// Appliances and fixtures: the things that take up space in a room, at their standard US sizes (inches, built in
// metres): fridges, ranges, dishwashers, range hoods, a washer and dryer and the two stacked, toilets, vanities,
// bathtubs, showers, radiators, a wall air conditioner, fans and a fireplace. Built here (mesh.mjs), front to +z, base
// at y = 0, each size its own catalogue piece (so "a bigger fridge" is the next one up). An appliance's finish
// (stainless, white, black, or a panel matching a collection's cabinets) is its fit, like a picture's size.
import { Mesh } from './mesh.mjs';
import { COLLECTIONS } from '../70-inventory/catalogue.mjs';
import { WOOD_TONE } from '../70-inventory/recipes.mjs';

const IN = 0.0254;
const panelOf = (c) => c.mojulo.paint ?? WOOD_TONE[c.mojulo.timber];
export const FINISHES = {
  stainless: { colour: '#d3d6d8', metallic: 0.45, roughness: 0.3 }, // lighter than true steel: nothing here for it to reflect
  white: { colour: '#f1f1ee', metallic: 0, roughness: 0.35 },
  black: { colour: '#232427', metallic: 0.35, roughness: 0.35 },
  ...Object.fromEntries(COLLECTIONS.map((c) => [`panel-${c.code}`, { colour: panelOf(c), metallic: 0, roughness: 0.6 }])),
};
const body = (finish) => ({ name: 'body:body', ...(FINISHES[finish] ?? FINISHES.stainless) });
const handle = { name: 'handles:handles', colour: '#9a9ea2', metallic: 0.8, roughness: 0.25 };
const dark = { name: 'glass:glass', colour: '#121417', metallic: 0.1, roughness: 0.12 };
const gap = { name: 'gap:gap', colour: '#0d0d0e' };
const porcelain = { name: 'porcelain:porcelain', colour: '#f4f4f1', roughness: 0.2 };
const chrome = { name: 'chrome:chrome', colour: '#d6dadd', metallic: 0.9, roughness: 0.15 };

/** A door's front: a thin gap line round it and a bar handle, vertical or across. */
function door(m, x0, x1, y0, y1, z, { bar = 'v', at = 'right' } = {}) {
  m.box(gap, [x0, y0, z - 0.002], [x1, y0 + 0.004, z + 0.001]); m.box(gap, [x0, y1 - 0.004, z - 0.002], [x1, y1, z + 0.001]);
  m.box(gap, [x0, y0, z - 0.002], [x0 + 0.004, y1, z + 0.001]); m.box(gap, [x1 - 0.004, y0, z - 0.002], [x1, y1, z + 0.001]);
  if (bar === 'v') { const x = at === 'right' ? x1 - 0.05 : x0 + 0.05; m.tube(handle, [[x, y0 + (y1 - y0) * 0.15, z + 0.045], [x, y1 - (y1 - y0) * 0.15, z + 0.045]], 0.011, { sides: 8, closeEnds: true }); for (const y of [y0 + (y1 - y0) * 0.15, y1 - (y1 - y0) * 0.15]) m.box(handle, [x - 0.008, y - 0.008, z], [x + 0.008, y + 0.008, z + 0.045]); }
  else if (bar === 'h') { const y = y1 - 0.05; m.tube(handle, [[x0 + 0.06, y, z + 0.045], [x1 - 0.06, y, z + 0.045]], 0.011, { sides: 8, closeEnds: true }); for (const x of [x0 + 0.06, x1 - 0.06]) m.box(handle, [x - 0.008, y - 0.008, z], [x + 0.008, y + 0.008, z + 0.045]); }
}
const ring = (cx, cy, z, r, n = 32) => Array.from({ length: n + 1 }, (_, i) => { const a = (i / n) * Math.PI * 2; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r, z]; });

