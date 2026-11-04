import { createHash } from 'node:crypto';

// mojulo's GLB export readied for the headset (spike 07's catalogue build, as a function): the studio's extras
// dropped (the floor plate named 'static', the preset cameras), the piece moved so its footprint is centred on the
// origin and its base sits at y = 0, front to +z. Returns the new GLB and the piece's size in metres (w, h, d).
export function readGlb(buf) {
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen;
  const bin = binStart < buf.length ? buf.subarray(binStart + 8, binStart + 8 + buf.readUInt32LE(binStart)) : Buffer.alloc(0);
  return { json, bin };
}

export function writeGlb(json, bin) {
  let j = Buffer.from(JSON.stringify(json), 'utf8');
  j = Buffer.concat([j, Buffer.alloc((4 - (j.length % 4)) % 4, 0x20)]);
  const b = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4, 0)]);
  const header = Buffer.alloc(12);
  header.write('glTF', 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + j.length + 8 + b.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(j.length, 0); jh.write('JSON', 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(b.length, 0); bh.write('BIN\0', 4);
  return Buffer.concat([header, jh, j, bh, b]);
}

const round = (v) => Math.round(v * 1000) / 1000;

const quatY = (deg) => { const t = (deg * Math.PI) / 360; return [0, Math.sin(t), 0, Math.cos(t)]; };
const mulQ = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const rotY = (deg, [x, y, z]) => { const t = (deg * Math.PI) / 180; return [x * Math.cos(t) + z * Math.sin(t), y, -x * Math.sin(t) + z * Math.cos(t)]; };

const linear = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };

/**
 * mojulo's lit export draws a sheet good's face (plywood, MDF) as a grain map stored relative to the board's colour,
 * and leaves that colour out: no COLOR_0 and a white factor, so casework comes out near-white. `sheetRgb(key)` gives
 * the colour back (sRGB 0-255) from the material name's tile key ({ m: 'ply' | 'mdf' | ..., ... }); it goes in the
 * factor, which glTF multiplies with the map.
 */
function tintSheets(json, sheetRgb) {
  const coloured = new Set();
  for (const m of json.meshes ?? []) for (const p of m.primitives) if (p.attributes.COLOR_0 !== undefined) coloured.add(p.material);
  let tinted = 0;
  json.materials?.forEach((mat, i) => {
    const pbr = mat.pbrMetallicRoughness;
    const at = mat.name?.indexOf(':sheet:') ?? -1;
    if (at < 0 || coloured.has(i) || !pbr?.baseColorTexture || pbr.baseColorFactor?.slice(0, 3).some((v) => v !== 1)) return;
    let key;
    try { key = JSON.parse(Buffer.from(mat.name.slice(at + 7), 'base64').toString('utf8')); } catch { return; }
    const rgb = sheetRgb(key);
    if (!rgb) return;
    pbr.baseColorFactor = [...rgb.map((c) => round(linear(c))), pbr.baseColorFactor?.[3] ?? 1];
    tinted++;
  });
  return tinted;
}

/**
 * `turn`: degrees about y to bring the piece's front to +z (some of mojulo's builds face -z). `sheetRgb`: the colour
 * of a sheet good from its tile key, for the faces mojulo's lit export leaves white (tintSheets).
 */
