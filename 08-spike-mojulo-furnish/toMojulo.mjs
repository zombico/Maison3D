// Spike 08: your scanned room as a mojulo room. The headset knows the room as walls (with the way they face), real
// furniture (with turned footprints) and door frames, in world metres. mojulo's floor plan knows a room as a
// rectangle in feet, N the y0 wall, x running east, with `items` placed inside it and `doors` on its edges. This maps
// one onto the other and back, through a frame set by the walls themselves, so nothing is mirrored.
import { walls } from '../07-spike-native-furnish/place.mjs';

export const FT = 0.3048;
const r2 = (v) => Math.round(v * 100) / 100;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

const STRUCTURE = new Set(['wall', 'invisible wall', 'inner wall', 'floor', 'ceiling', 'door frame', 'window frame', 'wall art', 'global mesh']);

/**
 * The room's own frame: `yDir` points from the north wall into the room (mojulo's +y, "south"), `xDir` is east,
 * turned so (x, y) has the same handedness as the world's top-down (x, z). `origin` is the north-west corner.
 */
export function frameOf(room) {
  const ws = walls(room);
  if (ws.length < 4) throw new Error(`a mojulo room needs four walls; this room has ${ws.length}`);
  // the north wall: the longest one, so the plan's long side runs east-west
  const north = ws.reduce((a, b) => (b.length > a.length ? b : a));
  const yDir = north.n;
  const xDir = [yDir[1], -yDir[0]];
  const along = (w) => (Math.abs(dot(w.n, yDir)) > 0.7 ? 'y' : 'x');
  const proj = (p) => [dot(p, xDir), dot(p, yDir)];
  const ys = ws.filter((w) => along(w) === 'y').map((w) => proj([w.center[0], w.center[2]])[1]);
  const xs = ws.filter((w) => along(w) === 'x').map((w) => proj([w.center[0], w.center[2]])[0]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return { xDir, yDir, x0, y0, width: x1 - x0, depth: y1 - y0, floorY: room.floorY ?? 0, north: north.id };
}

/** World (x, z) to plan feet, relative to the room's north-west corner. */
export const toPlan = (f, p) => [(dot(p, f.xDir) - f.x0) / FT, (dot(p, f.yDir) - f.y0) / FT];
/** Plan feet back to world (x, z). */
export const toWorld = (f, q) => {
  const a = q[0] * FT + f.x0, b = q[1] * FT + f.y0;
  return [f.xDir[0] * a + f.yDir[0] * b, f.xDir[1] * a + f.yDir[1] * b];
};
/** A world facing (x, z) as a plan direction, and back. */
export const dirToPlan = (f, d) => [dot(d, f.xDir), dot(d, f.yDir)];
export const dirToWorld = (f, q) => [f.xDir[0] * q[0] + f.yDir[0] * q[1], f.xDir[1] * q[0] + f.yDir[1] * q[1]];

/**
 * The floor-plan manifest: one lounge cell the size of the room, your real furniture as fixed items mojulo must
 * furnish around (it renders them as plain boxes, which we leave out of the headset), and the door frames as doors.
 */
export function manifestFor(room, { glyph = 'L', seed = 7, pad = 1 } = {}) {
  const f = frameOf(room);
  const W = f.width / FT, H = f.depth / FT;
  const items = [];
  for (const it of room.items ?? []) {
    if (STRUCTURE.has(it.label)) continue;
    const fp = it.footprint;
    const c = fp ? fp.center : [it.center[0], it.center[2]];
    const p = toPlan(f, c);
    // the footprint's sides along the plan's axes (a real piece turned to the room keeps its sizes)
    let w = it.size[0], d = it.size[2];
    if (fp) {
      const u = dirToPlan(f, fp.u);
      [w, d] = Math.abs(u[0]) >= Math.abs(u[1]) ? [fp.half[0] * 2, fp.half[1] * 2] : [fp.half[1] * 2, fp.half[0] * 2];
    }
    items.push({
      type: `existing-${it.label.replace(/\s+/g, '-')}`,
      name: `existing:${it.id}`,
      at: [r2(Math.min(0.98, Math.max(0.02, p[0] / W))), r2(Math.min(0.98, Math.max(0.02, p[1] / H)))],
      size: [r2(w / FT), r2(d / FT)],
      height: r2((it.top - f.floorY) / FT),
    });
  }
  const doors = [];
  for (const it of room.items ?? []) {
    if (it.label !== 'door frame') continue;
    const p = toPlan(f, [it.center[0], it.center[2]]);
    // the nearest edge of the cell
    const edges = [['N', p[1]], ['S', H - p[1]], ['W', p[0]], ['E', W - p[0]]];
    const [edge] = edges.reduce((a, b) => (Math.abs(b[1]) < Math.abs(a[1]) ? b : a));
    const x = edge === 'W' ? 0 : edge === 'E' ? W : p[0];
    const y = edge === 'N' ? 0 : edge === 'S' ? H : p[1];
    doors.push({ x: r2(x + pad), y: r2(y + pad), room: 0, edge, from: it.id });
  }
  const manifest = {
    kind: 'floorplan',
    title: 'Your room, furnished by mojulo',
    seed,
    width: r2(W + 2 * pad),
    height: r2(H + 2 * pad),
    rooms: [{ x: pad, y: pad, w: r2(W), h: r2(H), glyph, items }],
    doors: doors.map(({ from, ...d }) => d),
    furnish: true,
    furnishScale: 'share',
    furnishing: 'constructed',
    windows: false, // the scan found none in this room; mojulo would otherwise cut some
    view: 'cutaway',
  };
  return { manifest, frame: f, doors };
}
