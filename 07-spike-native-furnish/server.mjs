// Spike 07: the laptop side of furnishing by voice. The headset app posts a turn (audio, pointing, room) to
// /api/turn over `adb reverse tcp:8091 tcp:8091`; this transcribes it, asks the model, and answers with the words it
// heard, a reply to read aloud and the whole furnished scene. It also serves the catalogue's models (/catalog/<id>.glb)
// and the scene on its own (/api/scene). Loopback only: the API key and the scene stay on this machine.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, runTurn, scene, catalog, catalogList } from './agent.mjs';
import { transcribe, sttStatus } from './stt.mjs';
import { speak, voiceStatus } from './voice.mjs';

const PORT = Number(process.env.PORT) || 8091;
const CATALOG = join(dirname(fileURLToPath(import.meta.url)), 'catalog');
const sceneJson = () => scene.map((p) => ({ id: p.id, item: p.item, at: p.at, facing: p.facing }));
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
  // typed text (for trying it without speaking) skips transcription
  // bias the words toward this room and this catalogue: table, storage, sofa, armchair, rug…
  const keywords = [...new Set([...catalogList.flatMap((c) => c.words ?? [c.id.replace('-', ' '), c.name]), ...(body.room?.items ?? []).map((i) => i.label)])];
  const said = typeof body.text === 'string' && body.text.trim() ? body.text.trim() : await transcribe(Buffer.from(body.audio ?? '', 'base64'), keywords);
  const heardMs = Date.now() - t0;
  if (!said) return send(res, 200, { said: '', reply: '', scene: sceneJson(), note: 'heard nothing' });
  const { reply, calls, actions } = await runTurn({ said, pointing: body.pointing, room: body.room });
  console.log(`\n> ${said}${body.pointing ? `   (pointing at ${body.pointing.id ?? body.pointing.target})` : ''}`);
  for (const c of calls) console.log(`  ${c.name} ${JSON.stringify(c.args)} -> ${c.result.error ?? (c.result.piece ? `${c.result.piece.id} at ${c.result.piece.at}` : 'ok')}${c.result.issues?.length ? `  [${c.result.issues.join('; ')}]` : ''}`);
  console.log(`< ${reply}   [${heardMs} ms to hear, ${Date.now() - t0 - heardMs} ms to answer]`);
  const voice = body.voice ? await speak(reply) : null;
  send(res, 200, { said, reply, scene: sceneJson(), actions, ...(voice ? { voice: voice.toString('base64') } : {}) });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true, model: config.model, key: config.hasKey, stt: sttStatus(), voice: voiceStatus(), catalog: catalogList.map((c) => c.id) });
    if (req.method === 'GET' && url.pathname === '/api/scene') return send(res, 200, { scene: sceneJson() });
    if (req.method === 'POST' && url.pathname === '/api/clear') { scene.length = 0; console.log('\n(cleared from the headset)'); return send(res, 200, { scene: [] }); }
    if (req.method === 'GET' && url.pathname.startsWith('/catalog/')) {
      const id = decodeURIComponent(url.pathname.slice('/catalog/'.length)).replace(/\.glb$/, '');
      if (!catalog[id]) return send(res, 404, { error: `no catalogue item ${id}` });
      const glb = await readFile(join(catalog[id].dir ?? CATALOG, catalog[id].file));
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
