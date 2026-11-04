// What a room's surfaces are made of, beyond paint: floors of tile, checkerboard, hexagons, planks, herringbone,
// marble, terrazzo, concrete or carpet; walls of stucco, limewash, brick, subway tile, shiplap or concrete; a stucco
// (popcorn) or planked ceiling. Each is a texture painted here that repeats over the surface (shell.mjs maps it by the
// metre), from the surface's colour and a second one (the grout, the mortar, the other tile), at a size (a tile's).
import { encodePng } from '../70-inventory/colour.mjs';
import { dice } from './mesh.mjs';

export const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const mix = (a, b, t) => [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * t);
export const scale = (c, k) => c.map((v) => v * k);
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const frac = (v) => v - Math.floor(v);

/** A hash of integers to 0..1. */
export function hash(...n) {
  let h = 2166136261;
  for (const v of n) { h ^= v | 0; h = Math.imul(h, 16777619); h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; }
  return (h >>> 0) / 4294967296;
}
/** Value noise that wraps: u, v in 0..1 over `cells` cells each way, so a texture made from it tiles. */
export function pnoise(u, v, cells, seed = 0) {
  const x = u * cells, y = v * cells, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const s = (t) => t * t * (3 - 2 * t), w = (i) => ((i % cells) + cells) % cells;
  const at = (i, j) => hash(w(i), w(j), seed, cells);
  const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
  return a + (b - a) * s(fx) + (c - a) * s(fy) + (a - b - c + d) * s(fx) * s(fy);
}
/** Layers of it, finer each time; about 0..1. */
export function fbm(u, v, cells, seed = 0, octaves = 4) {
  let t = 0, amp = 0.5, sum = 0;
  for (let o = 0; o < octaves; o++) { t += amp * pnoise(u, v, cells << o, seed + o * 17); sum += amp; amp *= 0.5; }
  return t / sum;
}

/** A texture `W` x `H` pixels from `px(u, v)` -> [r, g, b] (u, v 0..1 over the texture). */
export function paintPng(W, H, px) {
  const out = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = px((x + 0.5) / W, (y + 0.5) / H, x, y), o = (y * W + x) * 4;
    out[o] = clamp(Math.round(c[0]), 0, 255); out[o + 1] = clamp(Math.round(c[1]), 0, 255); out[o + 2] = clamp(Math.round(c[2]), 0, 255); out[o + 3] = 255;
  }
  return encodePng(W, H, out);
}

// --- the painters: each makes { png, period: [metres across, metres up/along] } --------------------------------------
const PX = 300; // pixels a metre, about
const px = (m, lo = 64, hi = 512) => Math.max(lo, Math.min(hi, Math.round(m * PX)));

/** Square tiles `s` across with grout; a whole number of them a texture, each a shade off. */
function tiles(C, G, s, { checker = null, seed = 1, sheen = 0.04 } = {}) {
  const n = Math.max(2, Math.min(4, Math.round(1.2 / s))), period = n * s, W = px(period), g = Math.max(0.0025, s * 0.012);
  const png = paintPng(W, W, (u, v) => {
    const X = u * n, Y = v * n, i = Math.floor(X), j = Math.floor(Y), ex = Math.min(frac(X), 1 - frac(X)) * s, ey = Math.min(frac(Y), 1 - frac(Y)) * s;
    if (Math.min(ex, ey) < g / 2) return G;
    const base = checker && (i + j) % 2 ? checker : C;
    return scale(base, 0.96 + 0.06 * hash(i, j, seed) + sheen * (fbm(u, v, 4, seed) - 0.5));
  });
  return { png, period: [period, period] };
}

/** Running-bond rows: brick, subway tile, shiplap boards. */
function bond(C, G, { w, h, joint, seed = 2, rough = 0.1, offset = 0.5, bevel = 0, tone = 0.2 }) {
  const cols = Math.max(2, Math.round(1.0 / w)), rows = Math.max(4, Math.round(0.6 / h) * 2), pw = cols * w, ph = rows * h;
  const png = paintPng(px(pw), px(ph), (u, v) => {
    const Y = v * rows, r = Math.floor(Y), X = u * cols + (r % 2) * offset, c = Math.floor(X);
    const ex = Math.min(frac(X), 1 - frac(X)) * w, ey = Math.min(frac(Y), 1 - frac(Y)) * h;
    if (ex < joint / 2 || ey < joint / 2) return G;
    const k = 1 - tone * 0.6 + tone * hash(((c % cols) + cols) % cols, r, seed) + rough * (fbm(u, v, 8, seed) - 0.5);
    // a bevelled edge catches the light above and falls into shadow below
    const lit = bevel && ey < bevel ? (frac(Y) > 0.5 ? 1.08 : 0.9) : 1;
    return scale(C, k * lit);
  });
  return { png, period: [pw, ph] };
}

