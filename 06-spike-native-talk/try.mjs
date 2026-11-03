// Spike 06 without the headset: one turn against the room in spike 05's sample scan, typed or as a WAV.
//   node 06-spike-native-talk/try.mjs "put it on the biggest table and make it red"
//   node 06-spike-native-talk/try.mjs --wav turn.wav      (16 kHz mono 16-bit, e.g. from macOS:
//     say -o turn.wav --data-format=LEI16@16000 "put the cube on the biggest table")
import { readFileSync } from 'node:fs';
import { config, runTurn, sampleRoom } from './agent.mjs';
import { transcribe, STT_MODEL } from './stt.mjs';

const args = process.argv.slice(2);
const room = sampleRoom();
const cube = { color: '#e4b363', size: 0.2, at: [0, 1, -1], spin: false };
console.log(`model ${config.model} at ${config.base}; room: ${room.items.map((i) => i.id).join(', ')}`);

let said = args.join(' ') || 'put the cube on the table';
if (args[0] === '--wav') {
  const t0 = Date.now();
  said = await transcribe(readFileSync(args[1]), ['cube', ...new Set(room.items.map((i) => i.label))]);
  console.log(`heard (${STT_MODEL}, ${Date.now() - t0} ms): ${JSON.stringify(said)}`);
  if (!said) process.exit(0);
}
const t0 = Date.now();
const { reply, cube: next, calls } = await runTurn({ said, pointing: null, room, cube });
for (const c of calls) console.log(`  ${c.name} ${JSON.stringify(c.args)} -> ${JSON.stringify(c.result)}`);
console.log(`< ${reply}   (${Date.now() - t0} ms)`);
console.log('cube', JSON.stringify(next));
