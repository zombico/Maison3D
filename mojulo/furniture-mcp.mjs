#!/usr/bin/env node
// mojulo, scoped to furniture and interior design. An MCP server over stdio that sits in front of the pinned mojulo
// (mojulo/pin.json) and lists six tools instead of mojulo's whole studio (games, worlds, characters, audio, film,
// diagrams…), so an agent working on Maison3D is never steered toward those. Each tool maps onto one mojulo tool and
// refuses arguments outside furniture: make_piece only builds workbench furniture, design_room only fits out rooms.
//
// For Claude Code: .mcp.json starts it as `maison-furniture`. For our own code: mojulo/client.mjs reaches the same
// mojulo directly (no scoping needed there, the code calls exactly what it means to).
import { connect } from './client.mjs';

const FURNITURE_BUILDS = new Set(['sofa', 'chair', 'table', 'carcass']);

const INSTRUCTIONS = `Furniture and interior design for Maison3D, backed by mojulo (a 3D compiler: each piece and each room is a
small recipe that re-renders identically and is edited in place, never re-made). Everything is at true size.

- design_room fits out one room: furniture chosen and sized for the room's jobs, a named style, clearances kept.
  Describe the room as section { room, size: ['3.08m', '2.95m'], windows, doors } (sizes take '14ft', '4.2m' or a
  number in millimetres; a bare 10 is 10 mm), or revise a design by its ref.
- make_piece makes one piece of furniture from mojulo's furniture builds (sofa, chair, table, carcass for storage,
  shelves and cabinets) or a measured object study (lamps, rugs: lathes and extrudes), in mm or cm.
- edit_piece changes a stored piece or room in place (patch ops); export_piece writes its GLB for the headset.
- measure_piece reads a piece's true size; design_rules reads the interior card (how rooms are fitted, by id).
Never make games, worlds, characters, sound or diagrams here: this server is for furniture only.`;

