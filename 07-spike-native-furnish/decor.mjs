// Maison3D's own pieces, for what mojulo has no kind for: houseplants in planters, framed pictures, mirrors, and
// curtains and blinds made to fit the window they hang at. Each is built here (mesh.mjs), the same from the same
// recipe, readied like a catalogue piece: centred on its footprint, its base at y = 0, its front to +z. A wall piece's
// back is at -z; a window piece is built to its window (`fit`), the one kind of piece sized when placed.
import { Mesh, dice, norm, v3, bounds, settle } from './mesh.mjs';
import { paint, ABSTRACT_STYLES, PALETTES } from './art.mjs';
import { partsOf } from '../70-inventory/colour.mjs';
import { applianceEntries } from './appliances.mjs';
import { mediaEntries } from './media.mjs';

const R = (v) => Math.round(v * 1000) / 1000;

// --- planters -------------------------------------------------------------------------------------------------------
const POTS = {
  cylinder: { colour: '#e9e4da', profile: (r, h) => [[r * 0.9, 0], [r, 0.015], [r, h], [r * 0.93, h], [r * 0.93, h - 0.03]] },
  terracotta: { colour: '#b8643f', profile: (r, h) => [[r * 0.68, 0], [r * 0.7, 0.015], [r * 0.92, h * 0.84], [r * 1.04, h * 0.85], [r * 1.04, h], [r * 0.95, h], [r * 0.95, h - 0.03]] },
  bowl: { colour: '#3c3a36', profile: (r, h) => [[r * 0.45, 0], [r * 0.5, 0.01], [r * 0.85, h * 0.45], [r, h], [r * 0.94, h], [r * 0.94, h - 0.03]] },
  basket: { colour: '#b89b6e', profile: (r, h) => [[r * 0.88, 0], [r * 0.9, 0.01], [r, h], [r * 0.95, h], [r * 0.95, h - 0.03]], ribs: [36, 0.04] },
};
function planter(m, kind, r, h) {
  const P = POTS[kind];
  m.lathe({ name: 'pot:pot', colour: P.colour, roughness: kind === 'bowl' ? 0.5 : 0.85 }, P.profile(r, h), { segs: 28, ribs: P.ribs ?? null, caps: [true, false] });
  m.lathe({ name: 'soil:soil', colour: '#3b2e24' }, [[0, h - 0.035], [r * 0.93, h - 0.035]], { segs: 20, caps: [false, false] });
  return h - 0.035; // the soil line
}

// --- leaves ---------------------------------------------------------------------------------------------------------
const heart = (L, W) => (u) => W * L * Math.sin(Math.PI * Math.min(1, u ** 0.75)) * (u < 0.15 ? 0.7 + u * 2 : 1);
const oval = (L, W) => (u) => W * L * Math.sin(Math.PI * u) ** 0.8;
const blade = (W) => (u) => W * Math.sin(Math.PI * Math.min(1, 0.08 + u * 0.95)) ** 0.35 * (1 - u ** 4);
const violin = (L, W) => (u) => W * L * Math.sin(Math.PI * u) ** 0.6 * (1 - 0.22 * Math.exp(-(((u - 0.45) / 0.12) ** 2))) * (0.6 + 0.4 * u);
const around = (a, up) => [Math.cos(a) * Math.cos(up), Math.sin(up), Math.sin(a) * Math.cos(up)];
const leafMat = (colour) => ({ name: 'leaf:leaves', colour, roughness: 0.6 });
const along = (p0, p1, p2, n) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n; return [0, 1, 2].map((k) => (1 - t) ** 2 * p0[k] + 2 * (1 - t) * t * p1[k] + t * t * p2[k]); });