const BUILD = {
  fridge(m, [w, d, h], f, kind) {
    m.box(body(f), [-w / 2, 0, -d / 2], [w / 2, h, d / 2 - 0.05]);
    const z = d / 2 - 0.05;
    m.box(body(f), [-w / 2, 0.08, z], [w / 2, h, d / 2]); // the doors' slab
    m.box(gap, [-w / 2, 0, z - 0.01], [w / 2, 0.08, z + 0.02]); // the kick plate
    if (kind === 'top-freezer') { const s = 0.08 + (h - 0.08) * 0.7; door(m, -w / 2, w / 2, 0.08, s, d / 2, { at: 'left' }); door(m, -w / 2, w / 2, s, h, d / 2, { at: 'left' }); }
    else if (kind === 'side-by-side') { door(m, -w / 2, -0.002, 0.08, h, d / 2, { at: 'right' }); door(m, 0.002, w / 2, 0.08, h, d / 2, { at: 'left' }); }
    else { const s = 0.08 + (h - 0.08) * 0.32; door(m, -w / 2, w / 2, 0.08, s, d / 2, { bar: 'h' }); door(m, -w / 2, -0.002, s, h, d / 2, { at: 'right' }); door(m, 0.002, w / 2, s, h, d / 2, { at: 'left' }); }
  },
  range(m, [w, d, h], f) {
    const top = 0.915, z = d / 2;
    m.box(body(f), [-w / 2, 0, -d / 2], [w / 2, top - 0.03, d / 2 - 0.02]);
    m.box(dark, [-w / 2, top - 0.03, -d / 2], [w / 2, top, d / 2 - 0.02]); // the cooktop
    m.box(body(f), [-w / 2, top, -d / 2], [w / 2, h, -d / 2 + 0.06]); // the back guard
    const n = w > 0.8 ? 6 : 4, cols = n / 2;
    // the burners: a ring of grate each, two rows
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (w / cols) * ((i % cols) + 0.5), zz = i < cols ? -0.13 : 0.12;
      m.tube({ name: 'grate:grate', colour: '#2a2a2a', roughness: 0.6 }, Array.from({ length: 33 }, (_, k) => { const a = (k / 32) * Math.PI * 2; return [x + Math.cos(a) * 0.075, top + 0.012, zz + Math.sin(a) * 0.075]; }), 0.006, { sides: 5 });
    }
    door(m, -w / 2 + 0.02, w / 2 - 0.02, 0.12, top - 0.13, z, { bar: 'h' });
    m.quad(dark, [[-w / 2 + 0.12, 0.3, z + 0.001], [w / 2 - 0.12, 0.3, z + 0.001], [w / 2 - 0.12, top - 0.22, z + 0.001], [-w / 2 + 0.12, top - 0.22, z + 0.001]]); // the oven's window
    for (let i = 0; i < n; i++) { const x = -w / 2 + 0.08 + ((w - 0.16) * i) / Math.max(1, n - 1); m.lathe(handle, [[0.018, 0], [0.018, 0.02], [0.001, 0.022]], { at: [x, top - 0.07, z - 0.02], segs: 10 }); }
  },
  dishwasher(m, [w, d, h], f) {
    m.box(body(f), [-w / 2, 0, -d / 2], [w / 2, h, d / 2]);
    m.box(gap, [-w / 2, 0, d / 2 - 0.01], [w / 2, 0.1, d / 2 + 0.003]);
    door(m, -w / 2, w / 2, 0.1, h - 0.02, d / 2, { bar: 'h' });
  },
  hood(m, [w, d, h], f) {
    // a canopy (a frustum to the wall at -z), and its chimney up
    const c = 0.15, z0 = -d / 2;
    const B = body(f);
    const lo = [[-w / 2, 0, z0], [w / 2, 0, z0], [w / 2, 0, d / 2], [-w / 2, 0, d / 2]], hi = [[-0.17, c, z0], [0.17, c, z0], [0.17, c, z0 + 0.3], [-0.17, c, z0 + 0.3]];
    for (let k = 0; k < 4; k++) m.quad(B, [lo[k], lo[(k + 1) % 4], hi[(k + 1) % 4], hi[k]]);
    m.quad(B, [lo[3], lo[2], lo[1], lo[0]]);
    m.box(B, [-w / 2, 0, z0], [w / 2, 0.06, d / 2]);
    m.box(B, [-0.15, c, z0], [0.15, h, z0 + 0.28]);
  },
  washer(m, [w, d, h], f, kind) {
    const unit = (y0, uh, dryer) => {
      m.box(body(f), [-w / 2, y0, -d / 2], [w / 2, y0 + uh, d / 2]);
      m.box(gap, [-w / 2 + 0.03, y0 + uh - 0.11, d / 2], [w / 2 - 0.03, y0 + uh - 0.105, d / 2 + 0.002]);
      m.quad(dark, [[w / 2 - 0.22, y0 + uh - 0.085, d / 2 + 0.002], [w / 2 - 0.04, y0 + uh - 0.085, d / 2 + 0.002], [w / 2 - 0.04, y0 + uh - 0.03, d / 2 + 0.002], [w / 2 - 0.22, y0 + uh - 0.03, d / 2 + 0.002]]); // the display
      const cy = y0 + (uh - 0.12) / 2, r = Math.min(w, uh) * 0.3;
      m.tube(chrome, ring(0, cy, d / 2 + 0.02, r), 0.022, { sides: 10 });
      m.fan(dryer ? { name: 'drum:drum', colour: '#3a3d40', metallic: 0.5, roughness: 0.4 } : dark, ring(0, cy, d / 2 + 0.01, r - 0.01, 32).slice(0, 32));
    };
    if (kind === 'stacked') { unit(0, h / 2, false); unit(h / 2, h / 2, true); } else unit(0, h, kind === 'dryer');
  },
  toilet(m, [w, d, h]) {
    const back = -d / 2;
    m.lathe(porcelain, [[0.11, 0], [0.13, 0.05], [0.15, 0.3], [0.18, 0.39], [0.17, 0.4]], { at: [0, 0, back + d * 0.62], segs: 28 }); // the bowl
    m.tube(porcelain, ring(0, 0, 0, 0.165).map(([x, y]) => [x, 0.41, back + d * 0.62 + y]), 0.018, { sides: 8 }); // the seat
    m.box(porcelain, [-w / 2, 0.38, back], [w / 2, h, back + 0.2]); // the tank
    m.box(porcelain, [-w / 2 - 0.005, h - 0.02, back - 0.005], [w / 2 + 0.005, h, back + 0.205]);
    m.box(chrome, [w / 2 - 0.07, h - 0.08, back + 0.2], [w / 2 - 0.03, h - 0.06, back + 0.215]);
  },
  vanity(m, [w, d, h], f) {
    const B = body(f), top = { name: 'top:top', colour: '#efece6', roughness: 0.25 };
    m.box(B, [-w / 2, 0.1, -d / 2], [w / 2, h - 0.03, d / 2]);
    m.box(gap, [-w / 2 + 0.02, 0, -d / 2 + 0.02], [w / 2 - 0.02, 0.1, d / 2 - 0.06]);
    m.box(top, [-w / 2 - 0.01, h - 0.03, -d / 2], [w / 2 + 0.01, h, d / 2 + 0.01]);
    const sinks = w > 1.3 ? [-w / 4, w / 4] : [0];
    const doors = Math.max(2, Math.round(w / 0.3));
    for (let i = 0; i < doors; i++) door(m, -w / 2 + (w * i) / doors + 0.003, -w / 2 + (w * (i + 1)) / doors - 0.003, 0.12, h - 0.05, d / 2, { at: i % 2 ? 'left' : 'right' });
    for (const x of sinks) {
      m.lathe(porcelain, [[0.2, h + 0.001], [0.21, h + 0.012], [0.19, h + 0.014], [0.12, h - 0.06], [0.001, h - 0.08]], { at: [x, 0, 0.02], segs: 28, caps: [false, false] });
      m.tube(chrome, [[x, h, -d / 2 + 0.06], [x, h + 0.22, -d / 2 + 0.06], [x, h + 0.24, -d / 2 + 0.12], [x, h + 0.2, -d / 2 + 0.16]], 0.012, { sides: 8 });
    }
  },
  bathtub(m, [w, d, h]) {
    const t = 0.07;
    m.box(porcelain, [-w / 2, 0, -d / 2], [w / 2, 0.06, d / 2]);
    m.box(porcelain, [-w / 2, 0, -d / 2], [w / 2, h, -d / 2 + t]); m.box(porcelain, [-w / 2, 0, d / 2 - t], [w / 2, h, d / 2]);
    m.box(porcelain, [-w / 2, 0, -d / 2], [-w / 2 + t, h, d / 2]); m.box(porcelain, [w / 2 - t, 0, -d / 2], [w / 2, h, d / 2]);
    m.tube(chrome, [[-w / 2 + 0.03, h - 0.02, 0], [-w / 2 + 0.03, h + 0.08, 0], [-w / 2 + 0.12, h + 0.08, 0]], 0.012, { sides: 8 });
  },
  shower(m, [w, d, h]) {
    const glassy = { name: 'screen:screen', colour: '#cfe3ea', alpha: 0.25, roughness: 0.05 }, frame = { name: 'frame:frame', colour: '#2b2b2b', metallic: 0.6, roughness: 0.4 };
    m.box({ name: 'tray:tray', colour: '#f2f2ef', roughness: 0.4 }, [-w / 2, 0, -d / 2], [w / 2, 0.08, d / 2]);
    m.quad(glassy, [[-w / 2, 0.08, d / 2], [w / 2, 0.08, d / 2], [w / 2, h, d / 2], [-w / 2, h, d / 2]]); // the front glass
    m.quad(glassy, [[w / 2, 0.08, d / 2], [w / 2, 0.08, -d / 2], [w / 2, h, -d / 2], [w / 2, h, d / 2]]); // the side glass
    for (const p of [[[-w / 2, h, d / 2], [w / 2, h, d / 2]], [[w / 2, h, d / 2], [w / 2, h, -d / 2]], [[w / 2, 0.08, d / 2], [w / 2, h, d / 2]], [[-w / 2, 0.08, d / 2], [-w / 2, h, d / 2]], [[w / 2, 0.08, -d / 2], [w / 2, h, -d / 2]]]) m.tube(frame, p, 0.01, { sides: 6 });
    m.tube(chrome, [[0, 1.0, -d / 2 + 0.02], [0, 1.95, -d / 2 + 0.02], [0, 1.95, -d / 2 + 0.25]], 0.012, { sides: 8 });
    m.lathe(chrome, [[0.1, 1.92], [0.1, 1.93], [0.001, 1.95]], { at: [0, 0, -d / 2 + 0.25], segs: 18 });
  },
  radiator(m, [w, d, h], f) {
    const B = body(f), fins = Math.round(w / 0.06);
    for (let i = 0; i < fins; i++) { const x = -w / 2 + (w * (i + 0.5)) / fins; m.box(B, [x - 0.02, 0.1, -d / 2 + 0.01], [x + 0.02, h, d / 2]); }
    m.box(B, [-w / 2, 0.12, -d / 2 + 0.03], [w / 2, 0.16, d / 2 - 0.02]); m.box(B, [-w / 2, h - 0.06, -d / 2 + 0.03], [w / 2, h - 0.02, d / 2 - 0.02]);
    for (const x of [-w / 2 + 0.05, w / 2 - 0.05]) m.box(B, [x - 0.02, 0, -d / 2 + 0.02], [x + 0.02, 0.12, d / 2 - 0.02]);
  },
  aircon(m, [w, d, h], f) {
    m.box(body(f), [-w / 2, 0, -d / 2], [w / 2, h, d / 2]);
    m.box(gap, [-w / 2 + 0.03, 0.03, d / 2 - 0.02], [w / 2 - 0.03, 0.07, d / 2 + 0.002]); // the louvre
  },
  ceilingFan(m, [w, , h]) {
    const wood = { name: 'blades:wood', colour: WOOD_TONE.walnut, roughness: 0.6 }, B = { name: 'body:body', colour: '#2b2b2b', metallic: 0.5, roughness: 0.4 };
    m.lathe(B, [[0.07, h - 0.04], [0.08, h - 0.01], [0.001, h]], { segs: 18 }); // the canopy
    m.tube(B, [[0, h - 0.03, 0], [0, 0.18, 0]], 0.012, { sides: 8 });
    m.lathe(B, [[0.001, 0], [0.09, 0.03], [0.1, 0.1], [0.07, 0.18], [0.001, 0.19]], { segs: 20 });
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), r0 = 0.1, r1 = w / 2, bw = 0.07; m.quad(wood, [[c * r0 - s * bw, 0.09, s * r0 + c * bw], [c * r1 - s * bw, 0.1, s * r1 + c * bw], [c * r1 + s * bw, 0.1, s * r1 - c * bw], [c * r0 + s * bw, 0.09, s * r0 - c * bw]]); }
  },
  towerFan(m, [w, d, h]) {
    const B = { name: 'body:body', colour: '#e9e9e6', roughness: 0.4 };
    m.lathe(B, [[w / 2, 0], [w / 2, 0.03], [0.07, 0.04], [0.001, 0.045]], { segs: 24 });
    m.lathe(B, [[0.07, 0.04], [0.08, 0.1], [0.075, h - 0.05], [0.04, h], [0.001, h]], { segs: 24, ribs: [24, 0.06] });
    m.box(gap, [-0.03, 0.15, 0.06], [0.03, h - 0.12, 0.085]);
  },
  fireplace(m, [w, d, h], f) {
    const B = body(f), t = 0.18;
    m.box(B, [-w / 2, 0, -d / 2], [-w / 2 + t, h - 0.1, d / 2 - 0.05]); m.box(B, [w / 2 - t, 0, -d / 2], [w / 2, h - 0.1, d / 2 - 0.05]);
    m.box(B, [-w / 2, h - 0.35, -d / 2], [w / 2, h - 0.1, d / 2 - 0.05]);
    m.box(B, [-w / 2 - 0.04, h - 0.1, -d / 2], [w / 2 + 0.04, h, d / 2]); // the mantel shelf
    m.box({ name: 'firebox:firebox', colour: '#1a1716', roughness: 0.9 }, [-w / 2 + t, 0, -d / 2], [w / 2 - t, h - 0.35, -d / 2 + 0.12]);
    m.box({ name: 'hearth:hearth', colour: '#3a3634', roughness: 0.6 }, [-w / 2, 0, -d / 2], [w / 2, 0.04, d / 2 + 0.08]);
    for (const [x, z] of [[-0.12, 0], [0.1, 0.02]]) m.tube({ name: 'logs:logs', colour: '#4a3424' }, [[x - 0.18, 0.09, -d / 2 + 0.2 + z], [x + 0.18, 0.09, -d / 2 + 0.18 + z]], 0.045, { sides: 8, closeEnds: true });
    m.quad({ name: 'flame:flame', colour: '#ffa040', unlit: true }, [[-0.22, 0.1, -d / 2 + 0.16], [0.22, 0.1, -d / 2 + 0.16], [0.12, 0.42, -d / 2 + 0.16], [-0.12, 0.42, -d / 2 + 0.16]]);
  },
};

