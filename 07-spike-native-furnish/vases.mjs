// Vases: turned shapes (a bud vase, a bottle, an amphora, a jug, a cylinder, a moon jar, a ribbed vase, a footed bowl,
// tall floor vases), some with something in them (pampas grass, eucalyptus branches, an olive branch, tulips), in a
// glaze or a glass that is their fit, like an appliance's finish. Built here (mesh.mjs): base at y = 0, centred.
import { Mesh, dice } from './mesh.mjs';

export const GLAZES = {
  white: { colour: '#f2efe8', roughness: 0.25 }, cream: { colour: '#e6dac2', roughness: 0.6 }, terracotta: { colour: '#b8643f', roughness: 0.85 },
  black: { colour: '#252423', roughness: 0.35 }, sage: { colour: '#9aa98d', roughness: 0.4 }, blue: { colour: '#4f6d8f', roughness: 0.25 },
  stone: { colour: '#b9b2a6', roughness: 0.9 }, glass: { colour: '#d5e6e2', roughness: 0.05, alpha: 0.35 }, amber: { colour: '#b07a2a', roughness: 0.05, alpha: 0.5 },
};
const glazeOf = (g, fallback) => ({ name: 'vase:glaze', ...(GLAZES[g] ?? GLAZES[fallback]) });

// profiles: [radius, height] bottom to top, in metres, for a vase `h` tall
const SHAPES = {
  bud: (h) => [[0.03, 0], [0.034, 0.01], [0.042, h * 0.35], [0.018, h * 0.75], [0.012, h * 0.95], [0.016, h], [0.011, h]],
  bottle: (h) => [[0.05, 0], [0.058, 0.01], [0.062, h * 0.5], [0.05, h * 0.62], [0.02, h * 0.74], [0.017, h * 0.96], [0.021, h], [0.015, h]],
  amphora: (h) => [[0.05, 0], [0.06, 0.012], [0.11, h * 0.42], [0.1, h * 0.62], [0.05, h * 0.82], [0.045, h * 0.94], [0.06, h], [0.052, h]],
  jug: (h) => [[0.06, 0], [0.068, 0.01], [0.085, h * 0.45], [0.07, h * 0.75], [0.055, h * 0.9], [0.065, h], [0.058, h]],
  cylinder: (h) => [[0.06, 0], [0.065, 0.006], [0.065, h], [0.058, h], [0.058, h - 0.02]],
  moon: (h) => [[0.06, 0], [0.08, 0.01], [h * 0.48, h * 0.4], [h * 0.42, h * 0.75], [0.07, h * 0.95], [0.075, h], [0.065, h]],
  ribbed: (h) => [[0.055, 0], [0.065, 0.01], [0.085, h * 0.5], [0.07, h * 0.9], [0.075, h], [0.068, h]],
  bowl: (h) => [[0.05, 0], [0.055, h * 0.15], [0.07, h * 0.25], [0.15, h * 0.75], [0.17, h], [0.162, h], [0.13, h * 0.7]],
  floor: (h) => [[0.09, 0], [0.1, 0.012], [0.15, h * 0.35], [0.13, h * 0.7], [0.07, h * 0.9], [0.075, h], [0.066, h]],
};

/** A disc (a leaf, a petal) at `c`, facing `n`, of radius `r`. */
function disc(m, mat, c, n, r, k = 10) {
  const a = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = [n[1] * a[2] - n[2] * a[1], n[2] * a[0] - n[0] * a[2], n[0] * a[1] - n[1] * a[0]], ul = Math.hypot(...u); for (let i = 0; i < 3; i++) u[i] /= ul;
  const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  m.fan(mat, Array.from({ length: k }, (_, i) => { const t = (i / k) * Math.PI * 2; return [0, 1, 2].map((j) => c[j] + (u[j] * Math.cos(t) + v[j] * Math.sin(t)) * r); }));
}

