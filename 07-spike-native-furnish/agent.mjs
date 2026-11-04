// Spike 07, the agent's side: a spoken turn becomes changes to the furnished scene through the Meta Model API
// (chat completions with tools). The model picks catalogue pieces and says where they go in the room's own words;
// place.mjs turns that into positions and checks the fit; this file applies it. The scene lives here, on the laptop.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolve, check, pointedPiece, walls, sizeOf, mountOf, ceilingOf, floorOf } from './place.mjs';
import { decorCatalog, decorModel, fitTo, customFit, CUSTOM_ART } from './decor.mjs';
import { FINISHES } from './appliances.mjs';
import { PIECES as INVENTORY_PIECES, COLLECTIONS } from '../70-inventory/catalogue.mjs';
import * as rooms from './rooms.mjs';
import { resolve as resolvePath } from 'node:path';
import { frameOf, toWorld, dirToWorld, FT } from '../08-spike-mojulo-furnish/toMojulo.mjs';
import { linearOf } from '../70-inventory/colour.mjs';
import { MATERIALS, PATTERNED, materialsOf } from '../70-inventory/recipes.mjs';
import { entry as mojuloEntry } from '../mojulo/server.mjs';
import { existsSync } from 'node:fs';

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

// Maison3D's own pieces (decor.mjs): houseplants, framed pictures, mirrors, curtains and blinds
for (const e of decorCatalog()) { catalog[e.id] = e; catalogList.push(e); }

// What each inventory piece's parts are made of, and its sizes: the same piece in its collection, smallest first (a
// loveseat is the sofa's smallest), so "a smaller one" is the next one down and keeps the piece's colours and materials.
const LADDER = { LOV: 'SOF' };
for (const c of catalogList) if (c.piece && c.collection && c.parts) c.made = materialsOf(c.piece, c.collection, Object.keys(c.parts));
const area = (c) => (c.listed ? c.listed[0] * c.listed[1] : c.size[0] * Math.max(c.size[1], c.size[2]));
export const sizesOf = (item) => {
  const c = catalog[item];
  if (!c?.piece) return [];
  const rung = LADDER[c.piece] ?? c.piece;
  return catalogList.filter((o) => o.collection === c.collection && (LADDER[o.piece] ?? o.piece) === rung).sort((a, b) => area(a) - area(b) || a.id.localeCompare(b.id));
};
export const mojuloReady = () => existsSync(mojuloEntry);

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

const SYSTEM = `You design a room with a person, in VR in a Quest headset: they stand in it at true size and furnish
it with pieces from a catalogue. The room is dictated by default: a rectangle whose size, height, doors and windows
the person says ("make it 4 by 5 metres", "ceiling 2.7", "a door on the wall behind me", "a window on the left wall");
its walls are wall-front, wall-right, wall-back and wall-left, named as the person saw them when the room appeared
(standing in the middle, facing wall-front). Take sizes in feet and inches too, and give the tools metres. It can be
the headset's scan of their real room instead, emptied of its furniture (use_room). Each turn tells you what the
person said, what their right controller pointed at when they let go of the button (a wall or the floor, and the
placed piece it hit if any), where they stand and which way they face, the room (its size and openings, and its walls,
door and window frames and floor with ids, centre, size, top; walls carry the way they face and their colour) and the
pieces already placed (ids such as sofa1). "Behind me", "on my left" and the like are from where they stand now.

The catalogue (${catalogList.length} pieces), one line a piece; sizes are width x depth in metres. An inventory piece's
id is COLLECTION-PIECE-SIZE (HIN-SOF-3-seat: the Hinoki sofa, 3-seat); the rest are listed by id. find searches it
all by words (sizes, colours, parts and notes come back with each hit); use it when unsure of an id.
${catalogIndex()}

How pieces sit: on the floor; rugs under everything; wall pieces (pictures, mirrors) hang on a wall at a height
(pictures centred about 1.45 m up, or 22 cm over the piece they are above); window pieces (curtains, blinds) are made
to fit the window they are put at; surface pieces (table lamps, vases, books, candles, cushions, small plants) go on
top of a piece ("on": the sideboard, the sofa), or the floor; ceiling pieces (pendants) hang from the ceiling over the
spot they are put at (over the dining table: at its x, z, or next_to it).

Materials a part can be made of: ${Object.entries(MATERIALS).map(([k, v]) => `${k}: ${v.join(', ')}`).join('; ')}.

Change the scene only with the tools. Say where a piece goes the way the person would: on an item, against a wall,
next to something (left, right, front, behind as the person sees it), where they pointed, in front of them, or as
x, z coordinates when nothing else fits. "This" or "that" usually means the pointed piece. A tool's result says
where the piece ended up and anything it runs into; if it runs into a wall, a door or another piece, move it or say so. Pieces only
come from the catalogue; if asked for something it does not have, say what is closest. A piece's listed parts can be
recoloured (the sofa's fabric, a table's wood, a dresser's body): pick the colour as a hex the person would recognise
for what they said ("sage green", "darker wood", "white"), and say it in words, never as a hex. A part can also be
made of another material (linen to velvet, oak to walnut); that rebuilds the piece and takes a few seconds to appear.
A smaller or larger one is the same piece in its next size (resize), keeping its colours and materials.
Curtains open and close (open: 1 drawn back, 0 closed); hung "high and wide" they start near the ceiling. Blinds: roller,
roman, cellular and zebra drop down; venetian, wood slat and vertical blinds raise (or draw) and tilt; plantation and
café shutters are fixed and their louvres tilt ("tilt the slats", "close the louvres": open with tilt).
Appliances and fixtures (fridges, ranges, dishwashers, hoods, washers and dryers, toilets, vanities, tubs, showers,
radiators, fans, a fireplace) come in their US sizes; an appliance's finish changes with material (stainless, white,
black, or panel-<collection> to match that collection's cabinets).
A picture of a size the person names ("a frame here that's 80 by 120", "a big canvas over the bed, 1.5 by 1") is
ART-FRAME (a framed print) or ART-CANVAS (a stretched canvas), placed with width and height in metres (the first number
is the width; convert centimetres and inches), and if they say so a style (${CUSTOM_ART.styles.join(', ')}), a palette
(${CUSTOM_ART.palettes.join(', ')}) and a frame (${CUSTOM_ART.frames.join(', ')}). picture changes one already up: another
picture, a style, a palette, a frame, its size.
The room can be painted (paint): a wall by id, every wall ("all"), the floor or the ceiling; "this wall" is usually
the pointed one, and "the wall behind the sofa" the wall it stands against. Change the room itself with room_size and
opening ("this should be a window" while pointing at a wall: opening add, kind window, at_pointing; "move this door
here": opening move at_pointing; a window's sill depth, recess, casing, panes and frame: opening move with just those,
so curtains and blinds fit it: curtain rods clear the sill and casing, blinds go inside a deep enough recess); pieces stay where they are, so after shrinking the room check what now runs into a wall. go_to takes the
person to stand somewhere ("take me to the window"). They can look at their real room again and come back to the
design (view), and in a scanned room show or hide the outlines of their real furniture (outlines).

The person can also grab a piece with their laser pointer and move it themselves; the scene says where it is now.

Answer in one short spoken sentence: it is read aloud in the headset. No markdown, no lists. When you call tools,
write that sentence in the same message as the calls, saying what you did.`;

