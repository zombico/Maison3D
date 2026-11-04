// Media and entertainment: the ways a television stands in a room, and the things around it that take up space.
// Consoles with open shelves, drawers, an open middle bay or slatted doors, on the legs of the collection they match;
// a floating console on the wall; a corner console; entertainment centres (towers, a bridge and a base round the TV);
// televisions 43 to 85 in, on the wall or on their own feet; easel and pedestal floor stands; soundbars, speakers, a
// subwoofer, a game console, a turntable; a projector and a pull-down screen. Built here (mesh.mjs) like the
// appliances: front to +z, base at y = 0, each size its own catalogue piece (so "a bigger one" is the next one up). A
// piece's finish (a collection's, or oak, walnut, white, black) is its fit, like an appliance's.
import { Mesh } from './mesh.mjs';
import { COLLECTIONS } from '../70-inventory/catalogue.mjs';
import { WOOD_TONE } from '../70-inventory/recipes.mjs';

const IN = 0.0254;
const R = (v) => Math.round(v * 1000) / 1000;
const shade = (hex, k) => `#${[1, 3, 5].map((i) => Math.round(Math.min(255, parseInt(hex.slice(i, i + 2), 16) * k)).toString(16).padStart(2, '0')).join('')}`;

/** Finishes for media furniture: the carcass, the wood (legs, a top), the legs' style. A collection's matches its cabinets. */
export const MEDIA_FINISHES = {
  oak: { body: WOOD_TONE.oak, wood: WOOD_TONE.oak, legs: 'block' },
  walnut: { body: WOOD_TONE.walnut, wood: WOOD_TONE.walnut, legs: 'tapered' },
  white: { body: '#f1efe9', wood: WOOD_TONE.oak, legs: 'tapered', painted: true },
  black: { body: '#2a2a2d', wood: '#2a2a2d', legs: 'block', painted: true },
  ...Object.fromEntries(COLLECTIONS.map((c) => [c.code, { body: c.mojulo.paint ?? WOOD_TONE[c.mojulo.timber], wood: WOOD_TONE[c.mojulo.timber], legs: c.mojulo.legs ?? 'block', painted: !!c.mojulo.paint }])),
};
const DEFAULT_FINISH = 'oak';
const finishOf = (fit) => MEDIA_FINISHES[fit?.finish] ?? MEDIA_FINISHES[DEFAULT_FINISH];

const matsOf = (F) => ({
  body: { name: 'body:body', colour: F.body, roughness: F.painted ? 0.5 : 0.62 },
  inside: { name: 'inside:body', colour: shade(F.body, 0.74), roughness: 0.7 },
  wood: { name: 'legs:wood', colour: F.wood, roughness: 0.6 },
  gap: { name: 'gap:gap', colour: '#161514' },
  pull: { name: 'pulls:metal', colour: F.painted ? '#b0965f' : '#2c2b29', metallic: 0.6, roughness: 0.35 },
  slat: { name: 'slats:wood', colour: shade(F.wood, 1.04), roughness: 0.6 },
});
const black = { name: 'body:body', colour: '#1b1c1e', roughness: 0.45, metallic: 0.15 };
const screenMat = { name: 'screen:screen', colour: '#0a0b0e', roughness: 0.12, metallic: 0.1 };
const grille = { name: 'grille:fabric', colour: '#3a3b3d', roughness: 0.95 };
const driver = { name: 'drivers:drivers', colour: '#101012', roughness: 0.5 };
const metal = { name: 'stand:metal', colour: '#2b2c2f', metallic: 0.55, roughness: 0.35 };
const ring = (cx, cy, z, r, n = 24) => Array.from({ length: n }, (_, i) => { const a = (-i / n) * Math.PI * 2; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r, z]; });
/** A speaker driver on a front face at z: its surround, the cone, a dust cap. */
function speakerDriver(m, cx, cy, z, r) {
  m.fan({ name: 'surround:drivers', colour: '#262628', roughness: 0.6 }, ring(cx, cy, z + 0.001, r).reverse());
  m.fan(driver, ring(cx, cy, z + 0.003, r * 0.82).reverse());
  m.fan({ name: 'cap:drivers', colour: '#3a3a3c', roughness: 0.3 }, ring(cx, cy, z + 0.006, r * 0.28).reverse());
}