/** Boards side by side, of random lengths, each its own tone, with grain along them. */
function planks(C, G, { w = 0.19, seed = 3 } = {}) {
  const n = 6, pw = n * w, ph = 2.4, W = px(pw, 64, 384), H = px(ph, 128, 768);
  const cuts = Array.from({ length: n }, (_, i) => { const r = dice(seed * 31 + i); const ends = [r() * ph]; let y = ends[0]; for (let k = 0; k < 2; k++) { y += 0.9 + r() * 0.9; ends.push(y % ph); } return ends; });
  const png = paintPng(W, H, (u, v) => {
    const X = u * n, i = Math.floor(X), y = v * ph, ex = Math.min(frac(X), 1 - frac(X)) * w;
    const ends = cuts[i], near = Math.min(...ends.map((e) => Math.min(Math.abs(y - e), ph - Math.abs(y - e))));
    if (ex < 0.0015 || near < 0.0015) return G;
    const piece = ends.filter((e) => e < y).length, tone = 0.86 + 0.24 * hash(i, piece, seed);
    const grain = 0.93 + 0.1 * pnoise(frac(u * n), v, 24, seed + i) + 0.05 * Math.sin((frac(X) * 9 + pnoise(u, v, 16, seed) * 5) * Math.PI);
    return scale(C, tone * grain);
  });
  return { png, period: [pw, ph] };
}

/** Herringbone: slats L x W in a staircase, turned 45 degrees so the zig-zags run along the room. */
function herringbone(C, G, { L = 0.45, W = 0.09, seed = 4 } = {}) {
  const r2 = Math.SQRT2, pu = W * r2, pv = L * r2, nu = 4, nv = 2, tw = nu * pu, th = nv * pv;
  const tile = (x, y) => {
    // the staircase: H_k = [kW, kW+L] x [kW, kW+W]; V_k = [kW, kW+W] x [kW+W, kW+W+L]; repeated by (L, -L)
    const b0 = Math.floor((x - y + W) / (2 * L));
    for (const b of [b0 - 1, b0, b0 + 1]) {
      const qx = x - b * L, qy = y + b * L, k = Math.floor(qy / W), j = Math.floor(qx / W);
      if (qx >= k * W && qx < k * W + L) return { id: [b, k, 0], ex: Math.min(qx - k * W, k * W + L - qx), ey: Math.min(qy - k * W, (k + 1) * W - qy), along: qx - k * W };
      if (qy >= j * W + W && qy < j * W + W + L) return { id: [b, j, 1], ex: Math.min(qx - j * W, (j + 1) * W - qx), ey: Math.min(qy - j * W - W, j * W + W + L - qy), along: qy - j * W - W };
    }
    return null;
  };
  const png = paintPng(px(tw, 64, 256), px(th, 128, 640), (u, v) => {
    // back from the room's axes to the staircase's (a turn of 45 degrees)
    const a = u * tw, c = v * th, x = (a - c) / r2, y = (a + c) / r2, t = tile(x, y);
    if (!t || t.ex < 0.0015 || t.ey < 0.0015) return G;
    // tile ids repeat with the period (lattice (W, W) and (L, -L)): fold them so the tones tile too
    const tone = 0.86 + 0.24 * hash(((t.id[0] % nv) + nv) % nv, ((t.id[1] % nu) + nu) % nu, t.id[2], seed);
    return scale(C, tone * (0.95 + 0.06 * Math.sin((t.along / 0.03 + pnoise(u, v, 8, seed) * 3) * Math.PI)));
  });
  return { png, period: [tw, th] };
}