const PLANTS = {
  monstera: { label: 'monstera', pot: 'cylinder', leaf: '#4a8a45', grow(m, r, H, soil) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + r() * 0.5, up = 1.05 + r() * 0.35, L = H * (0.4 + r() * 0.3);
      const d = around(a, up), base = [0, soil, 0], tip = v3.add(base, v3.mul(d, L));
      m.tube({ name: 'stem:stem', colour: '#4a6b3a' }, along(base, v3.add(base, v3.mul(d, L * 0.6)), tip, 6), 0.006);
      m.leaf(leafMat(this.leaf), { base: tip, dir: norm([d[0], 0.1, d[2]]), length: H * 0.3, width: heart(H * 0.3, 0.45), fold: 0.12, droop: H * 0.06, rows: 7 });
    }
  } },
  'fiddle-leaf fig': { label: 'fiddle-leaf fig', pot: 'basket', leaf: '#5a9440', grow(m, r, H, soil) {
    const trunk = along([0, soil, 0], [0.03, soil + H * 0.4, 0], [0, H * 0.92, 0.02], 8);
    m.tube({ name: 'trunk:trunk', colour: '#6b5a45' }, trunk, trunk.map((_, i) => 0.018 - i * 0.0015), { sides: 7 });
    for (let i = 0; i < 34; i++) {
      const t = 0.38 + (i / 34) * 0.62, p = trunk[Math.round(t * 8)], a = i * 2.4, L = 0.26 + r() * 0.1;
      m.leaf(leafMat(this.leaf), { base: p, dir: norm(around(a, 0.35 + r() * 0.4)), length: L, width: violin(L, 0.36), fold: 0.1, droop: 0.05, rows: 6 });
    }
  } },
  'snake plant': { label: 'snake plant', pot: 'terracotta', leaf: '#4f7a3a', grow(m, r, H, soil) {
    for (let i = 0; i < 13; i++) {
      const a = r() * Math.PI * 2, off = 0.02 + r() * 0.05, tilt = 0.05 + r() * 0.15, L = (H - soil) * (0.55 + r() * 0.45);
      const base = [Math.cos(a) * off, soil - 0.01, Math.sin(a) * off], dir = norm([Math.cos(a) * tilt, 1, Math.sin(a) * tilt]);
      m.leaf(leafMat(['#4f7a3a', '#5f8a40', '#3f6633'][i % 3]), { base, dir, up: [Math.cos(a + 1.3), 0, Math.sin(a + 1.3)], length: L, width: blade(0.022 + r() * 0.012), fold: 0.3, rows: 8 });
    }
  } },
  pothos: { label: 'pothos', pot: 'bowl', leaf: '#62a447', surface: true, grow(m, r, H, soil, potR) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + r() * 0.4, out = [Math.cos(a), 0, Math.sin(a)], fall = Math.min(soil - 0.03, 0.1 + r() * 0.2);
      const path = along([out[0] * potR * 0.5, soil + 0.03, out[2] * potR * 0.5], [out[0] * (potR + 0.08), soil + 0.06, out[2] * (potR + 0.08)], [out[0] * (potR + 0.14), soil - fall, out[2] * (potR + 0.14)], 10);
      m.tube({ name: 'stem:stem', colour: '#5d7d3a' }, path, 0.003, { sides: 4 });
      for (let k = 1; k < path.length; k += 1) m.leaf(leafMat(k % 2 ? '#62a447' : '#7db552'), { base: path[k], dir: norm([out[0] + (r() - 0.5), 0.3, out[2] + (r() - 0.5)]), length: 0.065, width: heart(0.065, 0.42), fold: 0.15, rows: 4 });
    }
  } },
  'kentia palm': { label: 'kentia palm', pot: 'cylinder', leaf: '#52894a', grow(m, r, H, soil) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + r() * 0.4, up = 1.1 + r() * 0.3, L = (H - soil) * (0.75 + r() * 0.3);
      const d = around(a, up), mid = v3.add([0, soil, 0], v3.mul(d, L * 0.6)), tip = v3.add(v3.add([0, soil, 0], v3.mul(around(a, 0.55), L * 0.7)), [0, L * 0.25, 0]);
      const frond = along([0, soil, 0], mid, tip, 12);
      m.tube({ name: 'stem:stem', colour: '#5b7a3a' }, frond, 0.005, { sides: 5 });
      for (let k = 4; k < frond.length; k++) for (const s of [-1, 1]) {
        const t = norm(v3.sub(frond[k], frond[k - 1])), side = norm(v3.cross(t, [0, 1, 0]));
        m.leaf(leafMat(this.leaf), { base: frond[k], dir: norm(v3.add(v3.mul(side, s), [0, -0.5, 0])), length: (0.16 + r() * 0.08) * (1.2 - k / frond.length), width: blade(0.012), fold: 0.25, droop: 0.04, rows: 4 });
      }
    }
  } },
  'olive tree': { label: 'olive tree', pot: 'terracotta', leaf: '#7d8b6a', grow(m, r, H, soil) {
    const trunk = along([0, soil, 0], [0.05, soil + (H - soil) * 0.3, -0.03], [-0.02, H * 0.62, 0.02], 8);
    m.tube({ name: 'trunk:trunk', colour: '#6e6253' }, trunk, trunk.map((_, i) => 0.03 - i * 0.002), { sides: 7 });
    const top = trunk.at(-1);
    for (let b = 0; b < 5; b++) {
      const a = (b / 5) * Math.PI * 2 + r(), end = v3.add(top, [Math.cos(a) * 0.3, (H - top[1]) * (0.6 + r() * 0.4), Math.sin(a) * 0.3]);
      const branch = along(top, v3.add(top, [Math.cos(a) * 0.08, 0.15, Math.sin(a) * 0.08]), end, 5);
      m.tube({ name: 'trunk:trunk', colour: '#6e6253' }, branch, 0.008, { sides: 5 });
      for (let k = 0; k < 70; k++) {
        const c = v3.add(end, [(r() - 0.5) * 0.35, (r() - 0.6) * 0.3, (r() - 0.5) * 0.35]);
        m.leaf(leafMat(k % 3 ? '#8f9d7a' : '#a8b391'), { base: c, dir: norm([r() - 0.5, r() - 0.3, r() - 0.5]), length: 0.09, width: blade(0.011), fold: 0.1, rows: 2 });
      }
    }
  } },
  'zz plant': { label: 'ZZ plant', pot: 'bowl', leaf: '#3f7536', grow(m, r, H, soil) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + r() * 0.5, L = (H - soil) * (0.6 + r() * 0.4), d = around(a, 1.25 + r() * 0.2);
      const stem = along([0, soil, 0], v3.add([0, soil, 0], v3.mul(d, L * 0.5)), v3.add([0, soil, 0], v3.mul(around(a, 0.9), L)), 8);
      m.tube({ name: 'stem:stem', colour: '#3f5f2c' }, stem, 0.006, { sides: 5 });
      for (let k = 3; k < stem.length; k++) for (const s of [-1, 1]) {
        const t = norm(v3.sub(stem[k], stem[k - 1])), side = norm(v3.cross(t, [0, 1, 0]));
        m.leaf(leafMat(this.leaf), { base: stem[k], dir: norm(v3.add(v3.mul(side, s), v3.mul(t, 0.6))), length: 0.07, width: oval(0.07, 0.3), fold: 0.08, rows: 3 });
      }
    }
  } },
  'boston fern': { label: 'Boston fern', pot: 'basket', leaf: '#6fa648', grow(m, r, H, soil, potR) {
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + r() * 0.3, L = 0.45 + r() * 0.25, out = [Math.cos(a), 0, Math.sin(a)];
      const frond = along([0, soil + 0.02, 0], [out[0] * L * 0.4, soil + 0.25, out[2] * L * 0.4], [out[0] * (potR + L * 0.5), Math.max(0.03, soil - 0.08 - r() * 0.12), out[2] * (potR + L * 0.5)], 10);
      m.tube({ name: 'stem:stem', colour: '#4e6e34' }, frond, 0.002, { sides: 3 });
      for (let k = 2; k < frond.length; k++) for (const s of [-1, 1]) {
        const t = norm(v3.sub(frond[k], frond[k - 1])), side = norm(v3.cross(t, [0, 1, 0]));
        m.leaf(leafMat(k % 2 ? this.leaf : '#82b556'), { base: frond[k], dir: norm(v3.add(v3.mul(side, s), v3.mul(t, 0.4))), length: 0.05 * (1 - k / 14), width: blade(0.006), fold: 0.1, rows: 2 });
      }
    }
  } },
  'rubber plant': { label: 'rubber plant', pot: 'cylinder', leaf: '#3d5a40', grow(m, r, H, soil) {
    const trunk = along([0, soil, 0], [0.02, (soil + H) / 2, 0], [0, H * 0.95, 0], 8);
    m.tube({ name: 'trunk:trunk', colour: '#5f5a3e' }, trunk, 0.012, { sides: 6 });
    for (let i = 0; i < 20; i++) {
      const t = 0.2 + (i / 20) * 0.8, p = trunk[Math.round(t * 8)], a = i * 2.39, L = 0.26 + r() * 0.08;
      m.leaf(leafMat(i % 2 ? '#3d5a40' : '#5a4440'), { base: p, dir: norm(around(a, 0.25 + r() * 0.3)), length: L, width: oval(L, 0.27), fold: 0.06, droop: 0.03, rows: 5 });
    }
  } },
  cactus: { label: 'cactus', pot: 'terracotta', leaf: '#5d8c4a', grow(m, r, H, soil) {
    const h = H - soil, rr = 0.06 + h * 0.03;
    m.lathe(leafMat(this.leaf), [[rr * 0.8, soil - 0.01], [rr, soil + 0.05], [rr, soil + h * 0.88], [rr * 0.7, soil + h * 0.97], [0.001, soil + h]], { segs: 24, ribs: [12, 0.12], caps: [false, false] });
    if (h > 0.5) for (const s of [-1, 1]) {
      const y = soil + h * (0.35 + r() * 0.2), arm = along([0, y, 0], [s * rr * 2.6, y, 0], [s * rr * 2.6, y + h * 0.3, 0], 8);
      m.tube(leafMat(this.leaf), arm, rr * 0.6, { sides: 10 });
    }
  } },
};