/** The catalogue as one line per piece, for the prompt: its sizes and, for an inventory piece, its collections. */
export function catalogIndex() {
  const groups = new Map();
  for (const c of catalogList) { const k = c.piece ?? c.id; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); }
  // floor pieces by their footprint; wall and window pieces by their face (wide x high)
  const dims = (c) => (['wall', 'window'].includes(mountOf(c)) ? `${c.size[0]} wide x ${c.size[1]} high` : `${c.size[0]} x ${c.size[2]}`);
  const lines = [];
  for (const [k, cs] of groups) {
    const c = cs[0], mount = mountOf(c), how = mount === 'floor' ? '' : ` [${mount}]`;
    if (c.collection) {
      const name = INVENTORY_PIECES.find((p) => p.id === c.piece)?.name.toLowerCase() ?? c.name;
      const sizes = [...new Map(cs.map((x) => [x.sizeName, dims(x)])).entries()].map(([s, d]) => `${s} ${d}`).join(', ');
      lines.push(`- ${k} ${name}${how}: ${sizes}; in ${[...new Set(cs.map((x) => x.collection))].join(', ')}`);
    } else if (cs.length > 1) lines.push(`- ${c.name.split(',')[0]}${how}: ${cs.map((x) => `${x.id} ${dims(x)}`).join(', ')}`);
    else lines.push(`- ${c.id}: ${c.name}${how}, ${dims(c)}${c.note ? ` (${c.note})` : ''}`);
  }
  const cols = COLLECTIONS.filter((col) => catalogList.some((c) => c.collection === col.code)).map((col) => `${col.code} ${col.name} (${col.card})`);
  return `${lines.join('\n')}${cols.length ? `\nCollections: ${cols.join(', ')}.` : ''}`;
}

/** Catalogue pieces matching `query`'s words (and the filters), best first. */
export function findPieces({ query = '', kind, mount, collection, room, max = 12 } = {}) {
  const words = String(query).toLowerCase().split(/[^a-z0-9-]+/).filter((w) => w.length > 1);
  const hits = [];
  for (const c of catalogList) {
    if (kind && c.kind !== kind) continue;
    if (mount && mountOf(c) !== mount) continue;
    if (collection && c.collection !== collection) continue;
    if (room && c.room && c.room !== room) continue;
    // a collection's style and its colours count too ("emerald velvet" finds Fête)
    const col = COLLECTIONS.find((x) => x.code === c.collection), cm = col?.mojulo;
    const text = [c.id, c.name, c.note, c.kind, c.room, c.sizeName, ...(c.words ?? []), col?.name, col?.card, cm?.fabric?.warp, cm?.accent?.warp, cm?.fabric?.preset, cm?.accent?.preset, cm?.timber, ...Object.keys(c.parts ?? {}), ...Object.values(c.made ?? {})].filter(Boolean).join(' ').toLowerCase();
    const score = words.reduce((s, w) => s + (text.includes(w) ? (w.length > 3 ? 2 : 1) : 0), 0);
    if (!words.length || score) hits.push([score, c]);
  }
  return hits.sort((a, b) => b[0] - a[0] || a[1].id.localeCompare(b[1].id)).slice(0, max).map(([, c]) => ({ id: c.id, name: c.name, size: c.size, mount: mountOf(c), ...(c.note ? { note: c.note } : {}), ...(c.parts ? { parts: c.parts } : {}) }));
}

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
  centre_height: { type: 'number', description: "a wall piece's centre above the floor, metres (pictures hang about 1.45)" },
  above: { type: 'string', description: 'a wall piece: hang it over this piece (art above the sofa), on the wall behind it' },
  window: { type: 'string', description: 'a window piece (curtains, blinds): the window id it hangs at' },
  high: { type: 'boolean', description: 'curtains hung high and wide, near the ceiling' },
  drop: { type: 'string', enum: ['floor', 'sill'], description: 'curtains to the floor (default) or to the sill' },
  open: { type: 'number', description: 'curtains: 1 drawn back (default), 0 closed; blinds: 1 raised, 0 down' },
  inside: { type: 'boolean', description: 'a blind inside the window recess (true) or over its casing (false); default inside when the recess is deep enough' },
  tilt: { type: 'number', description: 'slats, vanes and louvres: 1 open (flat), 0 closed' },
  width: { type: 'number', description: 'ART-FRAME or ART-CANVAS: its width in metres' },
  height: { type: 'number', description: 'ART-FRAME or ART-CANVAS: its height in metres' },
  style: { type: 'string', enum: CUSTOM_ART.styles, description: "ART-FRAME or ART-CANVAS: the abstract's style" },
  palette: { type: 'string', enum: CUSTOM_ART.palettes, description: "ART-FRAME or ART-CANVAS: the abstract's colours" },
  frame: { type: 'string', enum: CUSTOM_ART.frames, description: 'ART-FRAME: the frame' },
};

