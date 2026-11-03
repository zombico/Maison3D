// Spike 06 without the headset: one typed turn against the room in spike 05's sample scan.
//   node 06-spike-native-talk/try.mjs "put it on the biggest table and make it red"
import { config, runTurn, sampleRoom } from './agent.mjs';

const said = process.argv.slice(2).join(' ') || 'put the cube on the table';
const room = sampleRoom();
const cube = { color: '#e4b363', size: 0.2, at: [0, 1, -1], spin: false };
console.log(`model ${config.model} at ${config.base}; room: ${room.items.map((i) => i.id).join(', ')}`);
const { reply, cube: next, calls } = await runTurn({ said, pointing: null, room, cube });
for (const c of calls) console.log(`  ${c.name} ${JSON.stringify(c.args)} -> ${JSON.stringify(c.result)}`);
console.log(`< ${reply}`);
console.log('cube', JSON.stringify(next));