/** Hexagon tiles `s` across (point to point), with grout. */
function hexes(C, G, s, seed = 5) {
  const r = s / 2, pu = Math.sqrt(3) * r, pv = 3 * r, nu = 3, nv = 2, tw = nu * pu, th = nv * pv;
  const png = paintPng(px(tw, 96, 384), px(th, 96, 384), (u, v) => {
    const x = u * tw, y = v * th;
    // the nearest centre on the pointy-top grid: rows 1.5r apart, every other one shifted half a column
    let best = null;
    const row0 = Math.floor(y / (1.5 * r));
    for (let rr = row0 - 1; rr <= row0 + 1; rr++) {
      const off = ((rr % 2) + 2) % 2 ? pu / 2 : 0, c0 = Math.floor((x - off) / pu);
      for (let cc = c0 - 1; cc <= c0 + 1; cc++) {
        const cx = cc * pu + off + pu / 2, cy = rr * 1.5 * r + r, d = Math.hypot(x - cx, y - cy);
        if (!best || d < best.d) best = { d, cx, cy, id: [cc, rr] };
      }
    }
    // distance to the hexagon's edge: its apothem less the largest of the three axis projections
    const dx = Math.abs(x - best.cx), dy = Math.abs(y - best.cy), ap = (Math.sqrt(3) / 2) * r;
    const edge = ap - Math.max(dx, dx * 0.5 + dy * (Math.sqrt(3) / 2));
    if (edge < 0.002) return G;
    const k = ((best.id[0] % nu) + nu) % nu, l = ((best.id[1] % (nv * 2)) + nv * 2) % (nv * 2);
    return scale(C, 0.95 + 0.08 * hash(k, l, seed));
  });
  return { png, period: [tw, th] };
}

/** Mottled and veined, tiling: marble, concrete, terrazzo, carpet, stucco, limewash. */
function stone(kind, C, G, seed = 6) {
  const period = { marble: 1.6, concrete: 1.2, terrazzo: 0.8, carpet: 0.5, stucco: 0.6, popcorn: 0.5, limewash: 1.6 }[kind], W = px(period, 128, 512);
  const r = dice(seed), chips = kind === 'terrazzo' ? Array.from({ length: 260 }, () => ({ u: r(), v: r(), s: 0.004 + r() * 0.012, c: [G, scale(C, 0.7), [236, 233, 226], [150, 150, 146]][Math.floor(r() * 4)] })) : [];
  const png = paintPng(W, W, (u, v) => {
    if (kind === 'marble') {
      const t = fbm(u, v, 3, seed, 5), vein = Math.abs(Math.sin((u * 2 + v * 3 + t * 4) * Math.PI));
      return mix(scale(C, 0.97 + 0.05 * fbm(u, v, 8, seed + 3)), G, Math.pow(1 - vein, 9) * 0.7 + Math.pow(1 - vein, 40) * 0.25);
    }
    if (kind === 'terrazzo') {
      for (const ch of chips) { const du = Math.min(Math.abs(u - ch.u), 1 - Math.abs(u - ch.u)) * period, dv = Math.min(Math.abs(v - ch.v), 1 - Math.abs(v - ch.v)) * period; if (du + dv * 0.8 < ch.s) return ch.c; }
      return scale(C, 0.97 + 0.05 * fbm(u, v, 16, seed));
    }
    if (kind === 'concrete') return scale(C, 0.86 + 0.2 * fbm(u, v, 4, seed, 5) + 0.06 * (pnoise(u, v, 128, seed) - 0.5));
    if (kind === 'carpet') return scale(C, 0.9 + 0.12 * pnoise(u, v, 256, seed) + 0.06 * fbm(u, v, 4, seed));
    if (kind === 'limewash') return scale(C, 0.88 + 0.18 * fbm(u, v, 3, seed, 4) + 0.04 * pnoise(u, v, 32, seed + 1));
    // stucco: a rough relief, lit from above (its slope shades it), finer and lumpier as popcorn
    const cells = kind === 'popcorn' ? 24 : 12, e = 1.5 / W, hgt = (a, b) => fbm(a, b, cells, seed, 3);
    const slope = Math.max(-1, Math.min(1, (hgt(u, v - e) - hgt(u, v + e)) * (kind === 'popcorn' ? 9 : 7)));
    return scale(C, 0.97 + 0.1 * slope + 0.03 * (fbm(u, v, 4, seed) - 0.5));
  });
  return { png, period: [period, period] };
}

