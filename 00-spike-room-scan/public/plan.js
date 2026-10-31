// A scan drawn top down: x to the right, z down the page (looking along -y). Floor filled, walls as lines,
// furniture as the footprint of its oriented box, the session origin and the headset as dots.
const COLORS = { floor: '#5bd16a', wall: '#4f8cff', 'door frame': '#ff9a3c', 'window frame': '#3fe0e0', ceiling: '#8a8a8a' };
const colorOf = (l) => COLORS[l] ?? '#e05bd1';
const NS = 'http://www.w3.org/2000/svg';

// column-major 4x4, as WebXR gives it
const apply = (m, [x, y, z]) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];

function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), q) <= 0) lower.pop(); lower.push(q); }
  for (const q of p.reverse()) { while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), q) <= 0) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function farthestPair(points) {
  let best = [points[0], points[0]], d = -1;
  for (const a of points) for (const b of points) {
    const dd = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
    if (dd > d) { d = dd; best = [a, b]; }
  }
  return best;
}

const pts = (list) => list.map(([x, z]) => `${x},${z}`).join(' ');
const centroid = (list) => list.reduce((a, [x, z]) => [a[0] + x / list.length, a[1] + z / list.length], [0, 0]);
export const countLabels = (list) => list.reduce((a, it) => ((a[it.label ?? '(none)'] = (a[it.label ?? '(none)'] ?? 0) + 1), a), {});

/** Draws `scan` into `svg` (replacing what was there) and returns a summary of it. */
export function drawPlan(svg, scan) {
  const el = (name, attrs, text) => {
    const e = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text) e.textContent = text;
    svg.appendChild(e);
    return e;
  };
  svg.replaceChildren();

  const shapes = [];
  for (const p of scan.planes) {
    const xz = p.world.map(([x, , z]) => [x, z]);
    if (p.orientation === 'vertical' || ['wall', 'door frame', 'window frame'].includes(p.label)) {
      shapes.push({ kind: 'line', label: p.label, xz: farthestPair(xz) });
    } else if (p.label !== 'ceiling') {
      shapes.push({ kind: 'poly', label: p.label, xz, fill: p.label === 'floor' });
    }
  }
  for (const m of scan.meshes) {
    if (m.label === 'global mesh') continue;
    const { min, max } = m.localBox;
    const corners = [];
    for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) corners.push(apply(m.pose.matrix, [x, y, z]));
    shapes.push({ kind: 'poly', label: m.label, xz: hull(corners.map(([x, , z]) => [x, z])), fill: false });
  }

  const all = shapes.flatMap((s) => s.xz).concat([[0, 0]]);
  const xs = all.map((p) => p[0]), zs = all.map((p) => p[1]);
  const pad = 0.5, x0 = Math.min(...xs) - pad, z0 = Math.min(...zs) - pad;
  const w = Math.max(...xs) + pad - x0, h = Math.max(...zs) + pad - z0;
  svg.setAttribute('viewBox', `${x0} ${z0} ${w} ${h}`);

  for (const s of shapes.filter((s) => s.fill)) el('polygon', { points: pts(s.xz), fill: colorOf(s.label), 'fill-opacity': 0.25, stroke: colorOf(s.label), 'stroke-width': 0.02 });
  for (const s of shapes.filter((s) => s.kind === 'poly' && !s.fill)) {
    el('polygon', { points: pts(s.xz), fill: 'none', stroke: colorOf(s.label), 'stroke-width': 0.025 });
    const [cx, cz] = centroid(s.xz);
    el('text', { x: cx, y: cz, 'text-anchor': 'middle' }, s.label ?? '?');
  }
  for (const s of shapes.filter((s) => s.kind === 'line')) {
    const [[ax, az], [bx, bz]] = s.xz;
    el('line', { x1: ax, y1: az, x2: bx, y2: bz, stroke: colorOf(s.label), 'stroke-width': s.label === 'wall' ? 0.06 : 0.1, 'stroke-linecap': 'round' });
  }
  el('circle', { cx: 0, cy: 0, r: 0.06, fill: '#ece6da' });
  el('text', { x: 0.1, y: -0.1 }, 'origin');
  if (scan.viewer) {
    const [vx, , vz] = scan.viewer.position;
    el('circle', { cx: vx, cy: vz, r: 0.08, fill: '#e4b363' });
    el('text', { x: vx + 0.12, y: vz }, 'headset');
  }

  return {
    capturedAt: scan.capturedAt, reason: scan.reason, enabledFeatures: scan.enabledFeatures,
    roomCaptureAvailable: scan.roomCaptureAvailable, planes: countLabels(scan.planes), meshes: countLabels(scan.meshes),
    extent: `${(w - 2 * pad).toFixed(2)} x ${(h - 2 * pad).toFixed(2)} m`, userAgent: scan.userAgent,
  };
}

/** Hands `scan` to the browser as a .json download. */
export function download(scan, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(scan, null, 1)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `${name}.json` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
