// Rugs: rectangles, runners, rounds and an oval at their US sizes, each woven in a design and a colourway that are its
// fit (like a picture's style and palette), so "make it a round persian in navy" is a swap and a fit. Designs: solid,
// bordered, striped, diamond, kilim, persian, vintage (a faded persian), moroccan (a lattice on a shaggy cream),
// checkerboard, abstract, jute (natural, braided round) and shag. Built here (mesh.mjs): lying flat, centred, base y = 0.
import { Mesh } from './mesh.mjs';
import { rgb, mix, scale, hash, pnoise, fbm, paintPng } from './surfaces.mjs';

const FT = 0.3048;
const frac = (v) => v - Math.floor(v);

/** Colourways: field, border, accent, a second accent. */
export const RUG_PALETTES = {
  ivory: ['#e9e2d3', '#b9ab92', '#8a7a62', '#d7cdb8'],
  sand: ['#d6c3a3', '#9c8463', '#f0e8d8', '#7a6750'],
  charcoal: ['#4a4a4c', '#2b2b2d', '#bdb8ae', '#7d7a74'],
  navy: ['#2e3b55', '#c9b991', '#e7e0cf', '#7c8aa3'],
  rust: ['#b25c3d', '#5b3a2c', '#e8d8bd', '#d79a63'],
  sage: ['#a9b49a', '#5f6b55', '#ece6d6', '#cbd0b9'],
  blush: ['#e3c4bb', '#a77c73', '#f3e9e2', '#c99f95'],
  persian: ['#9e2f2a', '#1f2e4a', '#e6d6b4', '#c88a3a'], // the classic: red field, navy border, ivory and gold
  ocean: ['#5f8ea3', '#264a5c', '#e5eef0', '#a9c8d2'],
  mono: ['#efede8', '#1e1e1e', '#1e1e1e', '#9a9893'],
};
export const RUG_DESIGNS = ['solid', 'bordered', 'stripes', 'diamond', 'kilim', 'persian', 'vintage', 'moroccan', 'checker', 'abstract', 'jute', 'shag'];
const JUTE = ['#c4a274', '#a9875a', '#dcc29a', '#8e6f47'];

/**
 * The rug's face as a texture. (X, Z) metres from the centre, `edge` metres in from the rug's edge, `cu`, `cv` -1..1
 * across it; round shapes measure their edge on the circle (or the ellipse).
 */
