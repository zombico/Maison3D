// Each SKU's mojulo recipe: the piece's own recipe, worn in its collection's finish, filled to its size exactly.
// Returns the mint_solid call ({ kind, spec }) the build sends to mojulo.
import { COLLECTIONS, PIECES } from './catalogue.mjs';
import { objectMesh } from './objects.mjs';

const byCode = Object.fromEntries(COLLECTIONS.map((c) => [c.code, c]));

const upholstered = (c, { accent = false } = {}) => ({ fabric: accent ? c.accent : c.fabric, timber: c.timber });
const wooden = (c) => ({ timber: c.timber, wood: c.wood });
const casework = (c) => ({ board: c.board, wood: c.wood, ...(c.paint ? { paint: c.paint } : {}) });

const furniture = (spec) => ({ kind: 'furniture', spec });

/** What a part can be made of instead (the pinned mojulo's fabric presets, timbers and sheet boards). */
const FABRICS = ['linen', 'canvas', 'twill', 'herringbone', 'houndstooth', 'gingham', 'tartan', 'ticking', 'velvet', 'boucle'];
export const MATERIALS = {
  fabric: FABRICS, pillows: FABRICS, throw: FABRICS, mattress: FABRICS,
  wood: ['oak', 'ash', 'walnut', 'cherry', 'maple', 'beech', 'birch', 'pine', 'hinoki', 'sugi', 'keyaki'],
  body: ['plywood', 'mdf', 'mfc', 'particleboard', 'osb'],
};
/**
 * Each timber's tone, oiled. mojulo draws a part without its grain (a sofa's turned legs) in the species' flat colour,
 * and its flat walnut is nearly as pale as its oak, so a part made in another wood is worn in this tone (make.mjs).
 */
export const WOOD_TONE = {
  oak: '#b8935f', ash: '#cdb48c', walnut: '#5c3f2a', cherry: '#9a5b3c', maple: '#d9bf94', beech: '#c9a27a',
  birch: '#d8c09a', pine: '#d2ad78', hinoki: '#e0c9a0', sugi: '#b0724a', keyaki: '#a9744a',
};
// cloths of one colour, which keep the collection's colour when chosen; the patterned ones bring their own colours
const SOLID = new Set(['linen', 'canvas', 'velvet', 'boucle', 'twill', 'herringbone']);
const ACCENTED = new Set(['ARM', 'CLB', 'LNG']); // pieces upholstered in the collection's accent fabric
export const PATTERNED = new Set(FABRICS.filter((f) => !SOLID.has(f)));
const presetOf = (f) => (typeof f === 'string' ? f : f?.preset);
const cloth = (preset, was) => (SOLID.has(preset) ? { preset, warp: was.warp, weft: was.weft ?? was.warp } : preset);

/** What each of a piece's parts is made of in its collection: { fabric: 'boucle', wood: 'oak' }, for `parts`. */
export function materialsOf(pieceId, collectionCode, parts) {
  const c = withMaterials(byCode[collectionCode].mojulo, pieceId);
  const made = { fabric: presetOf(ACCENTED.has(pieceId) ? c.accent : c.fabric), pillows: presetOf(c.fabric), throw: presetOf(c.accent), mattress: presetOf(c.mattress), wood: c.timber, body: c.board };
  return Object.fromEntries(parts.filter((k) => made[k]).map((k) => [k, made[k]]));
}

/** The collection's finish with a piece's parts made of other materials ({ fabric: 'velvet', wood: 'walnut' }). */
export function withMaterials(c, pieceId, materials = {}) {
  const out = { ...c, mattress: c.mattress ?? 'ticking' };
  for (const [part, material] of Object.entries(materials)) {
    if (!MATERIALS[part]?.includes(material)) throw new Error(`${part} cannot be ${material}: one of ${MATERIALS[part]?.join(', ') ?? 'no materials'}`);
    if (part === 'wood') out.timber = material;
    else if (part === 'body') out.board = material;
    else if (part === 'mattress') out.mattress = cloth(material, { warp: 'cream' });
    else if (part === 'throw' || (part === 'fabric' && ACCENTED.has(pieceId))) out.accent = cloth(material, c.accent);
    else out.fabric = cloth(material, c.fabric); // fabric, and a bed's pillows
  }
  return out;
}

