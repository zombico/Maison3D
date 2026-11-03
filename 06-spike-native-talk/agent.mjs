// Spike 06, the agent's side: one turn of "you said this, pointing there" becomes a change to the cube and a short
// reply, through the Meta Model API (OpenAI-style chat completions with tools). No agent in the loop: the model
// itself decides, and this file only checks and applies what it asked for.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// META_API_KEY and friends, from the environment or a .env next to this file or at the repository root (both are
// ignored by git). The key never goes to the headset.
for (const p of [join(here, '.env'), join(here, '..', '.env')]) {
  try { process.loadEnvFile(p); } catch {}
}

export const config = {
  base: (process.env.META_API_BASE || 'https://api.meta.ai/v1').replace(/\/$/, ''),
  model: process.env.MAISON_MODEL || 'muse-spark-1.3',
  hasKey: !!process.env.META_API_KEY,
};

const SYSTEM = `You furnish a real room, seen through a Quest headset in passthrough. In this test the only thing you
can change is one cube. Each turn tells you what the person said, what their right controller pointed at when they
let go of the button, the cube as it is, and the room: walls, frames and furniture with an id (table1, wall2…),
label, centre, size and top, in metres, y up, the floor at floorY.

Change the cube only by calling set_cube. To put it on a piece of furniture, pass that item's id as "on". For
"here" or "there", use at_pointing. Colours are #rrggbb. Sizes are the cube's edge in metres; "small" is about 0.1,
"big" about 0.5. If the request is unclear or impossible, change nothing and say why.

Then answer in one short spoken sentence: it is read aloud in the headset. No markdown, no lists.`;