function rugPng(design, palette, shape, w, d, seed) {
  const [F, B, A, A2] = (design === 'jute' ? JUTE : RUG_PALETTES[palette] ?? RUG_PALETTES.ivory).map(rgb);
  const round = shape === 'round' || shape === 'oval';
  const W = Math.min(512, Math.max(128, Math.round(w * 170))), H = Math.min(1024, Math.max(128, Math.round(d * 170)));
  const r = (k) => hash(seed, k);
  const blobs = Array.from({ length: 6 }, (_, k) => ({ x: (r(k) - 0.5) * w * 0.9, z: (r(k + 10) - 0.5) * d * 0.9, s: (0.15 + r(k + 20) * 0.3) * Math.min(w, d), c: [A, B, A2, scale(F, 0.85)][k % 4] }));
  return paintPng(W, H, (u, v) => {
    const X = (u - 0.5) * w, Z = (v - 0.5) * d, cu = X / (w / 2), cv = Z / (d / 2);
    const rr = Math.hypot(cu, cv), edge = round ? (1 - rr) * Math.min(w, d) / 2 : Math.min(w / 2 - Math.abs(X), d / 2 - Math.abs(Z));
    const along = round ? Math.atan2(cv, cu) * Math.min(w, d) / 2 : Math.abs(X) > Math.abs(Z) * (w / d) ? Z : X; // a border's run, for its motifs
    let c = F, pile = 0.06;
    switch (design) {
      case 'solid': c = edge < 0.02 ? scale(F, 0.85) : F; break;
      case 'bordered': c = edge < 0.12 ? B : edge < 0.15 ? A : F; break;
      case 'stripes': { const band = Math.floor((round ? rr * Math.min(w, d) / 2 : Z) / 0.11); c = edge < 0.05 ? B : [F, F, A, F, B, F][((band % 6) + 6) % 6]; break; }
      case 'diamond': { const gx = frac(X / 0.3), gz = frac(Z / 0.3), dm = Math.abs(gx - 0.5) + Math.abs(gz - 0.5); c = edge < 0.1 ? B : dm < 0.16 ? A : dm < 0.22 ? A2 : F; break; }
      case 'kilim': {
        // rows of stepped diamonds, bands between, a toothed border
        const rz = frac(Z / 0.42), q = Math.round((Math.abs(frac(X / 0.42) - 0.5) + Math.abs(rz - 0.54)) * 10) / 10;
        if (edge < 0.08) c = B; else if (edge < 0.12) c = frac(along / 0.06) < 0.5 ? A : F;
        else if (rz < 0.08) c = A2; else c = q < 0.15 ? A : q < 0.25 ? B : q < 0.35 ? A2 : F;
        pile = 0.03; break;
      }
      case 'persian': case 'vintage': {
        // a scalloped medallion, corner spandrels, small rosettes over the field, a wide border of flowers
        const th = Math.atan2(cv, cu), em = Math.hypot(cu / 0.58, cv / (round ? 0.58 : 0.42)) + 0.06 * Math.sin(th * 8);
        const corner = round ? 9 : Math.hypot((1 - Math.abs(cu)) / 0.48, (1 - Math.abs(cv)) / 0.36) + 0.05 * Math.sin(th * 12);
        const ros = Math.hypot(frac(X / 0.16) - 0.5, frac(Z / 0.16) - 0.5);
        if (edge < 0.03) c = A2;
        else if (edge < 0.17) c = edge > 0.05 && edge < 0.15 && Math.hypot(frac(along / 0.12) - 0.5, (edge - 0.1) / 0.12) < 0.24 ? A : B;
        else if (edge < 0.2) c = A2;
        else if (em < 0.3) c = A2; else if (em < 0.62) c = B; else if (em < 0.7) c = A; else if (em < 0.76) c = A2;
        else if (corner < 1) c = corner < 0.8 ? B : A;
        else c = ros < 0.1 ? A : ros < 0.14 ? A2 : F;
        if (design === 'vintage') { const wear = fbm(u, v, 5, seed, 4); c = mix(c, mix(F, [235, 225, 210], 0.35), 0.35 + 0.45 * Math.max(0, wear - 0.45)); }
        pile = 0.04; break;
      }
      case 'moroccan': {
        // thin dark lines making a lattice of diamonds on a shaggy cream
        const a = Math.abs(frac((X + Z * 0.7) / 0.34) - 0.5), b = Math.abs(frac((X - Z * 0.7) / 0.34) - 0.5);
        c = Math.min(a, b) < 0.035 ? B : F; pile = 0.12; break;
      }
      case 'checker': { const i = Math.floor(X / 0.3 + 100), j = Math.floor(Z / 0.3 + 100); c = edge < 0.05 ? B : (i + j) % 2 ? A : F; break; }
      case 'abstract': {
        c = F;
        for (const b of blobs) { const dd = Math.hypot(X - b.x, (Z - b.z) * 1.1) + 0.04 * Math.sin(Math.atan2(Z - b.z, X - b.x) * 3 + b.s * 10); if (dd < b.s) { c = b.c; break; } }
        if (edge < 0.02) c = scale(c, 0.85); break;
      }
      case 'jute': {
        // a round braid goes round and round; a rectangle is a chunky basket weave
        if (round) { const ring = Math.min(w, d) / 2 * rr, t = frac(ring / 0.028), tw = frac(ring / 0.028 + Math.atan2(cv, cu) * 9 / Math.PI); c = scale(mix(F, A2, tw < 0.5 ? 0.3 : 0), t < 0.15 || t > 0.9 ? 0.78 : 1); }
        else { const i = Math.floor(X / 0.025 + 1000), j = Math.floor(Z / 0.025 + 1000), dir = (i + j) % 2, s = dir ? frac(X / 0.025) : frac(Z / 0.025); c = scale(mix(F, A2, hash(i, j) * 0.4), 0.82 + 0.25 * Math.sin(s * Math.PI)); }
        pile = 0.02; break;
      }
      case 'shag': c = F; pile = 0.2; break;
    }
    // the weave (or the pile) over it all
    return scale(c, 1 - pile / 2 + pile * pnoise(u, v, design === 'shag' || design === 'moroccan' ? 128 : 256, seed));
  });
}