/**
 * Degrees to turn an export so the piece's front faces +z. mojulo's furniture kind faces -z (its sofas and casework
 * show their backs from +z); workbench pieces drawn front to -y, like Maison3D's beds, already face +z. Found by
 * looking at each piece from the front.
 */
export const frontTurn = (kind) => (kind === 'furniture' ? 180 : 0);

/** The mojulo mint for one SKU, with any of its parts made of other materials (MATERIALS). */
export function recipeFor(pieceId, collectionCode, size, materials) {
  const p = PIECES.find((x) => x.id === pieceId);
  if (!p) throw new Error(`no piece ${pieceId}`);
  // Maison3D's own objects (objects.mjs): built here, not minted
  if (p.source === 'maison' && !['BED', 'PLT', 'KBD'].includes(pieceId)) {
    const mm = p.sizes[size];
    const mesh = mm && objectMesh(pieceId, collectionCode, size, mm);
    if (!mesh) throw new Error(`no object build for ${pieceId}`);
    return { kind: 'maison', mesh };
  }
  if (!byCode[collectionCode]) throw new Error(`no collection ${collectionCode}`);
  const c = withMaterials(byCode[collectionCode].mojulo, pieceId, materials);
  const mm = p.sizes[size];
  if (!mm) throw new Error(`${pieceId} has no size ${size}`);
  const sofaForms = { ...c.sofa, legs: c.legs };
  switch (p.id) {
    case 'SOF': return furniture({ like: 'sofa', forms: sofaForms, finish: upholstered(c), size: mm });
    case 'LOV': return furniture({ like: 'settee', forms: { legs: c.legs }, finish: upholstered(c), size: mm });
    case 'MCS': return furniture({ like: 'mid-century-sofa', finish: upholstered(c), size: mm });
    case 'CHS': return furniture({ like: 'chesterfield', finish: upholstered(c), size: mm });
    case 'TUX': return furniture({ like: 'tuxedo', finish: upholstered(c), size: mm });
    case 'ERA': return furniture({ like: 'english-roll-arm', finish: upholstered(c), size: mm });
    case 'ARM': return furniture({ like: 'armchair', forms: sofaForms, finish: upholstered(c, { accent: true }), size: mm });
    case 'CLB':
    case 'LNG': return furniture({ like: 'club-chair', forms: { legs: c.legs }, finish: upholstered(c, { accent: true }), size: mm });
    case 'ACC':
    case 'DCH': return furniture({ like: 'chair', forms: { legs: c.legs }, finish: wooden(c), size: mm });
    case 'COF':
    case 'SID': return furniture({ like: 'coffee-table', forms: { legs: c.legs }, finish: wooden(c), size: mm });
    case 'BEN':
    case 'BEB':
    case 'DBN':
    case 'EBN': return furniture({ piece: 'table', forms: { legs: c.legs }, finish: wooden(c), size: mm });
    case 'MED': return furniture({ like: 'media-console', finish: casework(c), size: mm });
    case 'MDU':
    case 'WRD':
    case 'SHO': return furniture({ piece: 'casework', forms: { front: 'doors' }, finish: casework(c), size: mm });
    case 'BKC':
    case 'KBK': return furniture({ like: 'bookcase', finish: casework(c), size: mm });
    case 'SDB':
    case 'CON': return furniture({ like: 'sideboard', finish: casework(c), size: mm });
    case 'NST': return furniture({ like: 'nightstand', finish: casework(c), size: mm });
    case 'DRS':
    case 'CHT': return furniture({ piece: 'casework', forms: { front: 'drawers' }, finish: casework(c), size: mm });
    case 'CAB': return furniture({ piece: 'casework', forms: { front: 'doors-over-drawer' }, finish: casework(c), size: mm });
    case 'BCH':
    case 'KCT': return furniture({ like: 'chest', finish: casework(c), size: mm });
    case 'BED':
    case 'KBD': return { kind: 'workbench', spec: bed({ size: mm, platform: false, c }) };
    // dining, office, kids, outdoor: mojulo's styles and kinds in the collection's finish
    case 'PDR': return furniture({ like: 'painted-dresser', finish: casework(c), size: mm });
    case 'DTB': return furniture({ like: 'dining-table', forms: { legs: c.legs }, finish: wooden(c), size: mm });
    case 'FHT': return furniture({ like: 'farmhouse-table', finish: wooden(c), size: mm });
    case 'MCT': return furniture({ like: 'mid-century-table', finish: wooden(c), size: mm });
    case 'WSR': return furniture({ like: 'windsor-side-chair', finish: wooden(c), size: mm });
    case 'YOK': return furniture({ like: 'chair', forms: { legs: 'tapered' }, finish: wooden(c), size: mm });
    case 'DKC':
    case 'KCH':
    case 'OCH': return furniture({ like: 'chair', forms: { legs: c.legs }, finish: wooden(c), size: mm });
    case 'BAR': return furniture({ like: 'counter', finish: casework(c), size: mm });
    case 'UTL': return furniture({ like: 'shop-shelves', finish: casework(c), size: mm });
    case 'STL':
    case 'DSK':
    case 'SDK':
    case 'STT':
    case 'KTB':
    case 'OBT':
    case 'OBN': return furniture({ piece: 'table', forms: { legs: c.legs }, finish: wooden(c), size: mm });
    case 'OLS': return furniture({ piece: 'sofa', forms: { arms: 'none', back: 'loose', seat: 'loose', legs: c.legs }, finish: upholstered(c, { accent: true }), size: mm });
    case 'LDK': return { kind: 'workbench', spec: lDesk({ size: mm, c }) };
    // soft things: mojulo's soft parts in the collection's fabrics (a hidden block inside, as a frame needs one)
    case 'CUS': return { kind: 'workbench', spec: soft({ size: mm, id: 'pillow', kind: 'pillow', fabric: c.accent }), drop: ['core'] };
    case 'LMB': return { kind: 'workbench', spec: soft({ size: mm, id: 'pillow-lumbar', kind: 'pillow', fabric: c.fabric }), drop: ['core'] };
    case 'THR': return { kind: 'workbench', spec: soft({ size: mm, id: 'throw', kind: 'cushion', style: 'boxed', fabric: c.accent }), drop: ['core'] };
    case 'POF': return { kind: 'workbench', spec: soft({ size: mm, id: 'pillow-pouf', kind: 'cushion', style: 'boxed', fabric: c.fabric }), drop: ['core'] };
    case 'PLT': return { kind: 'workbench', spec: bed({ size: mm, platform: true, c }) };
    default: throw new Error(`no recipe yet for ${p.id} (${p.source})`);
  }
}

