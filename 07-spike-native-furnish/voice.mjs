// The reply as audio, for a browser or headset with no voice of its own (the Quest browser has none, and a Quest 3S had
// no English one). Meta's Model API transcribes but does not speak, so the server speaks: Piper where it is installed
// (the public demo's image: MAISON_PIPER, MAISON_PIPER_VOICE), else macOS `say` on the laptop. Either way a WAV the client
// plays. With neither there is no voice here, and the client falls back on its own, or the reply stays on the panel.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PIPER = process.env.MAISON_PIPER, PIPER_VOICE = process.env.MAISON_PIPER_VOICE;
const LONGEST = 1200; // characters read aloud: replies are short, and this bounds the work one reply can ask for

export const voiceStatus = () => (PIPER && PIPER_VOICE ? 'Piper' : process.platform === 'darwin' ? 'macOS say' : 'none');

/** On one line (Piper makes a file per line), and no longer than LONGEST, ending at a sentence when it can. */
function spoken(text) {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= LONGEST) return t;
  const cut = t.slice(0, LONGEST), end = cut.lastIndexOf('. ');
  return end > 0 ? cut.slice(0, end + 1) : cut;
}

const piper = (text, file) => new Promise((resolve, reject) => {
  const child = execFile(PIPER, ['--model', PIPER_VOICE, '--output_file', file], { timeout: 20000 }, (e) => (e ? reject(e) : resolve()));
  child.stdin.on('error', () => {}); // it died early: its own error says why
  child.stdin.end(text);
});
const say = (text, file) => new Promise((resolve, reject) => {
  execFile('say', ['-o', file, '--file-format=WAVE', '--data-format=LEI16@22050', text], { timeout: 15000 }, (e) => (e ? reject(e) : resolve()));
});

// one voice at a time: the demo runs on one small machine, and a reply waits its turn rather than starving the rest
let queue = Promise.resolve();
const inTurn = (job) => { const run = queue.then(job, job); queue = run.catch(() => {}); return run; };

/** `text` spoken as WAV bytes, or null when this machine has no voice or it failed. */
export async function speak(text) {
  const voice = PIPER && PIPER_VOICE ? piper : process.platform === 'darwin' ? say : null, words = text && spoken(text);
  if (!voice || !words) return null;
  return inTurn(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'maison3d-voice-'));
    const file = join(dir, 'reply.wav');
    try {
      await voice(words, file);
      return await readFile(file);
    } catch (e) {
      console.error(`! voice failed: ${e.message}`);
      return null;
    } finally {
      rm(dir, { recursive: true, force: true });
    }
  });
}
