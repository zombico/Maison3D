// The catalogue's objects, built by Maison3D (07-spike-native-furnish/mesh.mjs) rather than mojulo: lamps, vases, a
// bowl, candles, books, a basket, a tray, a clock, a television, rugs and a desk-top kit, each in its collection's
// palette. mojulo's workbench can turn and extrude these too, but its export merges parts of one finish into one
// material, so a lamp's shade could not be recoloured apart from its base; built here, each part is its own.
// Sizes are the catalogue's (mm, w x d x h); models are y up, metres, front to +z.
import { Mesh, dice } from '../07-spike-native-furnish/mesh.mjs';
import { encodePng } from './colour.mjs';
import { WOOD_TONE } from './recipes.mjs';

/** Each collection's things: its metal, two glazes, a lamp's shade and its style, its rugs. */
export const PALETTE = {
  HIN: { metal: '#2b2b2b', glaze: '#e6dfd2', glaze2: '#8c8577', shade: '#f3eee4', lamp: 'globe', rug: { pattern: 'border', field: '#ddd3c1', border: '#8c8577', accent: '#b9ad97' } },
  ATL: { metal: '#b8953d', glaze: '#c8652f', glaze2: '#2f6f6a', shade: '#efe2c4', lamp: 'cone', rug: { pattern: 'geometric', field: '#d9b36a', border: '#5a3a22', accent: '#2f6f6a' } },
  CAL: { metal: '#a58a5c', glaze: '#d8cfc4', glaze2: '#b9a58c', shade: '#ece4d6', lamp: 'drum', rug: { pattern: 'solid', field: '#cfc4b4', border: '#b8ab98', accent: '#c4b8a6' } },
  LIT: { metal: '#b7bcc0', glaze: '#f4f2ec', glaze2: '#5b7c99', shade: '#f6f4ee', lamp: 'drum', rug: { pattern: 'stripes', field: '#ece6d8', border: '#5b7c99', accent: '#a9bccb' } },
  SAB: { metal: '#b08d57', glaze: '#c9b49a', glaze2: '#a4502c', shade: '#ede3d1', lamp: 'mushroom', rug: { pattern: 'border', field: '#d8c8ae', border: '#a4502c', accent: '#c19a74' } },
  FET: { metal: '#c9a227', glaze: '#2f7556', glaze2: '#9e2a2b', shade: '#e8c27a', lamp: 'cone', rug: { pattern: 'kilim', field: '#9e2a2b', border: '#1d2a44', accent: '#c9a227' } },
  BIB: { metal: '#8c6d3a', glaze: '#3b2a1e', glaze2: '#1f4a35', shade: '#e9dcc0', lamp: 'drum', rug: { pattern: 'kilim', field: '#5a2d2a', border: '#1f2a24', accent: '#b08a5a' } },
};
const BOOKS = ['#7a2e2a', '#2f4a5a', '#c9b48c', '#3e5f4a', '#d9cfc1', '#5a4636', '#a4502c', '#1d2a44'];

const metal = (p) => ({ name: 'stem:base', colour: p.metal, metallic: 0.8, roughness: 0.35 });
const glaze = (hex, part = 'body') => ({ name: `${part}:base`, colour: hex, roughness: 0.35 });
const shadeMat = (p) => ({ name: 'shade:shade', colour: p.shade, roughness: 0.95 });
const bulb = { name: 'bulb:bulb', colour: '#fff4d6', unlit: true };

/** How tall a shade of `style` and radius r stands. */
const shadeH = (style, r) => ({ globe: 2 * r, cone: 1.1 * r, mushroom: 0.75 * r }[style] ?? 1.05 * r);

/** A lamp shade at height y in the collection's style, radius r. */
function shade(m, style, p, y, r) {
  const S = shadeMat(p);
  if (style === 'globe') m.lathe(S, Array.from({ length: 13 }, (_, i) => { const a = -Math.PI / 2 + (i / 12) * Math.PI; return [Math.max(0.004, Math.cos(a) * r), y + r + Math.sin(a) * r]; }), { segs: 24, caps: [false, false] });
  else if (style === 'cone') m.lathe(S, [[r, y], [r * 0.45, y + r * 1.1]], { segs: 24, caps: [false, false] });
  else if (style === 'mushroom') m.lathe(S, Array.from({ length: 9 }, (_, i) => { const a = (i / 8) * (Math.PI / 2); return [Math.max(0.004, Math.cos(a) * r), y + Math.sin(a) * r * 0.75]; }), { segs: 24, caps: [false, false] });
  else m.lathe(S, [[r, y], [r, y + r * 1.05]], { segs: 24, caps: [false, false] }); // a drum
  m.lathe(bulb, [[0.001, y + r * 0.25], [0.03, y + r * 0.35], [0.03, y + r * 0.5], [0.001, y + r * 0.6]], { segs: 10, caps: [false, false] });
}

