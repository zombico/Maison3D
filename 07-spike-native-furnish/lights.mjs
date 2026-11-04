// Pot lights: recessed into the ceiling, round (4 and 6 in), square, or a gimbal that tilts; a trim of white, black,
// brass or nickel (its fit, like an appliance's finish). The lens glows (unlit). Built here (mesh.mjs) with its top at
// the ceiling: a ceiling piece hangs so its top meets it. Muse lays them out in a grid (agent.mjs `potlights`).
import { Mesh } from './mesh.mjs';

const IN = 0.0254;
export const TRIMS = {
  white: { colour: '#f4f3ef', metallic: 0, roughness: 0.4 },
  black: { colour: '#1e1e20', metallic: 0.2, roughness: 0.4 },
  brass: { colour: '#b9975b', metallic: 0.8, roughness: 0.3 },
  nickel: { colour: '#c5c7c8', metallic: 0.85, roughness: 0.25 },
};
const glow = { name: 'lens:lens', colour: '#fff3d6', unlit: true };
const H = 0.016; // how far the trim stands below the ceiling, and the glow a little up into it

function potLight(m, kind, d, trim) {
  const T = { name: 'trim:trim', ...(TRIMS[trim] ?? TRIMS.white) }, r = d / 2, ri = r * 0.72;
  if (kind === 'square') {
    m.box(T, [-r, H - 0.006, -r], [r, H, r]);
    m.box({ ...T, name: 'baffle:trim', colour: '#2a2a2a' }, [-ri, H - 0.02, -ri], [ri, H - 0.006, ri]);
    m.quad(glow, [[-ri * 0.7, H - 0.012, ri * 0.7], [ri * 0.7, H - 0.012, ri * 0.7], [ri * 0.7, H - 0.012, -ri * 0.7], [-ri * 0.7, H - 0.012, -ri * 0.7]]);
    m.box(T, [-0.001, 0, -0.001], [0.001, 0.001, 0.001]); // the bottom of its box, so a square sits like a round
    return;
  }
  // a round trim: a flange flush on the ceiling, a baffle stepping up into it, the lens at the top
  m.lathe(T, [[ri, H - 0.008], [r, H - 0.002], [r, H], [ri, H]], { segs: 32, caps: [false, false] });
  m.lathe({ ...T, name: 'baffle:trim', colour: trim === 'white' ? '#e9e8e3' : '#2a2a2a' }, [[ri, H - 0.008], [ri * 0.9, H + 0.01]], { segs: 32, caps: [false, false] });
  if (kind === 'gimbal') {
    // an eyeball that tips: a dome below the flange, its lens to one side
    m.lathe(T, [[0.001, 0], [ri * 0.75, 0.004], [ri * 0.85, H - 0.006], [0.001, H - 0.006]], { segs: 24 });
    m.lathe(glow, [[0.001, -0.0005], [ri * 0.45, 0.001]], { at: [ri * 0.12, 0, 0], segs: 24, caps: [false, false] });
  } else {
    m.lathe(glow, [[0.001, H + 0.008], [ri * 0.9, H + 0.008]], { segs: 32, caps: [false, false] });
    m.box(T, [-0.001, 0, -0.001], [0.001, 0.001, 0.001]); // a speck at the bottom: every pot light is the same height
  }
}

