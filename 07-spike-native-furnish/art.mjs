// The pictures in Maison3D's frames, painted here: each a style and a seed, drawn into a PNG the same way every time.
// Colour fields, Bauhaus geometry, a single drawn line, layered hills, arches, a pencil grid, waves, leaf
// silhouettes, a sunset, ink washes. Drawn at 2x and averaged down, for clean edges.
import { encodePng } from '../70-inventory/colour.mjs';
import { dice } from './mesh.mjs';

const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const smooth = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** The styles, each a painter: (u, v in 0..1, from top-left; r: dice) -> [r, g, b]. Built per seed. */
const STYLES = {
  'colour-field': (r) => {
    const ground = rgb(['#5b2a2a', '#2f3e46', '#4a3b2a', '#3b3355'][Math.floor(r() * 4)]);
    const a = rgb(['#c8553d', '#e0a458', '#8fb3a3', '#d9c5a0'][Math.floor(r() * 4)]), b = rgb(['#e8d5b7', '#9c2c2c', '#d97a3d', '#577590'][Math.floor(r() * 4)]);
    const split = 0.42 + r() * 0.16;
    return (u, v) => {
      const inA = smooth(0.06, 0.1, Math.min(u, 1 - u)) * smooth(0.05, 0.09, v) * (1 - smooth(split - 0.04, split, v));
      const inB = smooth(0.06, 0.1, Math.min(u, 1 - u)) * smooth(split + 0.02, split + 0.06, v) * (1 - smooth(0.91, 0.95, v));
      const grain = 1 + (Math.sin(u * 340 + v * 97) * Math.sin(v * 410)) * 0.02;
      return mix(mix(ground, a, inA), b, inB).map((c) => c * grain);
    };
  },
  bauhaus: (r) => {
    const paper = rgb('#efe6d2'), cols = ['#c0392b', '#e1a730', '#26547c', '#1f1f1f'].map(rgb);
    const shapes = Array.from({ length: 5 }, (_, i) => ({ kind: Math.floor(r() * 3), x: 0.2 + r() * 0.6, y: 0.2 + r() * 0.6, s: 0.12 + r() * 0.22, c: cols[i % 4] }));
    return (u, v) => {
      let c = paper;
      for (const s of shapes) {
        const dx = u - s.x, dy = v - s.y;
        const inside = s.kind === 0 ? Math.hypot(dx, dy) < s.s : s.kind === 1 ? Math.abs(dx) < s.s * 0.7 && Math.abs(dy) < s.s * 0.7 : Math.hypot(dx, dy) < s.s && dy < 0;
        if (inside) c = s.c;
      }
      return c;
    };
  },
  line: (r) => {
    const paper = rgb('#f2ede3'), ink = rgb('#222222');
    const waves = Array.from({ length: 4 }, () => [1 + r() * 3, r() * Math.PI * 2, 0.08 + r() * 0.12]);
    const curve = (u) => 0.5 + waves.reduce((s, [f, p, a]) => s + Math.sin(u * f * Math.PI * 2 + p) * a, 0) * 0.8;
    return (u, v) => (u > 0.1 && u < 0.9 && Math.abs(v - curve(u)) < 0.006 ? ink : paper);
  },
  hills: (r) => {
    const sky = [rgb('#e9d8c4'), rgb('#f3e6d3')], layers = ['#a98467', '#7f5539', '#6c584c', '#3f4238'].map(rgb);
    const ridge = layers.map((_, i) => [0.45 + i * 0.12, r() * 6, 0.03 + r() * 0.05]);
    const sun = [0.3 + r() * 0.4, 0.25 + r() * 0.1];
    return (u, v) => {
      let c = mix(sky[0], sky[1], v);
      if (Math.hypot(u - sun[0], v - sun[1]) < 0.08) c = rgb('#e76f51');
      ridge.forEach(([h, p, a], i) => { if (v > h + Math.sin(u * 5 + p) * a + Math.sin(u * 13 + p * 2) * a * 0.3) c = layers[i]; });
      return c;
    };
  },
  arches: (r) => {
    const ground = rgb('#ead7c3'), cols = ['#c86b4a', '#e3b18a', '#9b4a35', '#d9a066'].map(rgb);
    const n = 3 + Math.floor(r() * 3);
    return (u, v) => {
      let c = ground;
      for (let i = 0; i < n; i++) {
        const cx = 0.5, base = 0.85, rad = 0.38 - i * (0.3 / n);
        const d = Math.hypot((u - cx) * 1.2, v - base);
        if ((v < base && d < rad) || (v >= base && Math.abs(u - cx) * 1.2 < rad && v < 0.92)) c = cols[i % cols.length];
      }
      return c;
    };
  },
  grid: (r) => {
    const ground = rgb(['#ece6da', '#e3e6e8', '#efe4e4'][Math.floor(r() * 3)]), line = rgb('#9a8f80');
    const n = 18 + Math.floor(r() * 10);
    return (u, v) => {
      const inside = u > 0.08 && u < 0.92 && v > 0.08 && v < 0.92;
      const g = Math.abs(((v - 0.08) * n / 0.84) % 1) < 0.06;
      return inside && g ? mix(ground, line, 0.6) : ground;
    };
  },
  waves: (r) => {
    const sea = [rgb('#1d3557'), rgb('#457b9d'), rgb('#a8dadc'), rgb('#f1faee')];
    const f = 6 + r() * 6, p = r() * 6;
    return (u, v) => { const t = (v * 9 + Math.sin(u * f + p + v * 3) * 0.6) % 4; return sea[Math.floor(Math.abs(t)) % 4]; };
  },
  leaves: (r) => {
    const ground = rgb(['#e9e4d8', '#d8c8b0', '#203a33'][Math.floor(r() * 3)]), leaf = rgb(['#3a5a40', '#588157', '#a3b18a'][Math.floor(r() * 3)]);
    const ls = Array.from({ length: 7 }, () => ({ x: 0.2 + r() * 0.6, y: 0.2 + r() * 0.6, a: r() * Math.PI, l: 0.15 + r() * 0.2 }));
    return (u, v) => {
      for (const L of ls) {
        const dx = u - L.x, dy = v - L.y, x = dx * Math.cos(L.a) + dy * Math.sin(L.a), y = -dx * Math.sin(L.a) + dy * Math.cos(L.a);
        const t = x / L.l;
        if (t > -1 && t < 1 && Math.abs(y) < Math.sqrt(1 - t * t) * L.l * 0.35) return Math.abs(y) < 0.003 ? mix(leaf, ground, 0.5) : leaf;
      }
      return ground;
    };
  },
  sunset: (r) => {
    const stops = [['#2b2d42', 0], ['#8d5a97', 0.35], ['#e07a5f', 0.62], ['#f2cc8f', 0.8], ['#f4f1de', 1]].map(([h, t]) => [rgb(h), t]);
    const horizon = 0.7 + r() * 0.1;
    return (u, v) => {
      if (v > horizon) return mix(rgb('#3d405b'), rgb('#22223b'), (v - horizon) / (1 - horizon));
      const t = v / horizon;
      for (let i = 0; i + 1 < stops.length; i++) if (t <= stops[i + 1][1]) return mix(stops[i][0], stops[i + 1][0], (t - stops[i][1]) / (stops[i + 1][1] - stops[i][1]));
      return stops.at(-1)[0];
    };
  },
  ink: (r) => {
    const paper = rgb('#f4efe6'), ink = rgb('#1b1b1e');
    const blots = Array.from({ length: 3 }, () => ({ x: 0.25 + r() * 0.5, y: 0.25 + r() * 0.5, s: 0.08 + r() * 0.16, f: 3 + r() * 5 }));
    return (u, v) => {
      let d = 0;
      for (const b of blots) { const a = Math.atan2(v - b.y, u - b.x), rr = b.s * (1 + 0.25 * Math.sin(a * b.f) + 0.1 * Math.sin(a * 13)); d = Math.max(d, 1 - Math.hypot(u - b.x, v - b.y) / rr); }
      return d > 0 ? mix(paper, ink, Math.min(1, d * 2.5)) : paper;
    };
  },
};