const TOOLS = [{
  type: 'function',
  function: {
    name: 'set_cube',
    description: 'Change the cube. Leave out what should stay as it is.',
    parameters: {
      type: 'object',
      properties: {
        color: { type: 'string', description: 'as #rrggbb' },
        size: { type: 'number', description: 'edge length in metres, 0.03 to 2' },
        on: { type: 'string', description: 'id of a room item (e.g. table1): the cube rests on its top, at its centre' },
        at_pointing: { type: 'boolean', description: 'put the cube where the person pointed' },
        at: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: 'centre of the cube, x y z in metres' },
        spin: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
}];

const round = (v) => Math.round(v * 1000) / 1000;

/** Applies set_cube's arguments to `cube`; returns { cube } or { error } for the model to read. */
export function setCube(cube, args, room, pointing) {
  const next = { ...cube };
  if (args.size !== undefined) {
    if (typeof args.size !== 'number' || !(args.size >= 0.03 && args.size <= 2)) return { error: 'size must be 0.03 to 2 metres' };
    next.size = args.size;
  }
  if (args.color !== undefined) {
    if (!/^#[0-9a-f]{6}$/i.test(args.color)) return { error: 'color must be #rrggbb' };
    next.color = args.color.toLowerCase();
  }
  if (args.spin !== undefined) next.spin = !!args.spin;

  const half = next.size / 2;
  if (args.on) {
    const items = room?.items ?? [];
    const want = String(args.on).toLowerCase().replace(/\s+/g, '');
    const item = items.find((i) => i.id.toLowerCase() === want) ?? items.find((i) => i.label.replace(/\s+/g, '') === want);
    if (!item) return { error: `no room item "${args.on}"; the ids are ${items.map((i) => i.id).join(', ') || 'none (no room loaded)'}` };
    next.at = [item.center[0], item.top + half, item.center[2]].map(round);
  } else if (args.at_pointing) {
    const p = pointing?.point;
    if (!p) return { error: 'the person was not pointing at anything in the room' };
    const n = pointing.normal ?? [0, 1, 0];
    // on a floor or table top it sits on the surface; on a wall it sits against it
    next.at = (n[1] > 0.7 ? [p[0], p[1] + half, p[2]] : [p[0] + n[0] * half, p[1] + n[1] * half, p[2] + n[2] * half]).map(round);
  } else if (args.at !== undefined) {
    if (!Array.isArray(args.at) || args.at.length !== 3 || !args.at.every(Number.isFinite)) return { error: 'at must be [x, y, z]' };
    next.at = args.at.map(round);
  } else if (args.size !== undefined && cube.at && room?.floorY !== undefined) {
    // resizing something that was resting on a surface keeps it resting there
    next.at = [cube.at[0], round(cube.at[1] - cube.size / 2 + half), cube.at[2]];
  }
  return { cube: next };
}

async function chat(messages) {
  if (!config.hasKey) throw new Error('no META_API_KEY: put it in .env at the repository root');
  const res = await fetch(`${config.base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.META_API_KEY}` },
    body: JSON.stringify({ model: config.model, messages, tools: TOOLS, tool_choice: 'auto' }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Meta Model API said ${res.status}: ${text.slice(0, 300)}`);
  const json = JSON.parse(text);
  const msg = json.choices?.[0]?.message;
  if (!msg) throw new Error(`unexpected answer: ${text.slice(0, 300)}`);
  return msg;
}

const history = []; // earlier turns, as plain text, so "make it bigger" knows what "it" is

/** One turn: returns { reply, cube, calls }. */
export async function runTurn({ said, pointing, room, cube }) {
  const context = JSON.stringify({ said, pointing: pointing ?? null, cube, room });
  const messages = [{ role: 'system', content: SYSTEM }, ...history, { role: 'user', content: context }];
  let state = cube;
  const calls = [];
  for (let round = 0; round < 4; round++) {
    const msg = await chat(messages);
    messages.push(msg);
    if (!msg.tool_calls?.length) {
      const reply = (typeof msg.content === 'string' ? msg.content : '').trim();
      history.push({ role: 'user', content: `said: ${said}` }, { role: 'assistant', content: reply || '(no reply)' });
      while (history.length > 20) history.shift();
      return { reply, cube: state, calls };
    }
    for (const call of msg.tool_calls) {
      let result;
      try {
        const args = JSON.parse(call.function?.arguments || '{}');
        result = call.function?.name === 'set_cube' ? setCube(state, args, room, pointing) : { error: `no tool ${call.function?.name}` };
        calls.push({ name: call.function?.name, args, result });
      } catch (e) {
        result = { error: `bad arguments: ${e.message}` };
      }
      if (result.cube) state = result.cube;
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  return { reply: 'I got stuck changing the cube.', cube: state, calls };
}

/** Spike 05's scan format to the headset's room description, for trying turns without the headset. */
export function roomFromScan(scan, floorBelow = 1.5) {
  const counts = {};
  const items = [];
  const lower = (y) => y < floorBelow;
  let floorY;
  const add = (label, min, max) => {
    const key = label.replace(/\s+/g, '');
    counts[key] = (counts[key] ?? 0) + 1;
    items.push({ id: `${key}${counts[key]}`, label, center: min.map((v, i) => round((v + max[i]) / 2)), size: min.map((v, i) => round(max[i] - v)), top: round(max[1]) });
  };
  for (const p of scan.planes) {
    const ys = p.world.map((w) => w[1]);
    if (!lower(Math.min(...ys))) continue;
    if (p.label === 'floor') floorY = p.pose.position[1];
    if (scan.meshes.some((m) => m.id === p.id)) continue; // furniture: its volume says more
    const min = [0, 1, 2].map((i) => Math.min(...p.world.map((w) => w[i])));
    const max = [0, 1, 2].map((i) => Math.max(...p.world.map((w) => w[i])));
    add(p.label, min, max);
  }
  for (const m of scan.meshes) {
    if (m.label === 'global mesh' || !lower(m.worldBox.min[1])) continue;
    add(m.label, m.worldBox.min, m.worldBox.max);
  }
  return { loaded: true, floorY, items };
}

export function sampleRoom() {
  return roomFromScan(JSON.parse(readFileSync(join(here, '..', '05-spike-native-scan', 'samples', 'two-rooms-quest3s.json'), 'utf8')));
}