// --- legs and carcasses ------------------------------------------------------------------------------------------------
const LEG_H = { block: 0.12, tapered: 0.17, turned: 0.15, bun: 0.07, hairpin: 0.18 };
/** Legs at `spots` ([x, z]) in a style; returns their height. */
function legs(m, mat, style, spots) {
  const h = LEG_H[style] ?? 0.12;
  for (const [x, z] of spots) {
    if (style === 'tapered') m.lathe(mat, [[0.001, 0], [0.013, 0], [0.024, h], [0.001, h]], { at: [x, 0, z], segs: 12 });
    else if (style === 'turned') m.lathe(mat, [[0.001, 0], [0.016, 0], [0.02, h * 0.12], [0.013, h * 0.3], [0.026, h * 0.55], [0.015, h * 0.8], [0.024, h * 0.92], [0.024, h], [0.001, h]], { at: [x, 0, z], segs: 14 });
    else if (style === 'bun') m.lathe(mat, [[0.001, 0], [0.026, 0.003], [0.042, h * 0.45], [0.034, h * 0.85], [0.022, h], [0.001, h]], { at: [x, 0, z], segs: 16 });
    else if (style === 'hairpin') m.tube({ ...metal, name: 'legs:metal' }, [[x - 0.035, h, z], [x, 0.004, z], [x + 0.035, h, z]], 0.005, { sides: 6 });
    else m.box(mat, [x - 0.025, 0, z - 0.025], [x + 0.025, h, z + 0.025]);
  }
  return h;
}
const cornerSpots = (w, d, inset = 0.06) => {
  const xs = w > 1.9 ? [-w / 2 + inset, 0, w / 2 - inset] : [-w / 2 + inset, w / 2 - inset];
  return xs.flatMap((x) => [[x, -d / 2 + inset], [x, d / 2 - inset]]);
};

const T = 0.018;
/** A box open at the front: top, bottom, sides, and a back in the inside colour. */
function carcass(m, M, x0, x1, y0, y1, z0, z1, { back = true } = {}) {
  m.box(M.body, [x0, y1 - T, z0], [x1, y1, z1]);
  m.box(M.body, [x0, y0, z0], [x1, y0 + T, z1]);
  m.box(M.body, [x0, y0, z0], [x0 + T, y1, z1]);
  m.box(M.body, [x1 - T, y0, z0], [x1, y1, z1]);
  if (back) m.box(M.inside, [x0 + T, y0 + T, z0], [x1 - T, y1 - T, z0 + 0.008]);
}

/** One bay's front, between x0 and x1 and y0 and y1, its face at z (the carcass's front), z0 its back. */
function bay(m, M, kind, x0, x1, y0, y1, z, z0, { pullAt = 'right' } = {}) {
  const panel = (a, b, c, e) => m.box(M.body, [a + 0.002, c + 0.002, z - 0.018], [b - 0.002, e - 0.002, z]);
  const behind = () => m.quad(M.gap, [[x0, y0, z - 0.02], [x1, y0, z - 0.02], [x1, y1, z - 0.02], [x0, y1, z - 0.02]]);
  const vpull = (x, c, e) => m.box(M.pull, [x - 0.006, (c + e) / 2 - 0.05, z], [x + 0.006, (c + e) / 2 + 0.05, z + 0.018]);
  const hpull = (y) => m.box(M.pull, [(x0 + x1) / 2 - 0.06, y - 0.006, z], [(x0 + x1) / 2 + 0.06, y + 0.006, z + 0.018]);
  if (kind === 'open') {
    // an open bay: the inside shows; a shelf halfway when it is tall enough
    m.quad(M.inside, [[x0, y0, z0 + 0.009], [x1, y0, z0 + 0.009], [x1, y1, z0 + 0.009], [x0, y1, z0 + 0.009]].reverse());
    if (y1 - y0 > 0.26) { const ym = (y0 + y1) / 2; m.box(M.body, [x0, ym - T / 2, z0 + 0.01], [x1, ym + T / 2, z - 0.02]); }
  } else if (kind === 'shelves') {
    m.quad(M.inside, [[x0, y0, z0 + 0.009], [x1, y0, z0 + 0.009], [x1, y1, z0 + 0.009], [x0, y1, z0 + 0.009]].reverse());
    const n = Math.max(1, Math.round((y1 - y0) / 0.34) - 1);
    for (let k = 1; k <= n; k++) { const y = y0 + ((y1 - y0) * k) / (n + 1); m.box(M.body, [x0, y - T / 2, z0 + 0.01], [x1, y + T / 2, z - 0.005]); }
  } else if (kind === 'door') {
    behind(); panel(x0, x1, y0, y1); vpull(pullAt === 'right' ? x1 - 0.04 : x0 + 0.04, y0, y1);
  } else if (kind === 'doors') {
    behind(); const xm = (x0 + x1) / 2; panel(x0, xm, y0, y1); panel(xm, x1, y0, y1); vpull(xm - 0.03, y0, y1); vpull(xm + 0.03, y0, y1);
  } else if (kind === 'drawers') {
    behind(); const n = y1 - y0 > 0.32 ? 2 : 1;
    for (let k = 0; k < n; k++) { const a = y0 + ((y1 - y0) * k) / n, b = y0 + ((y1 - y0) * (k + 1)) / n; panel(x0, x1, a, b); hpull(b - 0.045); }
  } else if (kind === 'flap') {
    behind(); panel(x0, x1, y0, y1); hpull(y1 - 0.035);
  } else if (kind === 'slats') {
    // slatted doors: vertical slats over a dark backing, the doors meeting in the middle
    behind(); m.box(M.inside, [x0 + 0.002, y0 + 0.002, z - 0.018], [x1 - 0.002, y1 - 0.002, z - 0.012]);
    const xm = (x0 + x1) / 2, pitch = 0.03;
    for (const [a, b] of [[x0 + 0.006, xm - 0.004], [xm + 0.004, x1 - 0.006]]) for (let x = a; x + 0.018 <= b + 1e-6; x += pitch) m.box(M.slat, [x, y0 + 0.004, z - 0.012], [Math.min(b, x + 0.018), y1 - 0.004, z]);
  }
}

