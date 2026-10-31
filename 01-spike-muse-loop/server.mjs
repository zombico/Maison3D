// Spike 01: the loop. The headset page posts what you said (and what you pointed at); the agent, waiting in
// `cli.mjs listen`, picks it up, changes the scene with `cli.mjs set` and answers with `cli.mjs reply`; the page,
// still in AR, swaps the change in and reads the answer aloud. The scene is one cube.
//
// Plain http by default (a Muse sandbox preview puts https in front). `--https` makes a self-signed certificate
// for a laptop on the same Wi-Fi as the headset: the browser warns once, you proceed.
// Every /api call carries the token the server prints (?t= or x-maison-token): whoever can post here is talking
// to an agent with a shell.
import http from 'node:http';
import https from 'node:https';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { join, extname, dirname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(here, 'public');
export const STATE_DIR = join(here, '.state');
const SERVER_FILE = join(STATE_DIR, 'server.json');
const SCENE_FILE = join(STATE_DIR, 'scene.json');

const MAX_BODY = 1024 * 1024;
const MAX_WAIT_S = 120;
const MAX_QUEUE = 20;
const KEEP_EVENTS = 200;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};
const DEFAULT_SCENE = { version: 0, cube: { color: '#e4b363', size: 0.25, position: [0, 1.2, -1.2], spin: false }, room: null };

// --- state ---------------------------------------------------------------------------------------------------

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

const boot = randomUUID();
let scene = readJson(SCENE_FILE, structuredClone(DEFAULT_SCENE));
const saveScene = () => writeFileSync(SCENE_FILE, JSON.stringify(scene, null, 1));

const events = [];      // { seq, type, data, at }, for pollers
const streams = new Set(); // open server-sent-event responses
let seq = 0;

function emit(type, data) {
  const e = { seq: ++seq, type, data, at: Date.now() };
  events.push(e);
  if (events.length > KEEP_EVENTS) events.shift();
  for (const res of streams) res.write(sseFrame(e));
}
const sseFrame = (e) => `id: ${e.seq}\nevent: ${e.type}\ndata: ${JSON.stringify(e.data)}\n\n`;

// what was said in the headset, waiting for the agent; and the agent's `listen` calls, waiting for something said
const queue = [];
const waiters = [];
const listening = () => waiters.length > 0;

function deliver() {
  const was = listening();
  while (queue.length && waiters.length) {
    const w = waiters.shift();
    const said = queue.shift();
    w.resolve(said);
    emit('taken', { id: said.id, text: said.text });
  }
  if (was !== listening()) emit('listening', { listening: listening() });
}

// the next thing said: at once if something is queued, else when it is said, else null after `seconds`
function next(seconds, req) {
  if (queue.length) {
    const said = queue.shift();
    emit('taken', { id: said.id, text: said.text });
    return Promise.resolve(said);
  }
  return new Promise((resolve) => {
    const drop = () => {
      const i = waiters.indexOf(w);
      if (i < 0) return;
      waiters.splice(i, 1);
      if (!listening()) emit('listening', { listening: false });
    };
    const timer = setTimeout(() => { drop(); resolve(null); }, seconds * 1000);
    const w = { resolve: (said) => { clearTimeout(timer); resolve(said); } };
    req.on('close', () => { clearTimeout(timer); drop(); });
    const was = listening();
    waiters.push(w);
    if (!was) emit('listening', { listening: true });
  });
}

// --- the cube: what `set` may change -------------------------------------------------------------------------

function patchCube(patch) {
  const next = { ...scene.cube };
  const problems = [];
  if ('color' in patch) {
    if (typeof patch.color === 'string' && patch.color.length <= 40) next.color = patch.color;
    else problems.push('color: a CSS colour, e.g. "red" or "#7fb0ff"');
  }
  if ('size' in patch) {
    const s = Number(patch.size);
    if (s >= 0.02 && s <= 3) next.size = s;
    else problems.push('size: metres, 0.02 to 3');
  }
  if ('position' in patch) {
    const p = patch.position;
    if (Array.isArray(p) && p.length === 3 && p.every((v) => Number.isFinite(Number(v)) && Math.abs(v) < 50)) next.position = p.map(Number);
    else problems.push('position: [x, y, z] in metres');
  }
  if ('spin' in patch) next.spin = !!patch.spin;
  return { next, problems };
}

// --- http ----------------------------------------------------------------------------------------------------

