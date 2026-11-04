// Where the design's room comes from. By default it is dictated: a rectangle of a given width, depth and height with
// doors and windows on its walls ("4 by 5 metres, a door behind me, a window on the left"), stood round the person
// where they were when the app started (in the middle, facing the front wall). Its walls are named the way they saw
// them then: front, right, back, left. The other source is the headset's scan of the real room, emptied. Either way
// the room comes out as the headset describes a scanned one (walls, door and window frames, floor and ceiling with
// their outline), so the VR room, placement and Muse's tools work on both alike.
import { emptyRoom, shellHit, SHELL } from './shell.mjs';

const WALL_SIDES = ['front', 'right', 'back', 'left'];
const round = (v) => Math.round(v * 1000) / 1000;

export const state = {
  source: 'dictated',
  spec: {
    // 20 by 15 feet, 10 feet high: a door behind you on the right, a wide window ahead, one on the left
    width: 6.096, depth: 4.572, height: 3.048,
    openings: [
      { id: 'door1', kind: 'door', wall: 'back', at: 1.8, width: 0.91, height: 2.13 },
      { id: 'window1', kind: 'window', wall: 'front', at: 0, width: 1.8, height: 1.5, sill: 0.8 },
      { id: 'window2', kind: 'window', wall: 'left', at: 0, width: 1.2, height: 1.5, sill: 0.8 },
    ],
  },
  // where the room stands: the person's place and facing at the start of the headset's session (y up, metres)
  anchor: { position: [0, 0], forward: [0, -1] },
  session: null,
  scanned: null, // the headset's last description of the real room
};

const rightOf = (f) => [-f[1], f[0]];
/** A point in the room's own frame (x to the right, z forward, from its centre) in the world. */
const toWorld = (a, [x, z]) => { const r = rightOf(a.forward); return [a.position[0] + r[0] * x + a.forward[0] * z, a.position[1] + r[1] * x + a.forward[1] * z]; };
const fromWorld = (a, [wx, wz]) => { const r = rightOf(a.forward), d = [wx - a.position[0], wz - a.position[1]]; return [d[0] * r[0] + d[1] * r[1], d[0] * a.forward[0] + d[1] * a.forward[1]]; };
const dirToWorld = (a, [x, z]) => { const r = rightOf(a.forward); return [r[0] * x + a.forward[0] * z, r[1] * x + a.forward[1] * z]; };
const dirFromWorld = (a, [x, z]) => { const r = rightOf(a.forward); return [x * r[0] + z * r[1], x * a.forward[0] + z * a.forward[1]]; };

/** Each wall in the room's frame: its centre, inward normal, the way "right" runs along it seen from inside, length. */
function wallsOf({ width: w, depth: d }) {
  return {
    front: { c: [0, d / 2], n: [0, -1], along: [1, 0], length: w },
    right: { c: [w / 2, 0], n: [-1, 0], along: [0, -1], length: d }, // facing it, your right is towards the back
    back: { c: [0, -d / 2], n: [0, 1], along: [-1, 0], length: w },
    left: { c: [-w / 2, 0], n: [1, 0], along: [0, 1], length: d }, // and here towards the front
  };
}