// --- ceiling lights: flush and semi-flush mounts, a chandelier, pendants, track lighting --------------------------------
const opal = { name: 'diffuser:glass', colour: '#f6efe2', roughness: 0.3, alpha: 0.85 };
const bulb = { name: 'bulbs:lens', colour: '#fff1d0', unlit: true };
const FIXTURES = {
  // a fabric drum close to the ceiling, its diffuser glowing underneath
  flush(m, T, d) {
    const r = d / 2, h = 0.16;
    m.lathe({ name: 'shade:fabric', colour: '#efe9de', roughness: 0.95 }, [[r, 0.01], [r, h - 0.01]], { segs: 40, caps: [false, false] });
    m.lathe(T, [[r * 0.4, h - 0.01], [r * 0.4, h], [0.001, h]], { segs: 24 });
    m.lathe(bulb, [[0.001, 0.02], [r * 0.96, 0.02]], { segs: 40, caps: [false, false] });
    return h;
  },
  // a frosted bowl on a short stem
  semi(m, T, d) {
    const r = d / 2, h = 0.34;
    m.lathe(T, [[0.07, h - 0.012], [0.07, h], [0.001, h]], { segs: 24 });
    m.tube(T, [[0, h, 0], [0, 0.14, 0]], 0.008, { sides: 8 });
    m.lathe(opal, [[0.001, 0], [r * 0.6, 0.02], [r, 0.09], [r * 0.98, 0.14]], { segs: 32, caps: [true, false] });
    m.lathe(bulb, [[0.001, 0.08], [0.03, 0.09], [0.001, 0.12]], { segs: 12 });
    return h;
  },
  // six curved arms with candle bulbs round a hub, on a rod from the canopy
  chandelier(m, T, d) {
    const r = d / 2, h = 0.66, hub = 0.09; // its arms' lowest point is the base
    m.lathe(T, [[0.08, h - 0.015], [0.08, h], [0.001, h]], { segs: 24 });
    m.tube(T, [[0, h, 0], [0, hub + 0.06, 0]], 0.009, { sides: 8 });
    m.lathe(T, [[0.001, hub - 0.06], [0.05, hub - 0.03], [0.055, hub + 0.03], [0.02, hub + 0.06], [0.001, hub + 0.06]], { segs: 18 });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      m.tube(T, [[c * 0.05, hub, s * 0.05], [c * r * 0.6, hub - 0.08, s * r * 0.6], [c * r, hub - 0.02, s * r], [c * r, hub + 0.03, s * r]], 0.007, { sides: 6 });
      m.lathe({ name: 'candles:candles', colour: '#f3efe6', roughness: 0.6 }, [[0.012, hub + 0.03], [0.012, hub + 0.12], [0.001, hub + 0.12]], { at: [c * r, 0, s * r], segs: 10 });
      m.lathe(bulb, [[0.001, hub + 0.12], [0.012, hub + 0.14], [0.001, hub + 0.17]], { at: [c * r, 0, s * r], segs: 10 });
    }
    return h;
  },
  // an opal glass globe on a cord
  globe(m, T, d) {
    const r = d / 2, h = 0.75;
    m.lathe(T, [[0.05, h - 0.012], [0.05, h], [0.001, h]], { segs: 20 });
    m.tube({ name: 'cord:cord', colour: '#1c1c1c' }, [[0, h, 0], [0, 2 * r + 0.03, 0]], 0.003, { sides: 6 });
    m.lathe(T, [[0.025, 2 * r - 0.01], [0.025, 2 * r + 0.03], [0.001, 2 * r + 0.03]], { segs: 14 });
    m.lathe(opal, Array.from({ length: 13 }, (_, i) => { const t = -Math.PI / 2 + (i / 12) * Math.PI; return [Math.max(0.004, Math.cos(t) * r), r + Math.sin(t) * r]; }), { segs: 28, caps: [false, false] });
    m.lathe(bulb, [[0.001, r - 0.03], [0.03, r], [0.001, r + 0.03]], { segs: 12 });
    return h;
  },
  // a slim bar over a table, glowing along its underside, on two cables
  linear(m, T, d) {
    const L = d, h = 0.75;
    for (const s of [-1, 1]) { m.tube({ name: 'cord:cord', colour: '#1c1c1c' }, [[s * L * 0.4, h, 0], [s * L * 0.4, 0.05, 0]], 0.002, { sides: 5 }); m.lathe(T, [[0.035, h - 0.01], [0.035, h], [0.001, h]], { at: [s * L * 0.4, 0, 0], segs: 14 }); }
    m.box(T, [-L / 2, 0.01, -0.03], [L / 2, 0.06, 0.03]);
    m.quad(bulb, [[-L / 2 + 0.01, 0.009, 0.022], [L / 2 - 0.01, 0.009, 0.022], [L / 2 - 0.01, 0.009, -0.022], [-L / 2 + 0.01, 0.009, -0.022]]);
    return h;
  },
  // a rail on the ceiling, four heads angled down
  track(m, T, d) {
    const L = d, h = 0.2;
    m.box(T, [-L / 2, h - 0.03, -0.02], [L / 2, h, 0.02]);
    for (let k = 0; k < 4; k++) {
      const x = -L / 2 + L * ((k + 0.5) / 4), tilt = k % 2 ? 0.25 : -0.25;
      m.tube(T, [[x, h - 0.03, 0], [x, h - 0.08, 0]], 0.006, { sides: 6 });
      m.tube(T, [[x, 0.12, -tilt * 0.12], [x, 0.03, tilt * 0.12]], 0.035, { sides: 14, closeEnds: true });
      m.lathe(bulb, [[0.001, 0], [0.026, 0.0]], { at: [x, 0.025, tilt * 0.13], segs: 14, caps: [false, false] });
    }
    return h;
  },
};
// id, fixture, size (across, metres), name, lumens, where its light comes from (local, base at y = 0)
const CEILING = [
  ['CLF-14in', 'flush', 0.36, 'Flush mount ceiling light, 14in drum', 1600, () => [[0, 0.03, 0]]],
  ['CLF-20in', 'flush', 0.5, 'Flush mount ceiling light, 20in drum', 2400, () => [[0, 0.03, 0]]],
  ['CLS', 'semi', 0.4, 'Semi-flush ceiling light, frosted bowl', 1400, () => [[0, 0.09, 0]]],
  ['CHD', 'chandelier', 0.7, 'Chandelier, six arms', 2400, () => [[0, 0.2, 0]]],
  ['PDG-25cm', 'globe', 0.25, 'Globe pendant, 25cm opal glass', 800, (d) => [[0, d / 2, 0]]],
  ['PDG-35cm', 'globe', 0.35, 'Globe pendant, 35cm opal glass', 1100, (d) => [[0, d / 2, 0]]],
  ['PDL-120cm', 'linear', 1.2, 'Linear pendant, 120cm, over a table', 3000, (d) => [-0.33, 0, 0.33].map((x) => [x * d, 0.0, 0])],
  ['TRK-150cm', 'track', 1.5, 'Track lighting, four heads, 150cm', 1800, (d) => [0, 1, 2, 3].map((k) => [-d / 2 + d * ((k + 0.5) / 4), 0.02, 0])],
];
export const ceilingEntries = CEILING.map(([id, fixture, d, name, lumens, at]) => ({
  id, name, kind: 'light', mount: 'ceiling', room: 'any', piece: id.split('-')[0], sizeName: id.split('-')[1] ?? 'std',
  words: ['ceiling light', 'light', 'lighting', fixture === 'chandelier' ? 'chandelier' : fixture === 'track' ? 'track lighting' : fixture === 'linear' ? 'linear pendant' : fixture === 'globe' ? 'pendant' : 'flush mount', fixture],
  note: `${lumens} lm; ${fixture === 'flush' || fixture === 'semi' ? 'close to the ceiling' : fixture === 'track' ? 'on the ceiling, its heads angled' : 'hangs about 75 cm'}; finish ${Object.keys(TRIMS).join(', ')}`, finishes: Object.keys(TRIMS),
  light: { lumens, at: at(d), kind: fixture === 'track' ? 'spot' : 'point' },
  build: (fit) => { const m = new Mesh(); FIXTURES[fixture](m, { name: 'body:trim', ...(TRIMS[fit?.finish ?? (fixture === 'chandelier' ? 'brass' : 'black')] ?? TRIMS.black) }, d); return m; },
}));