// --- abstract pictures for any size ------------------------------------------------------------------------------------
// Drawn in the picture's own proportions (x runs -aspect/2..aspect/2 across, y -0.5..0.5 down, one unit its height), so
// a circle stays round on a long canvas; coloured from a named palette: [ground, three colours, an ink].
export const PALETTES = {
  warm: ['#efe4d2', '#c8653f', '#e0a458', '#8c5a3c', '#2b2420'], earth: ['#e9e2d0', '#6b6a3a', '#a9744a', '#d1a85f', '#2f2a22'],
  ocean: ['#eef2f3', '#1d3557', '#457b9d', '#a8dadc', '#0f1b2c'], sage: ['#efede4', '#8fa58a', '#c9c3a6', '#5e7359', '#2c332a'],
  bold: ['#f1e9d8', '#c0392b', '#e1a730', '#26547c', '#1c1c1c'], mono: ['#f2f0eb', '#1d1d1d', '#8a8a86', '#c9c7c0', '#0d0d0d'],
  blush: ['#f4e9e4', '#d89a8e', '#a4502c', '#e9c9b9', '#3a2a28'], forest: ['#ece6d6', '#1f4a35', '#b8953d', '#6f8a5f', '#141c17'],
};
const ABSTRACT = {
  blobs: (r, A, P) => {
    const bs = Array.from({ length: 3 + Math.floor(r() * 3) }, (_, i) => ({ x: (r() - 0.5) * A * 0.75, y: (r() - 0.5) * 0.7, s: 0.12 + r() * 0.22, f: 2 + Math.floor(r() * 4), p: r() * 6, c: P[1 + (i % 3)] }));
    return (x, y) => { let c = P[0]; for (const b of bs) { const a = Math.atan2(y - b.y, x - b.x), rr = b.s * (1 + 0.18 * Math.sin(a * b.f + b.p)); if (Math.hypot(x - b.x, y - b.y) < rr) c = b.c; } return c; };
  },
  blocks: (r, A, P) => {
    const cells = [], split = (x0, y0, x1, y1, d) => { if (d > 3 || (d > 1 && r() < 0.3)) { cells.push([x0, y0, x1, y1, r() < 0.45 ? P[1 + Math.floor(r() * 3)] : P[0]]); return; } if ((x1 - x0) > (y1 - y0)) { const m = x0 + (x1 - x0) * (0.3 + r() * 0.4); split(x0, y0, m, y1, d + 1); split(m, y0, x1, y1, d + 1); } else { const m = y0 + (y1 - y0) * (0.3 + r() * 0.4); split(x0, y0, x1, m, d + 1); split(x0, m, x1, y1, d + 1); } };
    split(-A / 2, -0.5, A / 2, 0.5, 0);
    return (x, y) => { for (const [x0, y0, x1, y1, c] of cells) if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return Math.min(x - x0, x1 - x, y - y0, y1 - y) < 0.008 ? P[4] : c; return P[0]; };
  },
  gradient: (r, A, P) => {
    const ang = r() * Math.PI, dx = Math.cos(ang), dy = Math.sin(ang), stops = [P[1], P[3], P[2], P[0]];
    return (x, y) => { const t = Math.max(0, Math.min(0.999, 0.5 + (x * dx + y * dy) / (Math.abs(dx) * A + Math.abs(dy)))); const k = t * 3, i = Math.floor(k); const g = 1 + Math.sin(x * 900 + y * 700) * 0.012; return mix(rgb(stops[i]), rgb(stops[i + 1]), smooth(0, 1, k - i)).map((v) => v * g); };
  },
  strokes: (r, A, P) => {
    const ss = Array.from({ length: 5 + Math.floor(r() * 4) }, (_, i) => ({ x: (r() - 0.5) * A, y: (r() - 0.5), l: 0.25 + r() * 0.5, w: 0.03 + r() * 0.06, a: (r() - 0.5) * 1.2, c: P[1 + (i % 4)] }));
    return (x, y) => { let c = P[0]; for (const s of ss) { const u = (x - s.x) * Math.cos(s.a) + (y - s.y) * Math.sin(s.a), v = -(x - s.x) * Math.sin(s.a) + (y - s.y) * Math.cos(s.a); const edge = s.w * (1 + 0.06 * Math.sin(u * 23 + s.a * 9) + 0.04 * Math.sin(u * 61)) * (1 - 0.35 * (2 * Math.abs(u) / s.l) ** 4); /* a brush's soft taper */ if (Math.abs(u) < s.l / 2 && Math.abs(v) < edge) c = s.c; } return c; };
  },
  terrazzo: (r, A, P) => {
    const chips = Array.from({ length: Math.round(60 * A) }, () => ({ x: (r() - 0.5) * A, y: r() - 0.5, s: 0.012 + r() * 0.035, n: 3 + Math.floor(r() * 3), a: r() * 6, c: P[1 + Math.floor(r() * 3)] }));
    return (x, y) => { for (const k of chips) { const a = Math.atan2(y - k.y, x - k.x) + k.a, rr = k.s * Math.cos(Math.PI / k.n) / Math.cos(((a % (2 * Math.PI / k.n)) + 2 * Math.PI / k.n) % (2 * Math.PI / k.n) - Math.PI / k.n); if (Math.hypot(x - k.x, y - k.y) < rr) return k.c; } return P[0]; };
  },
  rings: (r, A, P) => {
    const cx = (r() < 0.5 ? -1 : 1) * A * (0.2 + r() * 0.3), cy = (r() - 0.5) * 0.6, band = 0.05 + r() * 0.05;
    return (x, y) => { const k = Math.floor(Math.hypot(x - cx, y - cy) / band); return k > 12 ? P[0] : P[[1, 2, 3, 0][k % 4]]; };
  },
  cutouts: (r, A, P) => {
    const sh = Array.from({ length: 4 + Math.floor(r() * 3) }, (_, i) => ({ x: (r() - 0.5) * A * 0.8, y: (r() - 0.5) * 0.8, s: 0.1 + r() * 0.15, k: 3 + Math.floor(r() * 4), a: r() * 6, c: P[1 + (i % 3)] }));
    return (x, y) => { let c = P[0]; for (const q of sh) { const a = Math.atan2(y - q.y, x - q.x), rr = q.s * (0.65 + 0.35 * Math.cos(a * q.k + q.a)); if (Math.hypot(x - q.x, y - q.y) < rr) c = q.c; } return c; };
  },
  horizon: (r, A, P) => {
    const h1 = -0.15 + r() * 0.2, h2 = h1 + 0.15 + r() * 0.15;
    return (x, y) => { const t = y + Math.sin(x * 3 + h1 * 10) * 0.01; return t < h1 ? mix(rgb(P[3]), rgb(P[0]), (t + 0.5) / (h1 + 0.5) * 0.6) : t < h2 ? rgb(P[2]) : rgb(P[1]); };
  },
  dots: (r, A, P) => {
    const n = 7 + Math.floor(r() * 5), step = 1 / n, phase = r() * 6;
    return (x, y) => { const gx = Math.round(x / step) * step, gy = Math.round(y / step) * step, rr = step * (0.18 + 0.22 * (0.5 + 0.5 * Math.sin(gx * 4 + gy * 3 + phase))); return Math.hypot(x - gx, y - gy) < rr ? P[1 + ((Math.round(gx / step) + Math.round(gy / step)) & 1 ? 1 : 0)] : P[0]; };
  },
  arcs: (r, A, P) => {
    const n = Math.max(2, Math.round(A * 2.5)), w = A / n;
    return (x, y) => { const i = Math.floor((x + A / 2) / w), cx = -A / 2 + (i + 0.5) * w, up = i % 2 === 0, base = up ? 0.25 : -0.25; const d = Math.hypot(x - cx, y - base); return (up ? y < base : y > base) && d < w * 0.48 ? P[1 + (i % 3)] : Math.abs(y - base) < 0.006 ? P[4] : P[0]; };
  },
};
export const ABSTRACT_STYLES = Object.keys(ABSTRACT);
export const ART_STYLES = [...Object.keys(STYLES), ...ABSTRACT_STYLES];

/** A painting in `style` from `seed`, `w` x `h` pixels (its aspect is the picture's), as a PNG. */
export function paint(style, seed, w = 384, h = 512, { palette = 'warm' } = {}) {
  const r = dice(seed), S = 2;
  let at;
  if (ABSTRACT[style]) {
    // in the picture's own proportions: x across in units of its height, centred; y down
    const A = w / h, P = (PALETTES[palette] ?? PALETTES.warm), draw = ABSTRACT[style](r, A, P);
    at = (u, v) => { const c = draw((u - 0.5) * A, v - 0.5); return typeof c === 'string' ? rgb(c) : c; };
  } else at = STYLES[style](r);
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let acc = [0, 0, 0];
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const c = at((x + (i + 0.5) / S) / w, (y + (j + 0.5) / S) / h); acc = acc.map((v, k) => v + c[k]); }
    const o = (y * w + x) * 4;
    out[o] = Math.max(0, Math.min(255, acc[0] / (S * S))); out[o + 1] = Math.max(0, Math.min(255, acc[1] / (S * S))); out[o + 2] = Math.max(0, Math.min(255, acc[2] / (S * S))); out[o + 3] = 255;
  }
  return encodePng(w, h, out);
}