/** One soft thing (a cushion, a throw, a pouf) on its own, `size` [w, d, h] mm, drawn front to -y. */
function soft({ size: [w, d, h], id, kind, style, fabric }) {
  const part = { id, kind, ...(style ? { style } : {}), box: { min: [0, 0, 0], max: [w, d, h] }, fabric };
  const core = { id: 'core', box: { min: [w / 2 - 10, d / 2 - 10, h / 2 - 10], max: [w / 2 + 10, d / 2 + 10, h / 2 + 10] }, species: 'oak' };
  return { units: 'mm', frames: [{ id, unit: 'mm', detail: 'boxes', members: [core], soft: [part], softCell: kind === 'pillow' ? 18 : 22 }] };
}

/** A corner desk: two tops meeting in an L, on five legs, in the collection's timber; drawn x across, y back from the front. */
function lDesk({ size: [w, d, h], c }) {
  const top = 30, deep = 600, leg = 45, wood = { species: c.timber, finish: c.wood };
  const members = [
    { id: 'top-a', box: { min: [0, 0, h - top], max: [w, deep, h] }, ...wood },
    { id: 'top-b', box: { min: [w - deep, deep, h - top], max: [w, d, h] }, ...wood },
    ...[[0, 0], [w - leg, 0], [0, deep - leg], [w - deep, d - leg], [w - leg, d - leg]].map(([x, y], i) => ({ id: `leg-${i}`, box: { min: [x, y, 0], max: [x + leg, y + leg, h - top] }, ...wood })),
  ];
  return { units: 'mm', frames: [{ id: 'l-desk', unit: 'mm', detail: 'boxes', members, figure: 'coarse' }] };
}