const TOOLS = [
  { type: 'function', function: { name: 'find', description: 'Search the catalogue by words (a kind, a style, a colour, a size, a collection): the best matches with their ids, sizes and how they sit.', parameters: { type: 'object', properties: { query: { type: 'string' }, mount: { type: 'string', enum: ['floor', 'rug', 'wall', 'window', 'ceiling', 'surface'] }, max: { type: 'number' } }, required: ['query'], additionalProperties: false } } },
  { type: 'function', function: { name: 'place', description: 'Add a catalogue piece to the room, by its id.', parameters: { type: 'object', properties: { item: { type: 'string' }, ...WHERE }, required: ['item'], additionalProperties: false } } },
  { type: 'function', function: { name: 'picture', description: 'Change a placed ART-FRAME or ART-CANVAS: another picture (another: true), its style, palette or frame, or its size (it keeps its centre).', parameters: { type: 'object', properties: { id: { type: 'string' }, another: { type: 'boolean' }, style: { type: 'string', enum: CUSTOM_ART.styles }, palette: { type: 'string', enum: CUSTOM_ART.palettes }, frame: { type: 'string', enum: CUSTOM_ART.frames }, width: { type: 'number' }, height: { type: 'number' } }, required: ['id'], additionalProperties: false } } },
  { type: 'function', function: { name: 'open', description: 'Open or close placed curtains or blinds (amount: 1 drawn back or raised, 0 closed or down), and tilt slats, vanes and louvres (tilt: 1 open, 0 closed). Shutters are fixed: they only tilt.', parameters: { type: 'object', properties: { id: { type: 'string', description: 'a curtain, blind or shutter id, or "all"' }, amount: { type: 'number' }, tilt: { type: 'number' } }, required: ['id'], additionalProperties: false } } },
  { type: 'function', function: { name: 'move', description: 'Move or turn a placed piece. Give only `face` or `turn` to turn it where it stands.', parameters: { type: 'object', properties: { id: { type: 'string' }, ...WHERE }, required: ['id'], additionalProperties: false } } },
  { type: 'function', function: { name: 'swap', description: 'Replace a placed piece with another catalogue item, keeping its place and facing.', parameters: { type: 'object', properties: { id: { type: 'string' }, item: { type: 'string' } }, required: ['id', 'item'], additionalProperties: false } } },
  { type: 'function', function: { name: 'recolour', description: "Change the colour of one part of a placed piece (its catalogue entry lists its parts and their colours now). Without `part`, the piece's first part (the sofa's fabric, the dresser's body).", parameters: { type: 'object', properties: { id: { type: 'string' }, part: { type: 'string', description: 'fabric, wood, body, seat, handles, throw, pillows or mattress, as the piece lists' }, colour: { type: 'string', description: '#rrggbb, or "original" to go back to the catalogue colour' } }, required: ['id', 'colour'], additionalProperties: false } } },
  { type: 'function', function: { name: 'material', description: "Make one part of a placed piece in another material (velvet instead of linen, walnut instead of oak). Without `part`, the piece's first part. A cloth of one colour keeps the part's colour; a patterned one (tartan, gingham, houndstooth, ticking) brings its own.", parameters: { type: 'object', properties: { id: { type: 'string' }, part: { type: 'string', enum: Object.keys(MATERIALS) }, material: { type: 'string', enum: [...new Set([...Object.values(MATERIALS).flat(), ...Object.keys(FINISHES), 'original'])], description: 'an appliance takes a finish (stainless, white, black, panel-<collection> to match its cabinets); "original" goes back to the catalogue material' } }, required: ['id', 'material'], additionalProperties: false } } },
  { type: 'function', function: { name: 'resize', description: 'Make a placed piece the same piece in another size (a smaller sofa, a king bed), back where its back was, keeping its colours and materials.', parameters: { type: 'object', properties: { id: { type: 'string' }, size: { type: 'string', description: '"smaller", "larger", "smallest", "largest", or a size by name (queen, 2-seat, tall)' } }, required: ['id', 'size'], additionalProperties: false } } },
  { type: 'function', function: { name: 'paint', description: 'Paint a wall of the room, every wall ("all"), the floor or the ceiling. Colour "none" goes back to how it started.', parameters: { type: 'object', properties: { wall: { type: 'string', description: 'a wall id (wall2), "all", "floor" or "ceiling"' }, colour: { type: 'string', description: '#rrggbb, or "none"' } }, required: ['wall', 'colour'], additionalProperties: false } } },
  { type: 'function', function: { name: 'room_size', description: 'Set the dictated room\'s size in metres: width (wall-left to wall-right), depth (wall-front to wall-back), height. Give only what changes.', parameters: { type: 'object', properties: { width: { type: 'number' }, depth: { type: 'number' }, height: { type: 'number' } }, additionalProperties: false } } },
  { type: 'function', function: { name: 'opening', description: 'Add, move (to another wall or along its own) or remove a door or window of the dictated room.', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['add', 'move', 'remove'] }, id: { type: 'string', description: 'with move or remove: door1, window2…' }, kind: { type: 'string', enum: ['door', 'window'], description: 'with add' }, wall: { type: 'string', enum: ['wall-front', 'wall-right', 'wall-back', 'wall-left'] }, at: { type: 'string', description: '"centre", "left" or "right" as seen facing that wall from inside, or metres right of its centre ("0.8", "-1.2")' }, width: { type: 'number' }, height: { type: 'number' }, sill: { type: 'number', description: 'a window\'s height off the floor' }, at_pointing: { type: 'boolean', description: 'add or move it where the person points on a wall ("this should be a window"), centred on the point' }, sill_depth: { type: 'number', description: "a window: how far its sill stands out into the room, metres" }, recess: { type: 'number', description: 'a window: how deep the glass sits in the wall, metres (a blind can go inside)' }, trim: { type: 'number', description: "a window: the casing's width round it, metres (0: none)" }, panes: { type: 'string', enum: ['single', 'two', 'sash', 'grid'] }, frame: { type: 'string', enum: ['white', 'black', 'wood'] } }, required: ['action'], additionalProperties: false } } },
  { type: 'function', function: { name: 'use_room', description: 'Design in the dictated room, or in the headset\'s scan of the real room (emptied of its furniture).', parameters: { type: 'object', properties: { source: { type: 'string', enum: ['dictated', 'scan'] } }, required: ['source'], additionalProperties: false } } },
  { type: 'function', function: { name: 'go_to', description: 'Take the person to stand a step into the room from a wall, door, window or placed piece, facing it, or in the middle ("middle").', parameters: { type: 'object', properties: { to: { type: 'string' } }, required: ['to'], additionalProperties: false } } },
  { type: 'function', function: { name: 'view', description: 'Show the real room (the headset camera, the design over it) or go back to the design in VR.', parameters: { type: 'object', properties: { real: { type: 'boolean', description: 'true: the real room; false: the design' } }, required: ['real'], additionalProperties: false } } },
  { type: 'function', function: { name: 'outlines', description: "Show or hide the outlines of the person's real furniture in the design.", parameters: { type: 'object', properties: { show: { type: 'boolean' } }, required: ['show'], additionalProperties: false } } },
  { type: 'function', function: { name: 'rescan_room', description: "Have the headset rescan the room (Meta's Space Setup), when the person asks or the room looks wrong: walls missing, furniture not found.", parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  { type: 'function', function: { name: 'remove', description: 'Take a placed piece away, or every piece with id "all".', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false } } },
];

