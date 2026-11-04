// Storage: cabinets, drawers, shelves and the things that hold a household's stuff, in the finishes the media furniture
// takes (a collection's, or oak, walnut, white, black). Tall cabinets, a hutch, a glass display cabinet, an armoire, a
// tallboy and a double dresser, cube storage with fabric bins, floating shelves and wall cabinets, a ladder shelf, an
// étagère, filing cabinets, a storage bench, a hall tree, a bar cart, a medicine cabinet and a bookcase with doors.
// Built here (mesh.mjs) from media.mjs's carcass and bays: front to +z, base at y = 0.
import { Mesh } from './mesh.mjs';
import { MEDIA_FINISHES, matsOf, carcass, bay, bays, legs, LEG_H, cornerSpots, finishOf, BOARD as T, metal } from './media.mjs';

const cm = (v) => `${Math.round(v * 100)}cm`;
const FIN = `finish ${Object.keys(MEDIA_FINISHES).join(', ')} (a collection code matches its cabinets and legs)`;

/** A cabinet on its base: legs (the finish's, or a style), a plinth, or none; returns where the carcass starts. */
function base(m, M, F, kind, w, d) {
  if (kind === 'plinth') { m.box(M.inside, [-w / 2 + 0.03, 0, -d / 2 + 0.02], [w / 2 - 0.03, 0.07, d / 2 - 0.04]); return 0.07; }
  if (kind === 'none') return 0;
  return legs(m, M.wood, typeof kind === 'string' && LEG_H[kind] ? kind : F.legs, cornerSpots(w, d));
}
/** Rows of bays up a carcass: [[height share, [kinds…]], …] bottom first, a shelf board between rows. */
function rows(m, M, spec, x0, x1, y0, y1, z0, z1) {
  const total = spec.reduce((s, [k]) => s + k, 0);
  let y = y0;
  spec.forEach(([k, kinds], i) => {
    const h = ((y1 - y0) * k) / total, top = y + h;
    if (i > 0) m.box(M.body, [x0 + T, y - T / 2, z0], [x1 - T, y + T / 2, z1]);
    bays(m, M, kinds, x0, x1, y - (i > 0 ? T / 2 : 0), top + (i < spec.length - 1 ? T / 2 : 0), z0, z1);
    y = top;
  });
}