const TOOLS = [
  {
    name: 'design_room',
    description: "Fit out one room: its jobs solved into furniture at true size, a named style (japandi, mid-century, quiet-luxury, coastal, maximalism… or { name, accent, palette }), clearances kept. Describe the room as `section` { room: 'lounge', size: ['3.08m', '2.95m'], windows: ['S'], doors: [{ wall, to, at }] } (sizes: '14ft', '4.2m' or millimetres), or pass `ref` to revise a design (pieces merge by id). Returns the pieces by id, what was refused, the gaps and a review. Rules: design_rules.",
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        section: { type: 'object', additionalProperties: true, description: "{ room, size: ['3.08m', '2.95m'] (or '14ft', or millimetres), windows: ['S'], doors: [{ wall: 'S', to: 'hall', at: 0.2 }] }" },
        style: { description: "A style card ('japandi') or { name, accent?, palette? }" },
        brief: { type: 'object', additionalProperties: true, description: '{ uses?, tags?, seats?, bed?, tv? }' },
        focal: { type: 'string', description: "'fireplace', a window's mark, a wall letter or 'view'" },
        pieces: { type: 'array', items: { type: 'object', additionalProperties: true }, description: "By id: [{ id: 'conversation.sofa', size?, at?, like?, omit? }]" },
        palette: { description: "The room's colours (pick_palette's spec), or false to keep the style card's" },
        ref: { type: 'string', description: 'A design to revise in place, or a stable ref for a new one' },
      },
    },
    to: 'design_interior',
    check: (a) => {
      if (!a.section && !a.ref) return 'describe the room as `section`, or pass the `ref` of a design to revise';
      const small = (a.section?.size ?? []).find((v) => typeof v === 'number' && v < 500);
      if (small !== undefined) return `size ${small} reads as ${small} mm; give units: '${small}m' or '${small}ft'`;
      return null;
    },
  },
  {
    name: 'make_piece',
    description: "Make one piece of furniture at true size as a mojulo workbench recipe. Furniture builds: spec { units: 'mm', frames: [{ id, unit: 'mm', build: { type: 'sofa' | 'chair' | 'table' | 'carcass', …dials }, fabric?, species?, finish? }] } (sofa: seats, arms, back, cushions, legH; table: w, d, h; carcass: w, h, d, shelves, doors, drawers). Lamps, rugs and other simple pieces: lathes / extrudes in cm. Read the dials with design_rules({ id: 'workbench' }).",
    inputSchema: {
      type: 'object',
      properties: { title: { type: 'string' }, ref: { type: 'string', description: 'A stable ref, e.g. sk_piece_sofa' }, spec: { type: 'object', additionalProperties: true } },
      required: ['spec'],
    },
    to: 'mint_solid',
    map: (a) => ({ kind: 'workbench', title: a.title, ref: a.ref, spec: a.spec }),
    check: (a) => {
      const builds = (a.spec?.frames ?? []).map((f) => f.build?.type).filter(Boolean);
      const bad = builds.find((b) => !FURNITURE_BUILDS.has(b));
      if (bad) return `"${bad}" is not a furniture build; use sofa, chair, table or carcass`;
      if (!a.spec?.frames && !a.spec?.lathes && !a.spec?.extrudes) return 'a piece is frames (furniture builds), lathes or extrudes';
      return null;
    },
  },
  {
    name: 'edit_piece',
    description: "Change a stored piece or room design in place, same ref: patch ops [{ op: 'set', id, …keys }, { op: 'set', path, value }, { op: 'remove', id | path }, { op: 'add', into, entry }]. A furniture build's dials live at /frames/<i>/build (e.g. { op: 'set', path: '/frames/0/build/seats', value: 2 }).",
    inputSchema: {
      type: 'object',
      properties: { ref: { type: 'string' }, patch: { type: 'array', items: { type: 'object', additionalProperties: true } }, title: { type: 'string' }, note: { type: 'string' } },
      required: ['ref', 'patch'],
    },
    to: 'update_sketch',
  },
  {
    name: 'export_piece',
    description: "Write a piece's or a room's GLB at true size (metres) for the headset → { path, bytes, triangles }. Room exports carry every piece as an `asset:<id>` node.",
    inputSchema: { type: 'object', properties: { ref: { type: 'string' } }, required: ['ref'] },
    to: 'export_model',
    map: (a) => ({ ref: a.ref, format: 'glb' }),
  },
  {
    name: 'measure_piece',
    description: "Read a stored piece's true size without exporting: bounds, per-part sizes, warnings.",
    inputSchema: { type: 'object', properties: { ref: { type: 'string' } }, required: ['ref'] },
    to: 'measure_solid',
    map: (a) => ({ ref: a.ref, volume: false }),
  },
  {
    name: 'design_rules',
    description: "Read a furniture or interior manual: 'interior' (how a room is fitted: pieces by id, styles, clearances), 'floor-plan' (rooms and their furnishing), or 'workbench' (furniture builds and their dials).",
    inputSchema: { type: 'object', properties: { id: { type: 'string', enum: ['interior', 'floor-plan', 'workbench'] } }, required: ['id'] },
    route: (a) => (a.id === 'workbench' ? ['get_solid_vocab', { id: 'workbench' }] : ['get_sketch_vocab', { id: a.id }]),
  },
];

let mojulo = null;
const mojuloReady = () => (mojulo ??= connect());

async function call(name, args) {
  const t = TOOLS.find((x) => x.name === name);
  if (!t) return { error: `no tool ${name} here: this server only does furniture (${TOOLS.map((x) => x.name).join(', ')})` };
  const refusal = t.check?.(args);
  if (refusal) return { error: refusal };
  const [tool, mapped] = t.route ? t.route(args) : [t.to, t.map ? t.map(args) : args];
  const m = await mojuloReady();
  return m.call(tool, mapped);
}

// --- MCP over stdio: newline-delimited JSON-RPC ---------------------------------------------------------------
const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
let buf = '';
process.stdin.on('data', async (d) => {
  buf += d;
  for (let i; (i = buf.indexOf('\n')) >= 0; ) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    const msg = JSON.parse(line);
    if (msg.id === undefined) continue; // notifications
    const reply = (result) => send({ jsonrpc: '2.0', id: msg.id, result });
    try {
      if (msg.method === 'initialize') {
        reply({
          protocolVersion: msg.params?.protocolVersion ?? '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'maison-furniture', version: '0.1.0' },
          instructions: INSTRUCTIONS,
        });
      } else if (msg.method === 'tools/list') {
        reply({ tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
      } else if (msg.method === 'tools/call') {
        const out = await call(msg.params.name, msg.params.arguments ?? {});
        const isError = !!out?.error && Object.keys(out).length === 1;
        reply({ content: [{ type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out, null, 1) }], isError });
      } else if (msg.method === 'ping') {
        reply({});
      } else {
        send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `no method ${msg.method}` } });
      }
    } catch (e) {
      reply({ content: [{ type: 'text', text: e.message }], isError: true });
    }
  }
});
process.stdin.on('end', async () => { (await mojulo)?.close(); process.exit(0); });
