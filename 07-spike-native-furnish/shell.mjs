// The scanned room, empty, as a model the headset stands in VR: its walls (with their doors and windows open), floor
// and ceiling from the scan's own outline, skirting, the trim round each opening, a short hall behind each door so a
// doorway does not open onto nothing, and bright glass in each window. Everything is in the headset's world space
// (y up, metres), so the model stands at the origin and the room lies 1:1 over the real one. The real furniture is
// left out; `ghostsGlb` draws it as outlines, so nobody walks into a real sofa they cannot see.
import { createHash } from 'node:crypto';
import { walls } from './place.mjs';
import { writeGlb } from '../70-inventory/ready.mjs';
import { surfaceTexture } from './surfaces.mjs';

export const FINISH = { wall: '#ece8e1', floor: '#b08d62', ceiling: '#f5f4f0', trim: '#f3f1ec', hall: '#d6d1c8', glass: '#e6f0f7', ghost: '#7fd4ff' };
/** The labels a room is made of; everything else the scan found is furniture, left out of an empty room. */
export const SHELL = new Set(['wall', 'invisible wall', 'inner wall', 'floor', 'ceiling', 'door frame', 'window frame']);
const T = 0.06; // wall thickness behind the scanned face
// a window the scan found (or one with nothing said about it): a modest sill, a 10 cm recess, a casing, two panes
const WINDOW_DEFAULT = { sill_depth: 0.05, recess: 0.1, trim: 0.065, panes: 'two', frame: 'white' };
const FRAME_COLOUR = { white: '#f4f3ef', black: '#232323', wood: '#a57e4e' };
const HALL = 1.2; // how deep the hall behind a door goes
const round = (v) => Math.round(v * 1000) / 1000;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

/** The room with only what it is made of: what an empty room's design (and Muse) sees. */
export const emptyRoom = (room) => room && { ...room, items: (room.items ?? []).filter((i) => SHELL.has(i.label)) };

/** A wall's frame: centre (x, z), along (its left to right seen from the room), inward normal, half its length, bottom, top. */
export function frame(w) {
  return { id: w.id, c: [w.center[0], w.center[2]], along: [w.n[1], -w.n[0]], n: w.n, half: w.length / 2, y0: w.center[1] - w.size[1] / 2, y1: w.center[1] + w.size[1] / 2 };
}
const at = (f, u, y, out = 0) => [f.c[0] + f.along[0] * u + f.n[0] * out, y, f.c[1] + f.along[1] * u + f.n[1] * out];

/** The doors and windows in wall `f`: [{ kind, u0, u1, y0, y1 }], u along the wall from its centre. */
export function openings(f, room) {
  const out = [];
  for (const i of room.items ?? []) {
    if (i.label !== 'door frame' && i.label !== 'window frame') continue;
    const d = [i.center[0] - f.c[0], i.center[2] - f.c[1]];
    if (Math.abs(dot(d, f.n)) > 0.15) continue;
    // a frame's level box spans its width along the wall (and a little of its depth)
    const u = dot(d, f.along), w = i.size[0] * Math.abs(f.along[0]) + i.size[2] * Math.abs(f.along[1]);
    if (Math.abs(u) > f.half + w / 2) continue;
    const y0 = i.label === 'door frame' ? f.y0 : Math.max(f.y0, i.center[1] - i.size[1] / 2);
    out.push({ id: i.id, kind: i.label === 'door frame' ? 'door' : 'window', u0: Math.max(-f.half, u - w / 2), u1: Math.min(f.half, u + w / 2), y0, y1: Math.min(f.y1 - 0.02, i.center[1] + i.size[1] / 2), ...(i.label === 'window frame' ? { style: { ...WINDOW_DEFAULT, ...i.style } } : {}) });
  }
  return out;
}