// --- pictures and mirrors ---------------------------------------------------------------------------------------------
const FRAMES = {
  gallery: { name: 'frame:frame', colour: '#1d1d1d', w: 0.022, d: 0.03, mat: 0.07, roughness: 0.5 },
  oak: { name: 'frame:frame', colour: '#b08d62', w: 0.042, d: 0.032, mat: 0 },
  brass: { name: 'frame:frame', colour: '#b8953d', w: 0.012, d: 0.025, mat: 0.06, metallic: 0.8, roughness: 0.3 },
  white: { name: 'frame:frame', colour: '#f1eee8', w: 0.03, d: 0.035, mat: 0.07 },
  canvas: { name: 'frame:frame', colour: '#e8e2d6', w: 0, d: 0.038, mat: 0 },
};
const ARTWORKS = [
  ['colour-field', 'Colour field', 'canvas', 'portrait', 11], ['bauhaus', 'Bauhaus print', 'white', 'portrait', 3],
  ['line', 'Line drawing', 'gallery', 'portrait', 7], ['hills', 'Layered hills', 'oak', 'landscape', 5],
  ['arches', 'Arches', 'oak', 'portrait', 2], ['grid', 'Pencil grid', 'white', 'portrait', 9],
  ['waves', 'Waves', 'canvas', 'landscape', 4], ['leaves', 'Leaf study', 'gallery', 'portrait', 6],
  ['sunset', 'Sunset', 'brass', 'landscape', 8], ['ink', 'Ink wash', 'gallery', 'portrait', 12],
  ['colour-field', 'Colour field II', 'oak', 'landscape', 21], ['bauhaus', 'Bauhaus print II', 'brass', 'portrait', 13],
];
const ART_SIZES = { small: [0.4, 0.5], medium: [0.6, 0.8], large: [0.9, 1.2] };

function picture(m, { art, seed, frame, w, h, palette, draft = false }) {
  const F = FRAMES[frame], D = F.d, z0 = -D / 2, z1 = D / 2;
  const fw = F.w;
  if (fw > 0) {
    const fm = { name: F.name, colour: F.colour, metallic: F.metallic, roughness: F.roughness };
    m.box(fm, [-w / 2, 0, z0], [w / 2, fw, z1]); m.box(fm, [-w / 2, h - fw, z0], [w / 2, h, z1]);
    m.box(fm, [-w / 2, fw, z0], [-w / 2 + fw, h - fw, z1]); m.box(fm, [w / 2 - fw, fw, z0], [w / 2, h - fw, z1]);
  } else m.box({ name: 'frame:frame', colour: F.colour }, [-w / 2, 0, z0], [w / 2, h, z1 - 0.002]); // a canvas's stretcher
  const inner = [w / 2 - fw, h - fw], mat = F.mat, zf = fw > 0 ? z1 - 0.008 : z1;
  if (mat > 0) m.quad({ name: 'mat:mat', colour: '#f6f3ec', roughness: 0.95 }, [[-inner[0], fw, zf - 0.001], [inner[0], fw, zf - 0.001], [inner[0], h - fw, zf - 0.001], [-inner[0], h - fw, zf - 0.001]]);
  const ax = inner[0] - mat, y0 = fw + mat, y1 = h - fw - mat;
  // the picture's pixels in its own proportions, the long side 512 (384 for the catalogue's fixed prints)
  const long = palette ? 512 : 384, aspect = (2 * ax) / (y1 - y0);
  const [px, py] = aspect >= 1 ? [long, Math.max(48, Math.round(long / aspect))] : [Math.max(48, Math.round(long * aspect)), long];
  m.quad({ name: 'art:art', colour: '#ffffff', roughness: 0.9, texture: draft ? paint('grid', 1, 8, 8) : paint(art, seed, px, Math.min(768, py), { palette }) }, [[-ax, y0, zf], [ax, y0, zf], [ax, y1, zf], [-ax, y1, zf]]);
}

