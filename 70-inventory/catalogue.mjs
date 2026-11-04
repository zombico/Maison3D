// The Maison3D catalogue, as data: seven collections and every piece they carry, each piece a mojulo recipe at true
// size. This is the source the catalogue build reads (mint each recipe, export, ready it for the headset) and the
// review doc is generated from (`node 70-inventory/list.mjs`). A SKU is one piece, in one collection, at one size.
//
// `source` says how mojulo makes a piece:
//   furniture: mint_solid's furniture builds (a style `like`, or a `piece` kind, with forms, finish and a size)
//   roster:    one of mojulo's room furnishings (a lamp, a rug, a TV…), exported from a one-cell room
//   workbench: a measured object study (lathes, extrudes), for what neither of the above has
//   maison:    Maison3D's own workbench recipe (recipes.mjs), where mojulo's piece is too plain (its bed)
//   gap:       not in mojulo today (see `gaps` below)
// Sizes are millimetres, width x depth x height, as mojulo takes them.

export const COLLECTIONS = [
  {
    code: 'HIN', name: 'Hinoki', card: 'japandi',
    line: 'Low, calm, natural: oiled oak, oat linen, nothing extra.',
    fabric: 'linen in oat', accent: 'boucle in cream', timber: 'oak, oiled', casework: 'plywood, oiled', legs: 'block', paint: null,
    mojulo: { fabric: { preset: 'linen', warp: 'oat', weft: 'oat' }, accent: { preset: 'boucle', warp: 'cream', weft: 'cream' }, timber: 'oak', wood: 'oil', board: 'plywood', legs: 'block', sofa: { arms: 'track', back: 'tight', seat: 'bench' } },
  },
  {
    code: 'ATL', name: 'Atelier 58', card: 'mid-century',
    line: 'Walnut and tapered legs, the 1958 living room.',
    fabric: 'herringbone in olive', accent: 'twill in mustard', timber: 'walnut, oiled', casework: 'plywood, walnut-stained', legs: 'tapered', paint: null,
    mojulo: { fabric: { preset: 'herringbone', warp: 'olive', weft: 'olive' }, accent: { preset: 'twill', warp: 'mustard', weft: 'mustard' }, timber: 'walnut', wood: 'oil', board: 'plywood', paint: '#5a3a22', legs: 'tapered', sofa: { arms: 'track', back: 'loose', seat: 'loose' } },
  },
  {
    code: 'CAL', name: 'Calme', card: 'quiet-luxury',
    line: 'Soft, tailored and quiet: boucle, cherry, sand.',
    fabric: 'boucle in oat', accent: 'velvet in camel', timber: 'cherry, waxed', casework: 'mdf, painted sand #d9cfc1', legs: 'bun', paint: '#d9cfc1',
    mojulo: { fabric: { preset: 'boucle', warp: 'oat', weft: 'oat' }, accent: { preset: 'velvet', warp: 'camel', weft: 'camel' }, timber: 'cherry', wood: 'wax', board: 'mdf', paint: '#d9cfc1', legs: 'bun', sofa: { arms: 'tuxedo', back: 'tight', seat: 'bench' } },
  },
  {
    code: 'LIT', name: 'Littoral', card: 'coastal',
    line: 'Light and salt-washed: limewashed ash, white linen, navy ticking.',
    fabric: 'linen in white', accent: 'ticking in navy', timber: 'ash, limewashed', casework: 'mdf, painted white #f2efe8', legs: 'tapered', paint: '#f2efe8',
    mojulo: { fabric: { preset: 'linen', warp: 'white', weft: 'white' }, accent: { preset: 'ticking', warp: 'navy', weft: 'navy' }, timber: 'ash', wood: 'limewash', board: 'mdf', paint: '#f2efe8', legs: 'tapered', sofa: { arms: 'rolled', back: 'loose', seat: 'loose' } },
  },
  {
    code: 'SAB', name: 'Sable', card: 'modern-organic',
    line: 'Rounded and warm: raw oak, sand boucle, a rust accent.',
    fabric: 'boucle in sand', accent: 'canvas in rust', timber: 'oak, waxed', casework: 'plywood, waxed', legs: 'bun', paint: null,
    mojulo: { fabric: { preset: 'boucle', warp: 'sand', weft: 'sand' }, accent: { preset: 'canvas', warp: 'rust', weft: 'rust' }, timber: 'oak', wood: 'wax', board: 'plywood', legs: 'bun', sofa: { arms: 'rolled', back: 'loose', seat: 'loose' } },
  },
  {
    code: 'FET', name: 'Fête', card: 'maximalism',
    line: 'Loud and happy: emerald velvet, tufted backs, mustard paint.',
    fabric: 'velvet in emerald', accent: 'velvet in rust', timber: 'walnut, oiled', casework: 'mdf, painted mustard #c9a227', legs: 'turned', paint: '#c9a227',
    mojulo: { fabric: { preset: 'velvet', warp: 'emerald', weft: 'emerald' }, accent: { preset: 'velvet', warp: 'rust', weft: 'rust' }, timber: 'walnut', wood: 'oil', board: 'mdf', paint: '#c9a227', legs: 'turned', sofa: { arms: 'rolled-high', back: 'tufted', seat: 'bench' } },
  },
  {
    code: 'BIB', name: 'Bibliothèque', card: 'dark-academia',
    line: 'The library: chesterfields, tartan, dark walnut and books.',
    fabric: 'tartan in forest', accent: 'velvet in chocolate', timber: 'walnut, waxed', casework: 'plywood, stained #3b2a1e', legs: 'turned', paint: '#3b2a1e',
    mojulo: { fabric: { preset: 'tartan', warp: 'forest', weft: 'forest' }, accent: { preset: 'velvet', warp: 'chocolate', weft: 'chocolate' }, timber: 'walnut', wood: 'wax', board: 'plywood', paint: '#3b2a1e', legs: 'turned', sofa: { arms: 'rolled-high', back: 'tufted', seat: 'bench' } },
  },
];