/** A run of bays across a carcass's front: `kinds` left to right, with dividers between. */
function bays(m, M, kinds, x0, x1, y0, y1, z0, z1) {
  const n = kinds.length, iw = (x1 - x0 - 2 * T) / n;
  for (let i = 0; i < n; i++) {
    const a = x0 + T + i * iw, b = a + iw;
    if (i > 0) m.box(M.body, [a - T / 2, y0 + T, z0], [a + T / 2, y1 - T, z1 - 0.018]);
    bay(m, M, kinds[i], a + (i > 0 ? T / 2 : 0), b - (i < n - 1 ? T / 2 : 0), y0 + T, y1 - T, z1, z0, { pullAt: i < n / 2 ? 'right' : 'left' });
  }
}
const odd = (w, per) => 2 * Math.round((w / per - 1) / 2) + 1;

// --- consoles ----------------------------------------------------------------------------------------------------------
const CONSOLES = {
  // design: label, base ('legs' the finish's, 'plinth', 'wall'), height, depth, the bays across its width
  'MCO-OPEN': { label: 'open media console', base: 'legs', h: 0.52, d: 0.42, kinds: (w) => Array(Math.max(2, Math.round(w / 0.6))).fill('open'), words: ['open shelves', 'open shelf'], note: 'open shelves for a player, a console, books' },
  'MCO-DRAW': { label: 'media console with drawers', base: 'plinth', h: 0.55, d: 0.42, kinds: (w) => Array(Math.max(2, Math.round(w / 0.6))).fill('drawers'), words: ['drawers'], note: 'drawers, two to a bay, on a plinth' },
  'MCO-BAY': { label: 'media console with an open bay', base: 'legs', h: 0.52, d: 0.42, kinds: (w) => { const n = odd(w, 0.55); return Array.from({ length: n }, (_, i) => (i === 0 || i === n - 1 ? 'door' : 'open')); }, words: ['doors', 'open middle', 'bay'], note: 'doors each end, the middle open with a shelf for a player or a game console' },
  'MCO-SLAT': { label: 'slatted media console', base: 'legs', h: 0.52, d: 0.42, kinds: (w) => Array(Math.max(2, Math.round(w / 0.6))).fill('slats'), words: ['slatted', 'slats', 'japandi', 'fluted'], note: 'slatted doors in the wood' },
  MCF: { label: 'floating media console', base: 'wall', h: 0.32, d: 0.36, kinds: (w) => { const n = odd(w, 0.55); return Array.from({ length: n }, (_, i) => (i === 0 || i === n - 1 ? 'flap' : 'open')); }, words: ['floating', 'wall-hung', 'wall mounted'], note: 'hung on the wall, about 35 cm off the floor: flaps each end, the middle open' },
};
function consoleBuild(m, F, design, w) {
  const M = matsOf(F), { h, d } = design;
  let y0 = 0;
  if (design.base === 'plinth') { m.box(M.inside, [-w / 2 + 0.04, 0, -d / 2 + 0.03], [w / 2 - 0.04, 0.06, d / 2 - 0.05]); y0 = 0.06; }
  else if (design.base === 'legs') y0 = legs(m, M.wood, F.legs, cornerSpots(w, d));
  // the listed height is the top's, whatever lifts it: taller legs make a shallower carcass
  const y1 = Math.max(y0 + 0.3, h);
  carcass(m, M, -w / 2, w / 2, y0, y1, -d / 2, d / 2);
  bays(m, M, design.kinds(w), -w / 2, w / 2, y0, y1, -d / 2, d / 2);
}

/** A corner console: a triangle in plan, its back corner in the room's corner, its front across it. */
function cornerBuild(m, F, w) {
  const M = matsOf(F), d = w / 2, h = 0.52;
  const y0 = legs(m, M.wood, F.legs, [[-w / 2 + 0.1, d / 2 - 0.06], [w / 2 - 0.1, d / 2 - 0.06], [0, -d / 2 + 0.12]]);
  const y1 = Math.max(y0 + 0.3, h); // the top at h, like the other consoles
  for (const [y, up] of [[y1, true], [y1 - T, false], [y0 + T, true], [y0, false]]) {
    const pts = [[-w / 2, y, d / 2], [w / 2, y, d / 2], [0, y, -d / 2]];
    m.fan(M.body, up ? pts.reverse() : pts);
  }
  // the two backs, along the walls, and the slabs' front edges
  m.quad(M.body, [[0, y0, -d / 2], [-w / 2, y0, d / 2], [-w / 2, y1, d / 2], [0, y1, -d / 2]]);
  m.quad(M.body, [[w / 2, y0, d / 2], [0, y0, -d / 2], [0, y1, -d / 2], [w / 2, y1, d / 2]]);
  m.box(M.body, [-w / 2, y1 - T, d / 2 - 0.02], [w / 2, y1, d / 2]); m.box(M.body, [-w / 2, y0, d / 2 - 0.02], [w / 2, y0 + T, d / 2]);
  m.box(M.body, [-w / 2, y0, d / 2 - 0.04], [-w / 2 + T, y1, d / 2]); m.box(M.body, [w / 2 - T, y0, d / 2 - 0.04], [w / 2, y1, d / 2]);
  // three bays: a door, the open middle (as deep as the corner lets it), a door
  const iw = (w - 2 * T) / 3, a = -w / 2 + T, zb = d / 2 - Math.min(0.3, d * 0.7);
  bay(m, M, 'door', a, a + iw - T / 2, y0 + T, y1 - T, d / 2, zb, { pullAt: 'right' });
  bay(m, M, 'open', a + iw + T / 2, a + 2 * iw - T / 2, y0 + T, y1 - T, d / 2, zb);
  bay(m, M, 'door', a + 2 * iw + T / 2, a + 3 * iw, y0 + T, y1 - T, d / 2, zb, { pullAt: 'left' });
  for (const x of [a + iw, a + 2 * iw]) m.box(M.body, [x - T / 2, y0 + T, zb], [x + T / 2, y1 - T, d / 2 - 0.018]);
  m.box(M.inside, [a + iw + T / 2, y0 + T, zb - 0.008], [a + 2 * iw - T / 2, y1 - T, zb]);
}

