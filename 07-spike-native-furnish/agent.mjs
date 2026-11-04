// Spike 07, the agent's side: a spoken turn becomes changes to the furnished scene through the Meta Model API
// (chat completions with tools). The model picks catalogue pieces and says where they go in the room's own words;
// place.mjs turns that into positions and checks the fit; this file applies it. The scene lives here, on the laptop.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolve, check, pointedPiece, walls } from './place.mjs';
import { resolve as resolvePath } from 'node:path';
import { frameOf, toWorld, dirToWorld, FT } from '../08-spike-mojulo-furnish/toMojulo.mjs';
import { linearOf } from '../70-inventory/colour.mjs';

const here = dirname(fileURLToPath(import.meta.url));

for (const p of [join(here, '.env'), join(here, '..', '.env')]) {
  try { process.loadEnvFile(p); } catch {}
}

export const config = {
  base: (process.env.META_API_BASE || 'https://api.meta.ai/v1').replace(/\/$/, ''),
  model: process.env.MAISON_MODEL || 'muse-spark-1.3',
  effort: process.env.MAISON_EFFORT || 'minimal',
  hasKey: !!process.env.META_API_KEY,
};

export const catalogList = JSON.parse(readFileSync(join(here, 'catalog', 'catalog.json'), 'utf8'));
export const catalog = Object.fromEntries(catalogList.map((c) => [c.id, c]));

// More pieces (70-inventory's catalog.json, built by its build.mjs): they join the six, served from beside that file.
if (process.env.MAISON_CATALOG) {
  const path = resolvePath(process.env.MAISON_CATALOG);
  const more = JSON.parse(readFileSync(path, 'utf8'));
  for (const c of more.catalog ?? more) {
    if (c.issues?.length) continue; // a piece that failed its checks stays out
    const entry = { ...c, dir: dirname(path) };
    catalog[c.id] = entry;
    catalogList.push(entry);
  }
}

// A designed layout (spike 08: mojulo's design_interior, split into pieces): its pieces join the catalogue, and its
// scene waits, in the room's own terms, until a turn brings the room's walls to place it by.
let pendingLayout = null;
if (process.env.MAISON_LAYOUT) {
  const path = resolvePath(process.env.MAISON_LAYOUT);
  const layout = JSON.parse(readFileSync(path, 'utf8'));
  for (const c of layout.catalog) {
    const entry = { ...c, dir: dirname(path) };
    catalog[c.id] = entry;
    catalogList.push(entry);
  }
  pendingLayout = layout;
}

const SYSTEM = `You furnish a real room, seen through a Quest headset in passthrough, with pieces from a catalogue.
Each turn tells you what the person said, what their right controller pointed at when they let go of the button
(a room surface, and the placed piece it hit if any), where they stand, the room (walls, frames and real furniture
with ids such as table1 or wall2, label, centre, size, top; walls carry the way they face) and the pieces already
placed (ids such as sofa1).

Catalogue (width x height x depth in metres; fronts face the way they are turned):
${catalogList.map((c) => `- ${c.id}: ${c.name}, ${c.size.join(' x ')}${c.note ? ` (${c.note})` : ''}${c.parts && Object.keys(c.parts).length ? `; parts ${Object.entries(c.parts).map(([k, v]) => `${k} ${v}`).join(', ')}` : ''}`).join('\n')}

Change the scene only with the tools. Say where a piece goes the way the person would: on an item, against a wall,
next to something (left, right, front, behind as the person sees it), where they pointed, in front of them, or as
x, z coordinates when nothing else fits. "This" or "that" usually means the pointed piece. A tool's result says
where the piece ended up and anything it runs into; if it overlaps real furniture, move it or say so. Pieces only
come from the catalogue; if asked for something it does not have, say what is closest. A piece's listed parts can be
recoloured (the sofa's fabric, a table's wood, a dresser's body): pick the colour as a hex the person would recognise
for what they said ("sage green", "darker wood", "white"), and say it in words, never as a hex.

Answer in one short spoken sentence: it is read aloud in the headset. No markdown, no lists. When you call tools,
write that sentence in the same message as the calls, saying what you did.`;

const WHERE = {
  on: { type: 'string', description: 'id of a room item or placed piece to stand it on (a lamp on table1)' },
  against: { type: 'string', description: 'id of a wall to stand it against, back to the wall' },
  next_to: { type: 'string', description: 'id of a room item or placed piece to stand it beside' },
  side: { type: 'string', enum: ['left', 'right', 'front', 'behind'], description: 'with next_to, as the person sees it' },
  at_pointing: { type: 'boolean', description: 'where the person pointed: on that floor or surface, or against that wall' },
  in_front: { type: 'boolean', description: 'in front of the person, on the floor' },
  at: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 3, description: '[x, z] on the floor, or [x, y, z]' },
  face: { type: 'string', description: '"me", "away", or an id to face; default: as the placement implies, else the person' },
  turn: { type: 'number', description: 'then turn it by this many degrees, anticlockwise seen from above (90 = a quarter turn left)' },
};

