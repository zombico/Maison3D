// Spike 06, speech to text on the laptop: the headset sends a 16 kHz mono 16-bit WAV of one held-button turn, and
// Muse Voice Transcribe returns the words. One multipart POST per turn in PUSH_TO_TALK mode, the mode Meta documents
// for "you delimit the turn, as with a mic button" (dev.meta.ai/docs/speech-to-text). The realtime WebSocket would
// stream words while you talk; it can come later, the turn shape stays the same.
import { config } from './agent.mjs';

export const STT_MODEL = process.env.MAISON_STT_MODEL || 'muse-voice-transcribe-1.0';

export const sttStatus = () => (config.hasKey ? STT_MODEL : 'no key');

/**
 * The words in `wav`. `keywords` biases recognition toward the room's own vocabulary (what the headset labelled:
 * table, storage, couch…), which the model might otherwise mishear.
 */
export async function transcribe(wav, keywords = []) {
  if (!config.hasKey) throw new Error('no META_API_KEY: put it in .env at the repository root');
  if (!wav?.length) return '';
  const request = { model: STT_MODEL, audioEncoding: 'WAV', mode: 'PUSH_TO_TALK', languageBias: ['English'] };
  if (keywords.length) request.keywords = keywords;
  const form = new FormData();
  form.append('request', new Blob([JSON.stringify(request)], { type: 'application/json' }));
  form.append('audio', new Blob([wav], { type: 'audio/wav' }), 'turn.wav');
  const res = await fetch(`${config.base}/asr/transcribe`, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.META_API_KEY}`, accept: 'application/json' },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Muse Voice said ${res.status}: ${text.slice(0, 300)}`);
  const json = JSON.parse(text);
  return (json.transcript ?? '').trim();
}
