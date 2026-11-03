// Spike 08: mojulo's design (design.json, from design.mjs) as headset furniture. The design's GLB holds every piece
// as nodes named by the piece's id (`asset:composed-furniture:media.console:…`, `interior:media.tv`); this splits them
// into one GLB per piece, readied the way spike 07's catalogue is (standing on y = 0, centred on its footprint, front
// to +z), and writes layout.json: those pieces as catalogue entries plus the scene that stands each where mojulo put
// it, in the room's own terms (metres from the inside north-west corner, a facing letter) so it lands in the same
// place whatever session the headset is in. Decor (a vase, the mail) rides the piece it sits on, the TV its console.
// Spike 07's server loads it with MAISON_LAYOUT=08-spike-mojulo-furnish/layout.json.
//   node 08-spike-mojulo-furnish/pieces.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from '../mojulo/client.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const design = JSON.parse(readFileSync(join(here, 'design.json'), 'utf8'));
const m = await connect();
const out = await m.call('export_model', { ref: design.ref, format: 'glb' });
m.close();

const buf = readFileSync(out.path);
const jl = buf.readUInt32LE(12);
const gltf = JSON.parse(buf.subarray(20, 20 + jl).toString('utf8'));
const binStart = 20 + jl;
const bin = buf.subarray(binStart + 8, binStart + 8 + buf.readUInt32LE(binStart));
const root = gltf.nodes.find((n) => n.name === 'mojulo');
const s = root.scale?.[0] ?? 1;

// mojulo's space is z up; its root turns that to glTF's y up: (x, y, z) -> (x, z, -y), times the unit scale
const toGltf = ([x, y, z]) => [x * s, z * s, -y * s];
function bounds(nodeIdx) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const i of nodeIdx) {
    for (const p of gltf.meshes[gltf.nodes[i].mesh].primitives) {
      const a = gltf.accessors[p.attributes.POSITION];
      for (const c of [toGltf(a.min), toGltf(a.max)]) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], c[k]); max[k] = Math.max(max[k], c[k]); }
    }
  }
  return { min, max };
}

// every mesh node that belongs to a piece, by the piece id in its name
const ids = design.pieces.map((p) => p.id);
const owner = (name) => ids.find((id) => name.split(':').includes(id));
const groups = new Map(ids.map((id) => [id, []]));
const loose = [];
gltf.nodes.forEach((n, i) => {
  if (n.mesh === undefined) return;
  const name = n.name ?? '';
  const id = owner(name);
  if (id) groups.get(id).push(i);
  else if (name.startsWith('interior:media.tv')) groups.get('media.console')?.push(i);
  else if (/^asset:(vase|mail-stack)/.test(name)) loose.push(i);
});
// decor goes with the piece whose footprint holds it
for (const i of loose) {
  const b = bounds([i]);
  const c = [(b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2];
  const host = [...groups].find(([, idx]) => { if (!idx.length) return false; const h = bounds(idx); return c[0] >= h.min[0] && c[0] <= h.max[0] && c[1] >= h.min[2] && c[1] <= h.max[2]; });
  host?.[1].push(i);
}

// glTF space after the root: +x east, +y up, +z south (the 3.1 line writes plan y as -y). A piece facing south already
// faces +z; the rest turn about y so their front does.
const YAW = { S: 0, E: -90, W: 90, N: 180 };
const quatY = (deg) => { const t = (deg * Math.PI) / 360; return [0, Math.sin(t), 0, Math.cos(t)]; };
const mulQ = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const rotY = (deg, [x, y, z]) => { const t = (deg * Math.PI) / 180; return [x * Math.cos(t) + z * Math.sin(t), y, -x * Math.sin(t) + z * Math.cos(t)]; };

function glbBytes(json) {
  let j = Buffer.from(JSON.stringify(json), 'utf8');
  j = Buffer.concat([j, Buffer.alloc((4 - (j.length % 4)) % 4, 0x20)]);
  const b = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4, 0)]);
  const h = Buffer.alloc(12); h.write('glTF', 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(12 + 8 + j.length + 8 + b.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(j.length, 0); jh.write('JSON', 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(b.length, 0); bh.write('BIN\0', 4);
  return Buffer.concat([h, jh, j, bh, b]);
}

const dir = join(here, 'pieces');
mkdirSync(dir, { recursive: true });
const catalog = [];
const scene = [];
for (const p of design.pieces) {
  const idx = groups.get(p.id);
  if (!idx?.length) { console.log(`  ${p.id}: no geometry in the export, left out`); continue; }
  const b = bounds(idx);
  const yaw = YAW[p.facingLetter] ?? 0;
  // base centre in glTF space, then the turn that brings the front to +z, about that centre
  const c = [(b.min[0] + b.max[0]) / 2, b.min[1], (b.min[2] + b.max[2]) / 2];
  const rc = rotY(yaw, c);
  const nodes = [{ name: p.id, rotation: mulQ(quatY(yaw), root.rotation), scale: root.scale, translation: [-rc[0], -rc[1], -rc[2]], children: [] }];
  for (const i of idx) { nodes[0].children.push(nodes.length); nodes.push({ ...gltf.nodes[i], children: undefined }); }
  const json = { ...gltf, nodes, scenes: [{ name: p.id, nodes: [0] }], scene: 0 };
  delete json.cameras;
  const file = `${p.id}.glb`;
  writeFileSync(join(dir, file), glbBytes(json));
  const size = [p.size[0], p.size[2], p.size[1]]; // w, h, d
  catalog.push({ id: p.id, name: `${p.like ?? p.piece} (mojulo ${design.style})`, kind: p.piece, size, sits: 'floor', file: `pieces/${file}`, note: `from mojulo's design_interior, ${design.style}` });
  // room-relative, not world: the headset's world origin moves with every launch, the room's walls do not
  scene.push({ id: p.id.split('.').pop(), item: p.id, plan: p.plan, facing: p.facingLetter });
  console.log(`  ${p.id.padEnd(22)} ${idx.length} parts, ${size.map((v) => v.toFixed(2)).join(' x ')} m, turned ${yaw} deg to face +z`);
}
writeFileSync(join(here, 'layout.json'), JSON.stringify({ from: design.ref, style: design.style, catalog, scene }, null, 1) + '\n');
console.log(`layout.json: ${catalog.length} pieces`);