const ALL = COLLECTIONS.map((c) => c.code);

// id, name, room, job (the interior designer's function), source + recipe, sizes, collections
export const PIECES = [
  // --- living room -------------------------------------------------------------------------------------------
  { id: 'SOF', name: 'Sofa', room: 'living', job: 'converse', source: 'furniture', recipe: "like 'sofa'", sizes: { '2-seat': [1700, 900, 780], '3-seat': [2100, 920, 780], '4-seat': [2600, 950, 780] }, in: ALL },
  { id: 'LOV', name: 'Loveseat', room: 'living', job: 'converse', source: 'furniture', recipe: "like 'settee'", sizes: { std: [1450, 850, 800] }, in: ALL },
  { id: 'CHS', name: 'Chesterfield', room: 'living', job: 'converse', source: 'furniture', recipe: "like 'chesterfield'", sizes: { '3-seat': [2200, 950, 760] }, in: ['CAL', 'FET', 'BIB'] },
  { id: 'MCS', name: 'Mid-century sofa', room: 'living', job: 'converse', source: 'furniture', recipe: "like 'mid-century-sofa'", sizes: { '3-seat': [2000, 850, 780] }, in: ['ATL', 'SAB'] },
  { id: 'TUX', name: 'Tuxedo sofa', room: 'living', job: 'converse', source: 'furniture', recipe: "like 'tuxedo'", sizes: { '3-seat': [2200, 900, 740] }, in: ['CAL', 'FET'] },
  { id: 'ERA', name: 'English roll-arm sofa', room: 'living', job: 'converse', source: 'furniture', recipe: "like 'english-roll-arm'", sizes: { '3-seat': [2100, 950, 860] }, in: ['LIT', 'BIB'] },
  { id: 'ARM', name: 'Armchair', room: 'living', job: 'converse', source: 'furniture', recipe: "like 'armchair'", sizes: { std: [850, 850, 800] }, in: ALL },
  { id: 'CLB', name: 'Club chair', room: 'living', job: 'read', source: 'furniture', recipe: "like 'club-chair'", sizes: { std: [800, 850, 760] }, in: ['ATL', 'CAL', 'BIB'] },
  { id: 'LNG', name: 'Lounge chair', room: 'living', job: 'read', source: 'furniture', recipe: "like 'club-chair', the accent fabric", sizes: { std: [760, 820, 760] }, in: ['HIN', 'LIT', 'SAB'] },
  { id: 'ACC', name: 'Accent chair', room: 'living', job: 'converse', source: 'furniture', recipe: "like 'chair'", sizes: { std: [560, 580, 820] }, in: ALL },
  { id: 'COF', name: 'Coffee table', room: 'living', job: 'converse', source: 'furniture', recipe: "like 'coffee-table'", sizes: { std: [1100, 600, 400], long: [1300, 700, 380] }, in: ALL },
  { id: 'SID', name: 'Side table', room: 'living', job: 'read', source: 'furniture', recipe: "like 'coffee-table', at side-table size", sizes: { std: [450, 450, 550] }, in: ALL },
  { id: 'MED', name: 'Media console', room: 'living', job: 'media', source: 'furniture', recipe: "like 'media-console'", sizes: { short: [1200, 420, 520], std: [1800, 450, 520], long: [2400, 450, 520] }, in: ALL },
  { id: 'MDU', name: 'Media wall unit', room: 'living', job: 'media', source: 'furniture', recipe: "piece 'casework', front 'doors', tall", sizes: { std: [2000, 420, 1800] }, in: ['HIN', 'CAL', 'SAB'] },
  { id: 'BKC', name: 'Bookcase', room: 'living', job: 'display', source: 'furniture', recipe: "like 'bookcase'", sizes: { std: [800, 320, 1830], tall: [1000, 350, 2100] }, in: ALL },
  { id: 'SDB', name: 'Sideboard', room: 'living', job: 'store', source: 'furniture', recipe: "like 'sideboard'", sizes: { std: [1600, 450, 800], long: [2000, 460, 800] }, in: ALL },
  { id: 'BEN', name: 'Low bench', room: 'living', job: 'converse', source: 'furniture', recipe: "piece 'table', at seat height", sizes: { std: [1200, 400, 450] }, in: ['HIN', 'LIT', 'SAB'] },

  // --- bedroom -----------------------------------------------------------------------------------------------
  { id: 'BED', name: 'Bed', room: 'bedroom', job: 'sleep', source: 'maison', recipe: 'Maison3D bed: workbench frame on legs, boxed mattress, pillows, a throw', sizes: { double: [1400, 2050, 1000], queen: [1600, 2100, 1050], king: [1930, 2130, 1100] }, in: ALL },
  { id: 'PLT', name: 'Platform bed', room: 'bedroom', job: 'sleep', source: 'maison', recipe: 'Maison3D bed: workbench frame on a plinth, boxed mattress, pillows, a throw', sizes: { queen: [1700, 2150, 900], king: [2030, 2180, 900] }, in: ['HIN', 'CAL', 'SAB'] },
  { id: 'NST', name: 'Nightstand', room: 'bedroom', job: 'sleep', source: 'furniture', recipe: "like 'nightstand'", sizes: { std: [500, 400, 550] }, in: ALL },
  { id: 'DRS', name: 'Dresser', room: 'bedroom', job: 'dress', source: 'furniture', recipe: "piece 'casework', front 'drawers'", sizes: { std: [1200, 500, 800], wide: [1600, 500, 800] }, in: ALL },
  { id: 'CHT', name: 'Chest of drawers', room: 'bedroom', job: 'dress', source: 'furniture', recipe: "piece 'casework', front 'drawers'", sizes: { tall: [800, 450, 1100] }, in: ALL },
  { id: 'PDR', name: 'Painted dresser', room: 'bedroom', job: 'dress', source: 'furniture', recipe: "like 'painted-dresser'", sizes: { std: [1200, 480, 820] }, in: ['LIT', 'FET'] },
  { id: 'WRD', name: 'Wardrobe', room: 'bedroom', job: 'store', source: 'furniture', recipe: "piece 'casework', front 'doors'", sizes: { single: [1000, 600, 2000], double: [1600, 600, 2100] }, in: ALL },
  { id: 'BEB', name: 'Bed-end bench', room: 'bedroom', job: 'sleep', source: 'furniture', recipe: "piece 'table', at seat height", sizes: { std: [1300, 420, 450] }, in: ALL },
  { id: 'BCH', name: 'Blanket chest', room: 'bedroom', job: 'store', source: 'furniture', recipe: "like 'chest'", sizes: { std: [900, 450, 480] }, in: ['HIN', 'FET', 'BIB'] },

  // --- dining ------------------------------------------------------------------------------------------------
  { id: 'DTB', name: 'Dining table', room: 'dining', job: 'dine', source: 'furniture', recipe: "like 'dining-table'", sizes: { '4-seat': [1400, 850, 750], '6-seat': [1800, 900, 750], '8-seat': [2400, 1000, 750] }, in: ALL },
  { id: 'FHT', name: 'Farmhouse table', room: 'dining', job: 'dine', source: 'furniture', recipe: "like 'farmhouse-table'", sizes: { '6-seat': [2000, 950, 760] }, in: ['LIT', 'SAB', 'BIB'] },
  { id: 'MCT', name: 'Mid-century table', room: 'dining', job: 'dine', source: 'furniture', recipe: "like 'mid-century-table'", sizes: { '6-seat': [1600, 850, 740] }, in: ['ATL'] },
  { id: 'DCH', name: 'Dining chair', room: 'dining', job: 'dine', source: 'furniture', recipe: "like 'chair'", sizes: { std: [450, 520, 820] }, in: ALL },
  { id: 'WSR', name: 'Windsor side chair', room: 'dining', job: 'dine', source: 'furniture', recipe: "like 'windsor-side-chair'", sizes: { std: [470, 500, 880] }, in: ['LIT', 'BIB'] },
  { id: 'YOK', name: 'Yoke chair', room: 'dining', job: 'dine', source: 'roster', recipe: "furnishing 'yoke-chair'", sizes: { std: [520, 500, 760] }, in: ['HIN', 'SAB'] },
  { id: 'DBN', name: 'Dining bench', room: 'dining', job: 'dine', source: 'roster', recipe: "furnishing 'bench'", sizes: { std: [1500, 380, 450] }, in: ALL },
  { id: 'BAR', name: 'Home bar', room: 'dining', job: 'dine', source: 'roster', recipe: "furnishing 'bar'", sizes: { std: [1500, 600, 1050] }, in: ['ATL', 'FET'] },
  { id: 'STL', name: 'Counter stool', room: 'dining', job: 'dine', source: 'roster', recipe: "furnishing 'stool'", sizes: { counter: [400, 400, 650] }, in: ALL },

  // --- home office -------------------------------------------------------------------------------------------
  { id: 'DSK', name: 'Desk', room: 'office', job: 'work', source: 'roster', recipe: "furnishing 'desk' (interior piece)", sizes: { std: [1200, 600, 750], wide: [1400, 700, 750] }, in: ALL },
  { id: 'SDK', name: 'Standing desk', room: 'office', job: 'work', source: 'roster', recipe: "furnishing 'standing-desk'", sizes: { std: [1400, 700, 1050] }, in: ['HIN', 'ATL', 'CAL', 'SAB'] },
  { id: 'LDK', name: 'Corner desk', room: 'office', job: 'work', source: 'roster', recipe: "furnishing 'l-desk'", sizes: { std: [1600, 1600, 750] }, in: ['CAL', 'SAB'] },
  { id: 'STT', name: 'Writing table', room: 'office', job: 'work', source: 'roster', recipe: "furnishing 'study-table'", sizes: { std: [1100, 550, 750] }, in: ['LIT', 'BIB'] },
  { id: 'DKC', name: 'Desk chair', room: 'office', job: 'work', source: 'roster', recipe: "furnishing 'desk-chair'", sizes: { std: [600, 600, 950] }, in: ALL },
  { id: 'UTL', name: 'Open shelving', room: 'office', job: 'display', source: 'roster', recipe: "furnishing 'utility-shelf'", sizes: { std: [900, 400, 1800] }, in: ['HIN', 'SAB'] },
  { id: 'CAB', name: 'Low cabinet', room: 'office', job: 'store', source: 'furniture', recipe: "piece 'casework', front 'doors-over-drawer'", sizes: { std: [800, 450, 750] }, in: ALL },
  { id: 'KIT', name: 'Desk-top kit', room: 'office', job: 'work', source: 'roster', recipe: "furnishings 'monitor', 'keyboard', 'mouse', 'laptop', 'pencil-holder', 'notebook'", sizes: { set: [900, 400, 450] }, in: ['ALL'] },

  // --- entry and hall ----------------------------------------------------------------------------------------
  { id: 'EBN', name: 'Entry bench', room: 'entry', job: 'drop', source: 'roster', recipe: "furnishing 'bench' (interior entry-bench)", sizes: { std: [1000, 380, 450] }, in: ALL },
  { id: 'CON', name: 'Hall console', room: 'entry', job: 'drop', source: 'furniture', recipe: "like 'sideboard', narrow", sizes: { std: [1000, 350, 800] }, in: ALL },
  { id: 'SHO', name: 'Shoe cabinet', room: 'entry', job: 'store', source: 'furniture', recipe: "piece 'casework', front 'doors'", sizes: { std: [900, 350, 1000] }, in: ALL },

  // --- kids' room --------------------------------------------------------------------------------------------
  { id: 'KBD', name: 'Single bed', room: 'kids', job: 'sleep', source: 'roster', recipe: "furnishing 'bed' (bed: single)", sizes: { single: [900, 1900, 800] }, in: ['LIT', 'SAB', 'FET'] },
  { id: 'KBK', name: 'Low bookcase', room: 'kids', job: 'display', source: 'furniture', recipe: "like 'bookcase', low", sizes: { low: [900, 300, 900] }, in: ['LIT', 'SAB', 'FET'] },
  { id: 'KTB', name: 'Play table', room: 'kids', job: 'work', source: 'furniture', recipe: "piece 'table', child height", sizes: { std: [900, 600, 520] }, in: ['LIT', 'SAB', 'FET'] },
  { id: 'KCH', name: 'Small chair', room: 'kids', job: 'work', source: 'furniture', recipe: "piece 'chair', child height", sizes: { std: [320, 320, 560] }, in: ['LIT', 'SAB', 'FET'] },
  { id: 'KCT', name: 'Toy chest', room: 'kids', job: 'store', source: 'furniture', recipe: "like 'chest'", sizes: { std: [800, 400, 450] }, in: ['LIT', 'SAB', 'FET'] },

  // --- outdoor and balcony -----------------------------------------------------------------------------------
  { id: 'OBN', name: 'Garden bench', room: 'outdoor', job: 'converse', source: 'roster', recipe: "furnishing 'bench', timber yakisugi or oiled", sizes: { std: [1200, 420, 450] }, in: ['HIN', 'LIT', 'SAB'] },
  { id: 'OBT', name: 'Bistro table', room: 'outdoor', job: 'dine', source: 'furniture', recipe: "piece 'table', small", sizes: { std: [700, 700, 740] }, in: ['HIN', 'LIT', 'SAB'] },
  { id: 'OCH', name: 'Garden chair', room: 'outdoor', job: 'dine', source: 'furniture', recipe: "like 'chair', canvas seat", sizes: { std: [480, 520, 800] }, in: ['HIN', 'LIT', 'SAB'] },
  { id: 'OLS', name: 'Outdoor lounge sofa', room: 'outdoor', job: 'converse', source: 'furniture', recipe: "piece 'sofa', arms 'none', canvas", sizes: { std: [1800, 850, 700] }, in: ['LIT', 'SAB'] },

  // --- lighting, rugs and decor (every room) -----------------------------------------------------------------
  { id: 'FLP', name: 'Floor lamp', room: 'any', job: 'light-task', source: 'roster', recipe: "furnishing 'floor-lamp'", sizes: { std: [380, 380, 1600] }, in: ALL },
  { id: 'SCN', name: 'Wall sconce', room: 'any', job: 'light-task', source: 'roster', recipe: "furnishing 'sconce'", sizes: { std: [150, 200, 300] }, in: ALL },
  { id: 'TLP', name: 'Table lamp', room: 'any', job: 'light-task', source: 'workbench', recipe: 'lathes: a base, a stem and a shade (as the catalogue floor lamp)', sizes: { std: [300, 300, 550] }, in: ALL },
  { id: 'RUG', name: 'Area rug', room: 'any', job: 'anchor', source: 'roster', recipe: "furnishing 'rug' / 'bordered-rug'", sizes: { '160x230': [1600, 2300, 10], '200x300': [2000, 3000, 10], '240x340': [2400, 3400, 10] }, in: ALL },
  { id: 'RUN', name: 'Runner', room: 'any', job: 'anchor', source: 'roster', recipe: "furnishing 'runner'", sizes: { '80x240': [800, 2400, 10] }, in: ALL },
  { id: 'ART', name: 'Wall art', room: 'any', job: 'display', source: 'roster', recipe: "furnishing 'picture'", sizes: { small: [600, 30, 800], large: [900, 30, 1200] }, in: ALL },
  { id: 'MIR', name: 'Floor mirror', room: 'any', job: 'dress', source: 'roster', recipe: "furnishing 'mirror'", sizes: { std: [600, 40, 1700] }, in: ALL },
  { id: 'VAS', name: 'Vase', room: 'any', job: 'display', source: 'roster', recipe: "furnishing 'vase'", sizes: { std: [140, 140, 430] }, in: ALL },
  { id: 'TV', name: 'Television', room: 'any', job: 'media', source: 'roster', recipe: "furnishing 'tv' (tv: inches)", sizes: { '55in': [1230, 60, 710], '65in': [1450, 60, 830] }, in: ['ALL'] },
];