/** The wall's whole rectangle less `cut` ([u0, u1, y0, y1]), as few rectangles as a grid of the cuts' edges allows. */
export function panels(f, cut, half = f.half) {
  const cl = (r) => [Math.max(-half, r[0]), Math.min(half, r[1]), Math.max(f.y0, r[2]), Math.min(f.y1, r[3])];
  const cs = cut.map(cl).filter((r) => r[1] - r[0] > 0.01 && r[3] - r[2] > 0.01);
  const us = [...new Set([-half, half, ...cs.flatMap((r) => [r[0], r[1]])])].sort((a, b) => a - b);
  const ys = [...new Set([f.y0, f.y1, ...cs.flatMap((r) => [r[2], r[3]])])].sort((a, b) => a - b);
  const out = [];
  for (let j = 0; j + 1 < ys.length; j++) {
    let run = null;
    for (let i = 0; i + 1 < us.length; i++) {
      const mu = (us[i] + us[i + 1]) / 2, my = (ys[j] + ys[j + 1]) / 2;
      const open = !cs.some((r) => mu > r[0] && mu < r[1] && my > r[2] && my < r[3]);
      if (open && run) run[1] = us[i + 1];
      else if (open) run = [us[i], us[i + 1], ys[j], ys[j + 1]];
      else if (run) { out.push(run); run = null; }
    }
    if (run) out.push(run);
  }
  const merged = []; // a run the same as the one under it grows up into it
  for (const r of out) {
    const below = merged.find((m) => Math.abs(m[0] - r[0]) < 1e-6 && Math.abs(m[1] - r[1]) < 1e-6 && Math.abs(m[3] - r[2]) < 1e-6);
    if (below) below[3] = r[3]; else merged.push([...r]);
  }
  return merged.filter((r) => r[1] - r[0] > 0.005 && r[3] - r[2] > 0.005);
}

/** The floor's outline [[x, z]…]: the scan's own, else the walls' ends in order round the room. */
function outline(room, fs) {
  const floor = (room.items ?? []).find((i) => i.label === 'floor');
  if (floor?.outline?.length >= 3) return floor.outline;
  const ends = fs.flatMap((f) => [at(f, -f.half, 0), at(f, f.half, 0)].map((p) => [p[0], p[2]]));
  const c = [ends.reduce((s, p) => s + p[0], 0) / ends.length, ends.reduce((s, p) => s + p[1], 0) / ends.length];
  const pts = ends.sort((a, b) => Math.atan2(a[1] - c[1], a[0] - c[0]) - Math.atan2(b[1] - c[1], b[0] - c[0]));
  return pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.15);
}

/** Ear clipping: a simple polygon's triangles, as index triples. */
function triangulate(poly) {
  const area = poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
  const idx = poly.map((_, i) => i);
  if (area < 0) idx.reverse();
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p, a, b, c) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  const tris = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 1000) {
    let cut = false;
    for (let i = 0; i < idx.length; i++) {
      const [ia, ib, ic] = [idx[(i + idx.length - 1) % idx.length], idx[i], idx[(i + 1) % idx.length]];
      const [a, b, c] = [poly[ia], poly[ib], poly[ic]];
      if (cross(a, b, c) <= 1e-9) continue;
      if (idx.some((j) => j !== ia && j !== ib && j !== ic && inside(poly[j], a, b, c))) continue;
      tris.push([ia, ib, ic]); idx.splice(i, 1); cut = true; break;
    }
    if (!cut) break;
  }
  if (idx.length === 3) tris.push([...idx]);
  return tris;
}

