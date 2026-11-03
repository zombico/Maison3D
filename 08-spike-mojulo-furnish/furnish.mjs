// Spike 08, step 1 end to end on the pinned mojulo: the scanned room (spike 05's sample) to a mojulo floor plan,
// furnished by mojulo, exported, and each piece mojulo placed read back into the room's world coordinates.
//   node 08-spike-mojulo-furnish/furnish.mjs [glyph L|O|B…] [--empty]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from '../mojulo/client.mjs';
import { roomFromScan } from '../07-spike-native-furnish/sample.mjs';
import { manifestFor, toWorld, FT } from './toMojulo.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const glyph = process.argv.find((a) => /^[A-Z]$/.test(a)) ?? 'L';
const empty = process.argv.includes('--empty');
const room = roomFromScan(JSON.parse(readFileSync(join(here, '..', '05-spike-native-scan', 'samples', 'two-rooms-quest3s.json'), 'utf8')));
const { manifest, frame } = manifestFor(room, { glyph });
if (empty) delete manifest.rooms[0].items;
const pad = manifest.rooms[0].x;

const m = await connect();
console.log(`mojulo ${m.server.version}; room ${frame.width.toFixed(2)} x ${frame.depth.toFixed(2)} m as '${glyph}'${empty ? ', empty' : ', with your furniture'}`);
const ref = `sk_maison_${glyph.toLowerCase()}_${empty ? 'empty' : 'real'}_${Date.now().toString(36)}`;
await m.call('create_sketch', { title: `Your room (${glyph})`, ref, manifest });
const out = await m.call('export_model', { ref, format: 'glb' });
m.close();

// the pieces, from the GLB's node names and bounds (mojulo's own space: plan feet, z up)
const glb = readFileSync(out.path);
const jl = glb.readUInt32LE(12);
const json = JSON.parse(glb.subarray(20, 20 + jl).toString('utf8'));
const groups = new Map();
for (const n of json.nodes) {
  const name = n.name ?? '';
  if (!name.startsWith('asset:') || n.mesh === undefined) continue;
  const id = name.split(':')[1];
  const g = groups.get(id) ?? { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const p of json.meshes[n.mesh].primitives) {
    const a = json.accessors[p.attributes.POSITION];
    for (let k = 0; k < 3; k++) { g.min[k] = Math.min(g.min[k], a.min[k]); g.max[k] = Math.max(g.max[k], a.max[k]); }
  }
  groups.set(id, g);
}
// which way the plan's y runs in the export: 3.0.0 wrote plan y as +y, the 3.1 line writes it as -y (a right-handed
// z-up export). The floor says which: its y range is the cell's [pad, pad + depth], or that range negated.
const floor = json.nodes.find((n) => (n.name ?? '').startsWith('floor') && n.mesh !== undefined);
const fa = json.accessors[json.meshes[floor.mesh].primitives[0].attributes.POSITION];
const flip = fa.max[1] <= 0 ? -1 : 1;
const planY = (y) => flip * y;
const pieces = [...groups].map(([id, g]) => {
  const y0 = Math.min(planY(g.min[1]), planY(g.max[1])), y1 = Math.max(planY(g.min[1]), planY(g.max[1]));
  const c = toWorld(frame, [(g.min[0] + g.max[0]) / 2 - pad, (y0 + y1) / 2 - pad]);
  return {
    id,
    at: [c[0], frame.floorY + g.min[2] * FT, c[1]].map((v) => Math.round(v * 1000) / 1000),
    size: [(g.max[0] - g.min[0]) * FT, (g.max[2] - g.min[2]) * FT, (y1 - y0) * FT].map((v) => Math.round(v * 100) / 100),
  };
});
for (const p of pieces) console.log(`  ${p.id.padEnd(30)} at ${p.at.join(', ')}   ${p.size.join(' x ')} m (w x h x d, along the room)`);
writeFileSync(join(here, `layout-${glyph}${empty ? '-empty' : ''}.json`), JSON.stringify({ mojulo: m.server.version, ref, glb: out.path, pieces }, null, 1) + '\n');