const BUILD = {
  // a tall cabinet: two doors floor to top (a pantry, linen)
  tall(m, F, [w, d, h]) { const M = matsOf(F), y0 = base(m, M, F, 'plinth', w, d); carcass(m, M, -w / 2, w / 2, y0, h, -d / 2, d / 2); rows(m, M, [[0.72, w > 0.7 ? ['door', 'door'] : ['door']], [0.28, w > 0.7 ? ['door', 'door'] : ['door']]], -w / 2, w / 2, y0, h, -d / 2, d / 2); },
  // a hutch: a sideboard base, glass-doored shelves on it, set back
  hutch(m, F, [w, d, h]) {
    const M = matsOf(F), y0 = base(m, M, F, 'legs', w, d), bh = 0.86, n = Math.max(2, Math.round(w / 0.5));
    carcass(m, M, -w / 2, w / 2, y0, bh, -d / 2, d / 2); rows(m, M, [[0.7, Array(n).fill('door')], [0.3, Array(n).fill('drawers:1')]], -w / 2, w / 2, y0, bh, -d / 2, d / 2);
    const ud = 0.32; carcass(m, M, -w / 2 + 0.02, w / 2 - 0.02, bh, h, -d / 2, -d / 2 + ud); bays(m, M, Array(n).fill('glass'), -w / 2 + 0.02, w / 2 - 0.02, bh, h - 0.04, -d / 2, -d / 2 + ud);
    m.box(M.body, [-w / 2, h - 0.04, -d / 2], [w / 2, h, -d / 2 + ud + 0.03]); // the cornice
  },
  display(m, F, [w, d, h]) { const M = matsOf(F), y0 = base(m, M, F, 'legs', w, d); carcass(m, M, -w / 2, w / 2, y0, h, -d / 2, d / 2); bays(m, M, w > 0.7 ? ['glass', 'glass'] : ['glass'], -w / 2, w / 2, y0, h, -d / 2, d / 2); },
  armoire(m, F, [w, d, h]) {
    const M = matsOf(F), y0 = base(m, M, F, 'legs', w, d);
    carcass(m, M, -w / 2, w / 2, y0, h - 0.05, -d / 2, d / 2); rows(m, M, [[0.2, ['drawers:1', 'drawers:1']], [0.8, ['door', 'door']]], -w / 2, w / 2, y0, h - 0.05, -d / 2, d / 2);
    m.box(M.body, [-w / 2 - 0.025, h - 0.05, -d / 2], [w / 2 + 0.025, h, d / 2 + 0.025]); // the crown
  },
  tallboy(m, F, [w, d, h]) { const M = matsOf(F), y0 = base(m, M, F, 'legs', w, d); carcass(m, M, -w / 2, w / 2, y0, h, -d / 2, d / 2); bays(m, M, ['drawers:5'], -w / 2, w / 2, y0, h, -d / 2, d / 2); },
  double(m, F, [w, d, h]) { const M = matsOf(F), y0 = base(m, M, F, 'legs', w, d), cols = w > 1.7 ? 3 : 2; carcass(m, M, -w / 2, w / 2, y0, h, -d / 2, d / 2); bays(m, M, Array(cols).fill('drawers:3'), -w / 2, w / 2, y0, h, -d / 2, d / 2); },
  cubes(m, F, [w, d, h], { c, r }) {
    const M = { ...matsOf(F), binColour: F.painted ? '#b9b2a6' : '#d4cbbd' };
    carcass(m, M, -w / 2, w / 2, 0, h, -d / 2, d / 2);
    rows(m, M, Array.from({ length: r }, (_, j) => [1, Array.from({ length: c }, (_, i) => ((i + j) % 2 ? 'bins' : 'open'))]), -w / 2, w / 2, 0, h, -d / 2, d / 2);
  },
  floatShelf(m, F, [w, d, h]) { const M = matsOf(F); m.box(M.wood, [-w / 2, 0, -d / 2], [w / 2, h, d / 2]); },
  wallCab(m, F, [w, d, h]) { const M = matsOf(F); carcass(m, M, -w / 2, w / 2, 0, h, -d / 2, d / 2); bays(m, M, w > 0.65 ? ['door', 'door'] : ['door'], -w / 2, w / 2, 0, h, -d / 2, d / 2); },
  medicine(m, F, [w, d, h]) {
    const M = matsOf(F); carcass(m, M, -w / 2, w / 2, 0, h, -d / 2, d / 2);
    m.box(M.body, [-w / 2, 0, d / 2 - 0.02], [w / 2, h, d / 2]);
    m.quad({ name: 'mirror:glass', colour: '#e4ebee', metallic: 0.15, roughness: 0.12 }, [[-w / 2 + 0.02, 0.02, d / 2 + 0.001], [w / 2 - 0.02, 0.02, d / 2 + 0.001], [w / 2 - 0.02, h - 0.02, d / 2 + 0.001], [-w / 2 + 0.02, h - 0.02, d / 2 + 0.001]]);
  },
  ladder(m, F, [w, d, h]) {
    // two rails leaning on the wall, shelves deepest at the bottom
    const M = matsOf(F), lean = d - 0.03;
    for (const s of [-1, 1]) m.box(M.wood, [s * w / 2 - (s > 0 ? 0.035 : 0), 0, d / 2 - 0.04], [s * w / 2 + (s < 0 ? 0.035 : 0), 0.01, d / 2]);
    for (const s of [-1, 1]) m.tube(M.wood, [[s * (w / 2 - 0.018), 0, d / 2 - 0.02], [s * (w / 2 - 0.018), h, -d / 2 + 0.02]], 0.018, { sides: 4, closeEnds: true });
    for (let k = 0; k < 5; k++) {
      const y = 0.2 + k * ((h - 0.35) / 4), zf = d / 2 - 0.02 - (lean * y) / h, sd = Math.max(0.16, (d - 0.04) * (1 - k * 0.17));
      m.box(M.body, [-w / 2 + 0.036, y - 0.012, zf - sd], [w / 2 - 0.036, y + 0.012, zf]);
    }
  },
  etagere(m, F, [w, d, h]) {
    const M = matsOf(F), frame = { ...metal, name: 'frame:metal', colour: F.painted && F.body === '#2a2a2d' ? '#1c1c1e' : '#b39563', metallic: 0.8 };
    for (const x of [-w / 2 + 0.01, w / 2 - 0.01]) for (const z of [-d / 2 + 0.01, d / 2 - 0.01]) m.box(frame, [x - 0.01, 0, z - 0.01], [x + 0.01, h, z + 0.01]);
    for (let k = 0; k < 5; k++) { const y = 0.05 + k * ((h - 0.08) / 4); m.box(M.wood, [-w / 2, y, -d / 2], [w / 2, y + 0.022, d / 2]); }
  },
  filing(m, F, [w, d, h], { n }) { const M = matsOf(F); m.box(M.inside, [-w / 2 + 0.02, 0, -d / 2 + 0.02], [w / 2 - 0.02, 0.04, d / 2 - 0.03]); carcass(m, M, -w / 2, w / 2, 0.04, h, -d / 2, d / 2); bays(m, M, [`drawers:${n}`], -w / 2, w / 2, 0.04, h, -d / 2, d / 2); },
  bench(m, F, [w, d, h]) {
    const M = { ...matsOf(F), binColour: '#c9bda8' }, n = Math.max(2, Math.round(w / 0.4));
    carcass(m, M, -w / 2, w / 2, 0, h - 0.06, -d / 2, d / 2); bays(m, M, Array.from({ length: n }, (_, i) => (i % 2 ? 'open' : 'bins')), -w / 2, w / 2, 0, h - 0.06, -d / 2, d / 2);
    m.box({ name: 'cushion:fabric', colour: '#cfc6b6', roughness: 0.95 }, [-w / 2 + 0.01, h - 0.06, -d / 2 + 0.01], [w / 2 - 0.01, h, d / 2 - 0.01]);
  },
  hallTree(m, F, [w, d, h]) {
    const M = matsOf(F), sh = 0.46;
    carcass(m, M, -w / 2, w / 2, 0, sh, -d / 2, d / 2); bays(m, M, ['open', 'open'], -w / 2, w / 2, 0, sh, -d / 2, d / 2);
    for (const s of [-1, 1]) m.box(M.body, [s > 0 ? w / 2 - T : -w / 2, sh, -d / 2], [s > 0 ? w / 2 : -w / 2 + T, h, -d / 2 + 0.3]);
    m.box(M.inside, [-w / 2 + T, sh, -d / 2], [w / 2 - T, h - 0.3, -d / 2 + 0.012]); // the back
    m.box(M.body, [-w / 2, h - 0.3, -d / 2], [w / 2, h - 0.3 + T, -d / 2 + 0.3]); m.box(M.body, [-w / 2, h - T, -d / 2], [w / 2, h, -d / 2 + 0.3]);
    m.box(M.body, [-w / 2 + T, h - 0.3 + T, -d / 2], [w / 2 - T, h - T, -d / 2 + 0.012]);
    for (let k = 0; k < 4; k++) { const x = -w / 2 + 0.12 + (k * (w - 0.24)) / 3; m.tube(metal, [[x, h - 0.45, -d / 2 + 0.012], [x, h - 0.45, -d / 2 + 0.07], [x, h - 0.41, -d / 2 + 0.09]], 0.007, { sides: 6, closeEnds: true }); }
  },
  barCart(m, F, [w, d, h]) {
    const M = matsOf(F), frame = { ...metal, name: 'frame:metal', colour: '#b39563', metallic: 0.85, roughness: 0.25 };
    for (const x of [-w / 2 + 0.015, w / 2 - 0.015]) for (const z of [-d / 2 + 0.015, d / 2 - 0.015]) m.tube(frame, [[x, 0.05, z], [x, h, z]], 0.008, { sides: 8 });
    m.tube(frame, [[w / 2 - 0.015, h, -d / 2 + 0.015], [w / 2 + 0.06, h + 0.0, -d / 2 + 0.015], [w / 2 + 0.06, h, d / 2 - 0.015], [w / 2 - 0.015, h, d / 2 - 0.015]], 0.008, { sides: 8 }); // the handle
    for (const y of [0.18, h - 0.02]) { m.box(M.wood, [-w / 2, y, -d / 2], [w / 2, y + 0.018, d / 2]); for (const s of [-1, 1]) m.box(frame, [-w / 2, y + 0.018, s * (d / 2) - 0.004], [w / 2, y + 0.05, s * (d / 2) + 0.004]); }
    for (const x of [-w / 2 + 0.015, w / 2 - 0.015]) for (const z of [-d / 2 + 0.015, d / 2 - 0.015]) m.lathe({ name: 'wheels:rubber', colour: '#222', roughness: 0.7 }, [[0.001, 0], [0.025, 0.002], [0.026, 0.045], [0.001, 0.05]], { at: [x, 0, z], segs: 12 });
  },
  bookcase(m, F, [w, d, h]) {
    const M = matsOf(F), y0 = base(m, M, F, 'plinth', w, d), n = Math.max(2, Math.round(w / 0.8));
    carcass(m, M, -w / 2, w / 2, y0, h, -d / 2, d / 2); rows(m, M, [[0.33, Array(n).fill('doors')], [0.67, Array(n).fill('shelves')]], -w / 2, w / 2, y0, h, -d / 2, d / 2);
  },
};