// --- rugs: a woven pattern painted into the rug's texture -----------------------------------------------------------
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
function rugPng({ pattern, field, border, accent }, w, d, seed) {
  const W = 256, H = Math.max(64, Math.round((256 * d) / w)), F = rgb(field), B = rgb(border), A = rgb(accent), r = dice(seed);
  const out = Buffer.alloc(W * H * 4), bw = 0.07;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H, edge = Math.min(u, 1 - u, (v * d) / w, ((1 - v) * d) / w);
    let c = F;
    if (pattern === 'border') c = edge < bw ? B : edge < bw + 0.025 ? A : F;
    else if (pattern === 'stripes') c = edge < 0.03 ? B : Math.floor(v * 14) % 3 === 0 ? B : Math.floor(v * 14) % 3 === 1 ? A : F;
    else if (pattern === 'geometric') { const gx = (u * 8) % 1, gy = ((v * d) / w * 8) % 1; c = edge < bw ? B : Math.abs(gx - 0.5) + Math.abs(gy - 0.5) < 0.22 ? A : F; }
    else if (pattern === 'kilim') { const gx = (u * 5) % 1, gy = ((v * d) / w * 5) % 1, dm = Math.abs(gx - 0.5) + Math.abs(gy - 0.5); c = edge < bw ? B : edge < bw + 0.02 ? A : dm < 0.18 ? A : dm < 0.24 ? B : F; }
    else c = edge < 0.02 ? B : F;
    const grain = 0.94 + 0.06 * (((x * 7 + y * 13) % 5) / 4) + (r() - 0.5) * 0.04; // the weave
    const o = (y * W + x) * 4;
    out[o] = Math.min(255, c[0] * grain); out[o + 1] = Math.min(255, c[1] * grain); out[o + 2] = Math.min(255, c[2] * grain); out[o + 3] = 255;
  }
  return encodePng(W, H, out);
}