export function ready(buf, name, { turn = 0, sheetRgb, drop = [] } = {}) {
  const { json, bin } = readGlb(buf);
  if (sheetRgb) tintSheets(json, sheetRgb);
  const rootIndex = json.scenes[json.scene ?? 0].nodes.find((i) => json.nodes[i].name === 'mojulo');
  if (rootIndex === undefined) throw new Error(`${name}: no 'mojulo' root node`);
  const root = json.nodes[rootIndex];
  const s = root.scale?.[0] ?? 1;
  // `drop`: parts by name, left out (a soft thing's hidden block)
  const keep = (root.children ?? []).filter((i) => json.nodes[i].camera === undefined && json.nodes[i].name !== 'static' && !drop.some((d) => (json.nodes[i].name ?? '').startsWith(d)));
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let triangles = 0;
  const visit = (i) => {
    const n = json.nodes[i];
    if (n.translation || n.rotation || n.scale || n.matrix) throw new Error(`${name}: part ${n.name} has its own transform`);
    for (const p of json.meshes[n.mesh]?.primitives ?? []) {
      const a = json.accessors[p.attributes.POSITION];
      for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], a.min[k]); max[k] = Math.max(max[k], a.max[k]); }
      triangles += (p.indices !== undefined ? json.accessors[p.indices].count : a.count) / 3;
    }
    (n.children ?? []).forEach(visit);
  };
  keep.forEach(visit);
  // the root turns mojulo's z-up into glTF's y-up: (x, y, z) -> (x, z, -y), times the unit scale
  const turned = Math.abs(turn % 180) === 90;
  const size = [(max[0] - min[0]) * s, (max[2] - min[2]) * s, (max[1] - min[1]) * s].map(round);
  if (turned) [size[0], size[2]] = [size[2], size[0]];
  const centre = [((min[0] + max[0]) / 2) * s, min[2] * s, -((min[1] + max[1]) / 2) * s];
  const nodes = [];
  const copy = (i) => {
    const n = { ...json.nodes[i] };
    nodes.push(n);
    const at = nodes.length - 1;
    if (n.children) n.children = n.children.map(copy);
    return at;
  };
  const rc = rotY(turn, centre);
  const newRoot = { name, rotation: turn ? mulQ(quatY(turn), root.rotation) : root.rotation, scale: root.scale, translation: rc.map((v) => -round(v)) };
  nodes.push(newRoot);
  newRoot.children = keep.map(copy);
  json.nodes = nodes;
  json.scenes = [{ name, nodes: [0] }];
  json.scene = 0;
  delete json.cameras;
  const packed = dedupeImages(json, bin);
  return { glb: writeGlb(json, packed), size, triangles: Math.round(triangles) };
}

/**
 * mojulo writes a sheet good's texture once per part (a chest's drawers each carry the same board): keep each image
 * once, point every texture at it, and drop the buffer views nothing uses any more. Returns the new binary chunk.
 */
function dedupeImages(json, bin) {
  if (!json.images?.length) return bin;
  const view = (v) => { const bv = json.bufferViews[v]; return bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength); };
  const seen = new Map(), canon = json.images.map((im, i) => {
    if (im.bufferView === undefined) return i;
    const k = createHash('sha1').update(view(im.bufferView)).digest('hex');
    if (!seen.has(k)) seen.set(k, i);
    return seen.get(k);
  });
  const keep = [...new Set(canon)], index = new Map(keep.map((i, n) => [i, n]));
  for (const t of json.textures ?? []) t.source = index.get(canon[t.source]);
  json.images = keep.map((i) => json.images[i]);
  // the buffer views still in use: the accessors' and the kept images'
  const used = new Set([...json.accessors.map((a) => a.bufferView), ...json.images.map((im) => im.bufferView)].filter((v) => v !== undefined));
  const parts = [], moved = new Map();
  let length = 0;
  json.bufferViews = json.bufferViews.filter((bv, i) => {
    if (!used.has(i)) return false;
    const pad = (4 - (length % 4)) % 4;
    if (pad) { parts.push(Buffer.alloc(pad)); length += pad; }
    parts.push(view(i));
    moved.set(i, moved.size);
    bv.byteOffset = length; length += bv.byteLength;
    return true;
  });
  for (const a of json.accessors) if (a.bufferView !== undefined) a.bufferView = moved.get(a.bufferView);
  for (const im of json.images) if (im.bufferView !== undefined) im.bufferView = moved.get(im.bufferView);
  json.buffers = [{ byteLength: length }];
  return Buffer.concat(parts);
}
