// Spike 07's test bench: spike 05's scan format turned into what the headset sends (room items with wall normals,
// and the viewer where the scan was taken), and a top-down plan of a furnished scene as SVG.
const round = (v) => Math.round(v * 1000) / 1000;

export function roomFromScan(scan, floorBelow = 1.5) {
  const counts = {};
  const items = [];
  let floorY;
  const add = (label, min, max, normal) => {
    const key = label.replace(/\s+/g, '');
    counts[key] = (counts[key] ?? 0) + 1;
    const item = { id: `${key}${counts[key]}`, label, center: min.map((v, i) => round((v + max[i]) / 2)), size: min.map((v, i) => round(max[i] - v)), top: round(max[1]) };
    if (normal) item.normal = normal.map(round);
    items.push(item);
  };
  for (const p of scan.planes) {
    if (Math.min(...p.world.map((w) => w[1])) >= floorBelow) continue;
    if (p.label === 'floor') floorY = p.pose.position[1];
    if (scan.meshes.some((m) => m.id === p.id)) continue;
    const min = [0, 1, 2].map((i) => Math.min(...p.world.map((w) => w[i])));
    const max = [0, 1, 2].map((i) => Math.max(...p.world.map((w) => w[i])));
    const m = p.pose.matrix;
    add(p.label, min, max, [m[8], m[9], m[10]]); // the pose's z column: the plane's normal
  }
  for (const m of scan.meshes) {
    if (m.label === 'global mesh' || m.worldBox.min[1] >= floorBelow) continue;
    add(m.label, m.worldBox.min, m.worldBox.max);
    // the footprint as the headset sends it: the volume's own x-y, turned with its pose
    const t = m.pose.matrix, lb = m.localBox;
    const mid = [0, 1, 2].map((i) => (lb.min[i] + lb.max[i]) / 2);
    const c = [t[0] * mid[0] + t[4] * mid[1] + t[8] * mid[2] + t[12], t[2] * mid[0] + t[6] * mid[1] + t[10] * mid[2] + t[14]];
    items.at(-1).footprint = { center: c.map(round), u: [t[0], t[2]].map(round), v: [t[4], t[6]].map(round), half: [(lb.max[0] - lb.min[0]) / 2, (lb.max[1] - lb.min[1]) / 2].map(round) };
  }
  const v = scan.viewer;
  const f = v ? [v.matrix[8], v.matrix[10]] : [0, -1];
  const fl = Math.hypot(...f) || 1;
  return { loaded: true, floorY, items, viewer: v ? { position: v.position, forward: [round(f[0] / fl), 0, round(f[1] / fl)] } : null };
}

import { walls, itemBox, pieceBox } from './place.mjs';

export function planSvg(room, scene, catalog) {
  const out = [];
  const pts = [];
  const rect = (b) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, c]) => [b.c[0] + b.u[0] * a * b.hu + b.v[0] * c * b.hv, b.c[1] + b.u[1] * a * b.hu + b.v[1] * c * b.hv]);
  const poly = (r, stroke, fill, w) => `<polygon points="${r.map((p) => p.join(',')).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${w}"/>`;
  const label = (c, t, color = '#ece6da') => `<text x="${c[0]}" y="${c[1]}" font-size="0.12" text-anchor="middle" fill="${color}">${t}</text>`;
  for (const w of walls(room)) {
    const a = [-w.n[1], w.n[0]], h = w.length / 2, c = [w.center[0], w.center[2]];
    const p0 = [c[0] - a[0] * h, c[1] - a[1] * h], p1 = [c[0] + a[0] * h, c[1] + a[1] * h];
    pts.push(p0, p1);
    out.push(`<line x1="${p0[0]}" y1="${p0[1]}" x2="${p1[0]}" y2="${p1[1]}" stroke="#4f8cff" stroke-width="0.05"/>`);
    out.push(label([c[0] + w.n[0] * 0.15, c[1] + w.n[1] * 0.15], w.id, '#4f8cff'));
  }
  for (const i of room.items) {
    if (['wall', 'invisible wall', 'inner wall', 'floor', 'ceiling', 'global mesh', 'door frame', 'window frame', 'wall art'].includes(i.label)) continue;
    const b = itemBox(i);
    out.push(poly(rect(b), '#e05bd1', 'none', 0.02), label(b.c, i.id, '#e05bd1'));
  }
  for (const p of scene) {
    const b = pieceBox(p, catalog[p.item].size);
    const r = rect(b);
    pts.push(...r);
    out.push(poly(r, '#e4b363', '#e4b36333', 0.03), `<circle cx="${b.c[0] + b.v[0] * b.hv}" cy="${b.c[1] + b.v[1] * b.hv}" r="0.035" fill="#e4b363"/>`, label(b.c, p.id, '#e4b363'));
  }
  const v = room.viewer;
  if (v) {
    pts.push([v.position[0], v.position[2]]);
    out.push(`<circle cx="${v.position[0]}" cy="${v.position[2]}" r="0.08" fill="#5bd16a"/><line x1="${v.position[0]}" y1="${v.position[2]}" x2="${v.position[0] + v.forward[0] * 0.5}" y2="${v.position[2] + v.forward[2] * 0.5}" stroke="#5bd16a" stroke-width="0.03"/>`);
  }
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  const x0 = Math.min(...xs) - 0.3, z0 = Math.min(...zs) - 0.3, w = Math.max(...xs) - x0 + 0.3, h = Math.max(...zs) - z0 + 0.3;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${z0} ${w} ${h}" width="800" height="${Math.round((800 * h) / w)}" style="background:#15130f">${out.join('')}</svg>\n`;
}
