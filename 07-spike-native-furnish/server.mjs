// Spike 07: the laptop side of furnishing by voice. The headset app posts a turn (audio, pointing, room) to
// /api/turn over `adb reverse tcp:8091 tcp:8091`; this transcribes it, asks the model, and answers with the words it
// heard, a reply to read aloud and the whole furnished scene. It also serves the catalogue's models (/catalog/<id>.glb)
// and the scene on its own (/api/scene). Loopback only (the API key and the scene stay on this machine), unless it
// is the public demo (MAISON_PUBLIC=1): then it serves the web client (web/) and keeps a design per visitor.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, runTurn, scene, catalog, catalogList, modelPath, parseModel, finish, settings, manualMove, apply as applyTool, sizesOf, windowsOf } from './agent.mjs';
import { decorModel } from './decor.mjs';
import { walls, sizeOf, mountOf, ceilingOf } from './place.mjs';
import { frame } from './shell.mjs';
import { shellGlb, ghostsGlb, shellKey } from './shell.mjs';
import { state as rooms, designRoom, resolvePointing, newSession } from './rooms.mjs';
import { recolour } from '../70-inventory/colour.mjs';
import { connect as connectMojulo } from '../mojulo/client.mjs';
import { transcribe, sttStatus } from './stt.mjs';
import { speak, voiceStatus } from './voice.mjs';
import { withDesign, designCount } from './designs.mjs';
import { mergeGlb, worldHtml, zip, throughMojulo } from './export.mjs';
import { readdirSync, statSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { mojuloReady } from './agent.mjs';

// The public demo (MAISON_PUBLIC=1): every visitor's browser names its own design (x-maison-design), turns are counted
// against a visitor, an address and the whole day, and the server listens beyond this machine. Without it the server
// is the laptop's, for the headset over adb, as before.
const PUBLIC = process.env.MAISON_PUBLIC === '1';
const LIMIT = { visitor: Number(process.env.MAISON_TURNS_PER_VISITOR) || 30, address: Number(process.env.MAISON_TURNS_PER_ADDRESS) || 60, day: Number(process.env.MAISON_TURNS_PER_DAY) || 1500 };
const counts = { day: '', visitor: new Map(), address: new Map(), all: 0 };
/** Whether one more turn is allowed for this design and address today; counts it if `take`. */
function allowance(design, address, take) {
  const today = new Date().toISOString().slice(0, 10);
  if (counts.day !== today) Object.assign(counts, { day: today, visitor: new Map(), address: new Map(), all: 0 });
  const v = counts.visitor.get(design) ?? 0, a = counts.address.get(address) ?? 0;
  const left = Math.min(LIMIT.visitor - v, LIMIT.address - a, LIMIT.day - counts.all);
  if (take && left > 0) { counts.visitor.set(design, v + 1); counts.address.set(address, a + 1); counts.all++; }
  return { left: Math.max(0, left - (take && left > 0 ? 1 : 0)), of: LIMIT.visitor, ok: left > 0 };
}
// the visitor's address: the host's own header first (Fly's, Cloudflare's), which a visitor cannot set; the day's cap is the
// real guard on cost either way
const addressOf = (req) => String(req.headers['fly-client-ip'] ?? req.headers['cf-connecting-ip'] ?? req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress || '?';
const WEB = join(dirname(fileURLToPath(import.meta.url)), 'web');
const STATIC = { '/': 'index.html', '/index.html': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css', '/favicon.svg': 'favicon.svg' };
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', svg: 'image/svg+xml' };

const PORT = Number(process.env.PORT) || 8091;
const CATALOG = join(dirname(fileURLToPath(import.meta.url)), 'catalog');
// each piece with its size and how it sits, so the headset's laser can hit it and its grab can move it the right way
const sceneJson = () => scene.map((p) => {
  const c = catalog[p.item], mount = mountOf(c), parts = Object.keys(c.parts ?? {});
  return {
    id: p.id, item: p.item, name: c.name, at: p.at, facing: p.facing, model: modelPath(p), size: sizeOf(p, catalog), mount, grab: mount !== 'window',
    // what the page's piece panel offers: its parts' colours, its finishes, whether it has other sizes
    parts: Object.fromEntries(parts.map((k) => [k, p.colours?.[k] ?? c.parts[k]])), ...(c.finishes ? { finishes: c.finishes, finish: p.fit?.finish ?? null } : {}), sized: sizesOf(p.item).length > 1,
    // where it gives light, in the room: the page lights the room from these
    ...(c.light ? { light: { lumens: c.light.lumens, kind: c.light.kind, colour: c.light.colour ?? '#ffd9a8', at: c.light.at.map((l) => toRoom(p, l)) } } : {}),
  };
});
/** A point in a piece's own frame (front +z, base at y = 0) in the room. */
function toRoom(p, [x, y, z]) {
  const t = Math.atan2(p.facing[0], p.facing[2]), c = Math.cos(t), s = Math.sin(t);
  return [p.at[0] + x * c + z * s, p.at[1] + y, p.at[2] - x * s + z * c].map((v) => Math.round(v * 1000) / 1000);
}
// The room the headset stands in VR (shell.mjs): the design's room (rooms.mjs: dictated, or the scan emptied) in the
// room's colours, and in a scanned room the real furniture's outlines: { shell: '/room/<key>.glb', ghosts, floorY }.
// The key names the room and its colours, so a change is a new model the headset loads afresh.
const built = new Map(); // key -> { shell, ghosts }
function roomJson() {
  const room = designRoom();
  const scanned = rooms.source === 'scan' ? rooms.scanned : null;
  const key = shellKey({ ...room, items: [...room.items, ...(scanned?.items ?? [])] }, finish);
  if (!built.has(key)) { built.set(key, { shell: shellGlb(room, finish), ghosts: scanned ? ghostsGlb(scanned) : null }); trim(built, 300); }
  const b = built.get(key);
  // the room's planes for the headset's laser: each wall (centre, inward normal, along, half its length, bottom, top)
  const planes = walls(room).map(frame).map((f) => ({ id: f.id, c: f.c, n: f.n, along: f.along, half: f.half, y0: f.y0, y1: f.y1 }));
  // its windows, for the daylight through them: centre, the way into the room, size
  const windows = windowsOf(room).map((w) => ({ id: w.id, c: w.c, n: w.n, width: w.width, bottom: w.bottom + (room.floorY ?? 0), top: w.top + (room.floorY ?? 0) }));
  return { shell: b.shell ? `/room/${key}.glb` : null, ghosts: settings.outlines && b.ghosts ? `/ghosts/${key}.glb` : null, floorY: room.floorY ?? 0, ceilingY: ceilingOf(room), walls: planes, windows, size: rooms.spec ? { width: rooms.spec.width, depth: rooms.spec.depth, height: rooms.spec.height } : null, source: rooms.source };
}
// speech recognition is biased toward this catalogue, the room's words and its sizes
const keywordsFor = (room) => [...new Set([...catalogList.flatMap((c) => c.words ?? [c.id.replace('-', ' '), c.name]), ...(room?.items ?? []).map((i) => i.label), 'wall', 'door', 'window', 'ceiling', 'floor', 'metres', 'feet', 'wider', 'longer'])];

// Models made on first request. The name says it all (materials, then colours), so the headset's cache never serves
// a stale one. Another material is a mojulo rebuild of the SKU (a second or a few), kept on disk beside the catalogue
// models; colours go over it here (colour.mjs, well under a second), kept in memory.
const made = new Map(); // name -> Promise<Buffer>
let mojulo = null, queue = Promise.resolve();
// one job at a time on mojulo; a failed job does not stop the ones after it
const onMojulo = (job) => { const run = queue.catch(() => {}).then(async () => job((mojulo ??= await connectMojulo()))); queue = run; return run; };
function rebuilt(item, materials) {
  const entry = catalog[item];
  const tag = Object.entries(materials).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `~${k}@${v}`).join('');
  const file = join(entry.dir ?? CATALOG, 'models', 'variants', `${item}${tag}.glb`);
  if (existsSync(file)) return readFile(file);
  return onMojulo(async (m) => {
    const t0 = Date.now();
    const { makeSku } = await import('../70-inventory/make.mjs');
    const { glb } = await makeSku(m, { sku: item, piece: entry.piece, collection: entry.collection, size: entry.sizeName }, materials);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, glb);
    console.log(`  (made ${item}${tag} on mojulo in ${Date.now() - t0} ms${glb.length > 1.5 * 1048576 ? `; ${(glb.length / 1048576).toFixed(1)} MB, over the 1.5 MB budget: slow to load` : ''})`);
    return glb;
  });
}
function modelFile(name) {
  const { item, materials, colours, fit } = parseModel(name);
  if (!catalog[item]) return null;
  if (!made.has(name)) {
    const job = (async () => {
      // Maison3D's own pieces are built here (a window piece to its fit); mojulo's are read, or rebuilt in other materials
      const glb = catalog[item].decor ? decorModel(catalog[item], fit).glb : Object.keys(materials).length ? await rebuilt(item, materials) : await readFile(join(catalog[item].dir ?? CATALOG, catalog[item].file));
      if (!Object.keys(colours).length) return glb;
      const t0 = Date.now();
      const out = recolour(glb, colours);
      console.log(`  (recoloured ${name} in ${Date.now() - t0} ms)`);
      return out;
    })();
    made.set(name, job);
    trim(made, 800);
    job.catch(() => made.delete(name)); // a failure is tried again on the next request
  }
  return made.get(name);
}
/** The design as one GLB: the room, every piece where it stands, their lights, the day through the windows. */
async function designGlb({ withRoom = true } = {}) {
  const r = roomJson(), shell = built.get(r.shell.match(/([0-9a-f]{12})\.glb$/)[1]).shell;
  const parts = withRoom ? [{ glb: shell, name: 'room' }] : [];
  for (const p of scene) parts.push({ glb: await modelFile(modelPath(p).slice('/catalog/'.length, -'.glb'.length)), name: `${p.id} (${catalog[p.item].name})`, at: p.at, facing: p.facing });
  const lights = sceneJson().flatMap((p) => (p.light?.at ?? []).map((at) => ({ name: `${p.id} light`, at, lumens: p.light.lumens / p.light.at.length, colour: p.light.colour, kind: p.light.kind })));
  lights.push({ name: 'daylight', kind: 'sun', colour: '#fff4e6', lux: 3, at: [0, r.ceilingY ?? 3, 0] });
  return mergeGlb(parts, lights);
}

/** Starts making the models the scene needs, so they are ready, or nearly, when the headset asks. */
const warm = () => { for (const p of scene) modelFile(modelPath(p).slice('/catalog/'.length, -'.glb'.length))?.catch((e) => console.log(`  (could not make ${p.id}: ${e.message.slice(0, 200)})`)); };
const MAX_BODY = 16 * 1024 * 1024;
/** A highlighted area as the browser sends it, checked: { surface, wall?, centre, size, u, normal }. */
function areaOf(a) {
  if (!a || !['floor', 'wall', 'ceiling'].includes(a.surface)) return null;
  const num = (v, n) => Array.isArray(v) && v.length === n && v.every(Number.isFinite);
  if (!num(a.centre, 3) || !num(a.size, 2) || !num(a.u, 2) || a.size.some((v) => v <= 0 || v > 30)) return null;
  return { surface: a.surface, ...(a.surface === 'wall' && typeof a.wall === 'string' ? { wall: a.wall } : {}), centre: a.centre, size: a.size, u: a.u, normal: num(a.normal, 3) ? a.normal : null };
}
// the tools the page calls itself, no model in between: placing from the library, dragging, turning, sizes, finishes,
// colours, the room's size and surfaces
const DIRECT = new Set(['place', 'move', 'remove', 'resize', 'swap', 'material', 'recolour', 'paint', 'surface', 'room_size', 'opening', 'open', 'rug', 'potlights', 'around', 'picture']);
const CATEGORY = { converse: 'Living', read: 'Living', dine: 'Dining', sleep: 'Bedroom', dress: 'Bedroom', store: 'Storage', storage: 'Storage', display: 'Storage', drop: 'Storage', work: 'Office', media: 'Media', tv: 'Media', audio: 'Media', gear: 'Media', screen: 'Media', 'light-task': 'Lighting', light: 'Lighting', rug: 'Rugs', art: 'Decor', plant: 'Decor', vase: 'Decor', mirror: 'Decor', curtain: 'Windows', appliance: 'Appliances' };
let library = null;
const libraryJson = () => (library ??= catalogList.map((c) => ({ id: c.id, name: c.name, category: CATEGORY[c.kind] ?? (/lamp|light/i.test(c.name) ? 'Lighting' : /sofa|chair/i.test(c.name) ? 'Living' : /table/i.test(c.name) ? 'Dining' : 'More'), mount: mountOf(c), size: c.size, ...(c.collection ? { collection: c.collection } : {}), ...(c.custom ? { custom: true } : {}) })));
/** Keeps a cache to `n` entries, the oldest made going first (a public server's visitors would grow it forever). */
function trim(map, n) { while (map.size > n) map.delete(map.keys().next().value); }

function send(res, status, body) {
  // close after every answer: the headset's HTTP stack keeps idle connections for reuse, Node drops them after 5 s,
  // and a turn sent down a dropped one fails as "unexpected end of stream"
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', connection: 'close' });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('turn too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

async function turn(req, res, design) {
  const body = await readJson(req);
  const t0 = Date.now();
  let limit = null;
  if (PUBLIC) {
    limit = allowance(design, addressOf(req), true);
    if (!limit.ok) return send(res, 429, { error: "That's the demo's limit for today: come back tomorrow, or run Maison3D yourself.", limit, scene: sceneJson(), room: roomJson() });
  }
  if (body.room?.items?.length) rooms.scanned = body.room; // the real room, as the headset reads it now
  // the headset hears first (/api/hear) and sends the words here; typed text skips transcription too
  const said = typeof body.text === 'string' && body.text.trim() ? body.text.trim() : await transcribe(Buffer.from(body.audio ?? '', 'base64'), keywordsFor(body.room));
  const heardMs = Date.now() - t0;
  if (!said) return send(res, 200, { said: '', reply: '', scene: sceneJson(), room: roomJson(), note: 'heard nothing' });
  const room = designRoom(body.room?.viewer ?? null);
  const pointed = resolvePointing(body.pointing, room), area = areaOf(body.area);
  const { reply, calls, actions } = await runTurn({ said, pointing: pointed, room, area });
  console.log(`\n> ${said}${pointed ? `   (pointing at ${pointed.id ?? pointed.target})` : ''}${area ? `   (area ${area.size.join(' x ')} m on the ${area.wall ?? area.surface})` : ''}`);
  for (const c of calls) console.log(`  ${c.name} ${JSON.stringify(c.args)} -> ${c.result.error ?? (c.result.piece ? `${c.result.piece.id} at ${c.result.piece.at}` : 'ok')}${c.result.issues?.length ? `  [${c.result.issues.join('; ')}]` : ''}`);
  console.log(`< ${reply}   [${heardMs} ms to hear, ${Date.now() - t0 - heardMs} ms to answer]`);
  warm(); // a piece in another material starts on mojulo now, while the reply is spoken
  const voice = body.voice ? await speak(reply) : null;
  send(res, 200, { said, reply, scene: sceneJson(), room: roomJson(), actions, ...(limit ? { limit } : {}), ...(voice ? { voice: voice.toString('base64') } : {}) });
}

const server = http.createServer(async (req, res) => {
  // a visitor's browser names its design; the headset names none and gets the local one
  const asked = String(req.headers['x-maison-design'] ?? '');
  const design = /^[A-Za-z0-9-]{8,64}$/.test(asked) ? `v-${asked}` : 'local';
  if (PUBLIC && design === 'local' && req.url.startsWith('/api/') && req.method === 'POST') return send(res, 400, { error: 'open the demo page: it names your own room' });
  return withDesign(design, () => handle(req, res, design));
});

async function handle(req, res, design) {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && STATIC[url.pathname]) {
      const name = STATIC[url.pathname], file = join(WEB, name);
      if (!existsSync(file)) return send(res, 404, { error: 'no web client here' });
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[name.split('.').pop()], 'cache-control': 'no-cache', connection: 'close' });
      return res.end(body);
    }
    if (req.method === 'GET' && url.pathname === '/api/limit') return send(res, 200, PUBLIC ? allowance(design, addressOf(req), false) : { ok: true, left: null });
    if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true, model: config.model, key: config.hasKey, stt: sttStatus(), voice: voiceStatus(), catalog: catalogList.map((c) => c.id) });
    if (req.method === 'GET' && url.pathname === '/api/scene') return send(res, 200, { scene: sceneJson(), room: roomJson() });
    // a piece the person moved with the laser: checked like a placement, the scene back with where it ended up
    if (req.method === 'POST' && url.pathname === '/api/move') {
      const body = await readJson(req);
      const r = manualMove(body, designRoom());
      console.log(`\n(moved by hand: ${body.id} -> ${r.error ?? `${r.piece.at}${r.issues?.length ? `  [${r.issues.join('; ')}]` : ''}`})`);
      return send(res, 200, { ...r, scene: sceneJson(), room: roomJson() });
    }
    if (req.method === 'POST' && url.pathname === '/api/clear') { scene.length = 0; console.log('\n(cleared from the headset)'); return send(res, 200, { scene: [], room: roomJson() }); }
    // the headset has read its room: the empty room to stand in VR, before anyone has said anything
    // (a new session: the app started, so its world's origin is where the person stands; the dictated room stands
    // round them again, and the pieces move with it)
    if (req.method === 'POST' && url.pathname === '/api/room') {
      const body = await readJson(req);
      if (body.room?.items?.length) rooms.scanned = body.room;
      const fresh = newSession(body.session, scene);
      console.log(`\n(headset ${fresh ? 'started' : 'reloaded its room'}: ${body.room?.items?.length ?? 0} things scanned; designing in the ${rooms.source} room)`);
      return send(res, 200, { scene: sceneJson(), room: roomJson() });
    }
    // the first half of a turn: only the words, back as soon as they are heard, so the headset can show them while
    // Muse thinks (the second half is /api/turn with { text })
    if (req.method === 'POST' && url.pathname === '/api/hear') {
      if (PUBLIC && !allowance(design, addressOf(req), false).ok) return send(res, 429, { error: "That's the demo's limit for today." });
      const body = await readJson(req);
      if (PUBLIC && (body.audio?.length ?? 0) > 2.8e6) return send(res, 413, { error: 'too long: hold the button for under a minute' });
      const t0 = Date.now();
      const said = await transcribe(Buffer.from(body.audio ?? '', 'base64'), keywordsFor(body.room ?? rooms.scanned));
      console.log(`\n(heard "${said}" in ${Date.now() - t0} ms)`);
      return send(res, 200, { said, ms: Date.now() - t0 });
    }
    const shellPath = /^\/(room|ghosts)\/([0-9a-f]{12})\.glb$/.exec(url.pathname);
    if (req.method === 'GET' && shellPath) {
      const glb = built.get(shellPath[2])?.[shellPath[1] === 'room' ? 'shell' : 'ghosts'];
      if (!glb) return send(res, 404, { error: `no ${shellPath[1]} ${shellPath[2]}` });
      res.writeHead(200, { 'content-type': 'model/gltf-binary', 'content-length': glb.length, connection: 'close' });
      return res.end(glb);
    }
    if (req.method === 'GET' && url.pathname.startsWith('/catalog/')) {
      const id = decodeURIComponent(url.pathname.slice('/catalog/'.length)).replace(/\.glb$/, '');
      const glb = await modelFile(id);
      if (!glb) return send(res, 404, { error: `no catalogue item ${id}` });
      res.writeHead(200, { 'content-type': 'model/gltf-binary', 'content-length': glb.length, 'cache-control': 'max-age=3600', connection: 'close' });
      return res.end(glb);
    }
    if (req.method === 'POST' && url.pathname === '/api/turn') return await turn(req, res, design);
    if (req.method === 'GET' && url.pathname === '/api/library') return send(res, 200, { pieces: libraryJson() });
    if (req.method === 'GET' && url.pathname === '/api/export/formats') return send(res, 200, { glb: true, html: true, mojulo: !PUBLIC && mojuloReady() });
    // the design to take away: one GLB of the room and every piece with its lights, or a page that walks round it
    // the design through mojulo (on a laptop with mojulo): its walkable world, a USDZ, its lit GLB, a Godot project, zipped
    if (req.method === 'GET' && url.pathname === '/api/export.mojulo') {
      if (PUBLIC || !mojuloReady()) return send(res, 404, { error: 'exporting through mojulo needs mojulo on this laptop (npm run mojulo:setup)' });
      const t0 = Date.now(), glbPath = join(mkdtempSync(join(tmpdir(), 'maison3d-')), 'room.glb');
      writeFileSync(glbPath, await designGlb());
      const room = designRoom(), ws = walls(room).flatMap((w) => { const a = [-w.n[1], w.n[0]], h = w.length / 2; return [[w.center[0] + a[0] * h, w.center[2] + a[1] * h], [w.center[0] - a[0] * h, w.center[2] - a[1] * h]]; });
      const xs = ws.map((p) => p[0]), zs = ws.map((p) => p[1]);
      const out = await onMojulo((m) => throughMojulo(m, glbPath, { width: Math.max(...xs) - Math.min(...xs), depth: Math.max(...zs) - Math.min(...zs), centre: [(Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...zs) + Math.min(...zs)) / 2], title: 'A room made with Maison3D' }));
      // every file, a directory's by walking it
      const files = [];
      const add = (path, name) => { if (statSync(path).isDirectory()) for (const f of readdirSync(path)) add(join(path, f), `${name}/${f}`); else files.push({ name, data: readFileSync(path) }); };
      for (const f of out.files) add(f.path, f.name);
      files.push({ name: 'README.txt', data: Buffer.from(`A room made with Maison3D, through mojulo (${out.ref}).\n\nworld.html: open it in a browser, no server needed: orbit, walk (gravity and walls), fly.\nroom.usdz: AR Quick Look on an iPhone, an iPad or a Vision Pro; any USD tool.\nroom-mojulo.glb: mojulo's lit GLB, for Blender, Unity or Unreal.\ngodot/: a Godot 4 project: open it and play level.tscn.\n`) });
      const body = zip(files), stamp = new Date().toISOString().slice(0, 10);
      console.log(`\n(exported through mojulo in ${Date.now() - t0} ms: ${out.files.map((f) => f.name).join(', ')})`);
      res.writeHead(200, { 'content-type': 'application/zip', 'content-length': body.length, 'x-filename': `maison3d-room-mojulo-${stamp}.zip`, 'cache-control': 'no-store', connection: 'close' });
      return res.end(body);
    }
    if (req.method === 'GET' && (url.pathname === '/api/export.glb' || url.pathname === '/api/export.html')) {
      const glb = await designGlb({ withRoom: url.searchParams.get('room') !== '0' });
      const stamp = new Date().toISOString().slice(0, 10);
      if (url.pathname.endsWith('.glb')) {
        res.writeHead(200, { 'content-type': 'model/gltf-binary', 'content-length': glb.length, 'x-filename': `maison3d-room-${stamp}.glb`, 'cache-control': 'no-store', connection: 'close' });
        return res.end(glb);
      }
      const spec = rooms.spec, html = Buffer.from(worldHtml(glb, { title: 'A room made with Maison3D', start: spec ? [spec.width * 0.35, 1.65, spec.depth * 0.4] : [0, 1.6, 2], target: [-0.5, 1.0, -0.8] }), 'utf8');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': html.length, 'x-filename': `maison3d-room-${stamp}.html`, 'cache-control': 'no-store', connection: 'close' });
      return res.end(html);
    }
    // a tool the page calls itself (no model): the scene back, and what the tool said (an overlap moved, a size picked)
    if (req.method === 'POST' && url.pathname === '/api/tool') {
      const body = await readJson(req);
      if (!DIRECT.has(body.name)) return send(res, 400, { error: `not a tool the page can call: ${body.name}` });
      const room = designRoom(body.room?.viewer ?? null);
      const result = applyTool(body.name, body.args ?? {}, { room, pointing: resolvePointing(body.pointing, room), area: areaOf(body.area), actions: [] });
      console.log(`\n(by hand: ${body.name} ${JSON.stringify(body.args ?? {}).slice(0, 160)} -> ${result.error ?? 'ok'})`);
      warm();
      return send(res, 200, { result, scene: sceneJson(), room: roomJson() });
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    console.error(`! ${e.message}`);
    send(res, 500, { error: PUBLIC ? 'something went wrong on the server' : e.message });
  }
}

server.keepAliveTimeout = 65000;

server.listen(PORT, process.env.HOST ?? (PUBLIC ? '0.0.0.0' : '127.0.0.1'), () => {
  if (PUBLIC) console.log(`public demo: ${LIMIT.visitor} turns a visitor, ${LIMIT.address} an address, ${LIMIT.day} a day; designs kept: ${designCount()}`);
  console.log(`furnish server on http://localhost:${PORT}  model ${config.model} (reasoning ${config.effort})  key ${config.hasKey ? 'found' : 'MISSING (.env META_API_KEY=…)'}  speech-to-text ${sttStatus()}  voice ${voiceStatus()}`);
  { const kinds = {}; for (const c of catalogList) kinds[c.kind ?? 'piece'] = (kinds[c.kind ?? 'piece'] ?? 0) + 1; console.log(`catalogue: ${catalogList.length} pieces (${Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`).join(', ')})`); }
  console.log(`headset: adb reverse tcp:${PORT} tcp:${PORT}, then open Maison3D Furnish`);
});
