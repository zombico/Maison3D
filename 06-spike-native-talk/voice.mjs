// Spike 06, the reply as audio, for a headset whose text-to-speech has no English voice (a Quest 3S had none).
// Meta's Model API transcribes but does not speak, so the laptop's own voice is used: macOS `say`, as a 22 kHz WAV
// the headset plays. Elsewhere there is no voice and the reply stays on the panel.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const voiceStatus = () => (process.platform === 'darwin' ? 'macOS say' : 'none (macOS only)');

/** `text` spoken as WAV bytes, or null when this machine has no voice. */
export async function speak(text) {
  if (process.platform !== 'darwin' || !text) return null;
  const dir = await mkdtemp(join(tmpdir(), 'maison3d-voice-'));
  const file = join(dir, 'reply.wav');
  try {
    await new Promise((resolve, reject) =>
      execFile('say', ['-o', file, '--file-format=WAVE', '--data-format=LEI16@22050', text], { timeout: 15000 }, (e) => (e ? reject(e) : resolve())),
    );
    return await readFile(file);
  } catch (e) {
    console.error(`! say failed: ${e.message}`);
    return null;
  } finally {
    rm(dir, { recursive: true, force: true });
  }
}