// --- the model ----------------------------------------------------------------------------------------------------
class Model {
  constructor() { this.groups = new Map(); }
  /** A material's group: a colour, or { colour, tex } for a textured surface (surfaces.mjs), mapped by the metre. */
  group(colour, unlit) {
    const tex = typeof colour === 'object' ? colour.tex : null, k = tex ? `tex:${tex.id}` : `${colour}${unlit ? ':unlit' : ''}`;
    if (!this.groups.has(k)) this.groups.set(k, { colour: tex ? colour.colour : colour, tex, unlit, pos: [], nrm: [], uv: [], idx: [] });
    return this.groups.get(k);
  }
  /** A textured point's uv: a floor or ceiling by its x and z, a wall by its run along and its height. */
  uvOf(g, p, n) {
    const [pu, pv] = g.tex.period;
    if (Math.abs(n[1]) > 0.5) return [p[0] / pu, p[2] / pv];
    const l = Math.hypot(n[0], n[2]) || 1;
    return [(p[0] * -n[2] + p[2] * n[0]) / l / pu, -p[1] / pv];
  }
  quad(colour, corners, n, unlit = false) {
    const g = this.group(colour, unlit), base = g.pos.length / 3;
    for (const c of corners) { g.pos.push(...c); g.nrm.push(...n); if (g.tex) g.uv.push(...this.uvOf(g, c, n)); }
    g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  /** A box from `o` along three axes (unit vectors a, b, c) by lengths la, lb, lc. */
  box(colour, o, [a, la], [b, lb], [c, lc], unlit = false) {
    const p = (i, j, k) => [0, 1, 2].map((d) => o[d] + a[d] * la * i + b[d] * lb * j + c[d] * lc * k);
    const neg = (v) => v.map((x) => -x);
    this.quad(colour, [p(0, 0, 0), p(0, 1, 0), p(0, 1, 1), p(0, 0, 1)], neg(a), unlit);
    this.quad(colour, [p(1, 0, 0), p(1, 0, 1), p(1, 1, 1), p(1, 1, 0)], a, unlit);
    this.quad(colour, [p(0, 0, 0), p(0, 0, 1), p(1, 0, 1), p(1, 0, 0)], neg(b), unlit);
    this.quad(colour, [p(0, 1, 0), p(1, 1, 0), p(1, 1, 1), p(0, 1, 1)], b, unlit);
    this.quad(colour, [p(0, 0, 0), p(1, 0, 0), p(1, 1, 0), p(0, 1, 0)], neg(c), unlit);
    this.quad(colour, [p(0, 0, 1), p(0, 1, 1), p(1, 1, 1), p(1, 0, 1)], c, unlit);
  }
  /** A box on wall `f`: u0..u1 along it, y0..y1 up, o0..o1 out into the room (negative: into the wall). */
  wallBox(colour, f, u0, u1, y0, y1, o0, o1, unlit = false) {
    const A = [f.along[0], 0, f.along[1]], N = [f.n[0], 0, f.n[1]];
    this.box(colour, at(f, u0, y0, o0), [A, u1 - u0], [[0, 1, 0], y1 - y0], [N, o1 - o0], unlit);
  }
  polygon(colour, pts, y, up) {
    const g = this.group(colour, false), base = g.pos.length / 3;
    for (const p of pts) { g.pos.push(p[0], y, p[1]); g.nrm.push(0, up ? 1 : -1, 0); if (g.tex) g.uv.push(...this.uvOf(g, [p[0], y, p[1]], [0, 1, 0])); }
    for (const t of triangulate(pts)) g.idx.push(base + t[0], base + t[1], base + t[2]);
  }
  glb(name) {
    const json = { asset: { version: '2.0', generator: 'Maison3D shell' }, scene: 0, scenes: [{ name, nodes: [0] }], nodes: [{ name, mesh: 0 }], meshes: [{ name, primitives: [] }], materials: [], accessors: [], bufferViews: [], buffers: [] };
    const chunks = []; let length = 0;
    const view = (buf, target) => {
      chunks.push(buf); json.bufferViews.push({ buffer: 0, byteOffset: length, byteLength: buf.length, target }); length += buf.length;
      const pad = (4 - (length % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); length += pad; } // a PNG's odd length leaves the next view aligned
      return json.bufferViews.length - 1;
    };
    let unlit = false;
    for (const g of this.groups.values()) {
      if (!g.idx.length) continue;
      const pos = new Float32Array(g.pos), nrm = new Float32Array(g.nrm), idx = new Uint32Array(g.idx);
      const min = [0, 1, 2].map((k) => Math.min(...g.pos.filter((_, i) => i % 3 === k))), max = [0, 1, 2].map((k) => Math.max(...g.pos.filter((_, i) => i % 3 === k)));
      json.accessors.push({ bufferView: view(Buffer.from(pos.buffer), 34962), componentType: 5126, count: pos.length / 3, type: 'VEC3', min, max });
      json.accessors.push({ bufferView: view(Buffer.from(nrm.buffer), 34962), componentType: 5126, count: nrm.length / 3, type: 'VEC3' });
      json.accessors.push({ bufferView: view(Buffer.from(idx.buffer), 34963), componentType: 5125, count: idx.length, type: 'SCALAR' });
      const n = json.accessors.length;
      const lin = hexLinear(g.colour);
      const pbr = { baseColorFactor: [...lin, 1], metallicFactor: 0, roughnessFactor: 0.9 }, attributes = { POSITION: n - 3, NORMAL: n - 2 };
      if (g.tex) {
        // the texture carries the colour; it repeats over the surface
        json.accessors.push({ bufferView: view(Buffer.from(new Float32Array(g.uv).buffer), 34962), componentType: 5126, count: g.uv.length / 2, type: 'VEC2' });
        attributes.TEXCOORD_0 = json.accessors.length - 1;
        json.images ??= []; json.textures ??= []; json.samplers ??= [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }];
        json.images.push({ bufferView: view(g.tex.png), mimeType: 'image/png' });
        json.textures.push({ source: json.images.length - 1, sampler: 0 });
        pbr.baseColorFactor = [1, 1, 1, 1]; pbr.baseColorTexture = { index: json.textures.length - 1 };
      }
      json.materials.push({ name: g.tex ? `surface ${json.materials.length}` : g.colour, doubleSided: true, pbrMetallicRoughness: pbr, ...(g.unlit ? { extensions: { KHR_materials_unlit: {} } } : {}) });
      if (g.unlit) unlit = true;
      json.meshes[0].primitives.push({ attributes, indices: n - 1, material: json.materials.length - 1 });
    }
    if (unlit) json.extensionsUsed = ['KHR_materials_unlit'];
    json.buffers.push({ byteLength: length });
    return writeGlb(json, Buffer.concat(chunks));
  }
}
const hexLinear = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const c = v / 255; return Math.round((c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4) * 10000) / 10000; }); };