const MIRRORS = {
  round: { label: 'round mirror', size: [0.7, 0.7], frame: { colour: '#b8953d', metallic: 0.8, roughness: 0.3 }, outline: (w, h) => Array.from({ length: 40 }, (_, i) => { const a = (i / 40) * Math.PI * 2; return [Math.cos(a) * w / 2, h / 2 + Math.sin(a) * h / 2]; }) },
  arch: { label: 'arched mirror', size: [0.6, 1.0], frame: { colour: '#1d1d1d', roughness: 0.5 }, outline: (w, h) => [[w / 2, 0], ...Array.from({ length: 21 }, (_, i) => { const a = (i / 20) * Math.PI; return [Math.cos(a) * w / 2, h - w / 2 + Math.sin(a) * w / 2]; }), [-w / 2, 0]] },
  rectangular: { label: 'rectangular mirror', size: [0.7, 1.0], frame: { colour: '#b08d62' }, outline: (w, h) => [[w / 2, 0], [w / 2, h], [-w / 2, h], [-w / 2, 0]] },
  floor: { label: 'floor mirror', size: [0.6, 1.7], mount: 'floor', frame: { colour: '#1d1d1d', roughness: 0.5 }, outline: (w, h) => [[w / 2, 0], [w / 2, h], [-w / 2, h], [-w / 2, 0]] },
  oval: { label: 'oval mirror', size: [0.55, 0.85], frame: { colour: '#b8953d', metallic: 0.8, roughness: 0.3 }, outline: (w, h) => Array.from({ length: 40 }, (_, i) => { const a = (i / 40) * Math.PI * 2; return [Math.cos(a) * w / 2, h / 2 + Math.sin(a) * h / 2]; }) },
};
function mirror(m, kind, [w, h], d = 0.03) {
  const M = MIRRORS[kind], ring = M.outline(w, h);
  m.fan({ name: 'glass:glass', colour: '#e4ebee', metallic: 0.15, roughness: 0.12 }, ring.map(([x, y]) => [x * 0.96, h / 2 + (y - h / 2) * 0.96, d / 2 - 0.004]).reverse());
  m.tube({ name: 'frame:frame', ...M.frame }, [...ring, ring[0]].map(([x, y]) => [x, y, d / 2 - 0.012]), Math.min(0.018, w * 0.03), { sides: 8 });
  m.box({ name: 'back:back', colour: '#4a4540' }, [-w * 0.3, h * 0.3, -d / 2], [w * 0.3, h * 0.7, -d / 2 + 0.01]);
}

// --- curtains and blinds, fitted ----------------------------------------------------------------------------------------
const CURTAINS = {
  'CUR-PINCH': { label: 'pinch-pleat curtains', fabric: '#e5ddcc', heading: 'pinch', roughness: 0.95, note: 'lined linen, floor length, a pinch-pleat heading on a rod' },
  'CUR-RIPPLE': { label: 'ripple-fold curtains', fabric: '#c9c3b6', heading: 'ripple', roughness: 0.9, note: 'soft even waves on a track' },
  'CUR-GROMMET': { label: 'grommet curtains', fabric: '#6f7d6c', heading: 'grommet', roughness: 0.9, note: 'rings through the fabric on a rod' },
  'CUR-SHEER': { label: 'sheer curtains', fabric: '#f5f3ee', heading: 'ripple', roughness: 0.9, alpha: 0.5, note: 'light, see-through voile' },
  'CUR-VELVET': { label: 'velvet curtains', fabric: '#3e4a61', heading: 'pinch', roughness: 0.55, note: 'heavy velvet drapes' },
  'BLD-ROMAN': { label: 'roman blind', fabric: '#d8cfbd', blind: 'roman', roughness: 0.95, note: 'folds up in soft pleats, inside the window' },
  'BLD-ROLLER': { label: 'roller blind', fabric: '#ece9e2', blind: 'roller', roughness: 0.9, note: 'a flat blind on a roller' },
  // drop down
  'BLD-CELLULAR': { label: 'cellular shade', fabric: '#efe9dd', blind: 'cellular', roughness: 0.95, note: 'honeycomb pleats that drop down' },
  'BLD-ZEBRA': { label: 'zebra shade', fabric: '#d9d3c7', blind: 'zebra', roughness: 0.9, tilts: true, note: 'two layers of sheer and solid bands that drop down and tilt between see-through and closed' },
  // tiltable
  'BLD-VENETIAN': { label: 'venetian blind', fabric: '#e8e8e4', blind: 'slats', slat: 0.025, metallic: 0.4, roughness: 0.4, tilts: true, note: 'aluminium slats, 25 mm, that raise and tilt' },
  'BLD-WOOD': { label: 'wood slat blind', fabric: '#b8935f', blind: 'slats', slat: 0.05, roughness: 0.6, tilts: true, note: 'wooden slats, 50 mm, on tapes, that raise and tilt' },
  'BLD-VERTICAL': { label: 'vertical blinds', fabric: '#e6e2d8', blind: 'vertical', roughness: 0.9, tilts: true, note: 'fabric vanes that draw to the side and tilt' },
  // fixed, their louvres tilt
  'SHT-PLANTATION': { label: 'plantation shutters', fabric: '#f2f0ea', blind: 'shutter', roughness: 0.5, tilts: true, fixed: true, note: 'fixed panels of wide louvres that tilt, inside the window' },
  'SHT-CAFE': { label: 'café shutters', fabric: '#f2f0ea', blind: 'shutter', cafe: true, roughness: 0.5, tilts: true, fixed: true, note: 'shutters over the lower half of the window, their louvres tilt' },
};
export const TILTS = Object.keys(CURTAINS).filter((k) => CURTAINS[k].tilts);