/**
 * Maison3D's bed, from mojulo's workbench parts: a frame in the collection's timber (on legs, or on a plinth), a
 * boxed mattress, two pillows in the collection's fabric and a folded throw in its accent. Drawn x across, y from the head
 * (0) to the foot, z up, then turned so the foot is the front. Soft parts on a 45 mm grain and coarse wood figure keep it near 12,000 triangles. The throw is a boxed
 * cushion standing 40 mm proud of the mattress with as much again sunk into it: on this grain a part needs about two
 * cells of depth, and a thinner one (a 30 mm knife throw) fell between the cells on the king and vanished.
 */
export function bed({ size: [w, d, h], platform, c }) {
  const leg = platform ? 0 : 160, rail = 28, frameT = platform ? 300 : 120, mattress = 220;
  const baseTop = leg + frameT;
  const wood = { species: c.timber, finish: c.wood };
  const above = leg + (platform ? 60 : 0);
  const members = [];
  if (platform) members.push({ id: 'plinth', box: { min: [20, 60, 0], max: [w - 20, d - 20, 60] }, ...wood });
  members.push(
    { id: 'rail-l', box: { min: [0, 60, above], max: [rail, d, baseTop] }, ...wood },
    { id: 'rail-r', box: { min: [w - rail, 60, above], max: [w, d, baseTop] }, ...wood },
    { id: 'foot', box: { min: [rail, d - rail, above], max: [w - rail, d, baseTop] }, ...wood },
    { id: 'head', box: { min: [0, 0, 0], max: [w, 60, Math.max(h, baseTop + mattress + 300)] }, ...wood },
  );
  if (!platform) {
    for (const [x, y, id] of [[0, 60, 'leg-hl'], [w - 60, 60, 'leg-hr'], [0, d - 60, 'leg-fl'], [w - 60, d - 60, 'leg-fr']]) {
      members.push({ id, box: { min: [x, y, 0], max: [x + 60, y + 60, leg] }, ...wood });
    }
  }
  const top = baseTop + mattress;
  const soft = [
    { id: 'mattress', kind: 'cushion', style: 'boxed', box: { min: [rail + 5, 65, baseTop], max: [w - rail - 5, d - rail - 5, top] }, fabric: c.mattress ?? 'ticking', crown: 10 },
    { id: 'pillow-l', kind: 'pillow', box: { min: [rail + 60, 90, top], max: [w / 2 - 30, 450, top + 140] }, fabric: c.fabric, tilt: 20 },
    { id: 'pillow-r', kind: 'pillow', box: { min: [w / 2 + 30, 90, top], max: [w - rail - 60, 450, top + 140] }, fabric: c.fabric, tilt: 20 },
    { id: 'throw', kind: 'cushion', style: 'boxed', box: { min: [rail + 5, d * 0.62, top - 40], max: [w - rail - 5, d - rail - 5, top + 40] }, fabric: c.accent },
  ];
  // drawn head at y = 0; mojulo's front is -y (it becomes +z, the way a placed piece faces), so the foot goes there
  const flip = (box) => ({ min: [box.min[0], d - box.max[1], box.min[2]], max: [box.max[0], d - box.min[1], box.max[2]] });
  for (const part of [...members, ...soft]) part.box = flip(part.box);
  return { units: 'mm', frames: [{ id: 'bed', unit: 'mm', detail: 'boxes', members, soft, fabric: c.fabric, softCell: 45, figure: 'coarse' }] };
}
