// Spike 06, speech to text on the laptop: the headset sends 16 kHz mono WAV, this returns the words.
// Meta's speech-to-text (Muse Voice) is the intended backend. It is not wired in yet: its request format has to be
// read from Meta's documentation (dev.meta.ai) first rather than guessed.
export const sttStatus = () => 'not wired yet (Muse Voice)';

export async function transcribe(_wav) {
  throw new Error('speech-to-text is not wired in yet: Muse Voice comes next');
}