/** The object `pieceId` in collection `code` (null: Maison3D's own, neutral) at size `mm` [w, d, h], as a Mesh; null if not an object. */
export function objectMesh(pieceId, code, sizeName, [wm, dm, hm]) {
  const p = PALETTE[code] ?? PALETTE.HIN, m = new Mesh(), w = wm / 1000, d = dm / 1000, h = hm / 1000;
  const wood = { name: 'wood:wood', colour: code ? WOOD_TONE[{ HIN: 'oak', ATL: 'walnut', CAL: 'cherry', LIT: 'ash', SAB: 'oak', FET: 'walnut', BIB: 'walnut' }[code]] : '#b8935f', roughness: 0.6 };
  switch (pieceId) {
    case 'FLP': {
      m.lathe(metal(p), [[w * 0.42, 0], [w * 0.45, 0.012], [w * 0.4, 0.025], [0.012, 0.03]], { segs: 24 });
      const r = p.lamp === 'globe' ? 0.2 : 0.21, top = h - shadeH(p.lamp, r);
      m.tube(metal(p), [[0, 0.025, 0], [0, top + 0.05, 0]], 0.011, { sides: 10 });
      shade(m, p.lamp, p, top, r);
      return m;
    }
    case 'TLP': {
      const bh = h * 0.42;
      m.lathe(glaze(p.glaze), [[0.06, 0], [0.075, 0.01], [0.12, bh * 0.45], [0.09, bh * 0.9], [0.03, bh]], { segs: 28 });
      const r = p.lamp === 'globe' ? 0.13 : 0.16, top = h - shadeH(p.lamp, r);
      m.tube(metal(p), [[0, bh, 0], [0, top + 0.04, 0]], 0.008, { sides: 8 });
      shade(m, p.lamp, p, top, r);
      return m;
    }
    case 'SCN': {
      // back plate on the wall (at -z), an arm out, a small shade upright
      m.box(metal(p), [-0.05, h * 0.25, -d / 2], [0.05, h * 0.55, -d / 2 + 0.015]);
      m.tube(metal(p), [[0, h * 0.4, -d / 2 + 0.01], [0, h * 0.42, -d / 2 + 0.08], [0, h * 0.5, d / 2 - 0.09], [0, h * 0.55, d / 2 - 0.09]], 0.007, { sides: 8 });
      shade(m, p.lamp === 'globe' ? 'globe' : 'drum', p, h * 0.55, 0.085);
      m.lathe(bulb, [[0.001, h * 0.55], [0.0001, h * 0.551]], { segs: 4, caps: [false, false] });
      // centre the shade over the footprint's front half
      return m;
    }
    case 'PND': {
      m.lathe(metal(p), [[0.06, h - 0.02], [0.06, h], [0.001, h]], { segs: 20 }); // the canopy at the ceiling
      m.tube({ name: 'cord:cord', colour: '#1f1f1f' }, [[0, h - 0.02, 0], [0, 0.3, 0]], 0.003, { sides: 6 });
      const r = w / 2, S = shadeMat(p);
      if (p.lamp === 'drum') m.lathe(S, [[r, 0], [r, 0.3]], { segs: 28, caps: [false, false] });
      else if (p.lamp === 'globe') m.lathe(S, Array.from({ length: 13 }, (_, i) => { const a = -Math.PI / 2 + (i / 12) * Math.PI; return [Math.max(0.004, Math.cos(a) * r * 0.75), 0.15 + Math.sin(a) * 0.15]; }), { segs: 24, caps: [false, false] });
      else m.lathe(S, Array.from({ length: 9 }, (_, i) => { const a = (i / 8) * (Math.PI / 2); return [Math.max(0.01, Math.cos(a) * r), Math.sin(a) * 0.3]; }), { segs: 28, caps: [false, false] });
      m.lathe(bulb, [[0.001, 0.08], [0.04, 0.12], [0.04, 0.2], [0.001, 0.25]], { segs: 10, caps: [false, false] });
      return m;
    }
    case 'VAS': {
      const r = w / 2, tall = sizeName === 'tall';
      const shapes = { HIN: [[0.55, 0], [0.8, 0.3], [1, 0.6], [0.6, 0.85], [0.35, 0.95], [0.4, 1]], ATL: [[0.5, 0], [1, 0.4], [0.6, 0.75], [0.3, 0.9], [0.45, 1]], CAL: [[0.8, 0], [1, 0.5], [0.95, 0.9], [0.85, 1]], LIT: [[0.6, 0], [1, 0.35], [0.9, 0.7], [0.35, 0.88], [0.4, 1]], SAB: [[0.6, 0], [1, 0.45], [0.75, 0.8], [0.5, 1]], FET: [[0.4, 0], [1, 0.3], [0.5, 0.7], [0.7, 1]], BIB: [[0.7, 0], [1, 0.25], [1, 0.75], [0.55, 0.9], [0.6, 1]] };
      m.lathe(glaze(tall ? p.glaze2 : p.glaze), (shapes[code] ?? shapes.HIN).map(([k, t]) => [r * k, h * t]), { segs: 28, caps: [true, false] });
      return m;
    }
    case 'BWL': {
      const r = w / 2;
      m.lathe(glaze(p.glaze2), [[r * 0.35, 0], [r * 0.4, 0.006], [r * 0.75, h * 0.45], [r, h], [r * 0.96, h], [r * 0.72, h * 0.5], [r * 0.32, h * 0.1]], { segs: 32, caps: [true, false] });
      return m;
    }
    case 'CND': {
      const wax = { name: 'wax:base', colour: '#f1e9d8', roughness: 0.7 };
      [[-0.06, 0.12, 0.034], [0.01, 0.2, 0.036], [0.07, 0.15, 0.032]].forEach(([x, ch, r], i) => {
        m.lathe(wax, [[r, 0], [r, ch - 0.004], [r * 0.85, ch]], { at: [x, 0, i === 1 ? -0.01 : 0.01], segs: 20 });
        m.tube({ name: 'wick:wick', colour: '#1a1a1a' }, [[x, ch, i === 1 ? -0.01 : 0.01], [x, ch + 0.012, i === 1 ? -0.01 : 0.01]], 0.0015, { sides: 4 });
      });
      return m;
    }
    case 'BKS':
    case 'BKR': {
      const r = dice(code ? code.charCodeAt(0) * 31 + pieceId.length : 7);
      const book = (x0, y0, z0, x1, y1, z1, colour, standing) => {
        const cover = { name: `cover-${colour.slice(1)}:books`, colour, roughness: 0.7 }, pages = { name: 'pages:pages', colour: '#efe7d6', roughness: 0.95 }, t = 0.004;
        m.box(cover, [x0, y0, z0], [x1, y1, z1]);
        if (standing) m.box(pages, [x0 + t, y0 + t, z0 + t], [x1 - t, y1 - t, z1 + 0.0005]);
        else m.box(pages, [x0 + t, y0 + t, z0 + t], [x1 + 0.0005, y1 - t, z1 - t]);
      };
      if (pieceId === 'BKS') {
        let y = 0;
        for (let i = 0; i < 4; i++) { const bw = w * (0.78 + r() * 0.22), bd = d * (0.75 + r() * 0.25), bt = 0.025 + r() * 0.015, ox = (r() - 0.5) * 0.03; book(-bw / 2 + ox, y, -bd / 2, bw / 2 + ox, y + bt, bd / 2, BOOKS[(i * 3 + (code?.charCodeAt(1) ?? 0)) % BOOKS.length], false); y += bt; }
      } else {
        let x = -w / 2;
        for (let i = 0; x < w / 2 - 0.02; i++) { const bt = 0.02 + r() * 0.025, bh = h * (0.72 + r() * 0.28), bd = d * (0.8 + r() * 0.2); book(x, 0, -d / 2, Math.min(w / 2, x + bt), bh, -d / 2 + bd, BOOKS[(i * 5 + (code?.charCodeAt(2) ?? 0)) % BOOKS.length], true); x += bt + 0.001; }
      }
      return m;
    }
    case 'BSK': {
      const r = w / 2, weave = { name: 'basket:base', colour: code === 'BIB' || code === 'FET' ? '#6b4a2e' : '#b89b6e', roughness: 0.9 };
      m.lathe(weave, [[r * 0.85, 0], [r * 0.88, 0.01], [r, h]], { segs: 40, ribs: [40, 0.03], caps: [true, false] });
      m.tube(weave, Array.from({ length: 33 }, (_, i) => { const a = (i / 32) * Math.PI * 2; return [Math.cos(a) * r, h, Math.sin(a) * r]; }), 0.012, { sides: 6 });
      return m;
    }
    case 'TRY': {
      const t = 0.01, mat = code === 'LIT' || code === 'HIN' || code === 'SAB' ? wood : { ...metal(p), name: 'tray:base' };
      m.box(mat, [-w / 2, 0, -d / 2], [w / 2, t, d / 2]);
      m.box(mat, [-w / 2, 0, -d / 2], [w / 2, h, -d / 2 + t]); m.box(mat, [-w / 2, 0, d / 2 - t], [w / 2, h, d / 2]);
      m.box(mat, [-w / 2, 0, -d / 2], [-w / 2 + t, h, d / 2]); m.box(mat, [w / 2 - t, 0, -d / 2], [w / 2, h, d / 2]);
      return m;
    }
    case 'CLK': {
      const r = w / 2, cy = h / 2, front = d / 2 - 0.008;
      const ring = (rr, z) => Array.from({ length: 49 }, (_, i) => { const a = (i / 48) * Math.PI * 2; return [Math.cos(a) * rr, cy + Math.sin(a) * rr, z]; });
      m.fan({ name: 'face:face', colour: code === 'BIB' || code === 'FET' ? '#efe6d2' : '#f6f4ef', roughness: 0.8 }, ring(r - 0.012, front).slice(0, 48));
      m.tube({ name: 'rim:frame', colour: p.metal, metallic: 0.7, roughness: 0.35 }, ring(r - 0.006, front - 0.01), 0.012, { sides: 8 });
      m.box({ name: 'back:back', colour: '#3a3532' }, [-r * 0.5, cy - r * 0.5, -d / 2], [r * 0.5, cy + r * 0.5, front - 0.02]);
      const hand = { name: 'hands:hands', colour: '#1d1d1d' };
      m.box(hand, [-0.004, cy, front + 0.002], [0.004, cy + r * 0.62, front + 0.005]); // ten past ten
      m.quad(hand, [[0, cy - 0.004, front + 0.006], [r * 0.45 * 0.87, cy + r * 0.45 * 0.5 - 0.004, front + 0.006], [r * 0.45 * 0.87, cy + r * 0.45 * 0.5 + 0.004, front + 0.006], [0, cy + 0.004, front + 0.006]]);
      for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2, x = Math.cos(a) * r * 0.82, y = cy + Math.sin(a) * r * 0.82; m.box(hand, [x - 0.004, y - 0.004, front + 0.001], [x + 0.004, y + 0.004, front + 0.003]); }
      return m;
    }
    case 'TV': {
      m.box({ name: 'body:body', colour: '#17181a', roughness: 0.5 }, [-w / 2, 0, -d / 2], [w / 2, h, d / 2 - 0.004]);
      m.quad({ name: 'screen:screen', colour: '#0b0c10', roughness: 0.15, metallic: 0.1 }, [[-w / 2 + 0.008, 0.01, d / 2], [w / 2 - 0.008, 0.01, d / 2], [w / 2 - 0.008, h - 0.008, d / 2], [-w / 2 + 0.008, h - 0.008, d / 2]]);
      return m;
    }
    case 'RUG':
    case 'RUN': {
      // lying flat: w across, d deep (its size is w x d x h with h its pile)
      const pile = Math.max(0.008, h), tex = rugPng(pieceId === 'RUN' ? { ...p.rug, pattern: p.rug.pattern === 'solid' ? 'border' : p.rug.pattern } : p.rug, w, d, (code?.charCodeAt(0) ?? 1) * 7 + w * 1000);
      m.quad({ name: 'top:rug', colour: '#ffffff', roughness: 0.95, texture: tex }, [[-w / 2, pile, d / 2], [w / 2, pile, d / 2], [w / 2, pile, -d / 2], [-w / 2, pile, -d / 2]]);
      const edge = { name: 'edge:rug-edge', colour: p.rug.border, roughness: 0.95 };
      m.quad(edge, [[-w / 2, 0, d / 2], [w / 2, 0, d / 2], [w / 2, pile, d / 2], [-w / 2, pile, d / 2]]); m.quad(edge, [[w / 2, 0, -d / 2], [-w / 2, 0, -d / 2], [-w / 2, pile, -d / 2], [w / 2, pile, -d / 2]]);
      m.quad(edge, [[-w / 2, 0, -d / 2], [-w / 2, 0, d / 2], [-w / 2, pile, d / 2], [-w / 2, pile, -d / 2]]); m.quad(edge, [[w / 2, 0, d / 2], [w / 2, 0, -d / 2], [w / 2, pile, -d / 2], [w / 2, pile, d / 2]]);
      return m;
    }
    case 'KIT': {
      const dark = { name: 'kit:kit', colour: '#2a2b2e', roughness: 0.5 }, screen = { name: 'screen:screen', colour: '#0b0c10', roughness: 0.15 };
      m.box(dark, [-0.09, 0, -0.16], [0.09, 0.012, -0.06]); m.box(dark, [-0.02, 0.012, -0.13], [0.02, 0.2, -0.1]); // the monitor's foot and neck
      m.box(dark, [-0.3, 0.1, -0.13], [0.3, 0.44, -0.11]);
      m.quad(screen, [[-0.29, 0.11, -0.109], [0.29, 0.11, -0.109], [0.29, 0.43, -0.109], [-0.29, 0.43, -0.109]]);
      m.box({ name: 'keys:kit', colour: '#d9d9d6', roughness: 0.6 }, [-0.21, 0, 0.02], [0.21, 0.018, 0.15]);
      m.box({ name: 'keys:kit', colour: '#d9d9d6', roughness: 0.6 }, [0.27, 0, 0.05], [0.33, 0.02, 0.15]);
      m.lathe(glaze(p.glaze, 'mug'), [[0.04, 0], [0.042, 0.01], [0.042, 0.1], [0.038, 0.1]], { at: [-0.36, 0, 0.06], segs: 18, caps: [true, false] });
      m.box({ name: 'notebook:books', colour: BOOKS[(code?.charCodeAt(0) ?? 0) % BOOKS.length], roughness: 0.7 }, [0.33, 0, -0.1], [0.45, 0.015, 0.06]);
      return m;
    }
  }
  return null;
}
