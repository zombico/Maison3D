#!/usr/bin/env node
// The agent's side of the loop. Every command but `serve` talks to the running server, found through
// .state/server.json, so the agent never handles the token.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STATE_DIR, serve } from './server.mjs';

const USAGE = `maison3d loop (spike 01)

  serve [--https]          start the server (keep it running in the background)
  url                      the address to open in the headset
  listen [--wait 50]       wait for the next thing said in the headset; prints it as JSON
  set key=value …          change the cube: color=red  size=0.3  at=0,1.1,-1.5  spin=on|off
  set --json '{…}'         the same as JSON: { "color", "size", "position": [x, y, z], "spin" }
  reply "text"             say something back: shown and read aloud in the headset
  state                    the scene and the room as the headset reported it

Coordinates are metres, y up, the floor at y = 0, -z forward from where the headset entered AR.`;

function server() {
  try {
    return JSON.parse(readFileSync(join(STATE_DIR, 'server.json'), 'utf8'));
  } catch {
    throw new Error('the server has not been started: run `cli.mjs serve` first (in the background)');
  }
}

async function api(method, path, body) {
  const { api: base, token } = server();
  let res;
  try {
    res = await fetch(base + path, {
      method,
      headers: { 'x-maison-token': token, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(`the server at ${base} is not answering: start it with \`cli.mjs serve\``);
  }
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? res.status);
  return json;
}

function parseSet(args) {
  const i = args.indexOf('--json');
  if (i >= 0) return JSON.parse(args[i + 1]);
  const patch = {};
  for (const arg of args) {
    const [key, ...rest] = arg.split('=');
    const value = rest.join('=');
    if (key === 'color') patch.color = value;
    else if (key === 'size') patch.size = Number(value);
    else if (key === 'at' || key === 'position') patch.position = value.split(',').map(Number);
    else if (key === 'spin') patch.spin = ['on', 'true', 'yes', '1'].includes(value);
    else throw new Error(`unknown setting "${arg}"`);
  }
  return patch;
}

const [cmd, ...args] = process.argv.slice(2);
try {
  if (cmd === 'serve') {
    serve({ https: args.includes('--https') });
  } else if (cmd === 'url') {
    console.log(server().urls.join('\n'));
  } else if (cmd === 'listen') {
    const i = args.indexOf('--wait');
    const wait = i >= 0 ? Number(args[i + 1]) : 50;
    const { said, scene } = await api('GET', `/api/next?wait=${wait}`);
    console.log(JSON.stringify(said
      ? { said: said.text, pointing: said.pointing, cube: scene.cube, room: scene.room?.objects ?? null,
          next: 'do what they asked (set), answer briefly (reply), then listen again' }
      : { said: null, next: 'nothing said yet: run listen again' }, null, 1));
  } else if (cmd === 'set') {
    const { scene } = await api('POST', '/api/set', parseSet(args));
    console.log(JSON.stringify({ ok: true, cube: scene.cube }));
  } else if (cmd === 'reply') {
    await api('POST', '/api/reply', { text: args.join(' ') });
    console.log(JSON.stringify({ ok: true }));
  } else if (cmd === 'state') {
    console.log(JSON.stringify(await api('GET', '/api/state'), null, 1));
  } else {
    console.log(USAGE);
    if (cmd && cmd !== 'help') process.exitCode = 1;
  }
} catch (e) {
  console.error(`error: ${e.message}`);
  process.exitCode = 1;
}