/**
 * The empty room as a GLB. `finish` gives its colours: { wall (every wall), walls: { wallId }, floor, ceiling }, over
 * FINISH; and `finish.surfaces` what they are made of beyond paint (surfaces.mjs): { floor, ceiling, wall, walls: {
 * wallId } }, each { kind, colour2?, size? } ('none' for a wall that stays plain when the rest are not).
 */
export function shellGlb(room, finish = {}) {
  const fs = walls(room).map(frame);
  if (!fs.length) return null;
  const m = new Model();
  const F = { ...FINISH, ...Object.fromEntries(Object.entries(finish).filter(([, v]) => typeof v === 'string')) };
  const floorY = room.floorY ?? Math.min(...fs.map((f) => f.y0));
  const top = Math.max(...fs.map((f) => f.y1));
  const ring = outline(room, fs), S = finish.surfaces ?? {};
  // a surface made of something: its colour and the texture that repeats over it
  const made = (surface, style, colour) => (style && style !== 'none' ? { colour, tex: surfaceTexture(surface, style, colour) } : colour);
  m.polygon(made('floor', S.floor, F.floor), ring, floorY, true);
  m.polygon(made('ceiling', S.ceiling, F.ceiling), ring, top, false);
  for (const f of fs) {
    const colour = made('wall', S.walls?.[f.id] ?? S.wall, finish.walls?.[f.id] ?? F.wall);
    const ops = openings(f, room);
    // the wall, its ends run on by its thickness so the corners close
    for (const [u0, u1, y0, y1] of panels(f, ops.map((o) => [o.u0, o.u1, o.y0, o.y1]), f.half + T)) {
      m.wallBox(colour, f, u0, u1, y0, y1, -T, 0);
      if (Math.abs(y0 - f.y0) < 1e-6) m.wallBox(F.trim, f, u0, u1, y0, y0 + 0.09, 0, 0.014); // skirting
    }
    for (const o of ops) {
      if (o.kind === 'window') { windowIn(m, f, o, F); continue; }
      const w = 0.06; // the trim round the opening
      m.wallBox(F.trim, f, o.u0 - w, o.u0, o.y0, o.y1 + w, 0, 0.012);
      m.wallBox(F.trim, f, o.u1, o.u1 + w, o.y0, o.y1 + w, 0, 0.012);
      m.wallBox(F.trim, f, o.u0 - w, o.u1 + w, o.y1, o.y1 + w, 0, 0.012);
      {
        // a short hall behind the door: its floor, two sides, an end and a ceiling, in a quieter colour
        m.wallBox(F.floor, f, o.u0, o.u1, floorY - 0.021, floorY - 0.001, -T - HALL, 0.01); // runs under the wall to the room's floor
        m.wallBox(F.hall, f, o.u0 - 0.02, o.u0, floorY, o.y1, -T - HALL, -T);
        m.wallBox(F.hall, f, o.u1, o.u1 + 0.02, floorY, o.y1, -T - HALL, -T);
        m.wallBox(F.hall, f, o.u0 - 0.02, o.u1 + 0.02, floorY, o.y1 + 0.02, -T - HALL - 0.02, -T - HALL);
        m.wallBox(F.hall, f, o.u0 - 0.02, o.u1 + 0.02, o.y1, o.y1 + 0.02, -T - HALL, -T);
      }
    }
  }
  return m.glb('room');
}

/**
 * A window in wall `f`: its reveal back to the glass (the recess), the glass and its frame and panes there, the sill
 * standing out into the room, and the casing and apron round it (none when the trim is 0).
 */