// --- entertainment centres ---------------------------------------------------------------------------------------------
const TOWER = 0.45, BASE_H = 0.45, BRIDGE_H = 0.32;
/** Towers each side, a bridge across the top and a low base, the TV in the opening between (open to the wall). */
function centreBuild(m, F, w, h, d, kind) {
  const M = matsOf(F), td = d - 0.04;
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? -w / 2 : w / 2 - TOWER, x1 = x0 + TOWER;
    m.box(M.inside, [x0 + 0.02, 0, -d / 2 + 0.02], [x1 - 0.02, 0.05, -d / 2 + td - 0.03]); // the plinth
    carcass(m, M, x0, x1, 0.05, h, -d / 2, -d / 2 + td);
    if (kind === 'library') {
      bay(m, M, 'doors', x0 + T, x1 - T, 0.05 + T, 0.62, -d / 2 + td, -d / 2);
      m.box(M.body, [x0 + T, 0.62, -d / 2], [x1 - T, 0.62 + T, -d / 2 + td]);
      bay(m, M, 'shelves', x0 + T, x1 - T, 0.62 + T, h - T, -d / 2 + td, -d / 2);
    } else {
      bay(m, M, 'door', x0 + T, x1 - T, 0.05 + T, 0.78, -d / 2 + td, -d / 2, { pullAt: side < 0 ? 'right' : 'left' });
      m.box(M.body, [x0 + T, 0.78, -d / 2], [x1 - T, 0.78 + T, -d / 2 + td]);
      bay(m, M, 'door', x0 + T, x1 - T, 0.78 + T, h - T, -d / 2 + td, -d / 2, { pullAt: side < 0 ? 'right' : 'left' });
    }
  }
  const bx0 = -w / 2 + TOWER, bx1 = w / 2 - TOWER, bw = bx1 - bx0;
  // the base: full depth, a plinth under it
  m.box(M.inside, [bx0 + 0.02, 0, -d / 2 + 0.02], [bx1 - 0.02, 0.05, d / 2 - 0.04]);
  carcass(m, M, bx0, bx1, 0.05, BASE_H, -d / 2, d / 2);
  bays(m, M, kind === 'library' ? Array(Math.max(2, Math.round(bw / 0.6))).fill('drawers') : (() => { const n = odd(bw, 0.5); return Array.from({ length: n }, (_, i) => (i === 0 || i === n - 1 ? 'door' : 'open')); })(), bx0, bx1, 0.05, BASE_H, -d / 2, d / 2);
  // the bridge, as deep as the towers
  carcass(m, M, bx0, bx1, h - BRIDGE_H, h, -d / 2, -d / 2 + td);
  bays(m, M, Array(Math.max(2, Math.round(bw / 0.6))).fill(kind === 'library' ? 'open' : 'flap'), bx0, bx1, h - BRIDGE_H, h, -d / 2, -d / 2 + td);
}

// --- televisions -------------------------------------------------------------------------------------------------------
const TV_SIZES = [43, 50, 55, 65, 75, 85];
/** A 16:9 TV's face: [width, height] in metres, bezel and all. */
const tvFace = (inch) => [R(inch * 0.8716 * IN + 0.016), R(inch * 0.4903 * IN + 0.016)];
/** The panel, its face at z, bottom at y0; a box of electronics behind. */
function tvPanel(m, inch, y0, z) {
  const [w, h] = tvFace(inch), dp = inch >= 65 ? 0.028 : 0.032;
  m.box(black, [-w / 2, y0, z - dp], [w / 2, y0 + h, z]);
  m.box(black, [-w * 0.32, y0 + h * 0.12, z - dp - 0.03], [w * 0.32, y0 + h * 0.62, z - dp]);
  m.quad(screenMat, [[-w / 2 + 0.007, y0 + 0.012, z + 0.001], [w / 2 - 0.007, y0 + 0.012, z + 0.001], [w / 2 - 0.007, y0 + h - 0.007, z + 0.001], [-w / 2 + 0.007, y0 + h - 0.007, z + 0.001]]);
  return { w, h, back: z - dp - 0.03 };
}
const TV_CENTRE = 1.1; // seated eye height: a TV's middle about here

