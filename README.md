# Maison3D

Furnish a real room by voice in a Quest headset. The headset's room scan becomes a room that Meta's models
(through the Meta Model API) design and rearrange with [mojulo](https://github.com/zombico/mojulo), and the
furniture appears over passthrough.

Folders are numbered in the order they are built: `0x` are spikes that prove one risky thing, `10`–`70` are the
product's parts, `90` is the demo.

## 00: room scan spike

What does the Quest browser expose about a scanned room? Planes and meshes, with their labels, saved as JSON.
WebXR's immersive modes need an https origin, so the page is published to GitHub Pages by
`.github/workflows/pages.yml` (one-time: Settings > Pages > Source: GitHub Actions).

1. On the headset, run Space Setup once (Settings > Physical space).
2. In the Quest browser, open the Pages URL and press **Enter room**. Allow spatial data when asked.
   Trigger or pinch saves a scan (a double buzz); grip asks the headset to run Space Setup from inside the session.
3. Exit: the saved scans are listed under the button, drawn from above. **Download** one to share it.
4. On the laptop, open `view.html` (same site) and pick the downloaded file.

Optional, scans straight to the laptop: connect the headset over USB with developer mode on, run
`npm run spike:scan` and `adb reverse tcp:8080 tcp:8080`, and open the page with `?send=http://localhost:8080`.
They land in `00-spike-room-scan/scans/` (ignored by git: it is your home).

Coordinates are WebXR `local-floor`: y up, metres, -z forward where the session started.

## 01: the Muse loop

Talk to the agent from inside the room: hold the trigger, speak, let go. What you said and what you pointed at go to
a small server; the agent, waiting in `listen`, changes the scene and answers; the headset swaps the change in and
reads the answer aloud without leaving AR. The scene is one cube. The agent's side is in
[`01-spike-muse-loop/AGENTS.md`](01-spike-muse-loop/AGENTS.md): tell Muse to read it and start.

- In a Muse sandbox: `npm run spike:loop`, then open the sandbox's preview address with the printed `/?t=…`.
- On a laptop on the headset's Wi-Fi: `npm run spike:loop:https`, open the printed `https://<laptop-ip>:8443/?t=…`
  and accept the certificate warning once.
- Before entering AR, on the page: **Allow mic**, **Load voice model** (about 40 MB the first time), and try
  **Hold to talk**. The Quest browser has no speech recognition of its own, so the headset records and transcribes
  in the page with a small Whisper model; only the words reach the server. Typing in the page sends the same thing.
- Where AR is not offered, the button enters VR with the cube over a grid.

## 05: the room, natively

Spike 00 again, as a native Quest app: Meta Spatial SDK with MR Utility Kit (MRUK) instead of the browser. It loads
the room Space Setup saved (walls, floor, ceiling, door and window frames, furniture volumes, the room and global
meshes), tints it over passthrough, and saves a scan in spike 00's format so `view.html` draws both and they can be
compared. MRUK's own serialisation of the scene rides along under `mruk`.

Getting it onto the headset, once:

1. Make a free developer organisation at developer.meta.com, then turn on Developer Mode in the Meta Horizon phone
   app (Devices > your headset > Headset settings > Developer Mode).
2. Install Android's `adb` (platform-tools) or Meta Quest Developer Hub on the laptop, plug the headset in over USB-C
   and allow USB debugging inside the headset.

Each build: every push that touches `05-spike-native-scan/` builds an APK in GitHub Actions (the `native` workflow).
Download `maison3d-native-scan` from the run's Artifacts, unzip it, and

```bash
adb install -r maison3d-native-scan.apk
```

It shows up in the headset's Library under Unknown Sources as **Maison3D Scan**.

In the headset: allow spatial data when asked. A scan is saved once the room loads; **A** (or the panel's button)
saves another, **B** reads the room again, **Space Setup** asks the headset to rescan. **X**, **Y** or a click of
the right thumbstick brings the panel back in front of you. Point at the panel and pull the trigger to press its buttons;
point and hold the grip to move it. Scans land on the headset and,
when the laptop server from spike 00 is running (`npm run spike:scan` and `adb reverse tcp:8080 tcp:8080`), in
`00-spike-room-scan/scans/` too. Without the server, pull them:

```bash
adb pull /sdcard/Android/data/ai.mojulo.maison3d.scan/files/scans/
```

What it found (`05-spike-native-scan/samples/`, a Quest 3S): every room the headset knows loads at once, each
with labelled walls, floor, ceiling, door and window frames, and furniture as boxes standing on the floor whose tops
match the table, storage and couch surfaces. Anchors hold to the millimetre between scans in one session; the origin
moves with each launch, so positions are only comparable within a session. The floor sat 6 cm below the app's
y = 0, so heights should be taken from the floor anchor, not from zero.

What the app is doing, from the laptop:

```bash
adb logcat -s Maison3DScan
```

## 06: talking to the room, natively

Spike 01 again, as a native app with no agent in the middle: hold **A**, speak, let go. The headset sends the audio,
what the right controller pointed at, the room you are in (from MRUK, with ids like `table2`) and the cube to a small
server on the laptop. The server turns the audio into words, asks Muse (Meta Model API, chat completions with a
`set_cube` tool) what to do, and answers with a reply and the cube's new state. The headset moves the cube and reads
the reply aloud without leaving passthrough. The API key stays on the laptop.

Once, on the laptop: put the key in `.env` at the repository root (ignored by git):

```
META_API_KEY=…
```

`MAISON_MODEL` picks another model (default `muse-spark-1.3`), `MAISON_EFFORT` its reasoning effort (default
`minimal`, for a spoken turn that answers in a second or two), `META_API_BASE` another endpoint.

In the headset: hold **A** to talk (it keeps listening a quarter of a second after you let go), **B** reads the room
again, **X** brings the panel in front of you and **Y** the cube. "Bring it here", "in front of me", "on the big
table", "where I'm pointing" all place it. Replies are spoken with the headset's English voice when it has one, and
otherwise with the Mac's (`say`), sent to the headset as audio. Maison3D Talk replaces Maison3D Scan for daily use;
the scan app stays for comparing what the headset knows about a room.

Try the model part without the headset, against the room in spike 05's sample:

```bash
npm run spike:talk:try -- "put the cube on the biggest table and make it red"
```

With the headset (Maison3D Talk from the `native` workflow's Artifacts, installed like spike 05):

```bash
npm run spike:talk
```

```bash
adb reverse tcp:8091 tcp:8091
```

Speech to text is Muse Voice Transcribe (`muse-voice-transcribe-1.0`, one `POST /v1/asr/transcribe` per turn in
`PUSH_TO_TALK` mode), biased toward the room's own words (table, storage, couch…). Try it without the headset with a
WAV from macOS's `say`:

```bash
say -o turn.wav --data-format=LEI16@16000 "put the cube on the biggest table and make it blue"
```

```bash
npm run spike:talk:try -- --wav turn.wav
```

Each turn is printed on the laptop: what was heard, the tool calls, the reply and how long hearing and answering
took.

## 07: furnishing by voice, from a mojulo catalogue

Spike 06's loop with real furniture instead of the cube. Six pieces were made with mojulo at true size (sofa,
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

Try it without the headset, against spike 05's sample room (several turns in a row, then a plan in `plan.svg`):

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

## 08: mojulo in the loop

Can mojulo, rather than our own rules, furnish the real room? Step 1 maps the scanned room into a mojulo floor plan
(`08-spike-mojulo-furnish/toMojulo.mjs`) and asks it to furnish. Results and what they mean:
[`08-spike-mojulo-furnish/FINDINGS.md`](08-spike-mojulo-furnish/FINDINGS.md).

This spike runs a newer mojulo than the Claude plugin's: the `1026-consolidated` release candidate, pinned to a
commit in `mojulo/pin.json` and run from source (it is not on npm, and the plugin installs published versions only).
Once:

```bash
npm run mojulo:setup
```

Then `node 08-spike-mojulo-furnish/furnish.mjs L` (or `--empty`, or another room glyph) furnishes the sample room on
it. It keeps its data in `.mojulo/home`, apart from the plugin's `~/.mojulo`.

In Claude Code this repo offers mojulo scoped to furniture, as the `maison-furniture` server (`.mcp.json`,
`mojulo/furniture-mcp.mjs`): six tools in front of the pinned mojulo instead of its whole studio, so an agent here is
not steered toward games, worlds or characters. `design_room` (mojulo's `design_interior`: a room fitted for its jobs
at true size, in a style, with clearances kept and refusals explained), `make_piece` (workbench furniture builds
only), `edit_piece`, `export_piece`, `measure_piece` and `design_rules`. Turn the mojulo plugin off for this project
(`/plugin`) to see only these. Muse never sees mojulo's tools at all: the laptop server gives it its own four.

### mojulo's design in the headset

`node 08-spike-mojulo-furnish/design.mjs japandi` has mojulo's `design_interior` design the real room, empty (walls
and doors from the scan, no furniture), and `node 08-spike-mojulo-furnish/pieces.mjs` turns the design into headset
pieces and `layout.json`. Both are committed, so on the laptop only this is needed, with the same Maison3D Furnish app:

```bash
MAISON_LAYOUT=08-spike-mojulo-furnish/layout.json npm run spike:furnish
```

The design stands in the room on the first turn (say "show me the design"), and the pieces then move, swap and go like
any other.

## 70: the inventory

Maison3D's own catalogue, made with mojulo: seven collections (a finish each: fabric, accent, timber, board, legs,
sofa forms) worn by one set of pieces, each piece in its listed sizes. `70-inventory/catalogue.mjs` lists them,
`recipes.mjs` is each SKU's mojulo recipe (mojulo's furniture builds, and Maison3D's own bed from workbench parts),
`ready.mjs` readies an export for the headset and `build.mjs` builds SKUs and writes `catalog.json`. Each SKU is
checked against the headset budgets (30,000 triangles, 1.5 MB) and its listed size (within 40 mm), and a soft part
mojulo's grain lost is reported.

The first slice is built: Hinoki (japandi) and Sable (modern-organic), living room and bedroom, 64 SKUs, all clean.
The models are not committed (mojulo is deterministic, so a build gives the same pieces); on the laptop, once
`npm run mojulo:setup` has run:

```bash
npm run inventory:build -- --collections HIN,SAB --rooms living,bedroom
```

Then furnish with them: the inventory joins spike 07's six pieces, with the same Maison3D Furnish app.

```bash
MAISON_CATALOG=70-inventory/catalog.json npm run spike:furnish
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
the room as `sample.mjs` makes it from spike 05's scan.

Two things mojulo's lit export gets wrong are fixed in `ready.mjs` and `recipes.mjs`: sheet goods (plywood and MDF
casework) come out white, so their board colour is put back from mojulo's own sheet table; and mojulo's furniture
builds face away from you, so they are turned to face +z like everything else.
