// The catalogue as markdown, for the review doc: one table per room, the collections, the gaps and the counts.
//   node 70-inventory/list.mjs [room|collections|gaps|counts]
import { COLLECTIONS, PIECES, GAPS, skus } from './catalogue.mjs';

const mm = (v) => v.join(' × ');
const ROOM_NAMES = { living: 'Living room', bedroom: 'Bedroom', dining: 'Dining', office: 'Home office', entry: 'Entry and hall', kids: "Kids' room", outdoor: 'Outdoor and balcony', any: 'Lighting, rugs and decor' };
const SOURCE = { furniture: 'furniture build', roster: 'room furnishing', workbench: 'workbench study', gap: 'not yet' };

export function roomTable(room) {
  const rows = PIECES.filter((p) => p.room === room).map((p) => {
    const sizes = Object.entries(p.sizes).map(([k, v]) => (Object.keys(p.sizes).length > 1 || k !== 'std' ? `${k} ${mm(v)}` : mm(v))).join('; ');
    const cols = p.in[0] === 'ALL' ? 'shared' : p.in.length === COLLECTIONS.length ? 'all 7' : p.in.join(', ');
    const n = (p.in[0] === 'ALL' ? 1 : p.in.length) * Object.keys(p.sizes).length;
    return `| ${p.name} | ${sizes} | ${SOURCE[p.source]}: ${p.recipe.replace(/\|/g, '/')} | ${p.job} | ${cols} | ${n} |`;
  });
  return `| Piece | Sizes (mm, w × d × h) | mojulo makes it as | Job | Collections | SKUs |\n| --- | --- | --- | --- | --- | --- |\n${rows.join('\n')}`;
}

export function collectionsTable() {
  const counts = {};
  for (const s of skus()) if (s.collection) counts[s.collection] = (counts[s.collection] ?? 0) + 1;
  const rows = COLLECTIONS.map((c) => `| ${c.name} (${c.code}) | ${c.card} | ${c.line} | ${c.fabric}; accent ${c.accent} | ${c.timber} | ${c.casework} | ${c.legs} | ${counts[c.code]} |`);
  return `| Collection | mojulo style card | The line | Upholstery | Timber | Casework | Legs | SKUs |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n${rows.join('\n')}`;
}

export function gapsTable() {
  return `| Piece | Rooms | Route | Note |\n| --- | --- | --- | --- |\n${GAPS.map((g) => `| ${g.name} | ${g.want} | ${g.route} | ${g.note} |`).join('\n')}`;
}

export function counts() {
  const s = skus();
  const room = {};
  for (const x of s) { const p = PIECES.find((q) => q.id === x.piece); room[p.room] = (room[p.room] ?? 0) + 1; }
  return { pieces: PIECES.length, skus: s.length, collections: COLLECTIONS.length, gaps: GAPS.length, byRoom: Object.fromEntries(Object.entries(room).map(([k, v]) => [ROOM_NAMES[k], v])) };
}

if (process.argv[1]?.endsWith('list.mjs')) {
  const what = process.argv[2] ?? 'counts';
  if (what === 'collections') console.log(collectionsTable());
  else if (what === 'gaps') console.log(gapsTable());
  else if (what === 'counts') console.log(JSON.stringify(counts(), null, 1));
  else console.log(roomTable(what));
}