/**
 * The furnished scene: [{ id, item, at, facing, colours?, materials? }]; `colours` are the parts recoloured
 * ({ fabric: '#5f7a5a' }), `materials` the parts made of something else ({ fabric: 'velvet' }).
 */
export const scene = [];

/** The room's colours: { wall (every wall), walls: { wallId }, floor, ceiling }, over shell.mjs's FINISH. */
export const finish = { walls: {} };
/** How the design is shown: the real furniture's outlines on or off. */
export const settings = { outlines: true };

function newId(item) {
  let n = 1;
  while (scene.some((p) => p.id === `${item}${n}`)) n++;
  return `${item}${n}`;
}

const describe = (p) => {
  const c = catalog[p.item];
  const parts = c.parts && Object.fromEntries(Object.keys(c.parts).map((k) => [k, [p.materials?.[k] ?? c.made?.[k], p.colours?.[k] ?? (p.materials?.[k] ? (PATTERNED.has(p.materials[k]) ? 'in its pattern' : null) : c.parts[k])].filter(Boolean).join(' ')]));
  return { id: p.id, item: p.item, at: p.at, facing: p.facing, size: sizeOf(p, catalog), mount: mountOf(c), ...(p.window ? { window: p.window, open: p.fit.open } : {}), ...(c.custom ? { picture: { style: p.fit.style, palette: p.fit.palette, frame: p.fit.frame } } : {}), ...(c.finishes ? { finish: p.fit?.finish ?? 'as built' } : {}), ...(parts ? { parts } : {}), ...(c.sizeName ? { sizes: sizesOf(p.item).map((o) => o.sizeName + (o.piece !== c.piece ? ` (${o.name})` : '')) } : {}) };
};

/**
 * The model the headset loads for a piece: the catalogue's, or the same made in other materials and worn in other
 * colours (server.mjs makes it): `/catalog/<item>~fabric@velvet~fabric-5f7a5a.glb`. The path names it all, so the
 * headset's cache never serves a stale one.
 */
export function modelPath(p) {
  const sorted = (o) => Object.entries(o ?? {}).sort(([a], [b]) => a.localeCompare(b));
  // a made-to-fit piece (curtains to a window, a picture to a size): its fit, key=value, in the path
  const fit = p.fit ? `~fit@${Object.entries(p.fit).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join(',')}` : '';
  return `/catalog/${encodeURIComponent(p.item)}${fit}${sorted(p.materials).map(([k, v]) => `~${k}@${v}`).join('')}${sorted(p.colours).map(([k, v]) => `~${k}-${v.slice(1).toLowerCase()}`).join('')}.glb`;
}

