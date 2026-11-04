// A readied model's colourable parts, and the same model in other colours. Each material is given a role from its
// part's name (fabric, wood, body, seat, handles, and a bed's mattress, pillows and throw); recolouring a role keeps
// its detail (the weave, the grain, the shading of a cushion) as shades of grey and puts the new colour in the
// material's factor, so each material of the role keeps its tone against the others (piping darker than its fabric,
// a leg against a rail). No mojulo: the server does this per request, in milliseconds.
import { inflateSync, deflateSync } from 'node:zlib';
import { readGlb, writeGlb } from './ready.mjs';

/** The parts a person can name, in the order a piece is usually meant by them ("the sofa" is its fabric). */
export const ROLES = ['fabric', 'body', 'throw', 'pillows', 'mattress', 'wood', 'seat', 'handles', 'pot', 'leaves', 'frame', 'mat', 'rod', 'shade', 'base'];
// Maison3D's own pieces name their parts' roles outright: `<part>:<role>`
const NAMED_ROLES = new Set(['pot', 'leaves', 'frame', 'mat', 'rod', 'shade', 'base', 'fabric', 'wood']);

/** The role a material plays, from its name (`<part>:<kind>:...`, as mojulo names them), or null. */
export function roleOf(name = '') {
  const [part = '', kind = ''] = name.split(':');
  if (NAMED_ROLES.has(kind) && kind !== 'fabric' && kind !== 'wood') return kind;
  if (kind === 'fabric' || kind === 'piping') return 'fabric';
  if (kind === 'wood') return 'wood';
  if (part === 'mattress') return 'mattress';
  if (/^pillow/.test(part)) return 'pillows';
  if (part === 'throw') return 'throw';
  if (kind === 'sheet') return part === 'seat' ? 'seat' : 'body';
  if (/^(pull|handle|knob)/.test(part)) return 'handles';
  if (kind === 'pbr') return 'wood';
  return null;
}

// --- colour ---------------------------------------------------------------------------------------------------------
const toSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const LINEAR = Float64Array.from({ length: 256 }, (_, i) => toLinear(i / 255)); // a byte's linear value
const SRGB = Uint8Array.from({ length: 4097 }, (_, i) => Math.round(toSrgb(i / 4096) * 255)); // linear (to 1/4096) to a byte
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const round = (v) => Math.round(v * 10000) / 10000;
export const hexOf = (lin) => `#${lin.map((v) => Math.round(toSrgb(Math.max(0, Math.min(1, v))) * 255).toString(16).padStart(2, '0')).join('')}`;
export function linearOf(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => toLinear(v / 255));
}