function tvOnFeet(m, inch) {
  const [w] = tvFace(inch), lift = 0.065, x = w / 2 - Math.min(0.2, w * 0.12);
  tvPanel(m, inch, lift, 0.015);
  for (const s of [-1, 1]) {
    m.tube(metal, [[s * x, 0.006, 0.12], [s * x, lift + 0.01, 0], [s * x, 0.006, -0.11]], 0.009, { sides: 8 });
    for (const z of [0.12, -0.11]) m.box(metal, [s * x - 0.02, 0, z - 0.012], [s * x + 0.02, 0.008, z + 0.012]);
  }
}
function tvEasel(m, F, inch) {
  const [w, h] = tvFace(inch), M = matsOf(F), y0 = TV_CENTRE - h / 2 - 0.05, top = y0 + h + 0.06;
  const zAt = (y) => 0.2 * (1 - y / top);
  const wood = M.wood;
  for (const s of [-1, 1]) m.tube(wood, [[s * 0.4, 0, 0.2], [s * 0.05, top, 0]], 0.018, { sides: 8, closeEnds: true });
  m.tube(wood, [[0, top - 0.04, -0.01], [0, 0, -0.5]], 0.018, { sides: 8, closeEnds: true });
  // the cross bar the TV hangs on
  const yb = y0 + h * 0.55, xb = 0.05 + (0.35 * (top - yb)) / top;
  m.box(wood, [-xb - 0.03, yb - 0.025, zAt(yb) - 0.012], [xb + 0.03, yb + 0.025, zAt(yb) + 0.012]);
  tvPanel(m, inch, y0, zAt(y0) + 0.06);
}
function tvPedestal(m, inch) {
  const [, h] = tvFace(inch), y0 = TV_CENTRE - h / 2, top = y0 + h * 0.8;
  m.box(metal, [-0.34, 0, -0.26], [0.34, 0.022, 0.18]);
  m.box(metal, [-0.035, 0.022, -0.12], [0.035, top, -0.07]);
  m.box(metal, [-0.18, y0 + h * 0.3, -0.07], [0.18, y0 + h * 0.6, -0.05]); // the bracket
  tvPanel(m, inch, y0, 0.0);
}