/** A rug lying flat: its face (textured), its edge, a fringe at the ends of a woven one. */
function rugMesh(m, shape, w, d, design, palette, seed) {
  const tex = rugPng(design, palette, shape, w, d, seed), h = design === 'shag' || design === 'moroccan' ? 0.03 : design === 'jute' ? 0.014 : 0.01;
  const top = { name: 'top:rug', colour: '#ffffff', roughness: 0.95, texture: tex };
  const edgeCol = design === 'jute' ? JUTE[3] : (RUG_PALETTES[palette] ?? RUG_PALETTES.ivory)[design === 'solid' || design === 'shag' ? 0 : 1];
  const edge = { name: 'edge:rug-edge', colour: edgeCol, roughness: 0.95 };
  if (shape === 'round' || shape === 'oval') {
    const n = 64, pts = Array.from({ length: n }, (_, i) => { const a = (-i / n) * Math.PI * 2; return [(Math.cos(a) * w) / 2, h, (Math.sin(a) * d) / 2]; });
    m.fan(top, pts, (p) => [p[0] / w + 0.5, p[2] / d + 0.5]); // clockwise seen from above: its normal points up
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; m.quad(edge, [[b[0], 0, b[2]], [a[0], 0, a[2]], [a[0], h, a[2]], [b[0], h, b[2]]]); }
    return;
  }
  m.quad(top, [[-w / 2, h, d / 2], [w / 2, h, d / 2], [w / 2, h, -d / 2], [-w / 2, h, -d / 2]], [[0, 1], [1, 1], [1, 0], [0, 0]]);
  m.quad(edge, [[-w / 2, 0, d / 2], [w / 2, 0, d / 2], [w / 2, h, d / 2], [-w / 2, h, d / 2]]); m.quad(edge, [[w / 2, 0, -d / 2], [-w / 2, 0, -d / 2], [-w / 2, h, -d / 2], [w / 2, h, -d / 2]]);
  m.quad(edge, [[-w / 2, 0, -d / 2], [-w / 2, 0, d / 2], [-w / 2, h, d / 2], [-w / 2, h, -d / 2]]); m.quad(edge, [[w / 2, 0, d / 2], [w / 2, 0, -d / 2], [w / 2, h, -d / 2], [w / 2, h, d / 2]]);
  if (['persian', 'vintage', 'kilim'].includes(design)) {
    // a fringe at each end, a tassel every 2 cm
    const fringe = { name: 'fringe:fringe', colour: '#ece4d2', roughness: 0.9 };
    for (const s of [-1, 1]) for (let x = -w / 2 + 0.02; x < w / 2 - 0.01; x += 0.02) {
      const z0 = (s * d) / 2, z1 = z0 + s * (0.05 + 0.01 * hash(Math.round(x * 100), s, seed));
      m.quad(fringe, s > 0 ? [[x - 0.004, 0.003, z0], [x + 0.004, 0.003, z0], [x + 0.004, 0.003, z1], [x - 0.004, 0.003, z1]].reverse() : [[x - 0.004, 0.003, z0], [x + 0.004, 0.003, z0], [x + 0.004, 0.003, z1], [x - 0.004, 0.003, z1]]);
    }
  }
}

// shape, size name, [width, depth] in feet (a round one's diameter), its default design and colourway
const RUGS = [
  ['rect', '5x8ft', [5, 8], 'bordered', 'ivory'], ['rect', '6x9ft', [6, 9], 'diamond', 'sand'], ['rect', '8x10ft', [8, 10], 'persian', 'persian'], ['rect', '9x12ft', [9, 12], 'vintage', 'rust'],
  ['runner', '2.5x8ft', [2.5, 8], 'kilim', 'rust'], ['runner', '2.5x12ft', [2.5, 12], 'stripes', 'navy'],
  ['round', '4ft', [4, 4], 'jute', 'sand'], ['round', '6ft', [6, 6], 'moroccan', 'ivory'], ['round', '8ft', [8, 8], 'abstract', 'sage'],
  ['oval', '5x8ft', [5, 8], 'bordered', 'navy'],
];
const ID = { rect: 'RUGM', runner: 'RUGN', round: 'RUGR', oval: 'RUGO' };
const LABEL = { rect: 'Rug', runner: 'Runner rug', round: 'Round rug', oval: 'Oval rug' };

/** A rug's fit: its design and colourway, as asked for, else the entry's own. */
export const rugFit = ({ design, palette, seed } = {}, entry) => ({
  design: RUG_DESIGNS.includes(design) ? design : entry.rugDefault.design,
  palette: RUG_PALETTES[palette] ? palette : entry.rugDefault.palette,
  seed: Math.max(1, Math.round(seed ?? 1)),
});

export const rugEntries = RUGS.map(([shape, size, [wf, df], design, palette]) => {
  const w = Math.round(wf * FT * 1000) / 1000, d = Math.round(df * FT * 1000) / 1000;
  const e = {
    id: `${ID[shape]}-${size}`, name: `${LABEL[shape]}, ${size.replace('x', ' x ')}`, kind: 'rug', mount: 'rug', room: 'any', piece: ID[shape], sizeName: size, rug: true,
    rugDefault: { design, palette },
    words: ['rug', 'carpet', shape === 'rect' ? 'area rug' : shape, ...(shape === 'runner' ? ['hallway'] : []), ...(shape === 'round' ? ['circle', 'circular'] : [])],
    note: `${size} ${shape === 'round' ? 'across' : ''}; designs ${RUG_DESIGNS.join(', ')}; colourways ${Object.keys(RUG_PALETTES).join(', ')}`,
  };
  e.build = (fit) => { const f = rugFit(fit ?? {}, e), m = new Mesh(); rugMesh(m, shape, w, d, f.design, f.palette, f.seed); return m; };
  return e;
});
