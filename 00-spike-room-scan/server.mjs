// Spike 00: serves the room-scan page to the headset and saves what it posts.
// Loopback only: reach it from the Quest with `adb reverse tcp:8080 tcp:8080`, then open http://localhost:8080
// (localhost is a secure context, so WebXR works without certificates).
import http from 'node:http';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join, extname, dirname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(here, 'public');
const SCANS = join(here, 'scans');
const THREE_BUILD = join(here, '..', 'node_modules', 'three', 'build');
const PORT = Number(process.env.PORT) || 8080;
const MAX_BODY = 64 * 1024 * 1024;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

async function serveFile(res, root, rel) {
  const path = normalize(join(root, decodeURIComponent(rel)));
  if (!path.startsWith(root + sep)) return send(res, 404, 'not found');
  try {
    send(res, 200, await readFile(path), TYPES[extname(path)] ?? 'application/octet-stream');
  } catch {
    send(res, 404, 'not found');
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('scan too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// shoelace over [x, z] pairs, square metres
function area(points) {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, z1] = points[i], [x2, z2] = points[(i + 1) % points.length];
    a += x1 * z2 - x2 * z1;
  }
  return Math.abs(a) / 2;
}

function tally(items) {
  const counts = {};
  for (const it of items) counts[it.label ?? '(none)'] = (counts[it.label ?? '(none)'] ?? 0) + 1;
  return counts;
}

function summarize(scan) {
  const floors = scan.planes.filter((p) => p.label === 'floor');
  return {
    planes: tally(scan.planes),
    meshes: tally(scan.meshes),
    floorArea: floors.map((p) => Math.round(area(p.polygon) * 100) / 100),
    enabledFeatures: scan.enabledFeatures,
    roomCaptureAvailable: scan.roomCaptureAvailable,
  };
}

async function saveScan(req, res) {
  const scan = JSON.parse(await readBody(req));
  if (!Array.isArray(scan.planes) || !Array.isArray(scan.meshes)) return send(res, 400, 'expected { planes: [], meshes: [] }');
  await mkdir(SCANS, { recursive: true });
  const file = `scan-${new Date().toISOString().replace(/[:.]/g, '-')}${scan.reason ? '-' + scan.reason : ''}.json`;
  await writeFile(join(SCANS, file), JSON.stringify(scan, null, 1));
  const summary = summarize(scan);
  console.log(`saved ${file}`, JSON.stringify(summary));
  send(res, 200, JSON.stringify({ ok: true, file, summary }), TYPES['.json']);
}

async function listScans() {
  try {
    return (await readdir(SCANS)).filter((f) => f.endsWith('.json')).sort().reverse();
  } catch {
    return [];
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'POST' && url.pathname === '/api/scan') return await saveScan(req, res);
    if (req.method === 'GET' && url.pathname === '/api/scans') return send(res, 200, JSON.stringify(await listScans()), TYPES['.json']);
    if (req.method === 'GET' && url.pathname.startsWith('/vendor/three/')) return await serveFile(res, THREE_BUILD, url.pathname.slice('/vendor/three/'.length));
    if (req.method === 'GET' && url.pathname.startsWith('/scans/')) return await serveFile(res, SCANS, url.pathname.slice('/scans/'.length));
    if (req.method === 'GET') return await serveFile(res, PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
    send(res, 405, 'method not allowed');
  } catch (e) {
    console.error(e);
    send(res, 500, String(e?.message ?? e));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`room-scan spike on http://localhost:${PORT}  (headset: adb reverse tcp:${PORT} tcp:${PORT})`);
  console.log(`desktop viewer: http://localhost:${PORT}/view.html`);
});
