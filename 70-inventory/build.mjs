// Builds catalogue SKUs on the pinned mojulo (npm run mojulo:setup): each SKU's recipe minted, exported as GLB, readied
// for the headset (ready.mjs), checked against the budgets and its listed size, and written to models/<sku>.glb with
// an entry in catalog.json (the shape spike 07's server reads). mojulo is deterministic, so a rebuild of a recipe gives
// the same piece; models/ is not committed.
//   node 70-inventory/build.mjs --collections HIN,SAB --rooms living,bedroom [--only HIN-SOF-3-seat]
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from '../mojulo/client.mjs';
import { COLLECTIONS, PIECES, skus } from './catalogue.mjs';
import { recipeFor, frontTurn } from './recipes.mjs';
import { ready } from './ready.mjs';
import { partsOf } from './colour.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const collections = arg('collections')?.split(',');
const rooms = arg('rooms')?.split(',');
const only = arg('only')?.split(',');

export const BUDGET = { triangles: 30000, bytes: 1.5 * 1024 * 1024, sizeMm: 40 };

const piece = (id) => PIECES.find((p) => p.id === id);
const todo = skus().filter((s) =>
  (!collections || collections.includes(s.collection)) &&
  (!rooms || rooms.includes(piece(s.piece).room)) &&
  (!only || only.includes(s.sku)) &&
  piece(s.piece).source !== 'gap');

const modelsDir = join(here, 'models');
mkdirSync(modelsDir, { recursive: true });
const catalogPath = join(here, 'catalog.json');
const catalog = existsSync(catalogPath) ? JSON.parse(readFileSync(catalogPath, 'utf8')) : { catalog: [] };
const byId = new Map(catalog.catalog.map((e) => [e.id, e]));

// mojulo's own sheet table and finishes, from the pinned source, to colour the sheet goods its lit export leaves white
const { SHEETS, sheetColor } = await import('../.mojulo/src/control/lib/graph/construction/sheets.js');
const BOARD_OF = { ply: 'plywood', mdf: 'mdf', particle: 'particleboard', osb: 'osb' };
const sheetRgbFor = (c) => (key) => {
  const material = key.m === 'ply' || key.m === 'mdf' ? BOARD_OF[key.m] : Object.keys(SHEETS).find((k) => SHEETS[k].figure === key.m);
  if (!material) return null;
  const { face } = sheetColor(material, { finish: c.paint ? { paint: c.paint } : c.wood });
  return face.mode === 'figure' ? face.rgb : null;
};

const m = await connect();
console.log(`mojulo ${m.server.version}: ${todo.length} SKUs`);
const problems = [];
for (const s of todo) {
  const p = piece(s.piece);
  const col = COLLECTIONS.find((c) => c.code === s.collection);
  const t0 = Date.now();
  try {
    const { kind, spec } = recipeFor(s.piece, s.collection, s.size);
    const ref = `sku_${s.sku.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Date.now().toString(36)}`;
    const minted = await m.call('mint_solid', { kind, ref, title: `${col.name} ${p.name} (${s.size})`, spec });
    // a soft part mojulo's grain could not catch comes back with no volume and is missing from the model
    const lost = JSON.stringify(minted).match(/"id":"[^"]+","kind":"(?:cushion|pillow|bolster|pad)"[^}]*?"volumeL":0[,}]/g)?.map((x) => x.match(/"id":"([^"]+)"/)[1]) ?? [];
    // lit: real materials over unshaded colours, so the headset's own lights shade it (the default bakes mojulo's
    // studio light into the vertex colours, which then shades twice)
    const out = await m.call('export_model', { ref, format: 'glb', lit: true });
    const { glb, size, triangles } = ready(readFileSync(out.path), s.sku, { turn: frontTurn(kind), sheetRgb: sheetRgbFor(col.mojulo) });
    const file = `models/${s.sku}.glb`;
    writeFileSync(join(here, file), glb);
    // listed size is w x d x h (mm); readied size is w x h x d (m)
    const off = [Math.abs(size[0] * 1000 - s.mm[0]), Math.abs(size[2] * 1000 - s.mm[1]), Math.abs(size[1] * 1000 - s.mm[2])];
    const issues = lost.map((id) => `soft part ${id} has no volume (missing from the model)`);
    if (triangles > BUDGET.triangles) issues.push(`${triangles} triangles (budget ${BUDGET.triangles})`);
    if (glb.length > BUDGET.bytes) issues.push(`${(glb.length / 1048576).toFixed(2)} MB (budget 1.5)`);
    if (Math.max(...off) > BUDGET.sizeMm) issues.push(`size ${size.map((v) => Math.round(v * 1000)).join(' x ')} mm (w h d) against ${s.mm.join(' x ')} (w d h)`);
    byId.set(s.sku, {
      id: s.sku, name: `${col.name} ${p.name.toLowerCase()}${Object.keys(p.sizes).length > 1 || s.size !== 'std' ? `, ${s.size}` : ''}`,
      kind: p.job === 'anchor' ? 'rug' : p.job, piece: p.id, collection: s.collection, room: p.room, job: p.job,
      // what the headset's model reads beside the name, and the words speech recognition is biased toward
      note: `${col.name} collection, ${col.card}, ${p.room}`, words: [col.name, p.name.toLowerCase()],
      size, listed: s.mm, parts: partsOf(glb), triangles, bytes: glb.length, file, mojulo: { ref, kind, spec }, issues,
    });
    console.log(`  ${s.sku.padEnd(22)} ${String(triangles).padStart(6)} tris ${(glb.length / 1048576).toFixed(2)} MB  ${size.map((v) => v.toFixed(2)).join(' x ')} m  ${Date.now() - t0} ms${issues.length ? `  ! ${issues.join('; ')}` : ''}`);
    if (issues.length) problems.push([s.sku, issues]);
  } catch (e) {
    console.log(`  ${s.sku.padEnd(22)} FAILED: ${e.message.slice(0, 300)}`);
    problems.push([s.sku, [`failed: ${e.message.slice(0, 200)}`]]);
  }
  // keep catalog.json current as it goes, so an interrupted build keeps what it made
  writeFileSync(catalogPath, JSON.stringify({ built: new Date().toISOString().slice(0, 10), mojulo: m.server.version, catalog: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)) }, null, 1) + '\n');
}
m.close();
console.log(`\n${todo.length - problems.length} clean, ${problems.length} with issues`);
for (const [sku, issues] of problems) console.log(`  ${sku}: ${issues.join('; ')}`);
