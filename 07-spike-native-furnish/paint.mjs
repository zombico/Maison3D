// Painted walls: each painted wall of the scanned room as flat panels the headset stands over passthrough, with its
// doors and windows cut out and the real furniture standing against it too (the headset draws what it adds over the
// world, so paint would otherwise cover a real sofa or bookcase in front of the wall). Furniture further into the room
// is not cut out, and a thing the scan does not know about (a lamp, a plant) is painted over: that is this approach's
// limit, short of the headset's depth sensing.
import { walls } from './place.mjs';

const FRAMES = new Set(['door frame', 'window frame', 'wall art']);
const AGAINST = 0.6; // m: furniture whose footprint comes this close to a wall is cut out of its paint
const LIFT = 0.004; // m: the panels stand this far into the room, in front of the scanned wall
const round = (v) => Math.round(v * 1000) / 1000;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

/** A wall's frame: centre (x, z), along (unit, the wall's left to right seen from the room), inward normal, length, bottom, top. */
function frame(w) {
  const along = [w.n[1], -w.n[0]];
  return { c: [w.center[0], w.center[2]], along, n: w.n, half: w.length / 2, y0: w.center[1] - w.size[1] / 2, y1: w.center[1] + w.size[1] / 2 };
}

/** The rectangles ([u0, u1, y0, y1], u along the wall from its centre) cut out of wall `f`'s paint. */
function holes(f, room) {
  const out = [];
  for (const i of room.items ?? []) {
    if (FRAMES.has(i.label)) {
      // a frame on this wall: in its plane, within its length
      const d = [i.center[0] - f.c[0], i.center[2] - f.c[1]];
      if (Math.abs(dot(d, f.n)) > 0.15) continue;
      const u = dot(d, f.along), w = i.size[0] * Math.abs(f.along[0]) + i.size[2] * Math.abs(f.along[1]);
      if (Math.abs(u) > f.half + w / 2) continue;
      out.push([u - w / 2, u + w / 2, i.center[1] - i.size[1] / 2, i.center[1] + i.size[1] / 2]);
    } else if (i.footprint && !WALL_LABELS.has(i.label)) {
      // real furniture against this wall: its footprint's corners, projected onto the wall
      const { center: c, u: a, v: b, half: h } = i.footprint;
      const corners = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([s, t]) => [c[0] + a[0] * h[0] * s + b[0] * h[1] * t, c[1] + a[1] * h[0] * s + b[1] * h[1] * t]);
      const rel = corners.map((p) => [p[0] - f.c[0], p[1] - f.c[1]]);
      const off = Math.min(...rel.map((p) => dot(p, f.n)));
      if (off > AGAINST || off < -0.3) continue;
      const us = rel.map((p) => dot(p, f.along));
      out.push([Math.min(...us) - 0.02, Math.max(...us) + 0.02, f.y0, (i.top ?? i.center[1] + i.size[1] / 2) + 0.02]);
    }
  }
  return out;
}
const WALL_LABELS = new Set(['wall', 'invisible wall', 'inner wall', 'floor', 'ceiling', 'global mesh', 'room mesh']);

/** The wall's whole rectangle less `cut`, as few rectangles as a grid of the cuts' edges allows. */
function panels(f, cut) {
  const cl = (r) => [Math.max(-f.half, r[0]), Math.min(f.half, r[1]), Math.max(f.y0, r[2]), Math.min(f.y1, r[3])];
  const cs = cut.map(cl).filter((r) => r[1] - r[0] > 0.01 && r[3] - r[2] > 0.01);
  const us = [...new Set([-f.half, f.half, ...cs.flatMap((r) => [r[0], r[1]])])].sort((a, b) => a - b);
  const ys = [...new Set([f.y0, f.y1, ...cs.flatMap((r) => [r[2], r[3]])])].sort((a, b) => a - b);
  const out = [];
  for (let j = 0; j + 1 < ys.length; j++) {
    let run = null;
    for (let i = 0; i + 1 < us.length; i++) {
      const mu = (us[i] + us[i + 1]) / 2, my = (ys[j] + ys[j + 1]) / 2;
      const open = !cs.some((r) => mu > r[0] && mu < r[1] && my > r[2] && my < r[3]);
      if (open && run) run[1] = us[i + 1];
      else if (open) run = [us[i], us[i + 1], ys[j], ys[j + 1]];
      else if (run) { out.push(run); run = null; }
    }
    if (run) out.push(run);
  }
  // a run the same as the one under it grows up into it
  const merged = [];
  for (const r of out) {
    const below = merged.find((m) => Math.abs(m[0] - r[0]) < 1e-6 && Math.abs(m[1] - r[1]) < 1e-6 && Math.abs(m[3] - r[2]) < 1e-6);
    if (below) below[3] = r[3]; else merged.push([...r]);
  }
  return merged.filter((r) => r[1] - r[0] > 0.005 && r[3] - r[2] > 0.005);
}

/**
 * The headset's paint: [{ wall, colour, facing, panels: [{ at, size }] }], each panel a thin box centred `at` (world,
 * m), `size` [along, up, thickness], turned to face `facing` (into the room). `paint` is { wallId: '#rrggbb' }.
 */
export function paintPanels(room, paint) {
  const out = [];
  for (const w of walls(room)) {
    const colour = paint[w.id];
    if (!colour) continue;
    const f = frame(w);
    out.push({
      wall: w.id, colour, facing: [round(f.n[0]), 0, round(f.n[1])],
      panels: panels(f, holes(f, room)).map(([u0, u1, y0, y1]) => {
        const u = (u0 + u1) / 2;
        return { at: [round(f.c[0] + f.along[0] * u + f.n[0] * LIFT), round((y0 + y1) / 2), round(f.c[1] + f.along[1] * u + f.n[1] * LIFT)], size: [round(u1 - u0), round(y1 - y0), 0.004] };
      }),
    });
  }
  return out;
}

/** An elevation of each painted wall, seen from the room (an SVG, for checking without the headset). */
export function paintSvg(room, paint) {
  const ws = walls(room).filter((w) => paint[w.id]);
  const S = 120, pad = 20;
  let x = pad;
  const parts = [];
  for (const w of ws) {
    const f = frame(w), W = f.half * 2 * S, H = (f.y1 - f.y0) * S;
    const px = (u) => x + (u + f.half) * S, py = (y) => pad + (f.y1 - y) * S;
    parts.push(`<rect x="${x}" y="${pad}" width="${W}" height="${H}" fill="none" stroke="#999" stroke-dasharray="4"/>`);
    for (const [u0, u1, y0, y1] of panels(f, holes(f, room))) parts.push(`<rect x="${px(u0)}" y="${py(y1)}" width="${(u1 - u0) * S}" height="${(y1 - y0) * S}" fill="${paint[w.id]}" stroke="#333" stroke-width="0.5"/>`);
    parts.push(`<text x="${x}" y="${pad + H + 16}" font-family="sans-serif" font-size="13">${w.id} (${(f.half * 2).toFixed(2)} m)</text>`);
    x += W + pad;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${x}" height="${pad * 2 + 2.2 * S + 20}" style="background:#fff">${parts.join('')}</svg>`;
}