/** The fit of a window piece to its window: { w, top, bottom, open }, from the window's width, sill, top, the ceiling. */
export function fitTo(id, win, { ceiling, high = false, drop = 'floor', open, inside, tilt } = {}) {
  const C = CURTAINS[id], t = win.trim ?? 0.065, sd = win.sill_depth ?? 0.05, rc = win.recess ?? 0.1;
  if (C.blind) {
    // a fixed shutter does not raise; a tiltable one starts with its slats open
    const how = { open: C.fixed ? 1 : open ?? 0.7, ...(C.tilts ? { tilt: tilt ?? 1 } : {}) };
    // café shutters cover the lower half
    const top = (y) => (C.cafe ? R(win.bottom + (win.top - win.bottom) / 2) : y);
    // inside the recess when it is deep enough for one (and not asked otherwise): the window's own width and height
    if ((inside ?? rc >= 0.06) && rc >= 0.04) return { w: R(win.width - 0.012), top: top(R(win.top - 0.005)), bottom: R(win.bottom), ...how, mount: 'inside' };
    return { w: R(win.width + 2 * t + 0.06), top: top(R(Math.min(ceiling - 0.03, win.top + t + 0.04))), bottom: R(win.bottom), ...how, mount: 'outside', proj: R(Math.max(0.04, Math.min(sd, 0.08) + 0.02)) };
  }
  // a rod over the casing, running 20 cm past it each side, its brackets clear of the sill
  const top = high ? ceiling - 0.08 : Math.min(ceiling - 0.05, win.top + t + 0.1);
  const bottom = drop === 'sill' ? (sd > 0.02 ? win.bottom + 0.012 : Math.max(0.02, win.bottom - 0.1)) : 0.012;
  return { w: R(win.width + 2 * t + 0.4), top: R(top), bottom: R(bottom), open: open ?? 1, proj: R(Math.max(0.1, sd + 0.07)) };
}

/** Slats across, `pitch` apart, each `width` deep, turned by `tilt` (1 flat and open, 0 closed). */
function slatRow(m, mat, w, yTop, yBottom, z, width, pitch, tilt) {
  const th = (1 - tilt) * 1.35, dy = (Math.sin(th) * width) / 2, dz = (Math.cos(th) * width) / 2;
  for (let y = yTop; y > yBottom; y -= pitch) m.quad(mat, [[-w / 2, y - dy, z - dz], [w / 2, y - dy, z - dz], [w / 2, y + dy, z + dz], [-w / 2, y + dy, z + dz]]);
}