/** The dictated room as the headset would describe a scanned one, in world space. */
export function dictatedRoom(spec = state.spec, anchor = state.anchor, viewer = null) {
  const { width, depth, height } = spec, a = anchor, ws = wallsOf(spec);
  const item = (id, label, c2, y0, y1, along, len, normal) => {
    const c = toWorld(a, c2), t = dirToWorld(a, along), n = normal && dirToWorld(a, normal);
    // a flat thing's level box spans its length along its wall (no thickness)
    return { id, label, center: [round(c[0]), round((y0 + y1) / 2), round(c[1])], size: [round(len * Math.abs(t[0])), round(y1 - y0), round(len * Math.abs(t[1]))], top: round(y1), ...(n ? { normal: [round(n[0]), 0, round(n[1])] } : {}) };
  };
  const items = [];
  for (const side of WALL_SIDES) { const W = ws[side]; items.push(item(`wall-${side}`, 'wall', W.c, 0, height, W.along, W.length, W.n)); }
  const corners = [[-width / 2, -depth / 2], [width / 2, -depth / 2], [width / 2, depth / 2], [-width / 2, depth / 2]].map((p) => toWorld(a, p).map(round));
  const fc = toWorld(a, [0, 0]);
  const xs = corners.map((p) => p[0]), zs = corners.map((p) => p[1]);
  const flat = (id, label, y) => ({ id, label, center: [round(fc[0]), y, round(fc[1])], size: [round(Math.max(...xs) - Math.min(...xs)), 0, round(Math.max(...zs) - Math.min(...zs))], top: y, normal: [0, label === 'floor' ? 1 : -1, 0], outline: corners });
  items.push(flat('floor', 'floor', 0), flat('ceiling', 'ceiling', height));
  for (const o of spec.openings) {
    const W = ws[o.wall];
    const y0 = o.kind === 'door' ? 0 : o.sill ?? 0.9, y1 = Math.min(height - 0.05, y0 + o.height);
    const c = [W.c[0] + W.along[0] * o.at, W.c[1] + W.along[1] * o.at];
    items.push(item(o.id, o.kind === 'door' ? 'door frame' : 'window frame', c, y0, y1, W.along, o.width, W.n));
  }
  return { loaded: true, source: 'dictated', floorY: 0, items, viewer };
}

/** The room the design is made in now: the dictated one, or the scan emptied of its furniture. */
export function designRoom(viewer = null) {
  if (state.source === 'scan' && state.scanned) return emptyRoom({ ...state.scanned, viewer: viewer ?? state.scanned.viewer });
  return dictatedRoom(state.spec, state.anchor, viewer);
}

/** What the person pointed at, in the design's room: the headset's hit only counts on the scanned room's own walls. */
export function resolvePointing(pointing, room) {
  if (!pointing?.ray) return pointing;
  if (state.source === 'scan') {
    const hit = (state.scanned?.items ?? []).find((i) => i.id === pointing.id);
    if (hit && SHELL.has(hit.label)) return pointing;
  }
  return { ...pointing, ...(shellHit(pointing.ray, room) ?? { target: 'nothing', id: null, point: null }) };
}

/**
 * A new headset session (the app started again): its world's origin is wherever the person stood, facing -z. The
 * dictated room stands round them again, and `scene`'s pieces move with it so they keep their places in the room.
 */
export function newSession(session, scene) {
  if (!session || session === state.session) return false;
  const was = state.session ? { ...state.anchor } : null;
  state.session = session;
  const next = { position: [0, 0], forward: [0, -1] };
  if (was && state.source === 'dictated') {
    for (const p of scene) {
      const local = fromWorld(was, [p.at[0], p.at[2]]), w = toWorld(next, local);
      const f = dirToWorld(next, dirFromWorld(was, [p.facing[0], p.facing[2]]));
      p.at = [round(w[0]), p.at[1], round(w[1])];
      p.facing = [round(f[0]), 0, round(f[1])];
    }
  }
  state.anchor = next;
  return true;
}

/** The room's size and openings, as Muse reads them. */
export function describeSpec() {
  const { width, depth, height, openings } = state.spec;
  return { source: state.source, width, depth, height, walls: Object.fromEntries(Object.entries(wallsOf(state.spec)).map(([k, w]) => [`wall-${k}`, { length: w.length }])), openings: openings.map((o) => ({ ...o, wall: `wall-${o.wall}` })) };
}

// --- changing the dictated room -----------------------------------------------------------------------------------
const metres = (v, what, lo, hi) => {
  if (v === undefined) return undefined;
  if (!Number.isFinite(v) || v < lo || v > hi) throw new Error(`${what} ${v} m is outside ${lo}–${hi} m`);
  return round(v);
};
const sideOf = (wall) => { const s = String(wall ?? '').replace(/^wall-/, ''); if (!WALL_SIDES.includes(s)) throw new Error(`wall ${wall}: one of wall-front, wall-right, wall-back, wall-left`); return s; };

