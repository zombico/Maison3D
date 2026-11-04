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

const LIGHTS = [
  ['PTL-4in', 'round', 4, 'Pot light, 4in round'], ['PTL-6in', 'round', 6, 'Pot light, 6in round'],
  ['PTS-4in', 'square', 4, 'Pot light, 4in square'], ['PTG-4in', 'gimbal', 4, 'Pot light, 4in gimbal (tilts)'],
];
export const lightEntries = LIGHTS.map(([id, kind, inch, name]) => ({
  id, name, kind: 'light', mount: 'ceiling', room: 'any', piece: id.split('-')[0], sizeName: `${inch}in`, potlight: true,
  words: ['pot light', 'potlight', 'pot lights', 'recessed light', 'downlight', 'can light', 'ceiling light', kind],
  note: `recessed in the ceiling; trim ${Object.keys(TRIMS).join(', ')}; lay several out with potlights`, finishes: Object.keys(TRIMS),
  build: (fit) => { const m = new Mesh(); potLight(m, kind, inch * IN + 0.03, fit?.finish ?? 'white'); return m; },
}));
