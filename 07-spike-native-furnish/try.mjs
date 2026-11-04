// Spike 07 without the headset: typed turns against the room in spike 05's sample scan, standing where the scan was
// taken. Each argument is one turn, in order; the scene carries over. Writes a plan of the result to plan.svg.
//   node 07-spike-native-furnish/try.mjs "put the sofa against the longest wall" "a lamp next to it on the left"
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, runTurn, scene, catalog } from './agent.mjs';
import { roomFromScan, planSvg } from './sample.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const scan = JSON.parse(readFileSync(join(here, 'samples', 'two-rooms-quest3s.json'), 'utf8'));
const room = roomFromScan(scan);
console.log(`model ${config.model} (reasoning ${config.effort}); room: ${room.items.map((i) => i.id).join(', ')}`);
for (const said of process.argv.slice(2)) {
  const t0 = Date.now();
  const { reply, calls } = await runTurn({ said, pointing: null, room });
  console.log(`\n> ${said}`);
  for (const c of calls) console.log(`  ${c.name} ${JSON.stringify(c.args)} -> ${c.result.error ?? `${c.result.piece?.id ?? ''} at ${c.result.piece?.at ?? ''}`}${c.result.issues?.length ? `  [${c.result.issues.join('; ')}]` : ''}`);
  console.log(`< ${reply}   (${Date.now() - t0} ms)`);
}
writeFileSync(join(here, 'plan.svg'), planSvg(room, scene, catalog));
console.log(`\nplan: ${join(here, 'plan.svg')}`);