// what the list wants and mojulo cannot make today
export const GAPS = [
  { name: 'Sectional and corner sofa', want: 'living', route: 'new mojulo build', note: 'its sofa build is straight; two sofas set at a corner is a stopgap' },
  { name: 'Round and oval tables', want: 'dining, living', route: 'new build, or workbench', note: 'a lathe top on a table base' },
  { name: 'Round rug', want: 'any', route: 'workbench', note: 'a thin lathe disc with the rug colours' },
  { name: 'Ottoman and pouf', want: 'living', route: 'new mojulo build', note: 'an armless one-seat sofa is close, but not a pouf' },
  { name: 'Pendant and chandelier', want: 'dining, living', route: 'workbench', note: 'needs the ceiling height, which the scan gives' },
  { name: 'Plants and planters', want: 'any', route: 'workbench for the pot; foliage is new', note: 'a pot is a lathe; leaves are not' },
  { name: 'Curtains and blinds', want: 'any', route: 'later', note: 'needs windows placed exactly; mojulo drapes can hang one' },
  { name: 'Coat rack and wall hooks', want: 'entry', route: 'workbench', note: 'sweeps on a post' },
  { name: 'Wall shelves', want: 'any', route: 'workbench', note: 'boards on brackets; needs wall anchoring in the headset' },
  { name: 'Bar cart', want: 'dining', route: 'workbench', note: 'a frame on wheels' },
  { name: 'Cushions and throws', want: 'living, bedroom', route: 'part of a sofa today', note: 'mojulo sofas carry pillows; loose ones are new' },
  { name: 'Bunk bed', want: 'kids', route: 'new mojulo build', note: '' },
  { name: 'Parasol', want: 'outdoor', route: 'workbench', note: '' },
];

/** Every SKU: { sku, piece, collection, size, mm }. */
export function skus() {
  const out = [];
  for (const p of PIECES) {
    const cols = p.in[0] === 'ALL' ? [null] : p.in;
    for (const c of cols) for (const [size, mm] of Object.entries(p.sizes)) out.push({ sku: `${c ?? 'M3D'}-${p.id}-${size}`, piece: p.id, collection: c, size, mm });
  }
  return out;
}
