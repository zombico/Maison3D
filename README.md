# Maison3D

Furnish a real room by voice in a Quest headset. The headset's room scan becomes a room that Meta's models
(through the Meta Model API) design and rearrange with [mojulo](https://github.com/zombico/mojulo), and the
furniture appears over passthrough.

The repo holds the product only:

- `07-spike-native-furnish/`: the Quest app (Kotlin, Meta Spatial SDK, `app/`) and the laptop server it talks to
  (Node: Muse's tools, the room, the scene, the pieces Maison3D builds itself).
- `70-inventory/`: the furniture library made with mojulo, seven collections, its models committed.
- `mojulo/`: the pinned mojulo the library is made with (`npm run mojulo:setup`), and the `maison-furniture` MCP
  server for agents working in this repo (`.mcp.json`).

How this becomes a submitted app: [`docs/packaging-proposal.md`](docs/packaging-proposal.md).

## In the browser, by hand as well as by voice

The web client (`07-spike-native-furnish/web/`) does a lot without any model in between: it calls the same tools Muse
uses (`/api/tool`):

- **Add:** browse the whole library by category or search. A piece goes where you clicked, into your highlighted
  area, or in front of you.
- **Move and turn:** drag a piece to move it (on the floor, its wall, or what it stands on). Q and E turn it, Delete
  removes it. In VR, hold the trigger on a piece to carry it and the thumbstick turns it.
- **A piece's panel:** turn it, the next size down or up, its finish, its parts' colours, remove.
- **The room:** its size in feet, and what the floor, walls and ceiling are made of, with their colours.
- **Highlight an area:** shift-drag (or the Highlight button) over the floor, a wall or the ceiling; in VR, hold B
  and sweep. Then "a sofa that fits here", or add from the library: the largest size that fits is chosen, backed onto
  a wall the area runs along; a picture is made to the area; pot lights fill it.
- **Day and evening:** daylight through the windows, or the evening with the lamps, ceiling lights and pot lights
  lighting the room (each fixture knows where its bulb is; the nearest eight light the view).

**Every piece keeps its own space.** Its box is its budget: a placement, a move, a resize or a drag that would put it
in another's is an error, and it is moved to the nearest free spot beside it (a lamp on a table stays on the table;
rugs, curtains and chairs tucked under their table are exempt). The tool's answer says so.

**Export:**
- **3D model (.glb):** the room and every piece, its lights as glTF lights, for Blender, Godot, Unity or three.js.
  It passes the Khronos glTF validator.
- **Walkable page (.html):** that GLB inside a page that opens in any browser and enters VR on a Quest.
- **With mojulo** (on a laptop with mojulo, `npm run mojulo:setup`): the room and its pieces are bound as a mesh onto
  a mojulo sketch and placed in a mojulo floorplan the room's size. mojulo's own exporters then make its walkable
  `world.html` (orbit, walk with gravity and walls, fly), a USDZ for AR Quick Look, its lit GLB and a Godot 4 project.
  All of it comes zipped, in about seven seconds.

## The public demo

The same server serves a web client (`07-spike-native-furnish/web/`): the room in 3D in any browser, typed or spoken
requests, a click to point, and **Enter VR** in a Quest's browser (WebXR: grip to talk, trigger to point, thumbstick to
step and turn). Nothing to install.

With `MAISON_PUBLIC=1` the server is a public demo:

- it listens beyond the machine;
- each visitor's browser keeps its own room (a design per visitor, in memory, kept six hours idle);
- turns are limited per visitor (30 a day), per address (60) and for the whole day (1,500, the real guard on cost);
- replies are spoken by the browser.

Making a part in another material needs mojulo on the server and is off in the demo; colours work.

**Render:** New > Blueprint, pick this repo (`render.yaml`), paste the Meta API key as `META_API_KEY`. The `starter`
plan doesn't sleep.

**Fly.io:**

```bash
fly launch --copy-config --no-deploy
```