/** The blinds and shutters beyond the roller and the roman blind: their own shapes, drops and tilts. */
function blindKind(m, C, { w, H, open, tilt = 1, zb, fabric, rod }) {
  const drop = H * (1 - open * 0.85), bottomY = H - drop;
  if (C.blind === 'slats') {
    const pitch = C.slat * 0.85, slat = { name: 'slat:body', colour: C.fabric, metallic: C.metallic, roughness: C.roughness };
    slatRow(m, slat, w - 0.01, H - 0.05, bottomY + 0.02, zb, C.slat, pitch, tilt);
    const raised = Math.max(0, Math.round((H - drop) / pitch) * 0 + Math.round((H * open * 0.85) / pitch));
    if (raised) m.box(slat, [-w / 2 + 0.005, H - 0.04 - raised * 0.0035, zb - C.slat / 2], [w / 2 - 0.005, H - 0.04, zb + C.slat / 2]); // the slats drawn up
    m.box(slat, [-w / 2 + 0.005, bottomY, zb - C.slat / 2], [w / 2 - 0.005, bottomY + 0.02, zb + C.slat / 2]); // the bottom rail
    const tape = { name: 'tape:tape', colour: C.slat > 0.03 ? '#e8e2d4' : '#cfcfcb' };
    for (const x of [-w / 3, w / 3]) m.box(tape, [x - (C.slat > 0.03 ? 0.018 : 0.0015), bottomY, zb - C.slat / 2 - 0.001], [x + (C.slat > 0.03 ? 0.018 : 0.0015), H - 0.04, zb - C.slat / 2]);
  } else if (C.blind === 'vertical') {
    // vanes hang from the track; drawn, they stack to the left, turned edge-on
    const vane = 0.089, n = Math.max(3, Math.round((w - 0.02) / 0.08)), span = (w - 0.02) * (1 - open) + 0.12 * open, gapX = span / n;
    for (let i = 0; i < n; i++) {
      // th 0 is edge-on to the room (open), π/2 flat across the glass (shut); stacked vanes cannot turn wider than their gap
      const x = -w / 2 + 0.01 + gapX * (i + 0.5), th = Math.min((1 - tilt) * 1.45, Math.asin(Math.min(1, gapX / vane)));
      const dx = (Math.sin(th) * vane) / 2, dz = (Math.cos(th) * vane) / 2;
      m.quad(fabric, [[x - dx, 0.01, zb - dz], [x + dx, 0.01, zb + dz], [x + dx, H - 0.05, zb + dz], [x - dx, H - 0.05, zb - dz]]);
    }
  } else if (C.blind === 'cellular') {
    m.quad(fabric, [[-w / 2, bottomY, zb - 0.012], [w / 2, bottomY, zb - 0.012], [w / 2, H - 0.04, zb - 0.012], [-w / 2, H - 0.04, zb - 0.012]]);
    for (let y = H - 0.055; y > bottomY + 0.015; y -= 0.032) m.tube(fabric, [[-w / 2, y, zb], [w / 2, y, zb]], 0.013, { sides: 6, closeEnds: true }); // the cells
    m.box(rod, [-w / 2, bottomY, zb - 0.016], [w / 2, bottomY + 0.02, zb + 0.016]);
  } else if (C.blind === 'zebra') {
    // two layers of alternating solid and sheer bands; tilted shut, the back layer's solids fill the front's sheers
    const band = 0.075, solid = { ...fabric, alpha: undefined, name: 'band:fabric' }, sheer = { name: 'sheer:fabric', colour: C.fabric, alpha: 0.3, roughness: 0.9 };
    m.tube(rod, [[-w / 2, H - 0.06, zb], [w / 2, H - 0.06, zb]], 0.03, { sides: 12, closeEnds: true });
    for (const [z, off] of [[zb + 0.03, 0], [zb + 0.02, band * (1 - tilt)]]) {
      for (let y = H - 0.09, k = 0; y > bottomY; y -= band, k++) {
        const y0 = Math.max(bottomY, y - band - off * (z < zb + 0.025 ? 1 : 0)), y1 = Math.min(H - 0.09, y - off);
        if (y1 > y0) m.quad(k % 2 === 0 ? solid : sheer, [[-w / 2 + 0.01, y0, z], [w / 2 - 0.01, y0, z], [w / 2 - 0.01, y1, z], [-w / 2 + 0.01, y1, z]]);
      }
    }
    m.box(rod, [-w / 2 + 0.01, bottomY - 0.02, zb + 0.015], [w / 2 - 0.01, bottomY, zb + 0.04]);
  } else if (C.blind === 'shutter') {
    // panels of a frame (stiles and rails) and louvres between, a tilt rod down the middle of each
    const paint = { name: 'louvre:body', colour: C.fabric, roughness: C.roughness }, panels = w > 1.3 ? 4 : w > 0.7 ? 2 : 1, pw = w / panels, st = 0.05, rail = 0.08;
    const mid = !C.cafe && H > 1.4 ? H / 2 : null;
    for (let i = 0; i < panels; i++) {
      const x0 = -w / 2 + i * pw, x1 = x0 + pw - 0.003;
      m.box(paint, [x0, 0, zb - 0.015], [x0 + st, H, zb + 0.015]); m.box(paint, [x1 - st, 0, zb - 0.015], [x1, H, zb + 0.015]);
      m.box(paint, [x0, 0, zb - 0.015], [x1, rail, zb + 0.015]); m.box(paint, [x0, H - rail, zb - 0.015], [x1, H, zb + 0.015]);
      if (mid) m.box(paint, [x0, mid - rail / 2, zb - 0.015], [x1, mid + rail / 2, zb + 0.015]);
      const lw = pw - 2 * st;
      const rows = mid ? [[H - rail, mid + rail / 2], [mid - rail / 2, rail]] : [[H - rail, rail]];
      for (const [a, b] of rows) {
        // the louvres, centred in the panel
        const g = new Mesh();
        slatRow(g, paint, lw, a - 0.04, b + 0.02, zb, 0.089, 0.08, tilt);
        for (const gr of g.mats.values()) for (let k = 0; k < gr.pos.length; k += 3) gr.pos[k] += (x0 + x1) / 2;
        for (const gr of g.mats.values()) { const base = m.mat(paint).pos.length / 3; const tgt = m.mat(paint); tgt.pos.push(...gr.pos); tgt.nrm.push(...gr.nrm); tgt.uv.push(...gr.uv); tgt.idx.push(...gr.idx.map((v) => v + base)); }
        m.box(paint, [(x0 + x1) / 2 - 0.006, b + 0.02, zb + 0.045], [(x0 + x1) / 2 + 0.006, a - 0.02, zb + 0.055]); // the tilt rod
      }
    }
  }
}