const APPLIANCES = [
  // id, name, room, mount, builder, kind, sizes { name: [w, d, h] in inches }, finishes?, words
  ['FRG', 'refrigerator', 'kitchen', 'floor', 'fridge', null, { '24in': [24, 28, 64], '30in': [30, 32, 66], '33in': [33, 34, 69], '36in': [36, 35, 70] }, true, ['fridge', 'refrigerator', 'french door']],
  ['FSS', 'side-by-side refrigerator', 'kitchen', 'floor', 'fridge', 'side-by-side', { '36in': [36, 35, 70] }, true, ['fridge', 'side by side']],
  ['RNG', 'range', 'kitchen', 'floor', 'range', null, { '24in': [24, 26, 47], '30in': [30, 28, 47], '36in': [36, 28, 47] }, true, ['range', 'stove', 'oven', 'cooker']],
  ['DSW', 'dishwasher', 'kitchen', 'floor', 'dishwasher', null, { '18in': [18, 24, 34], '24in': [24, 24, 34] }, true, ['dishwasher']],
  ['HOD', 'range hood', 'kitchen', 'wall', 'hood', null, { '30in': [30, 20, 30], '36in': [36, 20, 30] }, true, ['hood', 'extractor', 'range hood']],
  ['WSH', 'washing machine', 'laundry', 'floor', 'washer', 'washer', { '27in': [27, 31, 39] }, true, ['washer', 'washing machine', 'laundry']],
  ['DRY', 'dryer', 'laundry', 'floor', 'washer', 'dryer', { '27in': [27, 31, 39] }, true, ['dryer', 'tumble dryer', 'laundry']],
  ['STK', 'stacked washer and dryer', 'laundry', 'floor', 'washer', 'stacked', { '27in': [27, 31, 77] }, true, ['stacked washer dryer', 'laundry']],
  ['TLT', 'toilet', 'bath', 'floor', 'toilet', null, { std: [15, 28, 30] }, false, ['toilet', 'wc', 'loo']],
  ['VAN', 'bathroom vanity', 'bath', 'floor', 'vanity', null, { '24in': [24, 21, 34], '36in': [36, 21, 34], '48in': [48, 21, 34], '60in': [60, 21, 34] }, true, ['vanity', 'sink', 'basin', 'bathroom']],
  ['TUB', 'bathtub', 'bath', 'floor', 'bathtub', null, { '60in': [60, 30, 20], '66in': [66, 32, 21], '72in': [72, 36, 22] }, false, ['bathtub', 'bath', 'tub']],
  ['SHW', 'shower', 'bath', 'floor', 'shower', null, { '36in': [36, 36, 80], '48in': [48, 36, 80] }, false, ['shower', 'shower enclosure']],
  ['RAD', 'radiator', 'any', 'floor', 'radiator', null, { '24in': [24, 4, 24], '36in': [36, 4, 24] }, true, ['radiator', 'heater']],
  ['WAC', 'wall air conditioner', 'any', 'wall', 'aircon', null, { std: [32, 9, 11] }, true, ['air conditioner', 'ac', 'aircon', 'mini split']],
  ['CFN', 'ceiling fan', 'any', 'ceiling', 'ceilingFan', null, { '52in': [52, 52, 16] }, false, ['ceiling fan', 'fan']],
  ['TFN', 'tower fan', 'any', 'floor', 'towerFan', null, { std: [11, 11, 42] }, false, ['fan', 'tower fan']],
  ['FPL', 'fireplace with mantel', 'living', 'floor', 'fireplace', null, { '50in': [50, 14, 46], '60in': [60, 14, 48] }, true, ['fireplace', 'mantel', 'fire']],
];
const HANG = { HOD: 1.68, WAC: 2.05 }; // a hood's bottom about 30 in over a range; an air conditioner high on the wall