```bash
fly secrets set META_API_KEY=your-key
```

```bash
fly deploy
```

Keep it to one machine: the rooms and the day's counts live in the server's memory. The image (`Dockerfile`) has no
build step and no npm dependencies; try it locally with:

```bash
docker build -t maison3d . && docker run --rm -p 8080:8080 -e META_API_KEY=your-key maison3d
```

then open http://localhost:8080.


Quick start: `npm start` on the laptop (the API key in `.env` at the root), the Maison3D Furnish APK from the
`native` workflow on the headset, `adb reverse tcp:8091 tcp:8091`.

## 07: furnishing by voice, from a mojulo catalogue

The loop: hold a button, say what you want, Muse changes the room with tools. The first six pieces were made with mojulo at true size (sofa,
armchair, side table, bookshelf, floor lamp, rug: `07-spike-native-furnish/catalog/`, recipes in `recipes/`, a
preview in `preview.png`) and exported as GLB; `catalog/build.mjs` readies mojulo's exports for the headset (drops
the studio floor and cameras, stands each piece on y = 0 centred on its footprint, front to +z) and writes
`catalog.json`. This is the fixed-catalogue step: nothing calls mojulo while you talk. Making or editing pieces
mid-conversation needs mojulo on the laptop and comes later; the headset side does not change for it.

Muse gets four tools: `place` (a catalogue item), `move` (or turn), `swap` (for another item, same spot) and `remove`.
It says where in the room's words (on `table1`, against `wall3`, next to `sofa1` on the left as you see it, where you
pointed, in front of you) and `place.mjs` works out the position and facing and checks the fit against the real
room: furniture it would stand in is reported back to the model, a wall it would poke through pushes it back in, and
a piece placed without a facing sits square to the walls. The laptop holds the scene and serves the models; the
headset loads each piece from it (`/catalog/<id>.glb`, cached) and stands it where the scene says.

Try it without the headset, against a sample scanned room (`samples/`; several turns in a row, then a plan in `plan.svg`):

```bash
npm run spike:furnish:try -- "an armchair against the wall on my left" "a floor lamp next to it on the left" "a rug in front of it"
```

With the headset (Maison3D Furnish, from the `native` workflow's Artifacts):

```bash
npm run spike:furnish
```

```bash
adb reverse tcp:8091 tcp:8091
```

Hold **A** and say what you want; point while you let go for "there" or "this". **B** reads the room again, **X**
or **Y** brings the panel back. The panel's **Rescan room** runs the headset's Space Setup without leaving the app
(so does saying "rescan the room"), **Clear furniture** takes every piece away.

Pieces never change size: each model is true size in metres, and the headset only ever gives a piece a position and a
facing, never a scale; the fit checks read the same sizes from `catalog.json`. Fitting a room is done by choosing,
the way mojulo's floor-share sizing picks a loveseat for a small lounge: size variants of a piece belong in the
catalogue as their own models, and the designer picks among them.

## 70: the inventory

Maison3D's own catalogue, made with mojulo: seven collections (a finish each: fabric, accent, timber, board, legs,
sofa forms) worn by one set of pieces, each piece in its listed sizes. `70-inventory/catalogue.mjs` lists them,
`recipes.mjs` is each SKU's mojulo recipe (mojulo's furniture builds, and Maison3D's own bed from workbench parts),
`ready.mjs` readies an export for the headset and `build.mjs` builds SKUs and writes `catalog.json`. Each SKU is
checked against the headset budgets (30,000 triangles, 1.5 MB) and its listed size (within 40 mm), and a soft part
mojulo's grain lost is reported.