// id, label, mount, room, builder, { size name: [w, d, h] metres }, words, note, options
const STORAGE = [
  ['STC', 'tall cabinet', 'floor', 'any', 'tall', { '60cm': [0.6, 0.45, 2.0], '80cm': [0.8, 0.45, 2.0], '100cm': [1.0, 0.45, 2.0] }, ['tall cabinet', 'pantry', 'linen cupboard', 'cupboard', 'storage cabinet'], 'two doors floor to top, a shelf break at three-quarters'],
  ['HUT', 'hutch', 'floor', 'dining', 'hutch', { '120cm': [1.2, 0.48, 2.0], '160cm': [1.6, 0.48, 2.0] }, ['hutch', 'china cabinet', 'welsh dresser', 'dresser', 'buffet'], 'a sideboard of doors and drawers with glass-doored shelves on top'],
  ['DSP', 'glass display cabinet', 'floor', 'any', 'display', { '60cm': [0.6, 0.4, 1.8], '90cm': [0.9, 0.4, 1.8] }, ['display cabinet', 'vitrine', 'glass cabinet', 'curio', 'china cabinet'], 'glass doors and shelves, on legs'],
  ['ARW', 'armoire', 'floor', 'bedroom', 'armoire', { std: [1.1, 0.6, 2.0] }, ['armoire', 'wardrobe', 'closet'], 'two tall doors over two drawers, a crown on top'],
  ['TLB', 'tallboy', 'floor', 'bedroom', 'tallboy', { std: [0.6, 0.45, 1.3] }, ['tallboy', 'chest of drawers', 'tall dresser', 'lingerie chest', 'drawers'], 'five drawers, narrow and tall'],
  ['DBD', 'double dresser', 'floor', 'bedroom', 'double', { '6-drawer': [1.5, 0.5, 0.82], '9-drawer': [1.9, 0.5, 0.82] }, ['dresser', 'double dresser', 'chest of drawers', 'drawers', 'lowboy'], 'drawers in two or three columns'],
  ['CUB', 'cube storage', 'floor', 'any', 'cubes', { '2x2': [0.78, 0.39, 0.78], '4x1': [1.47, 0.39, 0.42], '2x4': [0.78, 0.39, 1.47], '4x4': [1.47, 0.39, 1.47] }, ['cube storage', 'cubby', 'cubbies', 'shelving', 'storage bins', 'bins'], 'square cubbies, every other one with a fabric bin'],
  ['FSH', 'floating shelf', 'wall', 'any', 'floatShelf', { '60cm': [0.6, 0.22, 0.04], '90cm': [0.9, 0.22, 0.04], '120cm': [1.2, 0.22, 0.04] }, ['floating shelf', 'wall shelf', 'shelf', 'ledge'], 'a solid board on the wall with no brackets showing', { hang: 1.4 }],
  ['WCB', 'wall cabinet', 'wall', 'any', 'wallCab', { '60cm': [0.6, 0.32, 0.7], '90cm': [0.9, 0.32, 0.7] }, ['wall cabinet', 'upper cabinet', 'cupboard', 'kitchen cabinet', 'laundry cabinet'], 'doors, hung on the wall (its middle about 1.75 m up)', { hang: 1.75 }],
  ['MCB', 'medicine cabinet', 'wall', 'bath', 'medicine', { std: [0.6, 0.14, 0.7] }, ['medicine cabinet', 'bathroom cabinet', 'mirror cabinet', 'mirror'], 'a mirror door over shelves, over a vanity', { hang: 1.55 }],
  ['LAD', 'ladder shelf', 'floor', 'any', 'ladder', { std: [0.6, 0.42, 1.8] }, ['ladder shelf', 'leaning shelf', 'shelves', 'bookshelf'], 'two rails leaning on the wall, five shelves deepest at the bottom'],
  ['ETG', 'étagère', 'floor', 'any', 'etagere', { std: [0.9, 0.4, 1.9] }, ['etagere', 'étagère', 'open shelving', 'shelves', 'bookshelf', 'brass'], 'a brass (or black) frame with five wooden shelves'],
  ['FIL', 'filing cabinet', 'floor', 'office', 'filing', { '2-drawer': [0.4, 0.55, 0.72], '3-drawer': [0.4, 0.55, 1.02] }, ['filing cabinet', 'file cabinet', 'drawers', 'office storage'], 'deep drawers for files', { n: { '2-drawer': 2, '3-drawer': 3 } }],
  ['STB', 'storage bench', 'floor', 'entry', 'bench', { '100cm': [1.0, 0.4, 0.46], '120cm': [1.2, 0.4, 0.46] }, ['storage bench', 'shoe bench', 'entry bench', 'mudroom', 'bench', 'bins'], 'a cushioned seat over cubbies and bins'],
  ['HTR', 'hall tree', 'floor', 'entry', 'hallTree', { std: [1.0, 0.42, 1.85] }, ['hall tree', 'coat rack', 'hooks', 'mudroom', 'entry'], 'a bench of cubbies, a back with four hooks, a shelf on top'],
  ['BRC', 'bar cart', 'floor', 'dining', 'barCart', { std: [0.8, 0.45, 0.85] }, ['bar cart', 'drinks trolley', 'trolley', 'cart'], 'a brass frame on wheels, two wooden shelves'],
  ['BKD', 'bookcase with doors', 'floor', 'living', 'bookcase', { '80cm': [0.8, 0.38, 2.0], '160cm': [1.6, 0.38, 2.0] }, ['bookcase', 'bookshelf', 'library', 'cabinet', 'shelves'], 'doors below, open shelves above'],
];
const CUBE = { '2x2': { c: 2, r: 2 }, '4x1': { c: 4, r: 1 }, '2x4': { c: 2, r: 4 }, '4x4': { c: 4, r: 4 } };

export const storageEntries = STORAGE.flatMap(([id, label, mount, room, builder, sizes, words, note, opts = {}]) =>
  Object.entries(sizes).map(([size, [w, d, h]]) => {
    const one = Object.keys(sizes).length === 1;
    return {
      id: one ? id : `${id}-${size}`, name: `${label[0].toUpperCase()}${label.slice(1)}${one ? '' : `, ${size}`}`, kind: 'storage', mount, room, piece: id, sizeName: size,
      ...(opts.hang ? { hang: opts.hang } : {}), words: ['storage', ...words], note: `${note}; ${FIN}`, finishes: Object.keys(MEDIA_FINISHES),
      build: (fit) => { const m = new Mesh(); BUILD[builder](m, finishOf(fit), [w, d, h], { ...(CUBE[size] ?? {}), n: opts.n?.[size] }); return m; },
    };
  }));
export { cm };
