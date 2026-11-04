// Spike 07: the laptop side of furnishing by voice. The headset app posts a turn (audio, pointing, room) to
// /api/turn over `adb reverse tcp:8091 tcp:8091`; this transcribes it, asks the model, and answers with the words it
// heard, a reply to read aloud and the whole furnished scene. It also serves the catalogue's models (/catalog/<id>.glb)
// and the scene on its own (/api/scene). Loopback only: the API key and the scene stay on this machine.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, runTurn, scene, catalog, catalogList, modelPath, parseModel, finish, settings, placeLayout, manualMove } from './agent.mjs';
import { decorModel } from './decor.mjs';
import { walls, sizeOf, mountOf, ceilingOf } from './place.mjs';
import { frame } from './shell.mjs';
import { shellGlb, ghostsGlb, shellKey } from './shell.mjs';
import { state as rooms, designRoom, resolvePointing, newSession } from './rooms.mjs';
import { recolour } from '../70-inventory/colour.mjs';
import { connect as connectMojulo } from '../mojulo/client.mjs';
import { transcribe, sttStatus } from './stt.mjs';
import { speak, voiceStatus } from './voice.mjs';

const PORT = Number(process.env.PORT) || 8091;
const CATALOG = join(dirname(fileURLToPath(import.meta.url)), 'catalog');
// each piece with its size and how it sits, so the headset's laser can hit it and its grab can move it the right way
const sceneJson = () => scene.map((p) => { const mount = mountOf(catalog[p.item]); return { id: p.id, item: p.item, at: p.at, facing: p.facing, model: modelPath(p), size: sizeOf(p, catalog), mount, grab: mount !== 'window' }; });
// The room the headset stands in VR (shell.mjs): the design's room (rooms.mjs: dictated, or the scan emptied) in the
// room's colours, and in a scanned room the real furniture's outlines: { shell: '/room/<key>.glb', ghosts, floorY }.
// The key names the room and its colours, so a change is a new model the headset loads afresh.
const built = new Map(); // key -> { shell, ghosts }
function roomJson() {
  const room = designRoom();
  const scanned = rooms.source === 'scan' ? rooms.scanned : null;
  const key = shellKey({ ...room, items: [...room.items, ...(scanned?.items ?? [])] }, finish);
  if (!built.has(key)) built.set(key, { shell: shellGlb(room, finish), ghosts: scanned ? ghostsGlb(scanned) : null });
  const b = built.get(key);
  // the room's planes for the headset's laser: each wall (centre, inward normal, along, half its length, bottom, top)
  const planes = walls(room).map(frame).map((f) => ({ id: f.id, c: f.c, n: f.n, along: f.along, half: f.half, y0: f.y0, y1: f.y1 }));
  return { shell: b.shell ? `/room/${key}.glb` : null, ghosts: settings.outlines && b.ghosts ? `/ghosts/${key}.glb` : null, floorY: room.floorY ?? 0, ceilingY: ceilingOf(room), walls: planes, source: rooms.source };
}
// speech recognition is biased toward this catalogue, the room's words and its sizes
const keywordsFor = (room) => [...new Set([...catalogList.flatMap((c) => c.words ?? [c.id.replace('-', ' '), c.name]), ...(room?.items ?? []).map((i) => i.label), 'wall', 'door', 'window', 'ceiling', 'floor', 'metres', 'feet', 'wider', 'longer'])];

// Models made on first request. The name says it all (materials, then colours), so the headset's cache never serves
// a stale one. Another material is a mojulo rebuild of the SKU (a second or a few), kept on disk beside the catalogue
// models; colours go over it here (colour.mjs, well under a second), kept in memory.
const made = new Map(); // name -> Promise<Buffer>
let mojulo = null, queue = Promise.resolve();
const onMojulo = (job) => (queue = queue.then(async () => job((mojulo ??= await connectMojulo()))));
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
    job.catch(() => made.delete(name)); // a failure is tried again on the next request
  }
  return made.get(name);
}
/** Starts making the models the scene needs, so they are ready, or nearly, when the headset asks. */
const warm = () => { for (const p of scene) modelFile(modelPath(p).slice('/catalog/'.length, -'.glb'.length))?.catch((e) => console.log(`  (could not make ${p.id}: ${e.message.slice(0, 200)})`)); };
const MAX_BODY = 16 * 1024 * 1024;

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

async function turn(req, res) {
  const body = await readJson(req);
  const t0 = Date.now();
  if (body.room?.items?.length) rooms.scanned = body.room; // the real room, as the headset reads it now
  // the headset hears first (/api/hear) and sends the words here; typed text skips transcription too
  const said = typeof body.text === 'string' && body.text.trim() ? body.text.trim() : await transcribe(Buffer.from(body.audio ?? '', 'base64'), keywordsFor(body.room));
  const heardMs = Date.now() - t0;
  if (!said) return send(res, 200, { said: '', reply: '', scene: sceneJson(), room: roomJson(), note: 'heard nothing' });
  const room = designRoom(body.room?.viewer ?? null);
  const { reply, calls, actions } = await runTurn({ said, pointing: resolvePointing(body.pointing, room), room });
  console.log(`\n> ${said}${body.pointing ? `   (pointing at ${body.pointing.id ?? body.pointing.target})` : ''}`);
  for (const c of calls) console.log(`  ${c.name} ${JSON.stringify(c.args)} -> ${c.result.error ?? (c.result.piece ? `${c.result.piece.id} at ${c.result.piece.at}` : 'ok')}${c.result.issues?.length ? `  [${c.result.issues.join('; ')}]` : ''}`);
  console.log(`< ${reply}   [${heardMs} ms to hear, ${Date.now() - t0 - heardMs} ms to answer]`);
  warm(); // a piece in another material starts on mojulo now, while the reply is spoken
  const voice = body.voice ? await speak(reply) : null;
  send(res, 200, { said, reply, scene: sceneJson(), room: roomJson(), actions, ...(voice ? { voice: voice.toString('base64') } : {}) });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
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
      const laid = placeLayout(designRoom());
      console.log(`\n(headset ${fresh ? 'started' : 'reloaded its room'}: ${body.room?.items?.length ?? 0} things scanned; designing in the ${rooms.source} room${laid ? `; the designed layout stands in it: ${laid.join(', ')}` : ''})`);
      return send(res, 200, { scene: sceneJson(), room: roomJson() });
    }
    // the first half of a turn: only the words, back as soon as they are heard, so the headset can show them while
    // Muse thinks (the second half is /api/turn with { text })
    if (req.method === 'POST' && url.pathname === '/api/hear') {
      const body = await readJson(req);
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
    if (req.method === 'POST' && url.pathname === '/api/turn') return await turn(req, res);
    send(res, 404, { error: 'not found' });
  } catch (e) {
    console.error(`! ${e.message}`);
    send(res, 500, { error: e.message });
  }
});

server.keepAliveTimeout = 65000;

server.listen(PORT, '127.0.0.1', () => {
  console.log(`furnish server on http://localhost:${PORT}  model ${config.model} (reasoning ${config.effort})  key ${config.hasKey ? 'found' : 'MISSING (.env META_API_KEY=…)'}  speech-to-text ${sttStatus()}  voice ${voiceStatus()}`);
  console.log(`catalogue: ${catalogList.map((c) => c.id).join(', ')}`);
  console.log(`headset: adb reverse tcp:${PORT} tcp:${PORT}, then open Maison3D Furnish`);
});
