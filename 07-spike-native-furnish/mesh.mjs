// A small GLB writer for Maison3D's own pieces (curtains, houseplants, frames, mirrors): triangles grouped by
// material, lit PBR (or unlit, or see-through), optionally textured, and a few ways of making shape: boxes, turned
// profiles (lathes), tubes along a path, flat polygons and leaves. y up, metres. A material's name is
// `<part>:<role>` so colour.mjs can recolour it like any catalogue piece's (a planter's pot, a frame's moulding).
import { writeGlb } from '../70-inventory/ready.mjs';

const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export const hexLinear = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(lin(v / 255) * 10000) / 10000); };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const v3 = { sub, add, mul, cross, len, norm };

export class Mesh {
  constructor() { this.mats = new Map(); }
  /** A material: { name: '<part>:<role>', colour, unlit?, alpha?, metallic?, roughness?, texture?: PNG Buffer }. */
  mat(m) {
    if (!this.mats.has(m.name)) this.mats.set(m.name, { ...m, pos: [], nrm: [], uv: [], idx: [] });
    return this.mats.get(m.name);
  }
  vert(m, p, n, uv = [0, 0]) { const g = this.mat(m); g.pos.push(...p); g.nrm.push(...n); g.uv.push(...uv); return g.pos.length / 3 - 1; }
  tri(m, a, b, c) { this.mat(m).idx.push(a, b, c); }
  /** A flat quad (corners in order), its normal from the corners, uv over its corners. */
  quad(m, ps, uvs = [[0, 1], [1, 1], [1, 0], [0, 0]]) {
    const n = norm(cross(sub(ps[1], ps[0]), sub(ps[3], ps[0])));
    const i = ps.map((p, k) => this.vert(m, p, n, uvs[k]));
    this.tri(m, i[0], i[1], i[2]); this.tri(m, i[0], i[2], i[3]);
  }
  /** An axis-aligned box from min to max. */
  box(m, [x0, y0, z0], [x1, y1, z1]) {
    const P = (x, y, z) => [x ? x1 : x0, y ? y1 : y0, z ? z1 : z0];
    this.quad(m, [P(0, 0, 1), P(1, 0, 1), P(1, 1, 1), P(0, 1, 1)]);
    this.quad(m, [P(1, 0, 0), P(0, 0, 0), P(0, 1, 0), P(1, 1, 0)]);
    this.quad(m, [P(0, 0, 0), P(0, 0, 1), P(0, 1, 1), P(0, 1, 0)]);
    this.quad(m, [P(1, 0, 1), P(1, 0, 0), P(1, 1, 0), P(1, 1, 1)]);
    this.quad(m, [P(0, 1, 1), P(1, 1, 1), P(1, 1, 0), P(0, 1, 0)]);
    this.quad(m, [P(0, 0, 0), P(1, 0, 0), P(1, 0, 1), P(0, 0, 1)]);
  }
  /**
   * A turned shape: `profile` [[radius, y]…] bottom to top, about the y axis at `at`, `segs` round; `ribs` (a count,
   * a depth as a fraction of the radius) flutes it; `caps` closes the bottom and/or top.
   */
  lathe(m, profile, { at = [0, 0, 0], segs = 24, ribs = null, caps = [true, true] } = {}) {
    const rows = profile.map(([r, y], j) => {
      const row = [];
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2, rr = ribs ? r * (1 - ribs[1] * (0.5 - 0.5 * Math.cos(a * ribs[0]))) : r;
        // the normal from the profile's slope here
        const [r0, y0] = profile[Math.max(0, j - 1)], [r1, y1] = profile[Math.min(profile.length - 1, j + 1)];
        const n = norm([Math.cos(a) * (y1 - y0), -(r1 - r0), Math.sin(a) * (y1 - y0)]);
        row.push(this.vert(m, [at[0] + Math.cos(a) * rr, at[1] + y, at[2] + Math.sin(a) * rr], n, [i / segs, y]));
      }
      return row;
    });
    for (let j = 0; j + 1 < rows.length; j++) for (let i = 0; i < segs; i++) { const a = rows[j][i], b = rows[j][i + 1], c = rows[j + 1][i + 1], d = rows[j + 1][i]; this.tri(m, a, d, c); this.tri(m, a, c, b); }
    const cap = ([r, y], up) => {
      if (r <= 0) return;
      const c = this.vert(m, [at[0], at[1] + y, at[2]], [0, up ? 1 : -1, 0]);
      const ring = [];
      for (let i = 0; i <= segs; i++) { const a = (i / segs) * Math.PI * 2; ring.push(this.vert(m, [at[0] + Math.cos(a) * r, at[1] + y, at[2] + Math.sin(a) * r], [0, up ? 1 : -1, 0])); }
      for (let i = 0; i < segs; i++) up ? this.tri(m, c, ring[i + 1], ring[i]) : this.tri(m, c, ring[i], ring[i + 1]);
    };
    if (caps[0]) cap(profile[0], false);
    if (caps[1]) cap(profile.at(-1), true);
  }
  /** A tube along `path` [[x, y, z]…], radius `r` (a number, or one per point), `sides` round. */
  tube(m, path, r, { sides = 6, closeEnds = false } = {}) {
    const radius = (i) => (Array.isArray(r) ? r[i] : r);
    let prevN = null;
    const rings = path.map((p, i) => {
      const t = norm(sub(path[Math.min(path.length - 1, i + 1)], path[Math.max(0, i - 1)]));
      let n = prevN ? norm(sub(prevN, mul(t, prevN[0] * t[0] + prevN[1] * t[1] + prevN[2] * t[2]))) : norm(cross(t, Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
      prevN = n;
      const b = cross(t, n), ring = [];
      for (let k = 0; k <= sides; k++) {
        const a = (k / sides) * Math.PI * 2, d = add(mul(n, Math.cos(a)), mul(b, Math.sin(a)));
        ring.push(this.vert(m, add(p, mul(d, radius(i))), d, [k / sides, i / (path.length - 1)]));
      }
      return ring;
    });
    for (let j = 0; j + 1 < rings.length; j++) for (let k = 0; k < sides; k++) { const a = rings[j][k], b = rings[j][k + 1], c = rings[j + 1][k + 1], d = rings[j + 1][k]; this.tri(m, a, b, c); this.tri(m, a, c, d); }
    if (closeEnds) for (const [i, ring] of [[0, rings[0]], [path.length - 1, rings.at(-1)]]) { const c = this.vert(m, path[i], [0, 1, 0]); for (let k = 0; k < sides; k++) this.tri(m, c, ring[k], ring[k + 1]); }
  }
  /** A convex flat polygon (points in a plane, in order) as a fan, with uvs from `uvOf(point)`. */
  fan(m, pts, uvOf = () => [0, 0]) {
    const n = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
    const i = pts.map((p) => this.vert(m, p, n, uvOf(p)));
    for (let k = 1; k + 1 < i.length; k++) this.tri(m, i[0], i[k], i[k + 1]);
  }
  /**
   * A leaf: along its spine from `base` in direction `dir` (unit) for `length`, `width(u)` the half-width at u in 0..1,
   * folded along the midrib by `fold`, drooping by `droop` (metres at the tip, downwards), its face turned toward `up`.
   */
  leaf(m, { base, dir, up = [0, 1, 0], length, width, fold = 0.15, droop = 0, rows = 6 }) {
    const side = norm(cross(dir, up)), face = norm(cross(side, dir));
    const spine = (u) => add(add(base, mul(dir, u * length)), [0, -droop * u * u, 0]);
    const g = this.mat(m), start = g.idx.length;
    let prev = null;
    for (let j = 0; j <= rows; j++) {
      const u = j / rows, s = spine(u), w = width(u);
      const mid = add(s, mul(face, w * fold));
      const ring = [add(s, mul(side, -w)), mid, add(s, mul(side, w))].map((p) => this.vert(m, p, face, [u, 0]));
      if (prev) { this.tri(m, prev[0], ring[0], ring[1]); this.tri(m, prev[0], ring[1], prev[1]); this.tri(m, prev[1], ring[1], ring[2]); this.tri(m, prev[1], ring[2], prev[2]); }
      prev = ring;
    }
    // the winding must agree with the normal, or a two-sided leaf is lit as if it faced away
    const P = (i) => [g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2]];
    for (let k = start; k < g.idx.length; k += 3) {
      const [a, b, c] = [g.idx[k], g.idx[k + 1], g.idx[k + 2]], wn = cross(sub(P(b), P(a)), sub(P(c), P(a)));
      if (wn[0] * face[0] + wn[1] * face[1] + wn[2] * face[2] < 0) { g.idx[k + 1] = c; g.idx[k + 2] = b; }
    }
  }
  get triangles() { let n = 0; for (const g of this.mats.values()) n += g.idx.length / 3; return n; }
  /** The GLB. */
  glb(name) {
    const json = { asset: { version: '2.0', generator: 'Maison3D' }, scene: 0, scenes: [{ name, nodes: [0] }], nodes: [{ name, mesh: 0 }], meshes: [{ name, primitives: [] }], materials: [], accessors: [], bufferViews: [], buffers: [] };
    const chunks = []; let length = 0;
    const view = (buf, target) => { const pad = (4 - (length % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); length += pad; } chunks.push(buf); json.bufferViews.push({ buffer: 0, byteOffset: length, byteLength: buf.length, ...(target ? { target } : {}) }); length += buf.length; return json.bufferViews.length - 1; };
    const ext = new Set();
    for (const g of this.mats.values()) {
      if (!g.idx.length) continue;
      const pos = new Float32Array(g.pos), nrm = new Float32Array(g.nrm), uv = new Float32Array(g.uv), idx = new Uint32Array(g.idx);
      const min = [0, 1, 2].map((k) => { let v = Infinity; for (let i = k; i < g.pos.length; i += 3) v = Math.min(v, g.pos[i]); return v; });
      const max = [0, 1, 2].map((k) => { let v = -Infinity; for (let i = k; i < g.pos.length; i += 3) v = Math.max(v, g.pos[i]); return v; });
      json.accessors.push({ bufferView: view(Buffer.from(pos.buffer), 34962), componentType: 5126, count: pos.length / 3, type: 'VEC3', min, max });
      json.accessors.push({ bufferView: view(Buffer.from(nrm.buffer), 34962), componentType: 5126, count: nrm.length / 3, type: 'VEC3' });
      json.accessors.push({ bufferView: view(Buffer.from(uv.buffer), 34962), componentType: 5126, count: uv.length / 2, type: 'VEC2' });
      json.accessors.push({ bufferView: view(Buffer.from(idx.buffer), 34963), componentType: 5125, count: idx.length, type: 'SCALAR' });
      const a = json.accessors.length;
      const pbr = { baseColorFactor: [...hexLinear(g.colour), g.alpha ?? 1], metallicFactor: g.metallic ?? 0, roughnessFactor: g.roughness ?? 0.85 };
      if (g.texture) {
        json.images ??= []; json.textures ??= []; json.samplers ??= [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }];
        json.images.push({ bufferView: view(g.texture), mimeType: 'image/png' });
        json.textures.push({ source: json.images.length - 1, sampler: 0 });
        pbr.baseColorTexture = { index: json.textures.length - 1 };
      }
      const mat = { name: g.name, doubleSided: true, pbrMetallicRoughness: pbr };
      if (g.alpha !== undefined && g.alpha < 1) mat.alphaMode = 'BLEND';
      if (g.unlit) { mat.extensions = { KHR_materials_unlit: {} }; ext.add('KHR_materials_unlit'); }
      json.materials.push(mat);
      json.meshes[0].primitives.push({ attributes: { POSITION: a - 4, NORMAL: a - 3, TEXCOORD_0: a - 2 }, indices: a - 1, material: json.materials.length - 1 });
    }
    if (ext.size) json.extensionsUsed = [...ext];
    json.buffers.push({ byteLength: length });
    return writeGlb(json, Buffer.concat(chunks));
  }
}

/** mulberry32: the same plant from the same seed, every time. */
export function dice(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const R = (v) => Math.round(v * 1000) / 1000;
export function bounds(m) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const g of m.mats.values()) for (let i = 0; i < g.pos.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], g.pos[i + k]); hi[k] = Math.max(hi[k], g.pos[i + k]); }
  return { lo, hi };
}
/** Centres a mesh's footprint on the origin, its base on y = 0 (a wall piece keeps its back where it was built). */
export function settle(m, { keepZ = false } = {}) {
  const { lo, hi } = bounds(m), dx = (lo[0] + hi[0]) / 2, dz = keepZ ? 0 : (lo[2] + hi[2]) / 2, dy = lo[1];
  for (const g of m.mats.values()) for (let i = 0; i < g.pos.length; i += 3) { g.pos[i] -= dx; g.pos[i + 1] -= dy; g.pos[i + 2] -= dz; }
  return [R(hi[0] - lo[0]), R(hi[1] - lo[1]), R(hi[2] - lo[2])];
}

