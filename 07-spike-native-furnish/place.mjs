// Spike 07, where things go. The model names a placement in words the room understands (on table2, against wall3,
// next to sofa1 on the left, where I'm pointing, in front of me); this turns it into a base point and a facing, and
// checks the result against the real room: furniture it would stand in, walls it would poke through. The model
// never does the arithmetic.
//
// World space is the headset's: y up, metres. A piece's `at` is the centre of its base; `facing` is the level unit
// vector its front points along (catalogue models face +z, and the headset turns +z onto `facing`).

const round = (v) => Math.round(v * 1000) / 1000;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const len = (a) => Math.hypot(a[0], a[1]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
const xz = (v) => [v[0], v[2]];
/** The right-hand side of something facing `f` (y up, right-handed). */
const rightOf = (f) => [-f[1], f[0]];
/** `f` turned by `deg` degrees anticlockwise seen from above. */
const turn = (f, deg) => { const t = (deg * Math.PI) / 180; return [f[0] * Math.cos(t) + f[1] * Math.sin(t), -f[0] * Math.sin(t) + f[1] * Math.cos(t)]; };

const STRUCTURE = new Set(['wall', 'invisible wall', 'inner wall', 'floor', 'ceiling', 'door frame', 'window frame', 'wall art', 'global mesh']);
const WALLS = new Set(['wall', 'invisible wall', 'inner wall']);

export const floorOf = (room) => room?.floorY ?? 0;
/** The ceiling's height: the ceiling's own, else the walls' top. */
export const ceilingOf = (room) => {
  const c = (room?.items ?? []).find((i) => i.label === 'ceiling');
  if (c) return c.center[1];
  const ws = (room?.items ?? []).filter((i) => WALLS.has(i.label));
  return ws.length ? Math.max(...ws.map((w) => w.center[1] + w.size[1] / 2)) : floorOf(room) + 2.6;
};
/** A placed piece's size: its own when it was made to fit (curtains), else its catalogue entry's. */
export const sizeOf = (piece, catalog) => piece.size ?? catalog[piece.item].size;
/** How an entry sits: 'floor', 'rug', 'wall', 'window', 'ceiling' or 'surface' (on top of something, or the floor). */
export const mountOf = (entry) => entry.mount ?? (entry.kind === 'rug' ? 'rug' : 'floor');

/** A footprint: centre, the two axes (width along `r`, depth along `f`), half sizes, and the height range. */
function pieceBox(piece, size) {
  const f = norm(xz(piece.facing));
  return { c: xz(piece.at), u: rightOf(f), v: f, hu: size[0] / 2, hv: size[2] / 2, y0: piece.at[1], y1: piece.at[1] + size[1] };
}

function itemBox(item) {
  const y0 = item.center[1] - item.size[1] / 2, y1 = item.center[1] + item.size[1] / 2;
  const f = item.footprint;
  // the real footprint when the headset sent it; else the level bounding box, which overstates a turned piece
  if (f) return { c: f.center, u: norm(f.u), v: norm(f.v), hu: f.half[0], hv: f.half[1], y0, y1 };
  return { c: xz(item.center), u: [1, 0], v: [0, 1], hu: item.size[0] / 2, hv: item.size[2] / 2, y0, y1 };
}

/** How far a box reaches from its centre along unit axis `a`. */
const reach = (b, a) => Math.abs(dot(a, b.u)) * b.hu + Math.abs(dot(a, b.v)) * b.hv;

/** Overlap depth of two footprints (separating axes), 0 when apart. */
function overlap(a, b) {
  let least = Infinity;
  for (const axis of [a.u, a.v, b.u, b.v]) {
    const d = Math.abs(dot([b.c[0] - a.c[0], b.c[1] - a.c[1]], axis));
    const o = reach(a, axis) + reach(b, axis) - d;
    if (o <= 0) return 0;
    least = Math.min(least, o);
  }
  return least;
}

/** Walls with their normals turned to face into the room. */
export function walls(room) {
  const items = room?.items ?? [];
  const floor = items.find((i) => i.label === 'floor');
  const mid = floor ? xz(floor.center) : centroid(items.filter((i) => WALLS.has(i.label)).map((w) => xz(w.center)));
  return items.filter((i) => WALLS.has(i.label) && i.normal).map((w) => {
    let n = norm(xz(w.normal));
    if (dot([mid[0] - w.center[0], mid[1] - w.center[2]], n) < 0) n = [-n[0], -n[1]];
    // an upright wall's level bounding box spans its length on the diagonal
    return { ...w, n, length: Math.hypot(w.size[0], w.size[2]) };
  });
}

function centroid(ps) {
  if (!ps.length) return [0, 0];
  return [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length];
}

/** `f` turned onto the nearest of the room's own four directions, so a piece sits square to the walls. */
function square(f, room) {
  const w = walls(room)[0];
  if (!w) return f;
  const dirs = [w.n, rightOf(w.n), [-w.n[0], -w.n[1]], [-rightOf(w.n)[0], -rightOf(w.n)[1]]];
  return dirs.reduce((best, d) => (dot(d, f) > dot(best, f) ? d : best));
}

/** Things a placement can refer to by id: room items and pieces already placed. */
function find(id, room, scene, catalog) {
  const want = String(id ?? '').toLowerCase().replace(/\s+/g, '');
  const piece = scene.find((p) => p.id.toLowerCase() === want);
  if (piece) {
    const size = sizeOf(piece, catalog);
    return { kind: 'piece', id: piece.id, box: pieceBox(piece, size), top: piece.at[1] + size[1], piece };
  }
  const items = room?.items ?? [];
  const item = items.find((i) => i.id.toLowerCase() === want) ?? items.find((i) => i.label.replace(/\s+/g, '') === want);
  if (item) return { kind: 'item', id: item.id, box: itemBox(item), top: item.top, item };
  return null;
}

export { itemBox, pieceBox };

const ids = (room, scene) => [...scene.map((p) => p.id), ...(room?.items ?? []).filter((i) => i.label !== 'global mesh').map((i) => i.id)].join(', ');

/**
 * Resolves `where` for a piece of catalogue item `entry` (current pose `current`, or none for a new piece).
 * Returns { at, facing } or { error }.
 */
export function resolve(where, entry, { room, scene, catalog, pointing, current }) {
  const viewer = room?.viewer;
  const vpos = viewer?.position ? xz(viewer.position) : null;
  const floor = floorOf(room);
  const [w, h, d] = entry.size;
  const mount = mountOf(entry);
  const onWall = mount === 'wall';
  const gap = onWall ? 0.004 : 0.02; // off the wall: a picture hangs flush, furniture stands a little clear
  // a wall piece's height: asked for (its centre), else over the thing it is above, else where it was, else its own
  const hangAt = (y) => [floor + (where.centre_height ?? entry.hang ?? 1.45) - h / 2, y].find((v) => v !== undefined);
  let at = current ? [...current.at] : null;
  let facing = current ? norm(xz(current.facing)) : null;
  let autoFace = null; // the facing a placement implies (against a wall: away from it)

  const own = (f) => ({ c: [0, 0], u: rightOf(f), v: f, hu: w / 2, hv: d / 2 });

  if (where.above && onWall) {
    // a picture over the sofa: on the wall the sofa stands against (or the one asked for), centred on it, 22 cm clear
    const t = find(where.above, room, scene, catalog);
    if (!t) return { error: `nothing called "${where.above}"; ids are ${ids(room, scene)}` };
    const wall = where.against ? walls(room).find((x) => x.id.toLowerCase() === String(where.against).toLowerCase()) : walls(room).map((x) => ({ x, off: Math.abs(dot([t.box.c[0] - x.center[0], t.box.c[1] - x.center[2]], x.n)) })).sort((a, b) => a.off - b.off)[0]?.x;
    if (!wall) return { error: 'no wall to hang it on' };
    const along = [-wall.n[1], wall.n[0]], half = wall.length / 2, c = xz(wall.center);
    const s = Math.max(-half + w / 2, Math.min(half - w / 2, dot([t.box.c[0] - c[0], t.box.c[1] - c[1]], along)));
    const back = reach(own(wall.n), wall.n);
    autoFace = wall.n;
    at = [c[0] + along[0] * s + wall.n[0] * (back + gap), where.centre_height !== undefined ? floor + where.centre_height - h / 2 : t.top + 0.22, c[1] + along[1] * s + wall.n[1] * (back + gap)];
  } else if (where.on) {
    const t = find(where.on, room, scene, catalog);
    if (!t) return { error: `nothing called "${where.on}"; ids are ${ids(room, scene)}` };
    at = [t.box.c[0], t.top, t.box.c[1]];
  } else if (where.against) {
    const wall = walls(room).find((x) => x.id.toLowerCase() === String(where.against).toLowerCase());
    if (!wall) return { error: `no wall "${where.against}"; walls are ${walls(room).map((x) => x.id).join(', ') || 'none'}` };
    // along the wall: where the person pointed on it, else where the piece already is, else the wall's middle
    let p = xz(wall.center);
    const ref = pointing?.id === wall.id && pointing.point ? xz(pointing.point) : at ? [at[0], at[2]] : null;
    if (ref) {
      const along = [-wall.n[1], wall.n[0]];
      const half = wall.length / 2;
      const s = Math.max(-half + w / 2, Math.min(half - w / 2, dot([ref[0] - p[0], ref[1] - p[1]], along)));
      p = [p[0] + along[0] * s, p[1] + along[1] * s];
    }
    autoFace = wall.n;
    const back = reach(own(wall.n), wall.n);
    at = [p[0] + wall.n[0] * (back + gap), onWall ? hangAt(where.centre_height === undefined && current ? current.at[1] : undefined) : floor, p[1] + wall.n[1] * (back + gap)];
  } else if (where.next_to) {
    const t = find(where.next_to, room, scene, catalog);
    if (!t) return { error: `nothing called "${where.next_to}"; ids are ${ids(room, scene)}` };
    const side = where.side ?? 'right';
    // sides as the person sees them when they can be worked out, else the thing's own
    let fwd = vpos ? norm([vpos[0] - t.box.c[0], vpos[1] - t.box.c[1]]) : t.box.v; // towards the person
    let right = [fwd[1], -fwd[0]]; // the person's right, looking at the thing
    if (!vpos) right = t.box.u;
    const dir = { left: [-right[0], -right[1]], right, front: fwd, behind: [-fwd[0], -fwd[1]] }[side];
    if (!dir) return { error: 'side is left, right, front or behind' };
    const f = facing ?? (vpos ? fwd : t.box.v);
    const gap = reach(t.box, dir) + reach(own(f), dir) + 0.05;
    at = [t.box.c[0] + dir[0] * gap, floor, t.box.c[1] + dir[1] * gap];
  } else if (where.at_pointing) {
    const p = pointing?.point;
    if (!p) return { error: 'the person was not pointing at the room' };
    const n = pointing.normal ?? [0, 1, 0];
    if (n[1] > 0.7) {
      at = [...p];
    } else {
      const nn = norm([n[0], n[2]]);
      autoFace = nn;
      const back = reach(own(nn), nn);
      // a wall piece hangs where the person pointed on the wall, unless a height is asked for
      at = [p[0] + nn[0] * (back + gap), onWall ? (where.centre_height !== undefined ? hangAt() : p[1] - h / 2) : floor, p[2] + nn[1] * (back + gap)];
    }
  } else if (where.in_front) {
    if (!vpos || !viewer.forward) return { error: 'the headset did not say where the person is' };
    const f = norm(xz(viewer.forward));
    const dist = 1.2 + d / 2;
    at = [vpos[0] + f[0] * dist, floor, vpos[1] + f[1] * dist];
  } else if (Array.isArray(where.at)) {
    const a = where.at.map(Number);
    if (!a.every(Number.isFinite) || (a.length !== 2 && a.length !== 3)) return { error: 'at is [x, z] or [x, y, z]' };
    at = a.length === 2 ? [a[0], floor, a[1]] : a;
  }
  if (!at) return { error: 'say where: on, against, next_to, at_pointing, in_front or at' };
  if (onWall && !autoFace && !current) return { error: `${entry.name} hangs on a wall: give against (a wall id), above (a piece), or at_pointing at a wall` };
  if (mount === 'ceiling') at = [at[0], ceilingOf(room) - h, at[2]];

  // facing: asked for, else what the placement implies, else as it was, else towards the person
  const towards = (c) => norm([c[0] - at[0], c[1] - at[2]]);
  if (where.face === 'me' && vpos) facing = towards(vpos);
  else if (where.face === 'away' && vpos) facing = towards(vpos).map((v) => -v);
  else if (where.face) {
    const t = find(where.face, room, scene, catalog);
    if (!t) return { error: `nothing called "${where.face}" to face` };
    facing = towards(t.box.c);
  } else if (autoFace) facing = autoFace;
  else if (!facing) facing = square(vpos ? towards(vpos) : [0, 1], room);
  if (typeof where.turn === 'number') facing = turn(facing, where.turn);

  return { at: at.map(round), facing: [round(facing[0]), 0, round(facing[1])] };
}

/**
 * What a piece at `pose` runs into: real furniture it would stand in, other placed pieces, walls it pokes through.
 * Rugs lie under things and are not checked against furniture. A wall poke is fixed by moving the piece back in.
 */
export function check(piece, size, { room, scene, catalog }) {
  const issues = [];
  let box = pieceBox(piece, size);
  for (const wall of walls(room)) {
    // only a wall the piece is in front of (an L-shaped room's walls do not reach everywhere)
    const along = [-wall.n[1], wall.n[0]];
    const off = [box.c[0] - wall.center[0], box.c[1] - wall.center[2]];
    if (Math.abs(dot(off, along)) > wall.length / 2 + reach(box, along)) continue;
    // the farthest the footprint reaches behind the wall's plane
    const depth = reach(box, wall.n) - dot(off, wall.n);
    if (depth > 0.005) {
      piece.at = [round(piece.at[0] + wall.n[0] * depth), piece.at[1], round(piece.at[2] + wall.n[1] * depth)];
      box = pieceBox(piece, size);
      issues.push(`moved ${round(depth)} m off ${wall.id}`);
    }
  }
  const mount = mountOf(catalog[piece.item]);
  if (mount === 'rug' || mount === 'window') return issues;
  if (mount === 'wall') {
    for (const f of room?.items ?? []) {
      if (f.label !== 'door frame' && f.label !== 'window frame') continue;
      const b = itemBox(f), o = overlap(box, { ...b, hu: b.hu + 0.02, hv: b.hv + 0.05 });
      if (o > 0.01 && Math.min(box.y1, b.y1) - Math.max(box.y0, b.y0) > 0.01) issues.push(`covers the ${f.label === 'door frame' ? 'door' : 'window'} ${f.id}`);
    }
  }
  const vertical = (a, b) => Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0.02;
  for (const item of room?.items ?? []) {
    if (STRUCTURE.has(item.label)) continue;
    const b = itemBox(item);
    const o = overlap(box, b);
    if (o > 0.02 && vertical(box, b)) issues.push(`overlaps the real ${item.label} ${item.id} by ${round(o)} m`);
  }
  // a door's opening and the 80 cm in front of it stay clear (a rug may lie there)
  for (const zone of doorZones(room)) {
    const o = overlap(box, zone);
    if (o > 0.02 && box.y0 < zone.y1) issues.push(`blocks the door ${zone.id} by ${round(o)} m (keep 80 cm in front of a door clear)`);
  }
  for (const other of scene) {
    if (other.id === piece.id || ['rug', 'window'].includes(mountOf(catalog[other.item]))) continue; // curtains and rugs are in nobody's way
    const b = pieceBox(other, sizeOf(other, catalog));
    const o = overlap(box, b);
    if (o > 0.02 && vertical(box, b)) issues.push(`overlaps ${other.id} by ${round(o)} m`);
  }
  return issues;
}

/** The floor in front of each door, inside the room: its opening's width, 0.8 m deep, as boxes like a footprint's. */
const DOOR_CLEAR = 0.8;
function doorZones(room) {
  const ws = walls(room);
  const out = [];
  for (const d of room?.items ?? []) {
    if (d.label !== 'door frame') continue;
    // the wall it is in: the nearest wall plane, whose normal points into the room
    const wall = ws.map((w) => ({ w, off: Math.abs(dot([d.center[0] - w.center[0], d.center[2] - w.center[2]], w.n)) })).sort((a, b) => a.off - b.off)[0]?.w;
    if (!wall) continue;
    const along = [-wall.n[1], wall.n[0]];
    const width = d.size[0] * Math.abs(along[0]) + d.size[2] * Math.abs(along[1]); // its level box, along the wall
    const c = [d.center[0] + wall.n[0] * DOOR_CLEAR / 2, d.center[2] + wall.n[1] * DOOR_CLEAR / 2];
    out.push({ id: d.id, c, u: along, v: wall.n, hu: width / 2, hv: DOOR_CLEAR / 2, y0: floorOf(room), y1: floorOf(room) + 2 });
  }
  return out;
}

/** Which placed piece the pointer ray hits first, if it hits one before the room. */
export function pointedPiece(pointing, scene, catalog) {
  const ray = pointing?.ray;
  if (!ray) return null;
  let best = null;
  for (const p of scene) {
    const b = pieceBox(p, sizeOf(p, catalog));
    // the footprint's bounding box, as a box in 3D
    const ex = reach(b, [1, 0]), ez = reach(b, [0, 1]);
    const min = [b.c[0] - ex, b.y0, b.c[1] - ez], max = [b.c[0] + ex, b.y1, b.c[1] + ez];
    const t = slab(ray.origin, ray.direction, min, max);
    if (t !== null && (pointing.distance === undefined || t < pointing.distance + 0.05) && (!best || t < best.t)) best = { id: p.id, t };
  }
  return best?.id ?? null;
}

function slab(o, d, min, max) {
  let t0 = 0, t1 = Infinity;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-9) { if (o[k] < min[k] || o[k] > max[k]) return null; continue; }
    let a = (min[k] - o[k]) / d[k], b = (max[k] - o[k]) / d[k];
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return null;
  }
  return t0;
}