/** The appliance entries for the decor catalogue: each size its own piece, its finish in its fit ({ finish }). */
export const applianceEntries = APPLIANCES.flatMap(([id, label, room, mount, builder, kind, sizes, finishes, words]) =>
  Object.entries(sizes).map(([size, inches]) => {
    const [w, d, h] = inches.map((v) => Math.round(v * IN * 1000) / 1000);
    const one = Object.keys(sizes).length === 1 && size === 'std';
    const named = id === 'FRG' ? `${label}, ${size}${size === '24in' || size === '30in' ? ' (top freezer)' : ' (French door)'}` : `${label[0].toUpperCase()}${label.slice(1)}${one ? '' : `, ${size}`}`;
    return {
      id: one ? id : `${id}-${size}`, name: named[0].toUpperCase() + named.slice(1), kind: 'appliance', room, mount, ...(HANG[id] ? { hang: HANG[id] } : {}), piece: id, sizeName: size, words,
      note: `${inches.join(' x ')} in (w x d x h)${finishes ? '; finish stainless, white, black, or panel-<collection> to match its cabinets' : ''}`,
      ...(finishes ? { finishes: Object.keys(FINISHES) } : {}),
      build: (fit) => { const m = new Mesh(); BUILD[builder](m, [w, d, h], fit?.finish ?? (room === 'kitchen' ? 'stainless' : 'white'), id === 'FRG' ? (size === '24in' || size === '30in' ? 'top-freezer' : 'french') : kind); return m; },
    };
  }));