function windowIn(m, f, o, F) {
  const S = o.style, r = S.recess, t = S.trim, sd = S.sill_depth, frame = FRAME_COLOUR[S.frame] ?? FRAME_COLOUR.white;
  const { u0, u1, y0, y1 } = o, fb = 0.045, fd = 0.05; // the frame's bars, wide and deep
  // the reveal: the wall's sides, head and bottom back to the glass
  m.wallBox(F.trim, f, u0 - 0.015, u0, y0, y1, -r, 0); m.wallBox(F.trim, f, u1, u1 + 0.015, y0, y1, -r, 0);
  m.wallBox(F.trim, f, u0 - 0.015, u1 + 0.015, y1, y1 + 0.015, -r, 0);
  // the glass, bright, and its frame at the back of the recess
  m.wallBox(F.glass, f, u0, u1, y0, y1, -r - 0.004, -r - 0.002, true);
  const fbox = (a0, a1, b0, b1) => m.wallBox(frame, f, a0, a1, b0, b1, -r - 0.002, -r + fd);
  fbox(u0, u0 + fb, y0, y1); fbox(u1 - fb, u1, y0, y1); fbox(u0, u1, y0, y0 + fb); fbox(u0, u1, y1 - fb, y1);
  const mu = 0.025, cx = (u0 + u1) / 2, cy = (y0 + y1) / 2;
  if (S.panes === 'two') fbox(cx - mu, cx + mu, y0, y1);
  if (S.panes === 'sash') fbox(u0, u1, cy - mu, cy + mu);
  if (S.panes === 'grid') { for (const k of [1, 2]) { const x = u0 + ((u1 - u0) * k) / 3; fbox(x - 0.012, x + 0.012, y0, y1); } fbox(u0, u1, cy - 0.012, cy + 0.012); }
  // the sill: from the glass out into the room, past the casing a little each side
  m.wallBox(F.trim, f, u0 - t - 0.02, u1 + t + 0.02, y0 - 0.028, y0, -r, sd);
  if (t > 0) {
    m.wallBox(F.trim, f, u0 - t, u0, y0, y1 + t, 0, 0.012); m.wallBox(F.trim, f, u1, u1 + t, y0, y1 + t, 0, 0.012);
    m.wallBox(F.trim, f, u0 - t, u1 + t, y1, y1 + t, 0, 0.012);
    if (sd > 0.02) m.wallBox(F.trim, f, u0 - t, u1 + t, y0 - 0.028 - t * 1.1, y0 - 0.028, 0, 0.012); // the apron under the sill
  }
}

/** The real furniture the scan found, as outlines (edges 1 cm thick, bright and unlit), for walking among in VR. */
export function ghostsGlb(room) {
  const m = new Model();
  const floorY = room.floorY ?? 0;
  for (const i of room.items ?? []) {
    if (!i.footprint || SHELL.has(i.label)) continue;
    const { center: c, u, v, half: h } = i.footprint, top = i.top ?? i.center[1] + i.size[1] / 2, e = 0.01;
    const U = [u[0], 0, u[1]], V = [v[0], 0, v[1]], Y = [0, 1, 0];
    const corner = (s, t, y) => [c[0] + u[0] * h[0] * s + v[0] * h[1] * t, y, c[1] + u[1] * h[0] * s + v[1] * h[1] * t];
    for (const y of [floorY, top - e]) for (const t of [-1, 1]) m.box(FINISH.ghost, corner(-1, t, y), [U, 2 * h[0]], [Y, e], [V, e * t], true);
    for (const y of [floorY, top - e]) for (const s of [-1, 1]) m.box(FINISH.ghost, corner(s, -1, y), [V, 2 * h[1]], [Y, e], [U, e * s], true);
    for (const s of [-1, 1]) for (const t of [-1, 1]) m.box(FINISH.ghost, corner(s, t, floorY), [U, e * s], [Y, top - floorY], [V, e * t], true);
  }
  return m.groups.size ? m.glb('real furniture') : null;
}

/** A short key for a room and its finish, so a changed room or colour is a new model the headset loads afresh. */
export function shellKey(room, finish) {
  const shape = (room.items ?? []).map((i) => [i.id, i.label, i.center, i.size, i.normal, i.footprint, i.outline, i.top, i.style]);
  return createHash('sha1').update(JSON.stringify([shape, room.floorY, finish])).digest('hex').slice(0, 12);
}