/** `item~fabric@velvet~fabric-5f7a5a` -> { item, materials, colours }, as modelPath writes it. */
export function parseModel(name) {
  const [item, ...rest] = name.split('~');
  const materials = {}, colours = {};
  let fit = null;
  for (const r of rest) {
    if (r.startsWith('fit@')) fit = Object.fromEntries(r.slice(4).split(',').map((kv) => { const [k, v] = kv.split('='); return [k, v !== '' && Number.isFinite(Number(v)) ? Number(v) : v]; }));
    else if (r.includes('@')) { const [k, v] = r.split('@'); materials[k] = v; } else { const [k, v] = r.split('-'); colours[k] = `#${v}`; }
  }
  return { item, materials, colours, fit };
}

/** Keeps the colours and materials of the parts `item` also has. */
function carry(p, item) {
  for (const k of ['colours', 'materials']) if (p[k]) p[k] = Object.fromEntries(Object.entries(p[k]).filter(([part]) => catalog[item].parts?.[part]));
  p.item = item;
}

const round3 = (v) => Math.round(v * 1000) / 1000;

/** The room's windows: { id, wall, width, top, bottom (above the floor), c: [x, z], n: its wall's inward normal }. */
export function windowsOf(room) {
  const ws = walls(room), fl = floorOf(room);
  return (room?.items ?? []).filter((i) => i.label === 'window frame').map((i) => {
    const w = ws.map((x) => ({ x, off: Math.abs((i.center[0] - x.center[0]) * x.n[0] + (i.center[2] - x.center[2]) * x.n[1]) })).sort((a, b) => a.off - b.off)[0]?.x;
    if (!w) return null;
    const along = [-w.n[1], w.n[0]];
    return { id: i.id, wall: w.id, width: i.size[0] * Math.abs(along[0]) + i.size[2] * Math.abs(along[1]), top: i.center[1] + i.size[1] / 2 - fl, bottom: i.center[1] - i.size[1] / 2 - fl, c: [i.center[0], i.center[2]], n: w.n, ...rooms.WINDOW_STYLE, ...i.style };
  }).filter(Boolean);
}

/** Fits a window piece to its window (p.window) in `room`: its model's fit and size, and where it hangs. False if the window is gone. */
function hang(p, room) {
  const win = windowsOf(room).find((w) => w.id === p.window);
  if (!win) return false;
  const entry = catalog[p.item];
  p.fit = fitTo(entry.id, win, { ceiling: ceilingOf(room) - floorOf(room), high: p.hangHigh, drop: p.drop, open: p.fit?.open, inside: p.inside, tilt: p.fit?.tilt });
  p.size = decorModel(entry, p.fit).size;
  // out from the wall's face; a blind inside the window stands in the recess, just in front of the glass
  const d = p.fit.mount === 'inside' ? -win.recess + p.size[2] / 2 + 0.06 : p.size[2] / 2 + 0.003;
  p.at = [round3(win.c[0] + win.n[0] * d), round3(floorOf(room) + p.fit.bottom), round3(win.c[1] + win.n[1] * d)];
  p.facing = [round3(win.n[0]), 0, round3(win.n[1])];
  return true;
}

/** The window meant: asked for, else the one on the pointed wall nearest the point, else the room's only one. */
function windowFor(args, ctx) {
  const wins = windowsOf(ctx.room);
  if (args.window) return wins.find((w) => w.id.toLowerCase() === String(args.window).toLowerCase()) ?? { error: `no window ${args.window}; the windows are ${wins.map((w) => w.id).join(', ') || 'none'}` };
  const pt = ctx.pointing?.point;
  if (pt && ctx.pointing.target === 'wall') {
    const on = wins.filter((w) => w.wall === ctx.pointing.id).sort((a, b) => Math.hypot(a.c[0] - pt[0], a.c[1] - pt[2]) - Math.hypot(b.c[0] - pt[0], b.c[1] - pt[2]));
    if (on.length) return on[0];
  }
  if (wins.length === 1) return wins[0];
  return { error: wins.length ? `which window: ${wins.map((w) => `${w.id} on ${w.wall}`).join(', ')}?` : 'the room has no windows: add one first' };
}

/**
 * The person moved a piece themselves (grabbed with the laser): where it ended up, checked like any placement. A floor
 * piece stays on the floor; a piece that hangs at a window stays there.
 */
export function manualMove({ id, at, facing }, room) {
  const p = scene.find((x) => x.id === id);
  if (!p) return { error: `no piece ${id}` };
  const entry = catalog[p.item], mount = mountOf(entry);
  if (mount === 'window') return { error: `${p.id} hangs at its window` };
  if (!Array.isArray(at) || at.length !== 3 || !at.every(Number.isFinite)) return { error: 'at is [x, y, z]' };
  p.at = [round3(at[0]), mount === 'floor' || mount === 'rug' ? floorOf(room) : round3(at[1]), round3(at[2])];
  if (Array.isArray(facing) && mount !== 'wall') { const l = Math.hypot(facing[0], facing[2]) || 1; p.facing = [round3(facing[0] / l), 0, round3(facing[2] / l)]; }
  const issues = check(p, sizeOf(p, catalog), { room, scene, catalog });
  return { ok: true, piece: describe(p), issues };
}