/** Where the inventory's lamps give their light (local, base at y = 0): a floor lamp's shade, a pendant's, a sconce's. */
export function lampLight(entry) {
  const [w, h, d] = entry.size;
  if (entry.piece === 'FLP') return { lumens: 1500, at: [[0, h - 0.18, 0]], kind: 'point' };
  if (entry.piece === 'TLP') return { lumens: 800, at: [[0, h - 0.1, 0]], kind: 'point' };
  if (entry.piece === 'PND') return { lumens: 1200, at: [[0, 0.12, 0]], kind: 'point' };
  if (entry.piece === 'SCN') return { lumens: 450, at: [[0, h * 0.7, d * 0.2]], kind: 'point' };
  if (entry.piece === 'FPL') return { lumens: 400, at: [[0, 0.25, 0]], kind: 'point', colour: '#ff9a4a' };
  return null;
}

const LIGHTS = [
  ['PTL-4in', 'round', 4, 'Pot light, 4in round'], ['PTL-6in', 'round', 6, 'Pot light, 6in round'],
  ['PTS-4in', 'square', 4, 'Pot light, 4in square'], ['PTG-4in', 'gimbal', 4, 'Pot light, 4in gimbal (tilts)'],
];
export const lightEntries = LIGHTS.map(([id, kind, inch, name]) => ({
  id, name, kind: 'light', mount: 'ceiling', room: 'any', piece: id.split('-')[0], sizeName: `${inch}in`, potlight: true,
  words: ['pot light', 'potlight', 'pot lights', 'recessed light', 'downlight', 'can light', 'ceiling light', kind],
  note: `recessed in the ceiling; trim ${Object.keys(TRIMS).join(', ')}; lay several out with potlights`, finishes: Object.keys(TRIMS),
  light: { lumens: inch >= 6 ? 900 : 650, at: [[0, 0.004, 0]], kind: 'spot' },
  build: (fit) => { const m = new Mesh(); potLight(m, kind, inch * IN + 0.03, fit?.finish ?? 'white'); return m; },
}));