/** A plan of the empty room from above, for checking without the headset: walls, openings, the real furniture's outlines. */
export function shellSvg(room) {
  const fs = walls(room).map(frame);
  const pts = fs.flatMap((f) => [at(f, -f.half, 0), at(f, f.half, 0)]);
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[2]), S = 110, pad = 30;
  const X = (x) => pad + (x - Math.min(...xs)) * S, Z = (z) => pad + (z - Math.min(...zs)) * S;
  const parts = [`<polygon points="${outline(room, fs).map((p) => `${X(p[0])},${Z(p[1])}`).join(' ')}" fill="${FINISH.floor}" fill-opacity="0.35"/>`];
  for (const f of fs) {
    const a = at(f, -f.half, 0), b = at(f, f.half, 0);
    parts.push(`<line x1="${X(a[0])}" y1="${Z(a[2])}" x2="${X(b[0])}" y2="${Z(b[2])}" stroke="#555" stroke-width="5"/>`);
    for (const o of openings(f, room)) {
      const p = at(f, o.u0, 0), q = at(f, o.u1, 0);
      parts.push(`<line x1="${X(p[0])}" y1="${Z(p[2])}" x2="${X(q[0])}" y2="${Z(q[2])}" stroke="${o.kind === 'door' ? '#fff' : '#7fb8e6'}" stroke-width="7"/>`);
    }
    const m = at(f, 0, 0, 0.25);
    parts.push(`<text x="${X(m[0])}" y="${Z(m[2])}" font-family="sans-serif" font-size="12" text-anchor="middle">${f.id}</text>`);
  }
  for (const i of room.items ?? []) {
    if (!i.footprint || SHELL.has(i.label)) continue;
    const { center: c, u, v, half: h } = i.footprint;
    const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s, t]) => [c[0] + u[0] * h[0] * s + v[0] * h[1] * t, c[1] + u[1] * h[0] * s + v[1] * h[1] * t]);
    parts.push(`<polygon points="${cs.map((p) => `${X(p[0])},${Z(p[1])}`).join(' ')}" fill="none" stroke="${FINISH.ghost}" stroke-width="2" stroke-dasharray="4"/><text x="${X(c[0])}" y="${Z(c[1])}" font-family="sans-serif" font-size="10" text-anchor="middle" fill="#3a8fb8">${i.id}</text>`);
  }
  const W = pad * 2 + (Math.max(...xs) - Math.min(...xs)) * S, H = pad * 2 + (Math.max(...zs) - Math.min(...zs)) * S;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${round(W)}" height="${round(H)}" style="background:#fff">${parts.join('')}</svg>`;
}

/**
 * Where a ray ({ origin, direction }) first meets the empty room: the floor or a wall, as the headset's own pointing
 * reports it ({ target, id, point, normal, distance }), or null.
 */
export function shellHit({ origin: o, direction: d }, room) {
  let best = null;
  const take = (t, target, id, normal, more = {}) => { if (t > 0.01 && (!best || t < best.distance)) best = { target, id, ...more, point: [0, 1, 2].map((k) => round(o[k] + d[k] * t)), normal, distance: round(t) }; };
  const floor = (room.items ?? []).find((i) => i.label === 'floor');
  const floorY = room.floorY ?? floor?.center[1];
  if (floorY !== undefined && Math.abs(d[1]) > 1e-6) take((floorY - o[1]) / d[1], 'floor', floor?.id ?? null, [0, 1, 0]);
  for (const f of walls(room).map(frame)) {
    const den = d[0] * f.n[0] + d[2] * f.n[1];
    if (Math.abs(den) < 1e-6) continue;
    const t = ((f.c[0] - o[0]) * f.n[0] + (f.c[1] - o[2]) * f.n[1]) / den;
    const p = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
    const u = (p[0] - f.c[0]) * f.along[0] + (p[2] - f.c[1]) * f.along[1];
    if (Math.abs(u) > f.half || p[1] < f.y0 || p[1] > f.y1) continue;
    // a window or a door in that wall (with its casing): the pointing names it, and the wall it is in
    const op = openings(f, room).find((x) => u >= x.u0 - 0.08 && u <= x.u1 + 0.08 && p[1] >= x.y0 - 0.1 && p[1] <= x.y1 + 0.08);
    if (op) take(t, op.kind, op.id, [round(f.n[0]), 0, round(f.n[1])], { wall: f.id });
    else take(t, 'wall', f.id, [round(f.n[0]), 0, round(f.n[1])], { wall: f.id });
  }
  return best;
}
