// One SKU made on the pinned mojulo: its recipe minted (with any parts made of other materials), exported as GLB and
// readied for the headset. The catalogue build makes every SKU this way; the furnish server makes a piece in another
// material the same way when someone asks for one ("make the sofa velvet").
import { readFileSync } from 'node:fs';
import { COLLECTIONS, PIECES } from './catalogue.mjs';
import { recipeFor, frontTurn, withMaterials, WOOD_TONE } from './recipes.mjs';
import { ready } from './ready.mjs';
import { partsOf, recolour } from './colour.mjs';
import { settle } from '../07-spike-native-furnish/mesh.mjs';

// mojulo's own sheet table and finishes, from the pinned source, to colour the sheet goods its lit export leaves white
const { SHEETS, sheetColor } = await import('../.mojulo/src/control/lib/graph/construction/sheets.js');
const BOARD_OF = { ply: 'plywood', mdf: 'mdf', particle: 'particleboard', osb: 'osb' };
const sheetRgbFor = (c) => (key) => {
  const material = key.m === 'ply' || key.m === 'mdf' ? BOARD_OF[key.m] : Object.keys(SHEETS).find((k) => SHEETS[k].figure === key.m);
  if (!material) return null;
  const { face } = sheetColor(material, { finish: c.paint ? { paint: c.paint } : c.wood });
  return face.mode === 'figure' ? face.rgb : null;
};

/**
 * Makes `sku` ({ sku, piece, collection, size }) on mojulo connection `m`, with `materials` ({ fabric: 'velvet' }).
 * Returns the readied GLB, its size (w, h, d in m), triangles, parts and their colours, soft parts mojulo lost, and
 * the mint it came from.
 */
export async function makeSku(m, { sku, piece, collection, size }, materials = {}) {
  const p = PIECES.find((x) => x.id === piece);
  const col = COLLECTIONS.find((c) => c.code === collection);
  const recipe = recipeFor(piece, collection, size, materials);
  const { kind, spec } = recipe;
  if (kind === 'maison') {
    // Maison3D's own object: built here, centred on its footprint, its base on y = 0
    const sz = settle(recipe.mesh);
    const glb = recipe.mesh.glb(sku);
    return { glb, size: sz, triangles: recipe.mesh.triangles, parts: partsOf(glb), lost: [], mojulo: null };
  }
  const tag = Object.entries(materials).map(([k, v]) => `${k}_${v}`).join('_');
  const ref = `sku_${sku.toLowerCase().replace(/[^a-z0-9]+/g, '_')}${tag ? `_${tag}` : ''}_${Date.now().toString(36)}`;
  const minted = await m.call('mint_solid', { kind, ref, title: `${col.name} ${p.name} (${size})${tag ? ` in ${Object.values(materials).join(', ')}` : ''}`, spec });
  // a soft part mojulo's grain could not catch comes back with no volume and is missing from the model
  const lost = JSON.stringify(minted).match(/"id":"[^"]+","kind":"(?:cushion|pillow|bolster|pad)"[^}]*?"volumeL":0[,}]/g)?.map((x) => x.match(/"id":"([^"]+)"/)[1]) ?? [];
  // lit: real materials over unshaded colours, so the headset's own lights shade it (the default bakes mojulo's
  // studio light into the vertex colours, which then shades twice)
  const out = await m.call('export_model', { ref, format: 'glb', lit: true });
  const readied = ready(readFileSync(out.path), sku, { turn: frontTurn(kind), sheetRgb: sheetRgbFor(withMaterials(col.mojulo, piece, materials)), drop: recipe.drop ?? [] });
  // another wood is worn in its own tone, grain kept (WOOD_TONE: mojulo's flat colours barely tell the species apart)
  if (materials.wood && partsOf(readied.glb).wood) readied.glb = recolour(readied.glb, { wood: WOOD_TONE[materials.wood] });
  return { ...readied, parts: partsOf(readied.glb), lost, mojulo: { ref, kind, spec } };
}