/** Runs one tool call against the scene; returns what the model reads back. */
export function apply(name, args, ctx) {
  const env = { ...ctx, scene, catalog };
  if (name === 'find') return { ok: true, hits: findPieces(args) };
  if (name === 'picture') {
    const p = scene.find((x) => x.id === args.id);
    if (!p) return { error: `no piece ${args.id}` };
    if (!catalog[p.item].custom) return { error: `${p.id} is not a made-to-size picture (ART-FRAME, ART-CANVAS); swap it for one, or resize it` };
    const was = sizeOf(p, catalog), centre = p.at[1] + was[1] / 2;
    const w = args.width ?? (args.height ? (args.height * p.fit.w) / p.fit.h : p.fit.w), h = args.height ?? (args.width ? (args.width * p.fit.h) / p.fit.w : p.fit.h);
    p.fit = customFit({ ...p.fit, w, h, ...(args.style ? { style: args.style } : {}), ...(args.palette ? { palette: args.palette } : {}), ...(args.frame ? { frame: args.frame } : {}), seed: args.another ? p.fit.seed + 1 : p.fit.seed }, p.item === 'ART-CANVAS');
    if (args.another && !args.style) p.fit.style = CUSTOM_ART.styles[(p.fit.seed - 1) % CUSTOM_ART.styles.length];
    p.size = decorModel(catalog[p.item], p.fit, { draft: true }).size;
    p.at = [p.at[0], round3(Math.max(floorOf(ctx.room) + 0.05, Math.min(ceilingOf(ctx.room) - p.size[1] - 0.05, centre - p.size[1] / 2))), p.at[2]];
    return { ok: true, piece: describe(p), issues: check(p, p.size, { ...ctx, scene, catalog }) };
  }
  if (name === 'open') {
    const ps = args.id === 'all' ? scene.filter((p) => p.window) : scene.filter((p) => p.id === args.id);
    if (!ps.length) return { error: args.id === 'all' ? 'no curtains or blinds are up' : `no piece ${args.id}` };
    if (ps.some((p) => !p.window)) return { error: `${args.id} is not a curtain or blind` };
    if (args.amount === undefined && args.tilt === undefined) return { error: 'give amount (open or closed) or tilt' };
    if (args.tilt !== undefined && args.id !== 'all' && !catalog[ps[0].item].tilts) return { error: `${ps[0].id} does not tilt` };
    for (const p of ps) {
      if (args.amount !== undefined) p.fit = { ...p.fit, open: Math.max(0, Math.min(1, Number(args.amount))) };
      if (args.tilt !== undefined && catalog[p.item].tilts) p.fit = { ...p.fit, tilt: Math.max(0, Math.min(1, Number(args.tilt))) };
      hang(p, ctx.room);
    }
    return { ok: true, pieces: ps.map(describe) };
  }
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
  if (name === 'paint') {
    const ws = walls(ctx.room).map((w) => w.id), what = args.wall;
    if (!ws.length) return { error: 'the room has no walls yet: rescan it' };
    if (!['all', 'floor', 'ceiling', ...ws].includes(what)) return { error: `no wall ${what}; the walls are ${ws.join(', ')}, or all, floor, ceiling` };
    const none = args.colour === 'none';
    if (!none && !linearOf(args.colour)) return { error: `${args.colour} is not a colour: give #rrggbb` };
    const c = none ? undefined : args.colour.toLowerCase().replace(/^#?/, '#');
    if (what === 'all') { finish.wall = c; finish.walls = {}; }
    else if (what === 'floor' || what === 'ceiling') finish[what] = c;
    else if (none) delete finish.walls[what];
    else finish.walls[what] = c;
    return { ok: true, [none ? 'reset' : 'painted']: what, ...(c ? { colour: c } : {}) };
  }
  if (name === 'room_size' || name === 'opening' || name === 'use_room') {
    try {
      if (name === 'use_room') {
        if (args.source === 'scan' && !rooms.state.scanned) return { error: 'the headset has no scan of the room: rescan it first' };
        rooms.state.source = args.source;
        return { ok: true, room: rooms.describeSpec(), note: 'the pieces stay where they were: check what now runs into a wall' };
      }
      if (rooms.state.source !== 'dictated') return { error: 'this is the scanned room: its size comes from the scan (use_room dictated to change size)' };
      let change = args;
      if (name === 'opening' && args.at_pointing) {
        // "this should be a window": on the wall the laser is on, centred where it landed
        const p = ctx.pointing;
        if (p?.target !== 'wall' || !p.point) return { error: 'the person is not pointing at a wall: ask them to point at where it goes' };
        const kind = args.kind ?? (args.id ? rooms.state.spec.openings.find((o) => o.id === args.id)?.kind : undefined);
        const here = rooms.openingAt(p.id, p.point, kind, args.height ?? (kind === 'window' && args.action === 'add' ? 1.4 : undefined));
        change = { ...args, wall: here.wall, at: String(here.at), ...(here.sill !== undefined && args.sill === undefined ? { sill: here.sill } : {}), ...(kind === 'window' && args.action === 'add' && !args.width ? { width: 1.22 } : {}), ...(kind === 'window' && args.action === 'add' && !args.height ? { height: 1.4 } : {}) };
      }
      const out = name === 'room_size' ? { room: rooms.setSize(change) } : rooms.changeOpening(change);
      // every piece checked against the changed room: one a wall now runs through is pushed back inside
      const changed = rooms.designRoom(ctx.room?.viewer);
      // curtains follow their window, and go with it
      const gone = [];
      for (const p of [...scene]) if (p.window && !hang(p, changed)) { scene.splice(scene.indexOf(p), 1); gone.push(p.id); }
      const pieces = scene.map((p) => ({ id: p.id, issues: check(p, sizeOf(p, catalog), { ...ctx, room: changed, scene, catalog }) })).filter((p) => p.issues.length);
      return { ok: true, ...out, ...(pieces.length ? { pieces } : {}), ...(gone.length ? { removed_with_their_window: gone } : {}) };
    } catch (e) {
      return { error: e.message };
    }
  }
  if (name === 'go_to') {
    const to = String(args.to ?? '').toLowerCase();
    let target = null;
    if (to !== 'middle' && to !== 'centre' && to !== 'center') {
      const piece = scene.find((p) => p.id.toLowerCase() === to);
      const item = (ctx.room?.items ?? []).find((i) => i.id.toLowerCase() === to);
      const wall = item && walls(ctx.room).find((w) => w.id === item.id);
      if (piece) {
        const d = sizeOf(piece, catalog)[2] / 2;
        target = { point: [piece.at[0] + piece.facing[0] * d, piece.at[2] + piece.facing[2] * d], inward: [piece.facing[0], piece.facing[2]], step: 1.4 };
      } else if (wall) target = { point: [wall.center[0], wall.center[2]], inward: wall.n };
      else if (item?.normal) {
        // a door or window: the way into the room is its wall's
        const w = walls(ctx.room).sort((a, b) => Math.abs((item.center[0] - a.center[0]) * a.n[0] + (item.center[2] - a.center[2]) * a.n[1]) - Math.abs((item.center[0] - b.center[0]) * b.n[0] + (item.center[2] - b.center[2]) * b.n[1]))[0];
        target = { point: [item.center[0], item.center[2]], inward: w?.n ?? [item.normal[0], item.normal[2]] };
      } else return { error: `nothing called ${args.to}; walls, doors, windows and pieces have ids, or say middle` };
    }
    const stand = rooms.standingFor(ctx.room, target);
    ctx.actions?.push({ teleport: stand });
    return { ok: true, standing: stand };
  }
  if (name === 'view') {
    ctx.actions?.push(args.real ? 'real' : 'design');
    return { ok: true, showing: args.real ? 'the real room, with the design over it' : 'the design' };
  }
  if (name === 'outlines') {
    settings.outlines = !!args.show;
    return { ok: true, outlines: settings.outlines };
  }
  if (name === 'material') {
    const p = scene.find((x) => x.id === args.id);
    if (!p) return { error: `no piece ${args.id}; pieces are ${scene.map((x) => x.id).join(', ') || 'none'}` };
    // an appliance's finish: built here, no mojulo
    if (catalog[p.item].finishes) {
      if (args.material === 'original') { if (p.fit) delete p.fit.finish; if (p.fit && !Object.keys(p.fit).length) delete p.fit; return { ok: true, piece: describe(p) }; }
      if (!catalog[p.item].finishes.includes(args.material)) return { error: `${p.id} comes in ${catalog[p.item].finishes.join(', ')}` };
      p.fit = { ...p.fit, finish: args.material };
      return { ok: true, piece: describe(p) };
    }
    const made = catalog[p.item].made ?? {};
    if (!Object.keys(made).length) return { error: `${p.id} cannot be made in other materials` };
    const part = args.part ?? Object.keys(made)[0];
    if (!made[part]) return { error: `${p.id} has no ${part} to make in another material; its parts are ${Object.keys(made).join(', ')}` };
    if (args.material === 'original' || args.material === made[part]) { if (p.materials) delete p.materials[part]; return { ok: true, piece: describe(p) }; }
    if (!MATERIALS[part].includes(args.material)) return { error: `${part} cannot be ${args.material}; it can be ${MATERIALS[part].join(', ')}` };
    if (!mojuloReady()) return { error: 'making a piece in another material needs mojulo on this laptop (npm run mojulo:setup); colours can still change' };
    p.materials = { ...p.materials, [part]: args.material };
    if (PATTERNED.has(args.material) && p.colours) delete p.colours[part]; // a pattern brings its own colours
    return { ok: true, piece: describe(p), note: 'rebuilding it in the new material: it appears in a few seconds' };
  }
  if (name === 'resize') {
    const p = scene.find((x) => x.id === args.id);
    if (!p) return { error: `no piece ${args.id}; pieces are ${scene.map((x) => x.id).join(', ') || 'none'}` };
    const sizes = sizesOf(p.item);
    if (sizes.length < 2) return { error: `${p.id} comes in one size only` };
    const i = sizes.findIndex((o) => o.id === p.item), want = String(args.size).toLowerCase();
    const to = { smaller: sizes[i - 1], larger: sizes[i + 1], bigger: sizes[i + 1], smallest: sizes[0], largest: sizes.at(-1), biggest: sizes.at(-1) }[want]
      ?? sizes.find((o) => o.sizeName === want || o.id.toLowerCase() === want || (o.piece !== catalog[p.item].piece && o.name.toLowerCase().includes(want)));
    const end = /^small/.test(want) ? 'smallest' : /^(larg|big)/.test(want) ? 'largest' : null;
    if ((!to && end) || to?.id === p.item) return { ok: true, note: `it is already the ${end ?? to.sizeName} one; it comes in ${sizes.map((o) => o.sizeName).join(', ')}`, piece: describe(p) };
    if (!to) return { error: `no ${args.size} ${catalog[p.item].name.split(',')[0]}; it comes in ${sizes.map((o) => o.sizeName).join(', ')} and is ${catalog[p.item].sizeName}` };
    // the back stays where it was (against its wall): the centre moves by half the change in depth, along the facing
    // a floor piece keeps its back where it was (against its wall); a rug, a lamp, a picture keep their centre
    const dd = mountOf(catalog[p.item]) === 'floor' ? (to.size[2] - sizeOf(p, catalog)[2]) / 2 : 0;
    if (mountOf(catalog[p.item]) === 'wall') p.at = [p.at[0], round3(p.at[1] + (sizeOf(p, catalog)[1] - to.size[1]) / 2), p.at[2]]; // a picture keeps its centre's height
    p.at = [p.at[0] + p.facing[0] * dd, p.at[1], p.at[2] + p.facing[2] * dd].map((v) => Math.round(v * 1000) / 1000);
    const was = p.id;
    carry(p, to.id);
    p.id = newId(to.id);
    const issues = check(p, to.size, env);
    return { ok: true, replaced: was, piece: describe(p), issues };
  }
  if (name === 'swap') {
    const p = scene.find((x) => x.id === args.id);
    if (!p) return { error: `no piece ${args.id}` };
    if (!catalog[args.item]) return { error: `no catalogue item ${args.item}` };
    const was = p.id, toWindow = mountOf(catalog[args.item]) === 'window';
    if (!!p.window !== toWindow) return { error: p.window ? `${p.id} hangs at a window: swap it for other curtains or a blind` : `${args.item} hangs at a window: place it at one` };
    carry(p, args.item); // colours and materials carry over to the parts the new piece also has
    p.id = newId(args.item); // the id says what it is: armchair1 swapped for a sofa becomes sofa1
    if (p.window) hang(p, ctx.room); else delete p.size;
    const issues = check(p, sizeOf(p, catalog), env);
    return { ok: true, replaced: was, piece: describe(p), issues };
  }
  if (name !== 'place' && name !== 'move') return { error: `no tool ${name}` };

  const current = name === 'move' ? scene.find((p) => p.id === args.id) : null;
  if (name === 'move' && !current) return { error: `no piece ${args.id}; pieces are ${scene.map((p) => p.id).join(', ') || 'none'}` };
  const item = current ? current.item : args.item;
  if (!catalog[item]) return { error: `no catalogue item ${item}; closest: ${findPieces({ query: String(item).replace(/[-_]/g, ' '), max: 5 }).map((h) => h.id).join(', ') || 'none (try find)'}` };
  // curtains and blinds: made to fit the window they go at, and hung there
  if (mountOf(catalog[item]) === 'window') {
    if (current && !args.window) return { error: `${current.id} hangs at its window: say another window to move it there` };
    const win = windowFor(args, ctx);
    if (win.error) return win;
    const piece = current ?? { id: newId(item), item };
    piece.window = win.id;
    if (args.high !== undefined) piece.hangHigh = args.high;
    if (args.drop !== undefined) piece.drop = args.drop;
    if (args.inside !== undefined) piece.inside = args.inside;
    piece.fit = { ...piece.fit, open: args.open !== undefined ? Math.max(0, Math.min(1, args.open)) : piece.fit?.open, tilt: args.tilt !== undefined ? Math.max(0, Math.min(1, args.tilt)) : piece.fit?.tilt };
    if (piece.fit.open === undefined) delete piece.fit.open;
    if (piece.fit.tilt === undefined) delete piece.fit.tilt;
    hang(piece, ctx.room);
    if (!current) scene.push(piece);
    return { ok: true, piece: describe(piece) };
  }
  const where = { ...args };
  let entry = current?.size ? { ...catalog[item], size: current.size } : catalog[item], fit = current?.fit;
  if (catalog[item].custom && !current) {
    // a picture made to the size asked for: one number given keeps a 3:4 portrait's proportion
    const w = args.width ?? (args.height ? args.height * 0.75 : 0.6), h = args.height ?? w / 0.75;
    fit = customFit({ w, h, style: args.style, palette: args.palette, frame: args.frame, seed: 1 + scene.filter((x) => catalog[x.item].custom).length }, item === 'ART-CANVAS');
    entry = { ...catalog[item], size: decorModel(catalog[item], fit, { draft: true }).size };
  }
  // only turning: stay put
  const placed = ['on', 'against', 'next_to', 'at_pointing', 'in_front', 'at'].some((k) => where[k] !== undefined && where[k] !== false);
  const pose = placed || !current ? resolve(where, entry, { ...env, current }) : resolve({ ...where, at: current.at }, entry, { ...env, current });
  if (pose.error) return pose;
  const piece = current ?? { id: newId(item), item, ...(fit ? { fit, size: entry.size } : {}) };
  piece.at = pose.at;
  piece.facing = pose.facing;
  // a tall picture is not hung through the ceiling
  if (mountOf(entry) === 'wall') piece.at[1] = round3(Math.max(floorOf(env.room) + 0.05, Math.min(ceilingOf(env.room) - entry.size[1] - 0.05, piece.at[1])));
  if (!current) scene.push(piece);
  const issues = check(piece, sizeOf(piece, catalog), env);
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
  // `room` is the design's room (rooms.mjs: dictated, or the scan emptied of its furniture), `pointing` what was
  // pointed at in it
  const laid = placeLayout(room);
  if (laid) console.log(`  (the designed layout stands in the room: ${laid.join(', ')})`);
  const pointed = pointedPiece(pointing, scene, catalog);
  const context = {
    said,
    pointing: pointing ? { ...pointing, ray: undefined, piece: pointed } : null,
    viewer: room?.viewer ?? null,
    room: { ...rooms.describeSpec(), floorY: room?.floorY, items: (room?.items ?? []).map(({ outline, ...i }) => i), walls: walls(room).map((w) => ({ id: w.id, faces: w.n.map((v) => Math.round(v * 100) / 100), colour: finish.walls[w.id] ?? finish.wall ?? 'as it started' })), floor: finish.floor ?? 'as it started', ceiling: finish.ceiling ?? 'as it started' },
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
        // a changed room is the room the rest of this turn's calls work in
        if (['room_size', 'opening', 'use_room'].includes(call.function?.name) && result.ok) room = rooms.designRoom(room?.viewer);
        calls.push({ name: call.function?.name, args, result });
      } catch (e) {
        result = { error: `bad arguments: ${e.message}` };
      }
      if (result.error || result.issues?.some((i) => i.startsWith('overlaps') || i.startsWith('blocks'))) needsLook = true;
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
    // the reply came with the calls and they all landed cleanly: no second round trip
    if (text && !needsLook) { remember(said, text); return { reply: text, calls, actions }; }
  }
  return { reply: 'I got stuck arranging that.', calls, actions };
}