/** Where along a wall an opening sits: 'centre', 'left', 'right' (as seen from inside), or metres right of centre. */
function along(at, wall, width) {
  const L = wallsOf(state.spec)[wall].length, room = L / 2 - width / 2 - 0.15;
  const v = at === undefined || at === 'centre' || at === 'center' ? 0 : at === 'left' ? -(room - 0.15) : at === 'right' ? room - 0.15 : Number(at);
  if (!Number.isFinite(v)) throw new Error(`at ${at}: 'centre', 'left', 'right' or metres right of centre`);
  return round(Math.max(-room, Math.min(room, v)));
}

/** The room's size: any of width (left to right), depth (front to back), height, in metres. Openings stay on their walls. */
export function setSize({ width, depth, height }) {
  const s = state.spec;
  s.width = metres(width, 'width', 1.5, 20) ?? s.width;
  s.depth = metres(depth, 'depth', 1.5, 20) ?? s.depth;
  s.height = metres(height, 'height', 2, 6) ?? s.height;
  for (const o of s.openings) { o.at = along(o.at, o.wall, o.width); if (o.kind === 'window') o.height = Math.min(o.height, s.height - (o.sill ?? 0.9) - 0.15); }
  return describeSpec();
}

/** Adds, moves (to another wall or along its own), resizes or removes a door or window. */
export function changeOpening({ action, id, kind, wall, at, width, height, sill }) {
  const s = state.spec;
  if (action === 'add') {
    if (kind !== 'door' && kind !== 'window') throw new Error("kind: 'door' or 'window'");
    let n = 1;
    while (s.openings.some((o) => o.id === `${kind}${n}`)) n++;
    const o = { id: `${kind}${n}`, kind, wall: sideOf(wall), width: metres(width, 'width', 0.4, 4) ?? (kind === 'door' ? 0.9 : 1.2), height: metres(height, 'height', 0.3, 3) ?? (kind === 'door' ? 2.1 : 1.3), ...(kind === 'window' ? { sill: metres(sill, 'sill', 0, 2) ?? 0.85 } : {}) };
    o.at = along(at, o.wall, o.width);
    s.openings.push(o);
    return { added: o, room: describeSpec() };
  }
  const o = s.openings.find((x) => x.id === id);
  if (!o) throw new Error(`no opening ${id}; the room has ${s.openings.map((x) => x.id).join(', ') || 'none'}`);
  if (action === 'remove') { s.openings.splice(s.openings.indexOf(o), 1); return { removed: id, room: describeSpec() }; }
  if (action !== 'move') throw new Error("action: 'add', 'move' or 'remove'");
  if (wall !== undefined) o.wall = sideOf(wall);
  o.width = metres(width, 'width', 0.4, 4) ?? o.width;
  o.height = metres(height, 'height', 0.3, 3) ?? o.height;
  if (o.kind === 'window') o.sill = metres(sill, 'sill', 0, 2) ?? o.sill;
  o.at = along(at ?? (wall !== undefined ? 'centre' : o.at), o.wall, o.width);
  return { moved: o, room: describeSpec() };
}

/**
 * Where to stand to look at `target` (a wall, door, window or piece, by its point and the way into the room) — a step
 * into the room from it, facing it — or the room's middle. → { position: [x, y, z], facing: [x, 0, z] }
 */
export function standingFor(room, target) {
  const floor = room.items.find((i) => i.label === 'floor');
  const mid = floor ? [floor.center[0], floor.center[2]] : [0, 0];
  if (!target) {
    const f = state.source === 'dictated' ? state.anchor.forward : [0, -1];
    return { position: [round(mid[0]), 0, round(mid[1])], facing: [f[0], 0, f[1]] };
  }
  const { point, inward, step = 1.2 } = target;
  const p = [point[0] + inward[0] * step, point[1] + inward[1] * step];
  return { position: [round(p[0]), 0, round(p[1])], facing: [round(-inward[0]), 0, round(-inward[1])] };
}