The whole catalogue builds now: all seven collections, every room (living, bedroom, dining, office, entry, kids,
outdoor) and the things for any room. Furniture is mojulo's (its furniture builds and styles, workbench frames for the
beds and the corner desk, its soft parts for cushions, lumbar cushions, folded throws and poufs, in the collection's
fabrics). The objects are Maison3D's own (`70-inventory/objects.mjs`, in each collection's palette: floor, table and
pendant lamps and a wall sconce in the collection's lamp style, vases, a bowl, candles, books stacked and standing, a
basket, a tray, a wall clock, rugs and a runner with a woven pattern, a television, a desk-top kit): mojulo's workbench
could turn and extrude them too, but its export merges parts of one finish into one material, so a lamp's shade could
not be recoloured apart from its base. Pictures and mirrors are the decor's (spike 07's `decor.mjs`).

A build skips what it has already built (`--fresh` builds everything again). mojulo is started with its gallery
thumbnails off (`MOJULO_DISABLE_SCENE_WARM`, `MOJULO_DISABLE_TURNTABLE_WARM`): it otherwise opens a headless browser
per mint and keeps it, and a long build runs out of memory.
The models are committed (`70-inventory/models/`, about 100 MB), so the library is there after a pull. To make them
again (mojulo is deterministic, so a build gives the same pieces), once `npm run mojulo:setup` has run:

```bash
npm run inventory:build
```

(`-- --collections HIN,SAB --rooms living,bedroom` builds a part of it.)

The furnish server loads them by default: the inventory joins spike 07's pieces, with the same Maison3D Furnish app.
`MAISON_CATALOG` names another catalogue (or `none`); a piece whose model is not on the laptop is left out, and the
server says how many.

```bash
npm run spike:furnish
```

Pieces are named by collection, so "a Sable sofa against that wall" or "swap the armchair for the Hinoki one" work.

Their colours change too: "make the sofa sage green", "black legs", "paint the dresser white", "a blue throw on the
bed". Each piece lists its parts in `catalog.json` (fabric, wood, body, seat, handles, and a bed's mattress, pillows and
throw) with the colour each wears now, and Muse's `recolour` tool changes one. `70-inventory/colour.mjs` keeps a part's
detail (weave, grain, a cushion's shading) as shades of grey and puts the new colour over it; the server makes the
recoloured model on the first request (well under a second, then cached), at a path that names its colours, so the
headset reloads just that piece. A swap keeps the colours of the parts the new piece shares. Recolouring needs this
Maison3D Furnish build or newer.

Parts can be made of other materials too: "make the sofa velvet", "walnut legs", "a tartan throw". The fabrics are
mojulo's (linen, canvas, twill, herringbone, houndstooth, gingham, tartan, ticking, velvet, bouclé), the woods its
timbers, the casework its boards. That is a real rebuild: the server has the pinned mojulo make the SKU again with
the change (a second or so, the first one a few more while mojulo starts), keeps it in `70-inventory/models/variants/`,
and puts any colours over it. A cloth of one colour keeps the part's colour; a patterned one brings its own. Another
wood is worn in that timber's tone (`WOOD_TONE` in `recipes.mjs`), since mojulo's flat-drawn parts barely tell the
species apart. A bed's bedding is drawn without textures, so a pattern there shows as its colour, not its pattern.

Sizes are related: each piece knows its other sizes in its collection, smallest first (the loveseat is the sofa's
smallest, then 2-, 3- and 4-seat; double, queen, king), and Muse's `resize` tool takes "smaller", "larger" or a size
by name. The resized piece keeps its back where it was and keeps its colours and materials.

### Decor, mounts, the laser

The dictated room starts at 20 × 15 feet, 10 feet high (6.1 × 4.6 × 3.05 m): a door behind you, a wide window ahead
and one on your left.

Maison3D's own pieces, for what mojulo has no kind for (`07-spike-native-furnish/decor.mjs`, built on the laptop with
`mesh.mjs`): ten houseplants in planters (monstera, fiddle-leaf fig, snake plant, pothos, kentia palm, olive tree, ZZ,
Boston fern, rubber plant, cactus) in their sizes; twelve framed pictures in three sizes, painted by `art.mjs` (colour
fields, Bauhaus, line drawing, hills, arches, a pencil grid, waves, leaves, a sunset, ink); four mirrors; and curtains
(pinch-pleat, ripple-fold, grommet, sheer, velvet) and blinds (roman, roller) made to fit the window they hang at. Their
parts recolour like any piece's (a planter's pot, a frame, the curtain fabric).