function curtain(m, id, { w, top, bottom, open, proj = 0.1, tilt }) {
  // the piece's depth: from the wall to just in front of the rod (or the blind)
  const C = CURTAINS[id], H = top - bottom, z0 = -(proj + 0.06) / 2;
  const fabric = { name: 'panel:fabric', colour: C.fabric, roughness: C.roughness, alpha: C.alpha };
  const rod = { name: 'rod:rod', colour: '#2b2a28', metallic: 0.7, roughness: 0.35 };
  if (C.blind) {
    const zb = z0 + Math.max(0.03, proj - 0.03), drop = H * (1 - open * 0.85);
    if (C.blind !== 'shutter') m.box(rod, [-w / 2, H - 0.04, z0], [w / 2, H, zb + 0.02]); // head rail
    if (!['roller', 'roman'].includes(C.blind)) { blindKind(m, C, { w, H, open, tilt, zb, fabric, rod }); return; }
    if (C.blind === 'roller') {
      m.tube(rod, [[-w / 2, H - 0.06, zb], [w / 2, H - 0.06, zb]], 0.028, { sides: 12, closeEnds: true });
      m.quad(fabric, [[-w / 2 + 0.02, H - drop, zb + 0.028], [w / 2 - 0.02, H - drop, zb + 0.028], [w / 2 - 0.02, H - 0.06, zb + 0.028], [-w / 2 + 0.02, H - 0.06, zb + 0.028]]);
      m.box(rod, [-w / 2 + 0.02, H - drop - 0.02, zb + 0.02], [w / 2 - 0.02, H - drop, zb + 0.035]);
    } else {
      // a roman blind: flat above, its raised fabric gathered in soft folds at the bottom
      const folds = Math.max(1, Math.round(open * 5));
      m.quad(fabric, [[-w / 2, H - drop + folds * 0.05, zb], [w / 2, H - drop + folds * 0.05, zb], [w / 2, H - 0.04, zb], [-w / 2, H - 0.04, zb]]);
      for (let k = 0; k < folds; k++) m.tube(fabric, [[-w / 2, H - drop + k * 0.05 + 0.025, zb + 0.02], [w / 2, H - drop + k * 0.05 + 0.025, zb + 0.02]], 0.026, { sides: 8, closeEnds: true });
    }
    return;
  }
  // the rod, its finials and brackets, a little below the top
  const ry = H - 0.025, zr = z0 + proj;
  m.tube(rod, [[-w / 2 - 0.04, ry, zr], [w / 2 + 0.04, ry, zr]], 0.013, { sides: 10 });
  for (const s of [-1, 1]) {
    m.lathe(rod, [[0.001, -0.03], [0.026, -0.015], [0.03, 0], [0.026, 0.015], [0.001, 0.03]], { at: [s * (w / 2 + 0.07), ry, zr], segs: 10, caps: [false, false] });
    m.box(rod, [s * (w / 2 - 0.06) - 0.01, ry - 0.02, z0], [s * (w / 2 - 0.06) + 0.01, ry + 0.01, zr]);
  }
  // two panels, gathered toward their sides as they open; folds deepen as the fabric stacks
  const heading = C.heading, hang = ry - 0.03;
  for (const side of [-1, 1]) {
    const span = Math.max(0.2, (w / 2) * (1 - open) + (0.12 + w * 0.1) * open), xo = side * (w / 2), xi = side * (w / 2 - span);
    const period = 0.11, folds = Math.max(3, Math.round(span / (period * (1 - 0.55 * open)))), cols = folds * 6, rows = 14;
    const amp = 0.028 + 0.04 * open;
    const grid = [];
    for (let j = 0; j <= rows; j++) {
      const t = j / rows, y = hang * t; // 0 at the hem, up to the heading
      const row = [];
      for (let i = 0; i <= cols; i++) {
        const s = i / cols, x = xo + (xi - xo) * s, ph = s * folds * Math.PI * 2;
        let wave = heading === 'pinch' ? (t > 0.9 ? Math.sin(ph) * 0.35 : Math.abs(Math.sin(ph / 2)) ** 0.7 * 2 - 1) : Math.sin(ph);
        const a = amp * (heading === 'pinch' && t > 0.9 ? 0.6 : 1) * (1 + 0.18 * (1 - t));
        row.push(m.vert(fabric, [x, y, zr - 0.035 + wave * a], [0, 0, 1], [s * folds, t * 4]));
      }
      grid.push(row);
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const a = grid[j][i], b = grid[j][i + 1], c = grid[j + 1][i + 1], d = grid[j + 1][i]; m.tri(fabric, a, b, c); m.tri(fabric, a, c, d); }
    if (heading === 'grommet') for (let k = 0; k <= folds; k++) m.tube(rod, [[xo + (xi - xo) * (k / folds), ry - 0.02, zr - 0.02], [xo + (xi - xo) * (k / folds), ry + 0.02, zr - 0.02]], 0.02, { sides: 8 });
  }
  smoothNormals(m.mat(fabric));
}
/** A gathered sheet's normals, from its faces (the panels are a grid: shared vertices). */
function smoothNormals(g) {
  const n = new Float64Array(g.pos.length);
  for (let k = 0; k < g.idx.length; k += 3) {
    const [a, b, c] = [g.idx[k], g.idx[k + 1], g.idx[k + 2]];
    const p = (i) => [g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2]];
    const f = v3.cross(v3.sub(p(b), p(a)), v3.sub(p(c), p(a)));
    for (const i of [a, b, c]) { n[i * 3] += f[0]; n[i * 3 + 1] += f[1]; n[i * 3 + 2] += f[2]; }
  }
  for (let i = 0; i < n.length; i += 3) { const v = norm([n[i], n[i + 1], n[i + 2]]); g.nrm[i] = v[0]; g.nrm[i + 1] = v[1]; g.nrm[i + 2] = v[2]; }
}

// --- the entries ------------------------------------------------------------------------------------------------------
const PLANT_SIZES = { small: 0.45, medium: 1.0, large: 1.7 };
const PLANT_CHOICE = {
  monstera: ['medium', 'large'], 'fiddle-leaf fig': ['medium', 'large'], 'snake plant': ['small', 'medium'], pothos: ['small'],
  'kentia palm': ['large'], 'olive tree': ['medium', 'large'], 'zz plant': ['small', 'medium'], 'boston fern': ['medium'],
  'rubber plant': ['medium', 'large'], cactus: ['small', 'medium'],
};
const code = (s) => s.toUpperCase().replace(/[^A-Z]+/g, '-').replace(/^-|-$/g, '');

function buildPlant(name, size) {
  const P = PLANTS[name], H = PLANT_SIZES[size] * (name === 'pothos' ? 0.6 : 1), m = new Mesh(), r = dice(name.length * 97 + H * 1000);
  const potR = Math.max(0.09, H * 0.13), potH = Math.max(0.12, H * 0.2);
  const soil = planter(m, P.pot, potR, potH);
  P.grow(m, r, H, soil, potR);
  return m;
}