// --- audio, players, the projector ---------------------------------------------------------------------------------------
function soundbar(m, w, wall) {
  const h = 0.065, d = 0.1, z = d / 2;
  m.box(black, [-w / 2, 0, -d / 2], [w / 2, h, z - 0.01]);
  m.box(grille, [-w / 2 + 0.005, 0.005, z - 0.01], [w / 2 - 0.005, h - 0.005, z]);
  if (wall) m.box(metal, [-w * 0.3, h * 0.25, -d / 2 - 0.015], [w * 0.3, h * 0.75, -d / 2]);
}
function bookshelfSpeaker(m) {
  const w = 0.18, h = 0.3, d = 0.24, z = d / 2, wal = { name: 'cabinet:wood', colour: WOOD_TONE.walnut, roughness: 0.55 };
  m.box(wal, [-w / 2, 0, -d / 2], [w / 2, h, z - 0.012]);
  m.box(black, [-w / 2 + 0.004, 0.004, z - 0.012], [w / 2 - 0.004, h - 0.004, z]);
  speakerDriver(m, 0, 0.11, z, 0.06); speakerDriver(m, 0, 0.235, z, 0.022);
}
function floorSpeaker(m) {
  const w = 0.22, h = 1.0, d = 0.32, z = d / 2, wal = { name: 'cabinet:wood', colour: WOOD_TONE.walnut, roughness: 0.55 };
  m.box(black, [-w / 2 - 0.03, 0, -d / 2 - 0.03], [w / 2 + 0.03, 0.025, z + 0.03]); // the plinth
  m.box(wal, [-w / 2, 0.025, -d / 2], [w / 2, h, z - 0.012]);
  m.box(black, [-w / 2 + 0.004, 0.03, z - 0.012], [w / 2 - 0.004, h - 0.004, z]);
  speakerDriver(m, 0, 0.3, z, 0.07); speakerDriver(m, 0, 0.5, z, 0.07); speakerDriver(m, 0, 0.66, z, 0.06); speakerDriver(m, 0, 0.8, z, 0.022);
}
function subwoofer(m) {
  const s = 0.36, z = s / 2;
  m.box(black, [-s / 2, 0.02, -s / 2], [s / 2, s + 0.02, z]);
  for (const x of [-1, 1]) for (const zz of [-1, 1]) m.lathe(metal, [[0.001, 0], [0.02, 0], [0.02, 0.02], [0.001, 0.02]], { at: [x * (s / 2 - 0.04), 0, zz * (s / 2 - 0.04)], segs: 10 });
  speakerDriver(m, 0, 0.02 + s / 2, z, 0.13);
}
function gameConsole(m) {
  const w = 0.3, h = 0.08, d = 0.26, white = { name: 'body:body', colour: '#eeeeec', roughness: 0.35 };
  m.box(white, [-w / 2, 0.01, -d / 2], [w / 2, 0.01 + h * 0.36, d / 2]);
  m.box(black, [-w / 2 + 0.01, 0.01 + h * 0.36, -d / 2 + 0.01], [w / 2 - 0.01, 0.01 + h * 0.64, d / 2 - 0.01]);
  m.box(white, [-w / 2, 0.01 + h * 0.64, -d / 2], [w / 2, 0.01 + h, d / 2]);
  m.box(black, [-w / 2 + 0.03, 0, -d / 2 + 0.03], [w / 2 - 0.03, 0.01, d / 2 - 0.03]);
}
function turntable(m) {
  const w = 0.45, d = 0.36, h = 0.075, wood = { name: 'plinth:wood', colour: WOOD_TONE.walnut, roughness: 0.5 };
  for (const x of [-1, 1]) for (const z of [-1, 1]) m.lathe(metal, [[0.001, 0], [0.022, 0], [0.022, 0.018], [0.001, 0.018]], { at: [x * (w / 2 - 0.04), 0, z * (d / 2 - 0.04)], segs: 12 });
  m.box(wood, [-w / 2, 0.018, -d / 2], [w / 2, 0.018 + h, d / 2]);
  const top = 0.018 + h;
  m.lathe({ name: 'platter:platter', colour: '#1c1c1e', roughness: 0.4 }, [[0.001, top], [0.15, top], [0.15, top + 0.018], [0.001, top + 0.018]], { at: [-0.05, 0, 0], segs: 36 });
  m.lathe({ name: 'label:label', colour: '#c4513b', roughness: 0.6 }, [[0.001, top + 0.018], [0.045, top + 0.018], [0.045, top + 0.019], [0.001, top + 0.019]], { at: [-0.05, 0, 0], segs: 24 });
  m.lathe(metal, [[0.001, top], [0.02, top], [0.02, top + 0.035], [0.001, top + 0.035]], { at: [0.16, 0, -0.11], segs: 12 });
  m.tube({ name: 'arm:arm', colour: '#c9cbcd', metallic: 0.8, roughness: 0.25 }, [[0.16, top + 0.035, -0.11], [0.14, top + 0.035, 0.05], [0.06, top + 0.03, 0.08]], 0.004, { sides: 6 });
}
function projector(m, drop) {
  const w = 0.32, h = 0.12, d = 0.28, white = { name: 'body:body', colour: '#f0f0ee', roughness: 0.35 };
  m.box(white, [-w / 2, 0, -d / 2], [w / 2, h, d / 2]);
  m.fan(black, ring(0.07, h / 2, d / 2 + 0.002, 0.04).reverse());
  m.fan({ name: 'lens:glass', colour: '#5d7280', roughness: 0.05, metallic: 0.3 }, ring(0.07, h / 2, d / 2 + 0.004, 0.028).reverse());
  m.box(metal, [-0.015, h, -0.015], [0.015, h + drop, 0.015]);
  m.lathe(metal, [[0.001, h + drop - 0.01], [0.06, h + drop - 0.01], [0.06, h + drop], [0.001, h + drop]], { segs: 18 });
}
/** A pull-down screen in its case: open 1 rolled up, 0 down. The box it fills stays the same either way. */
function screen(m, inch, open = 0) {
  const vw = inch * 0.8716 * IN, vh = inch * 0.4903 * IN, cw = vw + 0.2, ch = 0.09, cd = 0.09, full = 0.3 + vh + 0.06, H = ch + full;
  const caseMat = { name: 'case:case', colour: '#ededeb', roughness: 0.4, metallic: 0.2 };
  m.box(caseMat, [-cw / 2, H - ch, -cd / 2], [cw / 2, H, cd / 2]);
  for (const s of [-1, 1]) m.box(metal, [s > 0 ? cw / 2 - 0.012 : -cw / 2, H - ch, -cd / 2], [s > 0 ? cw / 2 : -cw / 2 + 0.012, H, cd / 2]); // the end caps
  const drop = full * (1 - Math.max(0, Math.min(1, open))), top = H - ch, bottom = top - drop, z = 0.0, fw = vw + 0.08;
  if (drop > 0.02) {
    m.quad({ name: 'fabric:screen', colour: '#f6f6f4', roughness: 0.95 }, [[-fw / 2, bottom, z], [fw / 2, bottom, z], [fw / 2, top, z], [-fw / 2, top, z]]);
    // the black borders: the drop at the top, a band round the picture
    const border = { name: 'border:border', colour: '#151515', roughness: 0.9 }, zb = z + 0.001;
    const pTop = Math.min(top, bottom + 0.06 + vh);
    m.quad(border, [[-fw / 2, pTop, zb], [fw / 2, pTop, zb], [fw / 2, top, zb], [-fw / 2, top, zb]]);
    if (pTop - bottom > 0.06) {
      m.quad(border, [[-fw / 2, bottom, zb], [fw / 2, bottom, zb], [fw / 2, bottom + 0.06, zb], [-fw / 2, bottom + 0.06, zb]]);
      for (const s of [-1, 1]) { const a = s * fw / 2, b = s * (vw / 2); const [l, r] = s < 0 ? [a, b] : [b, a]; m.quad(border, [[l, bottom + 0.06, zb], [r, bottom + 0.06, zb], [r, pTop, zb], [l, pTop, zb]]); }
    }
  }
  m.box(caseMat, [-fw / 2 - 0.01, bottom - 0.025, -0.012], [fw / 2 + 0.01, bottom, 0.012]); // the weighted bar
  m.box(caseMat, [-0.04, bottom - 0.05, 0.004], [0.04, bottom - 0.025, 0.01]); // its pull
  // the box the screen fills when it is down, held by a speck at the back of where its bottom reaches
  m.quad(caseMat, [[0.001, 0, -cd / 2], [-0.001, 0, -cd / 2], [-0.001, 0.002, -cd / 2], [0.001, 0.002, -cd / 2]]);
}

