// Spike 07's furniture: mojulo recipes (recipes/*.json, made with mojulo's workbench furniture builds at true size)
// exported as GLB, then readied for the headset here: mojulo's studio extras dropped (the floor plate under the
// object, the five preset cameras), the piece moved so its footprint is centred on the origin and its base sits at
// y = 0, and its size written to catalog.json. Front faces +z, the way the headset places things facing you.
//   node 07-spike-native-furnish/catalog/build.mjs <dir with <id>.glb straight from mojulo's export_model>
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = process.argv[2];
if (!src) { console.error('usage: build.mjs <dir of raw mojulo .glb files>'); process.exit(1); }

const meta = JSON.parse(readFileSync(join(here, 'pieces.json'), 'utf8'));

function readGlb(buf) {
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen;
  const bin = binStart < buf.length ? buf.subarray(binStart + 8, binStart + 8 + buf.readUInt32LE(binStart)) : null;
  return { json, bin };
}

function writeGlb(json, bin) {
  let j = Buffer.from(JSON.stringify(json), 'utf8');
  j = Buffer.concat([j, Buffer.alloc((4 - (j.length % 4)) % 4, 0x20)]);
  const b = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4, 0)]);
  const header = Buffer.alloc(12);
  header.write('glTF', 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + j.length + 8 + b.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(j.length, 0); jh.write('JSON', 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(b.length, 0); bh.write('BIN\0', 4);
  return Buffer.concat([header, jh, j, bh, b]);
}

const catalog = [];
for (const file of readdirSync(src).filter((f) => f.endsWith('.glb')).sort()) {
  const id = basename(file, '.glb');
  const { json, bin } = readGlb(readFileSync(join(src, file)));
  const rootIndex = json.scenes[json.scene ?? 0].nodes.find((i) => json.nodes[i].name === 'mojulo');
  const root = json.nodes[rootIndex];
  const s = root.scale?.[0] ?? 1;
  // keep the object's own parts: not the cameras, not the studio floor plate ('static', unlit, under the object)
  const keep = root.children.filter((i) => json.nodes[i].camera === undefined && json.nodes[i].name !== 'static');
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const visit = (i) => {
    const n = json.nodes[i];
    if (n.translation || n.rotation || n.scale || n.matrix) throw new Error(`${id}: part ${i} has its own transform; bounds would be wrong`);
    for (const p of json.meshes[n.mesh]?.primitives ?? []) {
      const a = json.accessors[p.attributes.POSITION];
      for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], a.min[k]); max[k] = Math.max(max[k], a.max[k]); }
    }
    (n.children ?? []).forEach(visit);
  };
  keep.forEach(visit);
  // the root turns mojulo's z-up into glTF's y-up: (x, y, z) -> (x, z, -y), times the unit scale
  const size = [(max[0] - min[0]) * s, (max[2] - min[2]) * s, (max[1] - min[1]) * s];
  const centre = [((min[0] + max[0]) / 2) * s, min[2] * s, -((min[1] + max[1]) / 2) * s];

  // a fresh node list: one root (moved so the footprint centre is at the origin, the base at y = 0) and its parts
  const remap = new Map();
  const nodes = [];
  const copy = (i) => {
    const n = { ...json.nodes[i] };
    remap.set(i, nodes.length);
    nodes.push(n);
    if (n.children) n.children = n.children.map(copy);
    return remap.get(i);
  };
  const newRoot = { name: id, rotation: root.rotation, scale: root.scale, translation: centre.map((v) => -round(v)) };
  nodes.push(newRoot);
  newRoot.children = keep.map(copy);
  json.nodes = nodes;
  json.scenes = [{ name: id, nodes: [0] }];
  json.scene = 0;
  delete json.cameras;
  writeFileSync(join(here, `${id}.glb`), writeGlb(json, bin));

  const m = meta[id] ?? {};
  catalog.push({ id, name: m.name ?? id, kind: m.kind ?? 'furniture', size: size.map(round), sits: m.sits ?? 'floor', file: `${id}.glb`, recipe: `recipes/${id}.json`, note: m.note ?? '' });
  console.log(`${id}: ${size.map((v) => v.toFixed(2)).join(' x ')} m (w x h x d)`);
}
writeFileSync(join(here, 'catalog.json'), JSON.stringify(catalog, null, 1) + '\n');

function round(v) { return Math.round(v * 1000) / 1000; }
