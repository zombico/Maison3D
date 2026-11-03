// Spike 08: your real room, empty, designed by mojulo's design_interior. The room's walls and doors come from the scan
// (spike 05's sample); the furniture in it is left out on purpose. The design's pieces are read back into the room's
// world coordinates, each with its facing, and written to design.json for the headset.
//   node 08-spike-mojulo-furnish/design.mjs [style] [--seats N] [--tv inches]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from '../mojulo/client.mjs';
import { roomFromScan } from '../07-spike-native-furnish/sample.mjs';
import { frameOf, toPlan, toWorld, dirToPlan, dirToWorld, FT } from './toMojulo.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const style = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a)) ?? 'japandi';
const opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? Number(args[i + 1]) : undefined; };

const room = roomFromScan(JSON.parse(readFileSync(join(here, '..', '05-spike-native-scan', 'samples', 'two-rooms-quest3s.json'), 'utf8')));
const f = frameOf(room);
const W = f.width, D = f.depth; // metres

// the doors, on the wall each faces out of, at the fraction along it (mojulo measures from the west / north end)
const WALL_OF = (n) => (Math.abs(n[1]) >= Math.abs(n[0]) ? (n[1] < 0 ? 'S' : 'N') : n[0] < 0 ? 'E' : 'W');
const doors = room.items.filter((i) => i.label === 'door frame').map((d) => {
  const p = toPlan(f, [d.center[0], d.center[2]]).map((v) => v * FT);
  const wall = WALL_OF(dirToPlan(f, [d.normal[0], d.normal[2]]));
  const along = wall === 'N' || wall === 'S' ? p[0] / W : p[1] / D;
  return { wall, to: 'hall', at: Math.round(along * 100) / 100, width: `${Math.round(Math.hypot(d.size[0], d.size[2]) * 1000)}mm` };
});

// The house the design is drawn over, as it really is: your room, a hall to the south that both doors open onto, and
// nothing else. (Describing the room as a `section` instead lets mojulo draft a house round it, which gave the north
// wall a door to a bedroom that does not exist.) A plan's cells run along the walls' centrelines and mojulo takes a
// wall's thickness off the inside, so each cell is grown by that much and the room inside comes out at its measured
// size. Plan units are feet, N the y0 edge, x east.
const WALL = 0.255; // metres mojulo took off each side's total in a first run (3077 -> 2822 mm)
const pad = 1, hallDepth = 4; // feet
const w = (W + WALL) / FT, d = (D + WALL) / FT, x0 = pad, y0 = pad;
const toCell = (metres) => metres / FT + WALL / 2 / FT; // a distance from the room's inside NW corner, in cell feet
const house = {
  kind: 'floorplan', title: 'Your room, empty', seed: 7,
  width: +(w + 2 * pad).toFixed(3), height: +(d + hallDepth + 2 * pad).toFixed(3),
  rooms: [
    { x: x0, y: y0, w: +w.toFixed(3), h: +d.toFixed(3), glyph: 'L' },
    { x: x0, y: +(y0 + d).toFixed(3), w: +w.toFixed(3), h: hallDepth, glyph: 'H' },
  ],
  doors: doors.filter((dr) => dr.wall === 'S').map((dr) => ({ x: +(x0 + toCell(dr.at * W)).toFixed(2), y: +(y0 + d).toFixed(3), room: 0, edge: 'S' })),
  furnish: false, windows: false,
};
const brief = { ...(opt('seats') ? { seats: opt('seats') } : {}), ...(opt('tv') ? { tv: opt('tv') } : {}) };
const m = await connect();
const h = await m.call('create_sketch', { title: 'Your room (house)', ref: `sk_maison_house_${Date.now().toString(36)}`, manifest: house });
const r = await m.call('design_interior', { title: `Your room, ${style}`, house: h.ref, room: '101', style, ...(Object.keys(brief).length ? { brief } : {}) });
m.close();
const it = r.interior;
const section = { house: h.ref, room: '101', doors };

// a piece's `at` is its centre in millimetres from the room's north-west corner (x east, y south); `facing` a wall
// letter, the way its front points; `size` width x depth x height in mm
const FACE = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
const pieces = (it.pieces ?? []).filter((p) => p.at).map((p) => {
  const c = toWorld(f, [p.at[0] / 1000 / FT, p.at[1] / 1000 / FT]);
  const face = dirToWorld(f, FACE[p.facing] ?? [0, 1]);
  return {
    id: p.id, piece: p.piece, like: p.like, facingLetter: p.facing ?? 'S',
    plan: [p.at[0] / 1000, p.at[1] / 1000], // metres from the room's inside north-west corner, x east, y south
    at: [c[0], f.floorY, c[1]].map((v) => Math.round(v * 1000) / 1000),
    facing: [face[0], 0, face[1]].map((v) => Math.round(v * 1000) / 1000),
    size: p.size.map((v) => v / 1000), // w, d, h in metres
  };
});
const out = { mojulo: 'design_interior', ref: r.ref, style, room: it.room, focal: it.focal, section, pieces, gaps: it.gaps, refused: it.refused, review: it.review, notes: it.notes };
writeFileSync(join(here, 'design.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`room ${it.room.size.join(' x ')} mm, doors ${it.room.doors.map((d) => `${d.wall}→${d.to}`).join(', ')}; focal ${it.focal?.wall} (${it.focal?.why})`);
for (const p of pieces) console.log(`  ${p.id.padEnd(26)} ${p.piece.padEnd(16)} ${p.size.map((v) => v.toFixed(2)).join(' x ')} m  at ${p.at.join(', ')}  facing ${p.facing.join(', ')}`);
for (const g of it.gaps ?? []) console.log(`  gap ${g.fn}: ${g.why}`);
for (const v of it.review ?? []) console.log(`  review: ${v}`);