/** What stands in the vase, from its mouth at height `top`. */
function stems(m, kind, top, seed) {
  const r = dice(seed), stem = { name: 'stems:stems', colour: kind === 'pampas' ? '#c8b38a' : '#6c7a52', roughness: 0.8 };
  const n = { pampas: 7, eucalyptus: 6, olive: 4, tulips: 7 }[kind];
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, lean = 0.12 + r() * 0.25, len = { pampas: 0.75, eucalyptus: 0.5, olive: 0.6, tulips: 0.3 }[kind] * (0.8 + r() * 0.4);
    const tip = [Math.cos(a) * lean * len, top + len * Math.sqrt(1 - lean * lean), Math.sin(a) * lean * len], mid = tip.map((v, k) => (k === 1 ? top + (v - top) * 0.5 : v * 0.4));
    m.tube(stem, [[0, top - 0.08, 0], mid, tip], 0.003, { sides: 4 });
    if (kind === 'pampas') {
      // a plume: a soft spindle along the top of the stem
      const d = tip.map((v, k) => v - mid[k]), L = Math.hypot(...d);
      for (let k = 0; k < 6; k++) { const t = 0.35 + k * 0.13, rr = 0.028 * Math.sin(Math.PI * Math.min(1, (t - 0.3) / 0.75)); m.lathe({ name: 'plumes:plumes', colour: '#e3d3b4', roughness: 1 }, [[0.001, 0], [rr, 0.03], [0.001, 0.06]], { at: mid.map((v, j) => v + d[j] * t - (j === 1 ? 0.03 : 0)), segs: 8 }); }
      void L;
    } else if (kind === 'tulips') {
      m.lathe({ name: 'flowers:flowers', colour: ['#d9534f', '#f2c14e', '#f4a7b9'][i % 3], roughness: 0.6 }, [[0.001, 0], [0.022, 0.012], [0.024, 0.04], [0.016, 0.055]], { at: tip, segs: 10 });
    } else {
      // leaves along the stem: round for eucalyptus, narrow for olive
      const leaf = { name: 'leaves:leaves', colour: kind === 'eucalyptus' ? '#8fa79a' : '#7d8a5c', roughness: 0.7 };
      for (let k = 0; k < 9; k++) {
        const t = 0.2 + k * 0.09, p = [0, 1, 2].map((j) => mid[j] + (tip[j] - mid[j]) * (t * 1.1 - 0.1) + (j !== 1 ? (r() - 0.5) * 0.04 : 0));
        if (kind === 'eucalyptus') disc(m, leaf, p, [Math.cos(a + k), 0.3, Math.sin(a + k)], 0.018);
        else disc(m, leaf, p, [Math.cos(a + k * 1.7), 0.5, Math.sin(a + k * 1.7)], 0.012, 6);
      }
    }
  }
}

function vase(m, shape, h, glaze, fill, seed) {
  const G = glazeOf(glaze, 'white'), prof = SHAPES[shape](h);
  m.lathe(G, prof, { segs: 32, caps: [true, false], ribs: shape === 'ribbed' ? [24, 0.06] : null });
  if (shape === 'jug') m.tube(G, [[0.07, h * 0.86, 0], [0.13, h * 0.8, 0], [0.12, h * 0.5, 0], [0.08, h * 0.45, 0]], 0.009, { sides: 6 });
  if (fill) stems(m, fill, h, seed);
}

// id, label, shape, height, glaze, fill, words
const VASES = [
  ['VSE-BUD', 'bud vase', 'bud', 0.18, 'sage', null, ['bud vase', 'small vase']],
  ['VSE-BUD-TULIPS', 'vase of tulips', 'bud', 0.2, 'white', 'tulips', ['tulips', 'flowers', 'bouquet']],
  ['VSE-BOTTLE', 'bottle vase', 'bottle', 0.3, 'terracotta', null, ['bottle vase', 'bottle']],
  ['VSE-AMPHORA', 'amphora vase', 'amphora', 0.38, 'cream', null, ['amphora', 'urn']],
  ['VSE-JUG', 'jug vase', 'jug', 0.28, 'stone', null, ['jug', 'pitcher']],
  ['VSE-CYL-EUCALYPTUS', 'glass cylinder of eucalyptus', 'cylinder', 0.3, 'glass', 'eucalyptus', ['eucalyptus', 'greenery', 'branches', 'glass vase']],
  ['VSE-MOON', 'moon jar', 'moon', 0.34, 'white', null, ['moon jar', 'round vase', 'ginger jar']],
  ['VSE-RIBBED', 'ribbed vase', 'ribbed', 0.26, 'black', null, ['ribbed vase', 'fluted vase']],
  ['VSE-BOWL', 'footed bowl', 'bowl', 0.16, 'cream', null, ['bowl', 'footed bowl', 'centrepiece', 'fruit bowl']],
  ['VSE-FLOOR-PAMPAS', 'floor vase of pampas grass', 'floor', 0.6, 'terracotta', 'pampas', ['floor vase', 'pampas', 'pampas grass', 'dried grass', 'tall vase']],
  ['VSE-FLOOR-OLIVE', 'floor vase of olive branches', 'floor', 0.75, 'stone', 'olive', ['floor vase', 'olive branches', 'branches', 'tall vase']],
];
export const vaseEntries = VASES.map(([id, label, shape, h, glaze, fill, words]) => ({
  id, name: `${label[0].toUpperCase()}${label.slice(1)}`, kind: 'vase', mount: shape === 'floor' ? 'floor' : 'surface', room: 'any', piece: id, words: ['vase', 'decor', ...words],
  note: `${Math.round(h * 100)} cm${fill ? ` with ${fill}` : ''}; glaze ${Object.keys(GLAZES).join(', ')}`, finishes: Object.keys(GLAZES),
  build: (fit) => { const m = new Mesh(); vase(m, shape, h, fit?.finish ?? glaze, fill, id.length * 7); return m; },
}));