More blinds and shutters, each in its own way of moving: shades that drop down (roller, roman, cellular, zebra), slatted
blinds that raise and tilt (venetian, wood slat) or draw aside and tilt (vertical), and fixed shutters whose louvres
tilt (plantation, with a mid rail on tall windows, and café over the lower half). A blind sits inside the window's
recess when it is deep enough for one, otherwise over the casing. Muse's `open` tool takes `amount` (1 raised or drawn,
0 down or shut) and `tilt` (1 slats open, 0 shut): "lower the blinds", "close the louvres", "tilt the slats halfway".

Pictures can be made to any size: "a frame here that's 80 by 120", "a canvas over the bed, 1.5 by 1". `ART-FRAME` (a
framed print) and `ART-CANVAS` (a stretched canvas) are built to the width and height asked for, with an abstract painted
to fit in the picture's own proportions (`art.mjs`: blobs, blocks, gradient, strokes, terrazzo, rings, cut-outs, horizon,
dots, arcs; palettes warm, earth, ocean, sage, bold, mono, blush, forest). Muse's `picture` tool changes one already up:
another picture, a style, a palette, a frame, its size. A wall piece's hanging height is `centre_height`.

Appliances and fixtures, the things that take up space in a room, at their US sizes (`appliances.mjs`): fridges
(24, 30, 33, 36 in, and a side-by-side), ranges (24, 30, 36 in), dishwashers (18, 24 in), range hoods (30, 36 in, on the
wall at range height), a washer, a dryer and the two stacked, a toilet, vanities (24 to 60 in), bathtubs (60, 66,
72 in), showers, radiators, a wall air conditioner, a ceiling fan, a tower fan and a fireplace with its mantel. Each size
is its own piece ("a bigger fridge" is the next one up); a finish (stainless, white, black, or `panel-<collection>` to
match that collection's cabinets) is set with Muse's `material` and kept through a resize.

Media and entertainment, the ways a TV stands in a room (`media.mjs`):
- Consoles, 1.2 to 2.4 m wide:
  - open shelves (`MCO-OPEN`);
  - drawers on a plinth (`MCO-DRAW`);
  - doors each end of an open middle bay (`MCO-BAY`);
  - slatted doors (`MCO-SLAT`);
  - floating on the wall (`MCF`);
  - a corner console (`MCC`), a triangle in plan, placed with `corner` ("front-left").
- Entertainment centres sized for 55 to 85 in TVs: towers, a bridge and a base round an opening that is open to the wall. `MWC` has tall cabinets; `MWL` has library shelves.
- Televisions from 43 to 85 in:
  - on the wall (`TV`), its middle about 1.1 m up, or 15 cm over the console it is above;
  - on their own feet (`TVF`), on a console or on an entertainment centre's base;
  - on an easel stand (`TVE`) or a pedestal stand (`TVP`).
- Audio and players:
  - soundbars, on a console or on the wall;
  - bookshelf and floor-standing speakers, one at a time;
  - a subwoofer, a game console and a turntable.
- A ceiling projector, and a pull-down screen that Muse's `open` rolls up and down.

Each piece matches a collection's cabinets and legs, or is oak, walnut, white or black. Muse's `material` changes it. A TV wider than its console gets a note to size one of them up; a console about 30 cm wider than the TV looks right. The old two-size inventory TV is gone, and the inventory's "media wall unit" (a closed cabinet) is now the tall media cabinet.

Rugs (`rugs.mjs`):
- Shapes, at US sizes:
  - rectangles: 5x8, 6x9, 8x10 and 9x12 ft;
  - runners: 2.5x8 and 2.5x12 ft;
  - rounds: 4, 6 and 8 ft;
  - an oval: 5x8 ft.
- Each is woven in a design and a colourway, its fit, like a picture's style.
- Designs: solid, bordered, stripes, diamond, kilim, persian, vintage, moroccan, checker, abstract, jute (braided when round) and shag. Persian, vintage and kilim have a fringe.
- Colourways: ivory, sand, charcoal, navy, rust, sage, blush, persian, ocean, mono.
- Muse places a rug with `design` and `palette` and changes it with `rug`. A rug keeps its design through a resize, and through a swap to another shape.

Room surfaces (`surfaces.mjs`), set with Muse's `surface`:
- Floors: square tiles, checkerboard, hexagons, planks, herringbone, marble, terrazzo, polished concrete or carpet.
- Walls: stucco, limewash, brick, subway tile, shiplap or concrete, on one wall or all of them.
- Ceilings: stucco (popcorn) or planks.
- Each is a texture painted on the laptop that repeats by the metre over the room shell. It has its colour (paint still sets it), a second colour (grout, mortar, the other tile) and a size (a tile's, a brick's, a board's).

Pot lights (`lights.mjs`):
- Types: 4 in and 6 in round, 4 in square, and a 4 in gimbal, in a white, black, brass or nickel trim.
- Muse's `potlights` lays them out as a grid over the room, spaced half the ceiling height apart and half that from the walls, or as a line over a piece (the island, the dining table).
- Each one is then a piece of its own.

Storage (`storage.mjs`), in the media furniture finishes:
- Tall cabinets, a hutch with glass doors, a glass display cabinet, an armoire, a tallboy, a 6- or 9-drawer dresser.
- Cube storage (2x2, 4x1, 2x4, 4x4) with fabric bins, floating shelves, wall cabinets and a mirrored medicine cabinet.
- A ladder shelf, a brass étagère, filing cabinets, a storage bench, a hall tree with hooks, a bar cart, and a bookcase with doors below.

Vases (`vases.mjs`), in a glaze or glass:
- A bud vase, a bottle, an amphora, a jug, a moon jar, a ribbed vase and a footed bowl.
- Tulips, a glass cylinder of eucalyptus, and floor vases of pampas grass or olive branches.

Muse's `around` sets chairs round a table: along its long sides, at its ends when there are more, facing it and tucked in.

Windows and doors, as the person sees them:
- Pointing at a window or a door names it ("curtains on this window"), not just the wall it is in.
- Each turn tells Muse where every window and door is from the person ("ahead", "on the left, 3 m away") and what already hangs at each window.
- A window piece with no window named goes to the one the person faces.

Windows and doors where you point: point the laser at a wall and say "this should be a window" (or "a door", or "move
this door here"); Muse's `opening` takes `at_pointing` and centres it on the point (a window 4 ft wide, 1.4 m high,
unless sized).

A window has a few settings, so what hangs at it fits: its sill's depth into the room, how deep the glass sits in the
wall (its recess), the casing's width round it (0 for none), its panes (single, two, sash, grid) and its frame (white,
black, wood); "this window has a deep sill", "no casing", "a sash window" (Muse's `opening` move with just those). The
VR room draws the reveal back to the glass, the sill standing out, the casing and an apron under the sill. Curtain rods
run 20 cm past the casing with their brackets clear of the sill, and sill-length curtains stop just above a projecting
sill; a blind goes inside a recess of 6 cm or more (else over the casing; `inside` asks for either).

Every piece has a mount: floor, rug, wall (pictures hang centred about 1.45 m up, or 22 cm over what they are above:
"the sunset print above the sofa"), window (curtains: a rod 15 cm over the window running 25 cm past each side, to the
floor, or "high and wide" near the ceiling, or to the sill; "close the curtains"), ceiling, and surface (a small plant
on the nightstand). A wall piece that would cover a window or door says so, and curtains follow their window when it
moves and go when it does. With a catalogue this size Muse reads it as an index, one line per piece, and has `find`.

The laser: a thin beam from the right controller with a dot where it lands, on the room or on a piece, which is what a
spoken "there" and "this" mean. Point at a piece (a faint box shows round it) and hold the trigger to pick it up: a
floor piece slides over the floor, a wall piece along its wall, and the thumbstick turns it 15° a click. Let go and the
server checks it like any placement (`POST /api/move`), nudging it off a wall or out of a doorway and saying why.

### A dictated room

The design now starts in a fresh room you dictate, not the scan: `07-spike-native-furnish/rooms.mjs` holds its size
and openings and stands it round you where you were when the app started, in its middle, facing its front wall
(4 × 5 m, 2.7 m high, a door behind you on the right and a window on your left, to begin with). Its walls are
`wall-front`, `wall-right`, `wall-back` and `wall-left`, as you saw them then. Say "make it 4 by 5 metres", "12 by 14
feet", "ceiling 2.7", "50 cm wider", "a door on the wall behind me", "move the door to the right", "a window on the
left wall, centred", "no windows" (Muse's `room_size` and `opening`); after a change every piece is checked against the
new walls and pushed back inside one that now runs through it. "Take me to the window" or "back to the middle"
(`go_to`) moves you there. "Use my scanned room" (`use_room`) designs in the scan instead, as below.

The room is described as the headset describes a scanned one, so the VR room, placement, door clearances, paint and
every other tool work on both. The headset now always sends its pointer's ray, and the server finds what it meets in
the dictated room. Each app launch is a new session: the room stands round you again, and the pieces move with it.

Moving: push the right thumbstick forward to aim (a square shows where you will land), let go to step there; push it
left or right to turn 45°. The Quest's own boundary stays on, since the room's walls are not your real ones.

Hearing: a turn now has two halves. Let go of A and the server only transcribes (`POST /api/hear`): a chime and the
words in a bubble over your right controller say it was heard, or a low tone and "didn't catch that" say it was not.
Then the same words go to Muse (`/api/turn` with `text`), the bubble says "thinking…", and the reply shows there and is
spoken. Holding A beeps and shows "listening…".

### Designing in VR, the room empty

Maison3D Furnish now designs in VR: the room you scanned stands around you empty, 1:1 over the real one, so you can
walk it, and you furnish it from scratch. `07-spike-native-furnish/shell.mjs` builds it on the laptop as one model
from the room the headset reads (`POST /api/room`, as soon as the room loads): the walls with their doors and
windows open, the floor and ceiling from the scan's own outline (a room need not be a rectangle), skirting, trim
round each opening, a short hall behind each door and bright glass in each window. The real furniture is left out of
the room, out of what Muse sees and out of the fit checks; it shows as blue outlines instead, so nobody walks into a
real sofa they cannot see (the Quest's own boundary stays on too). A point at real furniture goes on through it to the
wall or floor behind. Pieces are kept out of each door's opening and the 80 cm in front of it.

Say "paint this wall sage", "paint the room white", "a light oak floor" or "a white ceiling" (Muse's `paint`), "show
me the real room" and "back to the design" (`view`, or the panel's Real room button: passthrough, the design over
the real room), "hide the outlines" (`outlines`). A change of colour is a new room model, built in a few
milliseconds. The panel now comes up in front of you at eye height once the headset is tracking; X, Y or a
right-thumbstick click brings it back in front of you, and pointing at it and holding the grip moves it.

Check the room without the headset: `shellGlb`, `ghostsGlb` and `shellSvg` (a plan from above) in `shell.mjs` take
the room as `sample.mjs` makes it from a sample scan.

Two things mojulo's lit export gets wrong are fixed in `ready.mjs` and `recipes.mjs`: sheet goods (plywood and MDF
casework) come out white, so their board colour is put back from mojulo's own sheet table; and mojulo's furniture
builds face away from you, so they are turned to face +z like everything else.