// --- PNG (8-bit, not interlaced: what mojulo writes) ----------------------------------------------------------------
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let at = 8, w, h, type, idat = [];
  while (at < buf.length) {
    const len = buf.readUInt32BE(at), kind = buf.toString('latin1', at + 4, at + 8), data = buf.subarray(at + 8, at + 8 + len);
    if (kind === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4); type = data[9];
      if (data[8] !== 8 || data[12] !== 0 || ![0, 2, 4, 6].includes(type)) throw new Error(`PNG: depth ${data[8]}, type ${type}, interlace ${data[12]} not read here`);
    } else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    at += 12 + len;
  }
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[type], stride = w * ch, raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), row = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? px[row + x - ch] : 0, b = y ? px[row - stride + x] : 0, c = x >= ch && y ? px[row - stride + x - ch] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      px[row + x] = (src[x] + pred) & 255;
    }
  }
  // each pixel's linear luminance and mean colour, which is all a recolour needs
  const n = w * h, lums = new Float64Array(n), sum = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const o = i * ch, r = LINEAR[px[o]], g = ch >= 3 ? LINEAR[px[o + 1]] : r, b = ch >= 3 ? LINEAR[px[o + 2]] : r;
    sum[0] += r; sum[1] += g; sum[2] += b;
    lums[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  return { w, h, lums, mean: sum.map((v) => v / n), alpha: ch === 2 || ch === 4 ? (i) => px[i * ch + ch - 1] : null };
}

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (b) => { let c = -1; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(kind, data) {
  const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(kind, 4, 'latin1');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}
export function encodePng(w, h, rgba) {
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// --- the model --------------------------------------------------------------------------------------------------------
const viewOf = (json, bin, v) => { const bv = json.bufferViews[v]; return bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength); };
function vertexColours(json, bin, accessor) {
  const a = json.accessors[accessor];
  if (a.componentType !== 5126) throw new Error('COLOR_0 not float');
  const n = a.type === 'VEC4' ? 4 : 3, view = viewOf(json, bin, a.bufferView), stride = json.bufferViews[a.bufferView].byteStride || n * 4;
  return Array.from({ length: a.count }, (_, i) => [0, 1, 2].map((k) => view.readFloatLE((a.byteOffset ?? 0) + i * stride + k * 4)));
}

/** Every material the scene draws, with its role, its mean colour (linear, factor included) and how much of the piece it is. */
function survey(json, bin, only) {
  const prims = new Map(); // material -> primitives
  const walk = (i) => {
    const n = json.nodes[i];
    for (const p of json.meshes[n.mesh]?.primitives ?? []) { if (!prims.has(p.material)) prims.set(p.material, []); prims.get(p.material).push(p); }
    (n.children ?? []).forEach(walk);
  };
  json.scenes[json.scene ?? 0].nodes.forEach(walk);
  const texMean = new Map();
  const meanOfImage = (img) => {
    if (!texMean.has(img)) texMean.set(img, decodePng(viewOf(json, bin, json.images[img].bufferView)).mean);
    return texMean.get(img);
  };
  const out = [];
  for (const [mi, ps] of prims) {
    const mat = json.materials[mi], role = roleOf(mat.name);
    if (!role || (only && !only.includes(role))) continue;
    const pbr = mat.pbrMetallicRoughness ?? {}, f = (pbr.baseColorFactor ?? [1, 1, 1, 1]).slice(0, 3);
    const weight = ps.reduce((s, p) => s + json.accessors[p.attributes.POSITION].count, 0);
    let base = [1, 1, 1];
    if (pbr.baseColorTexture) base = meanOfImage(json.textures[pbr.baseColorTexture.index].source);
    else {
      const cs = ps.flatMap((p) => (p.attributes.COLOR_0 !== undefined ? vertexColours(json, bin, p.attributes.COLOR_0) : []));
      if (cs.length) base = [0, 1, 2].map((k) => cs.reduce((s, c) => s + c[k], 0) / cs.length);
    }
    out.push({ material: mi, role, prims: ps, weight, mean: base.map((v, k) => v * f[k]) });
  }
  return out;
}

const weighted = (ms) => { const W = ms.reduce((s, m) => s + m.weight, 0); return [0, 1, 2].map((k) => ms.reduce((s, m) => s + m.mean[k] * m.weight, 0) / W); };

/** The parts of a readied model and the colour each wears now: { fabric: '#c8b89a', wood: '#8a6a44' }, main part first. */
export function partsOf(buf) {
  const { json, bin } = readGlb(buf);
  const by = Object.groupBy(survey(json, bin), (m) => m.role);
  return Object.fromEntries(ROLES.filter((r) => by[r]).map((r) => [r, hexOf(weighted(by[r]))]));
}

// the detail's mean, as grey: room above it for the light threads and the figure's highlights. A light colour raises
// it (to 0.97 at most), trading some highlights for the colour asked for.
const DETAIL = 0.8;

/** The model with each role in `colours` ({ fabric: '#2f4f3a' }) worn in that colour instead. */
export function recolour(buf, colours) {
  const { json, bin } = readGlb(buf);
  const surveyed = survey(json, bin, Object.keys(colours));
  const chunks = [bin];
  let length = bin.length;
  const append = (data, target) => {
    const pad = (4 - (length % 4)) % 4;
    if (pad) { chunks.push(Buffer.alloc(pad)); length += pad; }
    json.bufferViews.push({ buffer: 0, byteOffset: length, byteLength: data.length, ...(target ? { target } : {}) });
    chunks.push(data); length += data.length;
    return json.bufferViews.length - 1;
  };
  const recoloured = new Set(surveyed.filter((m) => colours[m.role] !== undefined).map((m) => m.material));
  const usersOf = (pick) => { const n = new Map(); for (const mesh of json.meshes) for (const p of mesh.primitives) for (const x of pick(p)) n.set(x, [...(n.get(x) ?? []), p.material]); return n; };
  const imageUsers = usersOf((p) => { const t = json.materials[p.material]?.pbrMetallicRoughness?.baseColorTexture; return t ? [json.textures[t.index].source] : []; });
  const colourUsers = usersOf((p) => (p.attributes.COLOR_0 !== undefined ? [p.attributes.COLOR_0] : []));
  const done = new Set(); // images and accessors already rewritten
  for (const [role, hex] of Object.entries(colours)) {
    const target = linearOf(hex);
    if (!target) throw new Error(`${role}: ${hex} is not a colour (#rrggbb)`);
    const ms = surveyed.filter((m) => m.role === role);
    if (!ms.length) throw new Error(`no ${role} on this piece`);
    const ref = lum(weighted(ms)) || 1;
    const D = Math.min(0.97, Math.max(DETAIL, Math.max(...target) * Math.max(...ms.map((m) => lum(m.mean) / ref))));
    for (const m of ms) {
      const mat = json.materials[m.material], pbr = (mat.pbrMetallicRoughness ??= {});
      const k = lum(m.mean) / ref;
      if (pbr.baseColorTexture) {
        let tex = json.textures[pbr.baseColorTexture.index];
        // an image some other part also wears gets a grey copy of its own; otherwise it is rewritten where it is
        if (imageUsers.get(tex.source).some((u) => !recoloured.has(u))) {
          json.images.push({ ...json.images[tex.source] });
          json.textures.push({ ...tex, source: json.images.length - 1 });
          pbr.baseColorTexture = { ...pbr.baseColorTexture, index: json.textures.length - 1 };
          tex = json.textures[json.textures.length - 1];
        }
        if (!done.has(`i${tex.source}`)) {
          const { w, h, lums, alpha } = decodePng(viewOf(json, bin, json.images[tex.source].bufferView));
          let mean = 0; for (const l of lums) mean += l; mean = mean / lums.length || 1;
          const out = Buffer.alloc(w * h * 4), scale = (4096 * D) / mean;
          for (let i = 0; i < lums.length; i++) { const g = SRGB[Math.min(4096, Math.round(lums[i] * scale))]; out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = g; out[i * 4 + 3] = alpha ? alpha(i) : 255; }
          json.images[tex.source].bufferView = append(encodePng(w, h, out));
          done.add(`i${tex.source}`);
        }
      }
      const own = lum((pbr.baseColorFactor ?? [1, 1, 1]).slice(0, 3)) || 1;
      for (const p of m.prims) {
        if (p.attributes.COLOR_0 === undefined) continue;
        if (colourUsers.get(p.attributes.COLOR_0).some((u) => u !== m.material)) {
          json.accessors.push({ ...json.accessors[p.attributes.COLOR_0] });
          p.attributes.COLOR_0 = json.accessors.length - 1;
        }
        if (done.has(`c${p.attributes.COLOR_0}`)) continue;
        const cs = vertexColours(json, bin, p.attributes.COLOR_0);
        const mean = lum(m.mean) / own || 1; // the vertex colours' own mean, without the factor
        const data = Buffer.alloc(cs.length * 12);
        cs.forEach((c, i) => { const g = Math.min(1, (D * lum(c)) / mean); for (let j = 0; j < 3; j++) data.writeFloatLE(g, i * 12 + j * 4); });
        Object.assign(json.accessors[p.attributes.COLOR_0], { bufferView: append(data, 34962), byteOffset: 0, type: 'VEC3' });
        done.add(`c${p.attributes.COLOR_0}`);
      }
      pbr.baseColorFactor = [...target.map((v) => round(Math.min(1, (v * k) / D))), pbr.baseColorFactor?.[3] ?? 1];
    }
  }
  return compact(json, Buffer.concat(chunks));
}

/** Drops the buffer views nothing points at any more (the colours and images a recolour replaced). */
function compact(json, bin) {
  const used = new Set([...json.accessors.map((a) => a.bufferView), ...(json.images ?? []).map((i) => i.bufferView)].filter((v) => v !== undefined));
  const parts = [], index = new Map();
  let length = 0;
  json.bufferViews = json.bufferViews.filter((bv, i) => {
    if (!used.has(i)) return false;
    const pad = (4 - (length % 4)) % 4;
    if (pad) { parts.push(Buffer.alloc(pad)); length += pad; }
    parts.push(bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength));
    index.set(i, index.size);
    bv.byteOffset = length; length += bv.byteLength;
    return true;
  });
  for (const a of json.accessors) if (a.bufferView !== undefined) a.bufferView = index.get(a.bufferView);
  for (const im of json.images ?? []) if (im.bufferView !== undefined) im.bufferView = index.get(im.bufferView);
  json.buffers = [{ byteLength: length }];
  return writeGlb(json, Buffer.concat(parts));
}