/** The finishes: what each surface can be, a label, its own colour and second colour when not painted, its size. */
export const SURFACES = {
  floor: {
    tile: { label: 'square tiles', colour: '#e8e4dc', colour2: '#bdb7ac', size: 0.6, paint: (C, G, s) => tiles(C, G, s) },
    checker: { label: 'checkerboard tiles', colour: '#ecebe6', colour2: '#232323', size: 0.3, grout: '#9a968e', paint: (C, G, s, x) => tiles(C, x.grout, s, { checker: G }) },
    hex: { label: 'hexagon tiles', colour: '#f1efea', colour2: '#c9c4ba', size: 0.2, paint: (C, G, s) => hexes(C, G, s) },
    planks: { label: 'wood planks', colour: '#b08d62', colour2: '#5a4630', size: 0.19, paint: (C, G, s) => planks(C, G, { w: s }) },
    herringbone: { label: 'herringbone wood', colour: '#b08d62', colour2: '#5a4630', size: 0.09, paint: (C, G, s) => herringbone(C, G, { W: s, L: s * 5 }) },
    marble: { label: 'marble', colour: '#eeece8', colour2: '#8e8e8c', size: 0.6, paint: (C, G) => stone('marble', C, G) },
    terrazzo: { label: 'terrazzo', colour: '#e6e1d8', colour2: '#c26a4a', size: 0.6, paint: (C, G) => stone('terrazzo', C, G) },
    concrete: { label: 'polished concrete', colour: '#a9a7a2', colour2: '#8d8b86', size: 1, paint: (C, G) => stone('concrete', C, G) },
    carpet: { label: 'wall-to-wall carpet', colour: '#c9bfae', colour2: '#b3a995', size: 1, keepsPaint: true, paint: (C, G) => stone('carpet', C, G) },
  },
  wall: {
    stucco: { label: 'stucco', colour: '#ece8e1', colour2: '#ece8e1', size: 1, keepsPaint: true, paint: (C, G) => stone('stucco', C, G) },
    limewash: { label: 'limewash', colour: '#e3dccf', colour2: '#e3dccf', size: 1, keepsPaint: true, paint: (C, G) => stone('limewash', C, G) },
    brick: { label: 'exposed brick', colour: '#9c5a43', colour2: '#cfc6b8', size: 0.215, paint: (C, G, s) => bond(C, G, { w: s, h: s * 0.33, joint: 0.01, rough: 0.25 }) },
    subway: { label: 'subway tile', colour: '#f3f2ee', colour2: '#cfcbc3', size: 0.15, paint: (C, G, s) => bond(C, G, { w: s, h: s / 2, joint: 0.003, rough: 0.03, bevel: 0.006, tone: 0.05 }) },
    shiplap: { label: 'shiplap boards', colour: '#efede7', colour2: '#9d9a94', size: 0.15, keepsPaint: true, paint: (C, G, s) => bond(C, scale(C, 0.62), { w: 2.4, h: s, joint: 0.004, rough: 0.03, offset: 0.37, tone: 0.03 }) },
    concrete: { label: 'concrete', colour: '#b3b0aa', colour2: '#8d8b86', size: 1, paint: (C, G) => stone('concrete', C, G) },
  },
  ceiling: {
    stucco: { label: 'stucco (popcorn)', colour: '#f5f4f0', colour2: '#f5f4f0', size: 1, keepsPaint: true, paint: (C, G) => stone('popcorn', C, G) },
    planks: { label: 'wood planks', colour: '#c9a77a', colour2: '#6a5236', size: 0.14, paint: (C, G, s) => planks(C, G, { w: s }) },
  },
};
export const SURFACE_KINDS = [...new Set(Object.values(SURFACES).flatMap((o) => Object.keys(o)))];

const made = new Map();
/** The texture for `surface` ('floor', 'wall', 'ceiling') of `kind`, in colour `colour`: { png, period, id }. */
export function surfaceTexture(surface, { kind, colour2, size }, colour) {
  const S = SURFACES[surface]?.[kind];
  if (!S) return null;
  const key = JSON.stringify([surface, kind, colour, colour2, size]);
  if (!made.has(key)) {
    const t = S.paint(rgb(colour ?? S.colour), rgb(colour2 ?? S.colour2), size ?? S.size, { grout: rgb(S.grout ?? '#9a968e') });
    made.set(key, { ...t, id: key });
  }
  return made.get(key);
}