const entries = [];
for (const [name, sizes] of Object.entries(PLANT_CHOICE)) for (const size of sizes) {
  const P = PLANTS[name];
  entries.push({ id: `PLT-${code(name)}-${size}`, name: `${P.label[0].toUpperCase()}${P.label.slice(1)}, ${size}`, kind: 'plant', mount: P.surface || size === 'small' ? 'surface' : 'floor', sizeName: size, piece: `PLT-${code(name)}`, words: [P.label, 'plant'], note: `a houseplant in a ${P.pot} planter`, build: () => buildPlant(name, size) });
}
ARTWORKS.forEach(([art, label, frame, shape, seed]) => {
  for (const [size, [a, b]] of Object.entries(ART_SIZES)) {
    const [w, h] = shape === 'landscape' ? [b, a] : [a, b];
    entries.push({ id: `ART-${code(label)}-${size}`, name: `${label} print, ${size}`, kind: 'art', mount: 'wall', hang: 1.45, sizeName: size, piece: `ART-${code(label)}`, words: [label.toLowerCase(), 'picture', 'frame', 'art'], note: `${frame === 'canvas' ? 'a stretched canvas' : `in a ${frame} frame`}, ${Math.round(w * 100)} x ${Math.round(h * 100)} cm`, build: (fit, { draft } = {}) => { const m = new Mesh(); picture(m, { art, seed, frame, w, h, draft }); return m; } });
  }
});
// pictures made to any size: a framed print or a stretched canvas, its picture an abstract painted to fit
export const CUSTOM_ART = { styles: ABSTRACT_STYLES, palettes: Object.keys(PALETTES), frames: Object.keys(FRAMES).filter((f) => f !== 'canvas') };
export const customFit = ({ w = 0.6, h = 0.8, style, palette = 'warm', frame = 'oak', seed = 1 } = {}, canvas = false) => ({
  w: Math.round(Math.max(0.15, Math.min(3, w)) * 1000) / 1000, h: Math.round(Math.max(0.15, Math.min(3, h)) * 1000) / 1000,
  style: ABSTRACT_STYLES.includes(style) ? style : ABSTRACT_STYLES[(seed - 1) % ABSTRACT_STYLES.length],
  palette: PALETTES[palette] ? palette : 'warm', frame: canvas ? 'canvas' : FRAMES[frame] && frame !== 'canvas' ? frame : 'oak', seed: Math.max(1, Math.round(seed)),
});
for (const [id, label, canvas] of [['ART-FRAME', 'Framed print, any size', false], ['ART-CANVAS', 'Stretched canvas, any size', true]]) {
  entries.push({ id, name: label, kind: 'art', mount: 'wall', hang: 1.45, piece: id, custom: true, words: [canvas ? 'canvas' : 'frame', 'picture', 'art', 'abstract'], note: `made to the size asked for (width x height), an abstract painted to fit: styles ${ABSTRACT_STYLES.join(', ')}; palettes ${Object.keys(PALETTES).join(', ')}${canvas ? '' : `; frames ${Object.keys(FRAMES).filter((f) => f !== 'canvas').join(', ')}`}`,
    build: (fit, { draft } = {}) => { const f = customFit(fit ?? {}, canvas), m = new Mesh(); picture(m, { art: f.style, seed: f.seed, frame: f.frame, w: f.w, h: f.h, palette: f.palette, draft }); return m; } });
}
for (const [kind, M] of Object.entries(MIRRORS)) entries.push({ id: `MIR-${code(kind)}`, name: `${M.label[0].toUpperCase()}${M.label.slice(1)}`, kind: 'mirror', mount: M.mount ?? 'wall', hang: 1.5, piece: `MIR-${code(kind)}`, words: [M.label, 'mirror'], note: `${Math.round(M.size[0] * 100)} x ${Math.round(M.size[1] * 100)} cm`, build: () => { const m = new Mesh(); mirror(m, kind, M.size); return m; } });
for (const [id, C] of Object.entries(CURTAINS)) entries.push({ id, name: `${C.label[0].toUpperCase()}${C.label.slice(1)}`, kind: 'curtain', mount: 'window', piece: id, ...(C.tilts ? { tilts: true } : {}), words: [C.label, C.blind === 'shutter' ? 'shutters' : C.blind ? 'blind' : 'curtains', ...(C.tilts ? ['tilt', 'slats', 'louvres'] : [])], note: `${C.note}; made to fit the window it hangs at`, fitted: true, build: (fit) => { const m = new Mesh(); curtain(m, id, fit ?? { w: 1.7, top: 2.45, bottom: 0.012, open: 1 }); return m; } });

// appliances and fixtures (appliances.mjs): built the same way, a finish their fit
entries.push(...applianceEntries);
// media and entertainment (media.mjs): consoles, entertainment centres, TVs and their stands, speakers, a projector
entries.push(...mediaEntries);

const built = new Map();
/** A decor entry's model: { glb, size [w, h, d], triangles }; a window piece's for its fit. Built once each. */
export function decorModel(entry, fit = null, { draft = false } = {}) {
  const key = `${entry.id}${fit ? `~${JSON.stringify(Object.entries(fit).sort())}` : ''}${draft ? '~draft' : ''}`;
  if (!built.has(key)) {
    const m = entry.build(fit, { draft });
    const size = settle(m, { keepZ: entry.mount === 'wall' || entry.mount === 'window' });
    // a wall or window piece was built with its back at -d/2 of its own depth: centre its depth too
    if (entry.mount === 'wall' || entry.mount === 'window') { const { lo, hi } = bounds(m), dz = (lo[2] + hi[2]) / 2; for (const g of m.mats.values()) for (let i = 2; i < g.pos.length; i += 3) g.pos[i] -= dz; }
    built.set(key, { glb: m.glb(entry.name), size, triangles: m.triangles });
  }
  return built.get(key);
}

/** The decor catalogue: entries as catalog.json's, sizes measured from their models (a window piece's for a 1.2 m window). */
export function decorCatalog() {
  return entries.map(({ build, ...e }) => {
    const { size, glb } = decorModel({ ...e, build }, null, { draft: true });
    return { ...e, size, parts: partsOf(glb), decor: true, build };
  });
}