const TOOLS = [
  { type: 'function', function: { name: 'place', description: 'Add a catalogue piece to the room.', parameters: { type: 'object', properties: { item: { type: 'string', enum: catalogList.map((c) => c.id) }, ...WHERE }, required: ['item'], additionalProperties: false } } },
  { type: 'function', function: { name: 'move', description: 'Move or turn a placed piece. Give only `face` or `turn` to turn it where it stands.', parameters: { type: 'object', properties: { id: { type: 'string' }, ...WHERE }, required: ['id'], additionalProperties: false } } },
  { type: 'function', function: { name: 'swap', description: 'Replace a placed piece with another catalogue item, keeping its place and facing.', parameters: { type: 'object', properties: { id: { type: 'string' }, item: { type: 'string', enum: catalogList.map((c) => c.id) } }, required: ['id', 'item'], additionalProperties: false } } },
  { type: 'function', function: { name: 'recolour', description: "Change the colour of one part of a placed piece (its catalogue entry lists its parts and their colours now). Without `part`, the piece's first part (the sofa's fabric, the dresser's body).", parameters: { type: 'object', properties: { id: { type: 'string' }, part: { type: 'string', description: 'fabric, wood, body, seat, handles, throw, pillows or mattress, as the piece lists' }, colour: { type: 'string', description: '#rrggbb, or "original" to go back to the catalogue colour' } }, required: ['id', 'colour'], additionalProperties: false } } },
  { type: 'function', function: { name: 'rescan_room', description: "Have the headset rescan the room (Meta's Space Setup), when the person asks or the room looks wrong: walls missing, furniture not found.", parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  { type: 'function', function: { name: 'remove', description: 'Take a placed piece away, or every piece with id "all".', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false } } },
];

/** The furnished scene: [{ id, item, at, facing, colours? }]; `colours` are the parts recoloured ({ fabric: '#5f7a5a' }). */
export const scene = [];

function newId(item) {
  let n = 1;
  while (scene.some((p) => p.id === `${item}${n}`)) n++;
  return `${item}${n}`;
}

const describe = (p) => ({ id: p.id, item: p.item, at: p.at, facing: p.facing, size: catalog[p.item].size, ...(catalog[p.item].parts ? { parts: { ...catalog[p.item].parts, ...p.colours } } : {}) });

/** The model the headset loads for a piece: the catalogue's, or the same in the piece's colours (server.mjs makes it). */
export function modelPath(p) {
  const c = Object.entries(p.colours ?? {}).sort(([a], [b]) => a.localeCompare(b));
  return `/catalog/${encodeURIComponent(p.item)}${c.map(([k, v]) => `~${k}-${v.slice(1).toLowerCase()}`).join('')}.glb`;
}

/** `item~fabric-5f7a5a~wood-222222` -> { item, colours }, as modelPath writes it. */
export function parseModel(name) {
  const [item, ...rest] = name.split('~');
  return { item, colours: Object.fromEntries(rest.map((r) => { const [k, v] = r.split('-'); return [k, `#${v}`]; })) };
}

/** Runs one tool call against the scene; returns what the model reads back. */
export function apply(name, args, ctx) {
  const env = { ...ctx, scene, catalog };
  if (name === 'rescan_room') {
    ctx.actions?.push('rescan');
    return { ok: true, note: 'the headset is starting Space Setup; the person walks the room and the scan reloads after' };
  }
  if (name === 'remove') {
    if (args.id === 'all') { const n = scene.length; scene.length = 0; return { ok: true, removed: n }; }
    const i = scene.findIndex((p) => p.id === args.id);
    if (i < 0) return { error: `no piece ${args.id}; pieces are ${scene.map((p) => p.id).join(', ') || 'none'}` };
    scene.splice(i, 1);
    return { ok: true, removed: args.id };
  }
  if (name === 'recolour') {
    const p = scene.find((x) => x.id === args.id);
    if (!p) return { error: `no piece ${args.id}; pieces are ${scene.map((x) => x.id).join(', ') || 'none'}` };
    const parts = catalog[p.item].parts ?? {};
    const part = args.part ?? Object.keys(parts)[0];
    if (!part || !parts[part]) return { error: Object.keys(parts).length ? `${p.id} has no ${args.part}; its parts are ${Object.keys(parts).join(', ')}` : `${p.id} cannot be recoloured` };
    if (args.colour === 'original') { if (p.colours) delete p.colours[part]; }
    else if (!linearOf(args.colour)) return { error: `${args.colour} is not a colour: give #rrggbb` };
    else p.colours = { ...p.colours, [part]: args.colour.toLowerCase().replace(/^#?/, '#') };
    return { ok: true, piece: describe(p) };
  }
  if (name === 'swap') {
    const p = scene.find((x) => x.id === args.id);
    if (!p) return { error: `no piece ${args.id}` };
    if (!catalog[args.item]) return { error: `no catalogue item ${args.item}` };
    const was = p.id;
    p.item = args.item;
    // colours carry over to the parts the new piece also has
    if (p.colours) p.colours = Object.fromEntries(Object.entries(p.colours).filter(([k]) => catalog[p.item].parts?.[k]));
    p.id = newId(args.item); // the id says what it is: armchair1 swapped for a sofa becomes sofa1
    const issues = check(p, catalog[p.item].size, env);
    return { ok: true, replaced: was, piece: describe(p), issues };
  }
  if (name !== 'place' && name !== 'move') return { error: `no tool ${name}` };

  const current = name === 'move' ? scene.find((p) => p.id === args.id) : null;
  if (name === 'move' && !current) return { error: `no piece ${args.id}; pieces are ${scene.map((p) => p.id).join(', ') || 'none'}` };
  const item = current ? current.item : args.item;
  if (!catalog[item]) return { error: `no catalogue item ${item}` };
  const where = { ...args };
  // only turning: stay put
  const placed = ['on', 'against', 'next_to', 'at_pointing', 'in_front', 'at'].some((k) => where[k] !== undefined && where[k] !== false);
  const pose = placed || !current ? resolve(where, catalog[item], { ...env, current }) : resolve({ ...where, at: current.at }, catalog[item], { ...env, current });
  if (pose.error) return pose;
  const piece = current ?? { id: newId(item), item };
  piece.at = pose.at;
  piece.facing = pose.facing;
  if (!current) scene.push(piece);
  const issues = check(piece, catalog[item].size, env);
  return { ok: true, piece: describe(piece), issues };
}

async function chat(messages) {
  if (!config.hasKey) throw new Error('no META_API_KEY: put it in .env at the repository root');
  const res = await fetch(`${config.base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.META_API_KEY}` },
    body: JSON.stringify({ model: config.model, reasoning_effort: config.effort, messages, tools: TOOLS, tool_choice: 'auto' }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Meta Model API said ${res.status}: ${text.slice(0, 300)}`);
  const msg = JSON.parse(text).choices?.[0]?.message;
  if (!msg) throw new Error(`unexpected answer: ${text.slice(0, 300)}`);
  return msg;
}

const history = [];
function remember(said, reply) {
  history.push({ role: 'user', content: `said: ${said}` }, { role: 'assistant', content: reply || '(no reply)' });
  while (history.length > 20) history.shift();
}

/** Stands a pending layout in the room the headset just described; returns what it placed, or null. */
export function placeLayout(room) {
  if (!pendingLayout || walls(room).length < 4) return null;
  const f = frameOf(room);
  const FACE = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
  const placed = [];
  for (const p of pendingLayout.scene) {
    const c = toWorld(f, [p.plan[0] / FT, p.plan[1] / FT]);
    const d = dirToWorld(f, FACE[p.facing] ?? [0, 1]);
    const piece = { id: p.id, item: p.item, at: [c[0], f.floorY, c[1]].map((v) => Math.round(v * 1000) / 1000), facing: [d[0], 0, d[1]].map((v) => Math.round(v * 1000) / 1000) };
    scene.push(piece);
    placed.push(piece.id);
  }
  pendingLayout = null;
  return placed;
}

/** One turn: returns { reply, calls }; the scene is changed in place. */
export async function runTurn({ said, pointing, room }) {
  const laid = placeLayout(room);
  if (laid) console.log(`  (the designed layout stands in the room: ${laid.join(', ')})`);
  const pointed = pointedPiece(pointing, scene, catalog);
  const context = {
    said,
    pointing: pointing ? { ...pointing, ray: undefined, piece: pointed } : null,
    viewer: room?.viewer ?? null,
    room: { floorY: room?.floorY, items: (room?.items ?? []).filter((i) => i.label !== 'global mesh'), walls: walls(room).map((w) => ({ id: w.id, faces: w.n.map((v) => Math.round(v * 100) / 100) })) },
    pieces: scene.map(describe),
  };
  const messages = [{ role: 'system', content: SYSTEM }, ...history, { role: 'user', content: JSON.stringify(context) }];
  const calls = [];
  const actions = []; // things for the headset itself to do, such as rescanning
  for (let round = 0; round < 4; round++) {
    const msg = await chat(messages);
    messages.push(msg);
    const text = typeof msg.content === 'string' ? msg.content.trim() : '';
    if (!msg.tool_calls?.length) { remember(said, text); return { reply: text, calls, actions }; }
    let needsLook = false;
    for (const call of msg.tool_calls) {
      let result;
      try {
        const args = JSON.parse(call.function?.arguments || '{}');
        result = apply(call.function?.name, args, { room, pointing, actions });
        calls.push({ name: call.function?.name, args, result });
      } catch (e) {
        result = { error: `bad arguments: ${e.message}` };
      }
      if (result.error || result.issues?.some((i) => i.startsWith('overlaps'))) needsLook = true;
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
    // the reply came with the calls and they all landed cleanly: no second round trip
    if (text && !needsLook) { remember(said, text); return { reply: text, calls, actions }; }
  }
  return { reply: 'I got stuck arranging that.', calls, actions };
}