// --- the entries ---------------------------------------------------------------------------------------------------------
const cm = (v) => `${Math.round(v * 100)}cm`;
const FIN_NOTE = `finish ${Object.keys(MEDIA_FINISHES).join(', ')} (a collection code matches its cabinets and legs)`;
const entries = [];
const add = (e) => entries.push({ room: 'living', ...e });

for (const [id, D] of Object.entries(CONSOLES)) {
  const widths = id === 'MCF' ? [1.2, 1.6, 2.0] : [1.2, 1.6, 2.0, 2.4];
  for (const w of widths) add({
    id: `${id}-${cm(w)}`, name: `${D.label[0].toUpperCase()}${D.label.slice(1)}, ${cm(w)}`, kind: 'media', mount: D.base === 'wall' ? 'wall' : 'floor', ...(D.base === 'wall' ? { hang: 0.35 + D.h / 2 } : {}), piece: id, sizeName: cm(w),
    words: ['media console', 'tv stand', 'tv console', 'tv unit', 'credenza', ...D.words], note: `${D.note}; ${FIN_NOTE}`, finishes: Object.keys(MEDIA_FINISHES),
    build: (fit) => { const m = new Mesh(); consoleBuild(m, finishOf(fit), D, w); return m; },
  });
}
for (const w of [1.0, 1.3]) add({
  id: `MCC-${cm(w)}`, name: `Corner media console, ${cm(w)}`, kind: 'media', mount: 'floor', piece: 'MCC', sizeName: cm(w), corner: true,
  words: ['corner', 'corner tv stand', 'media console', 'tv stand'], note: `a triangle in plan that fits a corner (place it with corner); doors each side of an open middle; ${FIN_NOTE}`, finishes: Object.keys(MEDIA_FINISHES),
  build: (fit) => { const m = new Mesh(); cornerBuild(m, finishOf(fit), w); return m; },
});
for (const [id, kind, label, words] of [['MWC', 'closed', 'Entertainment centre', ['entertainment centre', 'entertainment center', 'media wall', 'tv wall unit', 'cabinets']], ['MWL', 'library', 'Library media wall', ['entertainment centre', 'entertainment center', 'media wall', 'bookcase', 'library', 'shelves']]]) {
  for (const [inch, w] of [[55, 2.4], [65, 2.7], [75, 3.0], [85, 3.3]]) {
    const h = inch >= 75 ? 2.1 : 2.0, d = 0.42;
    add({
      id: `${id}-${inch}in`, name: `${label}, for a ${inch}in TV`, kind: 'media', mount: 'floor', piece: id, sizeName: `${inch}in`,
      standAt: BASE_H, opening: { x0: -w / 2 + TOWER, x1: w / 2 - TOWER, y0: BASE_H, y1: h - BRIDGE_H },
      words, note: `${kind === 'library' ? 'towers of open shelves over doors, drawers in the base, an open bridge' : 'tall cabinets each side, flap doors in the bridge, doors and an open bay in the base'}; the TV goes in the opening (on the base, or on the wall behind it); ${FIN_NOTE}`, finishes: Object.keys(MEDIA_FINISHES),
      build: (fit) => { const m = new Mesh(); centreBuild(m, finishOf(fit), w, h, d, kind); return m; },
    });
  }
}
for (const inch of TV_SIZES) {
  add({ id: `TV-${inch}in`, name: `Television, ${inch}in, wall-mounted`, kind: 'tv', mount: 'wall', hang: TV_CENTRE, piece: 'TV', sizeName: `${inch}in`, room: 'any', words: ['tv', 'television', 'screen', 'wall-mounted', 'flat screen'], note: `${inch} in, on the wall (its middle about ${TV_CENTRE} m up, or 15 cm over the console it is above)`, build: () => { const m = new Mesh(); tvPanel(m, inch, 0, 0); return m; } });
  add({ id: `TVF-${inch}in`, name: `Television, ${inch}in, on its feet`, kind: 'tv', mount: 'surface', facesHost: true, piece: 'TVF', sizeName: `${inch}in`, room: 'any', words: ['tv', 'television', 'screen', 'on feet', 'on the console', 'freestanding'], note: `${inch} in, standing on its own feet on a console or in an entertainment centre`, build: () => { const m = new Mesh(); tvOnFeet(m, inch); return m; } });
  if (inch <= 65) add({ id: `TVE-${inch}in`, name: `TV on an easel stand, ${inch}in`, kind: 'tv', mount: 'floor', piece: 'TVE', sizeName: `${inch}in`, words: ['tv', 'television', 'easel', 'tv stand', 'floor stand', 'tripod'], note: `a ${inch} in TV on a wooden easel, no furniture under it; ${FIN_NOTE}`, finishes: Object.keys(MEDIA_FINISHES), build: (fit) => { const m = new Mesh(); tvEasel(m, finishOf(fit), inch); return m; } });
  if (inch <= 75) add({ id: `TVP-${inch}in`, name: `TV on a pedestal stand, ${inch}in`, kind: 'tv', mount: 'floor', piece: 'TVP', sizeName: `${inch}in`, words: ['tv', 'television', 'pedestal', 'tv stand', 'floor stand', 'pole'], note: `a ${inch} in TV on a steel pole and base plate, no furniture under it`, build: () => { const m = new Mesh(); tvPedestal(m, inch); return m; } });
}
for (const w of [0.9, 1.2]) add({ id: `SBR-${cm(w)}`, name: `Soundbar, ${cm(w)}`, kind: 'audio', mount: 'surface', facesHost: true, piece: 'SBR', sizeName: cm(w), words: ['soundbar', 'sound bar', 'speaker', 'speakers', 'audio'], note: 'on the console in front of the TV', build: () => { const m = new Mesh(); soundbar(m, w, false); return m; } });
add({ id: 'SBW-120cm', name: 'Soundbar, wall-mounted', kind: 'audio', mount: 'wall', hang: 0.6, piece: 'SBW', sizeName: '120cm', words: ['soundbar', 'sound bar', 'speaker', 'wall'], note: 'on the wall under a wall-mounted TV (centre_height just under the TV)', build: () => { const m = new Mesh(); soundbar(m, 1.2, true); return m; } });
add({ id: 'SPK-BOOK', name: 'Bookshelf speaker', kind: 'audio', mount: 'surface', facesHost: true, piece: 'SPK-BOOK', words: ['speaker', 'speakers', 'bookshelf speaker', 'stereo', 'hifi', 'audio'], note: 'one speaker: place two, either side of the TV', build: () => { const m = new Mesh(); bookshelfSpeaker(m); return m; } });
add({ id: 'SPK-FLOOR', name: 'Floor-standing speaker', kind: 'audio', mount: 'floor', piece: 'SPK-FLOOR', words: ['speaker', 'speakers', 'tower speaker', 'floor speaker', 'stereo', 'hifi', 'audio'], note: 'one tower speaker, 1 m tall: place two, either side of the TV', build: () => { const m = new Mesh(); floorSpeaker(m); return m; } });
add({ id: 'SUB', name: 'Subwoofer', kind: 'audio', mount: 'floor', piece: 'SUB', words: ['subwoofer', 'sub', 'bass', 'audio'], note: 'a 36 cm cube, on the floor beside the console', build: () => { const m = new Mesh(); subwoofer(m); return m; } });
add({ id: 'GCN', name: 'Game console', kind: 'gear', mount: 'surface', facesHost: true, piece: 'GCN', words: ['game console', 'games console', 'gaming', 'console', 'playstation', 'xbox'], note: 'lying flat on a console shelf or top', build: () => { const m = new Mesh(); gameConsole(m); return m; } });
add({ id: 'TTB', name: 'Turntable', kind: 'gear', mount: 'surface', facesHost: true, piece: 'TTB', words: ['turntable', 'record player', 'vinyl', 'audio'], note: 'a record player on a walnut plinth', build: () => { const m = new Mesh(); turntable(m); return m; } });
add({ id: 'PRJ', name: 'Ceiling projector', kind: 'gear', mount: 'ceiling', piece: 'PRJ', words: ['projector', 'home cinema', 'ceiling'], note: 'hangs from the ceiling on a short pole, across the room from its screen', build: () => { const m = new Mesh(); projector(m, 0.28); return m; } });
for (const inch of [100, 120]) add({
  id: `PRS-${inch}in`, name: `Projector screen, ${inch}in, pull-down`, kind: 'screen', mount: 'wall', hang: inch === 100 ? 1.75 : 1.85, piece: 'PRS', sizeName: `${inch}in`, opens: true,
  words: ['projector screen', 'screen', 'pull-down', 'home cinema', 'cinema'], note: `${inch} in, 16:9, in a case high on the wall; it rolls up and pulls down (open: 1 up, 0 down)`,
  build: (fit) => { const m = new Mesh(); screen(m, inch, fit?.open ?? 0); return m; },
});

export const mediaEntries = entries;
/** How wide a TV the piece takes: a console's width, an entertainment centre's opening. */
export const holdsWidth = (entry, size) => (entry.opening ? entry.opening.x1 - entry.opening.x0 : size[0]);
export { tvFace };
