// Spike 06: the laptop side of talking to the room. The headset app posts a turn (audio, pointing, room, cube) to
// /api/turn over `adb reverse tcp:8091 tcp:8091`; this transcribes it, asks the model, and answers with the words it
// heard, a reply to read aloud and the cube's new state. Loopback only: the API key stays on this machine.
import http from 'node:http';
import { config, runTurn } from './agent.mjs';
import { transcribe, sttStatus } from './stt.mjs';

const PORT = Number(process.env.PORT) || 8091;
const MAX_BODY = 16 * 1024 * 1024;

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
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
  const said = typeof body.text === 'string' && body.text.trim() ? body.text.trim() : await transcribe(Buffer.from(body.audio ?? '', 'base64'));
  const heardMs = Date.now() - t0;
  if (!said) return send(res, 200, { said: '', reply: '', cube: body.cube, note: 'heard nothing' });
  const { reply, cube, calls } = await runTurn({ said, pointing: body.pointing, room: body.room, cube: body.cube });
  console.log(`\n> ${said}${body.pointing ? `   (pointing at ${body.pointing.id ?? body.pointing.target})` : ''}`);
  for (const c of calls) console.log(`  ${c.name} ${JSON.stringify(c.args)} -> ${c.result.error ?? 'ok'}`);
  console.log(`< ${reply}   [${heardMs} ms to hear, ${Date.now() - t0 - heardMs} ms to answer]`);
  send(res, 200, { said, reply, cube });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true, model: config.model, key: config.hasKey, stt: sttStatus() });
    if (req.method === 'POST' && url.pathname === '/api/turn') return await turn(req, res);
    send(res, 404, { error: 'not found' });
  } catch (e) {
    console.error(`! ${e.message}`);
    send(res, 500, { error: e.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`talk server on http://localhost:${PORT}  model ${config.model}  key ${config.hasKey ? 'found' : 'MISSING (.env META_API_KEY=…)'}  speech-to-text ${sttStatus()}`);
  console.log(`headset: adb reverse tcp:${PORT} tcp:${PORT}, then open Maison3D Talk`);
});
