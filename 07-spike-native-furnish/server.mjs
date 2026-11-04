// Spike 07: the laptop side of furnishing by voice. The headset app posts a turn (audio, pointing, room) to
// /api/turn over `adb reverse tcp:8091 tcp:8091`; this transcribes it, asks the model, and answers with the words it
// heard, a reply to read aloud and the whole furnished scene. It also serves the catalogue's models (/catalog/<id>.glb)
// and the scene on its own (/api/scene). Loopback only: the API key and the scene stay on this machine.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, runTurn, scene, catalog, catalogList, modelPath, parseModel, paint } from './agent.mjs';
import { paintPanels } from './paint.mjs';
import { recolour } from '../70-inventory/colour.mjs';
import { connect as connectMojulo } from '../mojulo/client.mjs';
import { transcribe, sttStatus } from './stt.mjs';
import { speak, voiceStatus } from './voice.mjs';

const PORT = Number(process.env.PORT) || 8091;
const CATALOG = join(dirname(fileURLToPath(import.meta.url)), 'catalog');
const sceneJson = () => scene.map((p) => ({ id: p.id, item: p.item, at: p.at, facing: p.facing, model: modelPath(p) }));
// the painted walls as panels, worked out against the room the headset last described
let lastRoom = null;
const paintJson = () => (lastRoom ? paintPanels(lastRoom, paint) : []);

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
  const { item, materials, colours } = parseModel(name);
  if (!catalog[item]) return null;
  if (!made.has(name)) {
    const job = (async () => {
      const glb = Object.keys(materials).length ? await rebuilt(item, materials) : await readFile(join(catalog[item].dir ?? CATALOG, catalog[item].file));
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
  if (body.room?.items?.length) lastRoom = body.room; // the paint is cut to the room as it is now
  // typed text (for trying it without speaking) skips transcription
  // bias the words toward this room and this catalogue: table, storage, sofa, armchair, rug…
  const keywords = [...new Set([...catalogList.flatMap((c) => c.words ?? [c.id.replace('-', ' '), c.name]), ...(body.room?.items ?? []).map((i) => i.label)])];
  const said = typeof body.text === 'string' && body.text.trim() ? body.text.trim() : await transcribe(Buffer.from(body.audio ?? '', 'base64'), keywords);
  const heardMs = Date.now() - t0;
  if (!said) return send(res, 200, { said: '', reply: '', scene: sceneJson(), paint: paintJson(), note: 'heard nothing' });
  const { reply, calls, actions } = await runTurn({ said, pointing: body.pointing, room: body.room });
  console.log(`\n> ${said}${body.pointing ? `   (pointing at ${body.pointing.id ?? body.pointing.target})` : ''}`);
  for (const c of calls) console.log(`  ${c.name} ${JSON.stringify(c.args)} -> ${c.result.error ?? (c.result.piece ? `${c.result.piece.id} at ${c.result.piece.at}` : 'ok')}${c.result.issues?.length ? `  [${c.result.issues.join('; ')}]` : ''}`);
  console.log(`< ${reply}   [${heardMs} ms to hear, ${Date.now() - t0 - heardMs} ms to answer]`);
  warm(); // a piece in another material starts on mojulo now, while the reply is spoken
  const voice = body.voice ? await speak(reply) : null;
  send(res, 200, { said, reply, scene: sceneJson(), paint: paintJson(), actions, ...(voice ? { voice: voice.toString('base64') } : {}) });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true, model: config.model, key: config.hasKey, stt: sttStatus(), voice: voiceStatus(), catalog: catalogList.map((c) => c.id) });
    if (req.method === 'GET' && url.pathname === '/api/scene') return send(res, 200, { scene: sceneJson(), paint: paintJson() });
    if (req.method === 'POST' && url.pathname === '/api/clear') { scene.length = 0; console.log('\n(cleared from the headset)'); return send(res, 200, { scene: [] }); }
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