function send(res, status, body, type = TYPES['.json']) {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function serveFile(res, rel) {
  const path = normalize(join(PUBLIC, decodeURIComponent(rel)));
  if (!path.startsWith(PUBLIC + sep)) return send(res, 404, 'not found', 'text/plain');
  try {
    send(res, 200, await readFile(path), TYPES[extname(path)] ?? 'application/octet-stream');
  } catch {
    send(res, 404, 'not found', 'text/plain');
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function authorized(req, url, token) {
  const given = Buffer.from(req.headers['x-maison-token'] ?? url.searchParams.get('t') ?? '');
  const want = Buffer.from(token);
  return given.length === want.length && timingSafeEqual(given, want);
}

function handler(token) {
  return async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const path = url.pathname;
      if (!path.startsWith('/api/')) {
        if (req.method !== 'GET') return send(res, 405, 'method not allowed', 'text/plain');
        return await serveFile(res, path === '/' ? 'index.html' : path.slice(1));
      }
      if (!authorized(req, url, token)) return send(res, 401, { error: 'missing or wrong token: open the URL the server printed' });
      const route = `${req.method} ${path}`;

      if (route === 'GET /api/state') return send(res, 200, { boot, seq, listening: listening(), queued: queue.length, scene });

      if (route === 'GET /api/events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
        res.write(sseFrame({ seq, type: 'hello', data: { boot, seq, listening: listening(), scene } }));
        streams.add(res);
        const beat = setInterval(() => res.write(': beat\n\n'), 15000);
        req.on('close', () => { clearInterval(beat); streams.delete(res); });
        return;
      }

      // the fallback when server-sent events do not get through a proxy
      if (route === 'GET /api/poll') {
        const after = Number(url.searchParams.get('after')) || 0;
        if (url.searchParams.get('boot') !== boot) return send(res, 200, { boot, seq, listening: listening(), scene, events: [] });
        return send(res, 200, { boot, seq, listening: listening(), events: events.filter((e) => e.seq > after) });
      }

      if (route === 'POST /api/say') {
        const body = await readBody(req);
        const text = String(body.text ?? '').trim();
        if (!text) return send(res, 400, { error: 'nothing said' });
        if (queue.length >= MAX_QUEUE) queue.shift();
        const said = { id: randomUUID().slice(0, 8), text, pointing: body.pointing ?? null, at: new Date().toISOString() };
        queue.push(said);
        emit('heard', { id: said.id, text });
        deliver();
        return send(res, 200, { ok: true, id: said.id, listening: listening() });
      }

      if (route === 'GET /api/next') {
        const seconds = Math.min(Math.max(Number(url.searchParams.get('wait')) || 50, 0), MAX_WAIT_S);
        const said = await next(seconds, req);
        if (res.destroyed) return; // the listener gave up; a delivered command stays delivered
        return send(res, 200, { said, scene });
      }

      if (route === 'POST /api/set') {
        const { next, problems } = patchCube(await readBody(req));
        if (problems.length) return send(res, 400, { error: problems.join('; ') });
        scene = { ...scene, version: scene.version + 1, cube: next };
        saveScene();
        emit('scene', scene);
        return send(res, 200, { ok: true, scene });
      }

      if (route === 'POST /api/reply') {
        const text = String((await readBody(req)).text ?? '').trim();
        if (!text) return send(res, 400, { error: 'nothing to say' });
        emit('reply', { text });
        return send(res, 200, { ok: true });
      }

      // what the headset knows about the room, so "on the table" means something
      if (route === 'POST /api/room') {
        const body = await readBody(req);
        if (!Array.isArray(body.objects)) return send(res, 400, { error: 'expected { objects: [] }' });
        scene = { ...scene, room: { objects: body.objects.slice(0, 200), at: new Date().toISOString() } };
        saveScene();
        return send(res, 200, { ok: true });
      }

      send(res, 404, { error: `no route ${route}` });
    } catch (e) {
      console.error(e);
      if (!res.headersSent) send(res, 500, { error: String(e?.message ?? e) });
    }
  };
}

// --- start ---------------------------------------------------------------------------------------------------

function lanAddresses() {
  return Object.values(networkInterfaces()).flat().filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => a.address);
}

// a self-signed certificate for this machine's addresses, made once with openssl
function certificate() {
  const dir = join(STATE_DIR, 'certs');
  const key = join(dir, 'key.pem'), cert = join(dir, 'cert.pem');
  if (!existsSync(key) || !existsSync(cert)) {
    mkdirSync(dir, { recursive: true });
    const names = ['DNS:localhost', 'IP:127.0.0.1', ...lanAddresses().map((ip) => `IP:${ip}`)].join(',');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '30', '-subj', '/CN=maison3d',
      '-keyout', key, '-out', cert, '-addext', `subjectAltName=${names}`], { stdio: 'ignore' });
  }
  return { key: readFileSync(key), cert: readFileSync(cert) };
}

export function serve({ https: secure = false } = {}) {
  mkdirSync(STATE_DIR, { recursive: true });
  const saved = readJson(SERVER_FILE, {});
  const token = process.env.MAISON_TOKEN || saved.token || randomBytes(12).toString('hex');
  const port = Number(process.env.PORT) || (secure ? 8443 : 8080);
  const host = process.env.HOST || (secure ? '0.0.0.0' : '127.0.0.1');
  const app = handler(token);
  const server = secure ? https.createServer(certificate(), app) : http.createServer(app);
  // the command line always talks plain http on loopback; with --https that is a second, loopback-only port
  const apiPort = secure ? port + 1 : port;
  if (secure) http.createServer(app).listen(apiPort, '127.0.0.1');
  server.listen(port, host, () => {
    const scheme = secure ? 'https' : 'http';
    const hosts = host === '0.0.0.0' ? [...lanAddresses(), 'localhost'] : [host === '127.0.0.1' ? 'localhost' : host];
    const urls = hosts.map((h) => `${scheme}://${h}:${port}/?t=${token}`);
    writeFileSync(SERVER_FILE, JSON.stringify({ token, port, api: `http://127.0.0.1:${apiPort}`, urls, secure }, null, 1));
    console.log('maison3d loop is up. Open in the headset:');
    for (const u of urls) console.log(`  ${u}`);
    if (!secure) console.log('  (behind a preview or tunnel: its https address plus /?t=' + token + ')');
  });
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) serve({ https: process.argv.includes('--https') });
