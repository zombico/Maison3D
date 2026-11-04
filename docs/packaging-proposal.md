# Packaging Maison3D for submission: a proposal

Today Maison3D runs as a developer setup:

- the headset app reaches a Node server on a laptop over a USB cable (`adb reverse`, plain HTTP to `localhost`);
- the laptop holds the Meta Model API key, the design, the furniture library and mojulo;
- spoken replies come from macOS `say`;
- the APK is debug-signed.

A reviewer, a judge or a store customer has none of that.

**The proposal:** keep the split (the thin headset app, the server that thinks), but move the server into the cloud
and make the app a release build that finds it on its own.

**The target this assumes:** the Meta Horizon Store (Quest apps of every kind are submitted there since App Lab was
folded into it), through a private release channel first.

**A hackathon or competition entry** needs the same core, because judges cannot run a laptop and a cable either. It
needs less store paperwork; see the last section.

## What a submitted Maison3D looks like

```
Quest 3 / 3S                              Cloud (one region to start)
┌──────────────────────────┐   HTTPS    ┌───────────────────────────────────────────────┐
│ Maison3D (release APK)   │──────────▶ │ api.maison3d.app  (the furnish server, Node)  │
│ - hold A, talk, point    │  /api/*    │  - one Design per signed-in user              │
│ - VR room, laser, panel  │◀────────── │  - Muse tools, rooms, place, decor builders   │
│ - entitlement check      │            │  - META_API_KEY in the platform's secrets     │
└──────────────────────────┘            │  - speech-to-text (Muse Voice), TTS (Piper)   │
            │  GET /catalog/*.glb        └───────────────┬───────────────────────────────┘
            ▼                                            │ saves designs
   cdn.maison3d.app (object storage + CDN)       ┌───────▼────────┐
   - 70-inventory models (~100 MB, immutable)    │ a small store  │
   - built decor models, cached by their path    │ (designs, use) │
                                                 └────────────────┘
```

**What doesn't change:** the headset app's job, Muse's tools, the room, placement, the library, and the pieces built
in code. The server already speaks HTTP and names every model by an immutable path, so the change is mostly where
things run and who they belong to.

## The work, in order

### 1. The repo as a product (half a day)

Rename the folders so the layout says what each part is:

- `07-spike-native-furnish/app` becomes `quest/`, the Android project;
- the server's `.mjs` files become `server/`;
- `70-inventory/` becomes `library/`;
- `mojulo/` becomes `tools/mojulo/`.

Imports and the CI paths move with them. Nothing else changes; this is one commit.

### 2. One design per person (1 to 2 days)

**The problem:** the server keeps one design in module globals in `agent.mjs` and `rooms.mjs`:

- `scene`, `finish`, `settings` and `history` in `agent.mjs`;
- `state` in `rooms.mjs`.

**The change:** these move into a `Design` object, and every request carries its owner. Each tool handler already
takes a `ctx`, so `ctx.design` replaces the globals:

```js
// server/designs.mjs
export class Design {
  constructor(id) { this.id = id; this.scene = []; this.finish = { walls: {} }; this.history = []; this.room = rooms.fresh(); }
  toJSON() { return { scene: this.scene, finish: this.finish, room: this.room.spec }; }   // what gets saved
}
const live = new Map(); // design id -> Design, loaded from the store on first use, saved after each turn
export async function designFor(req) { const user = await verify(req.headers.authorization); /* … */ }
```

**Saving:** after each turn the design is written to the store. One JSON document per user and room is enough:

- SQLite on a volume, or Firestore;
- "my living room" and "the bedroom" become saved designs the app can list and reopen.

### 3. The server in the cloud (1 to 2 days)

**A container:** one image that runs `npm start` with the library models baked in, or fetched from the CDN at
start:

```dockerfile
FROM node:22-slim
WORKDIR /srv
COPY package.json ./
COPY server ./server
COPY library/catalog.json ./library/
COPY vendor/piper /opt/piper   # Piper's release binary and one English voice, fetched by CI
ENV PORT=8080 MAISON_MODELS_URL=https://cdn.maison3d.app/library/
CMD ["node", "server/server.mjs"]
```

**Hosting:** anything that runs a container behind HTTPS with secrets: Cloud Run, Fly.io or Render.

- `META_API_KEY` lives in the platform's secret store. It never leaves the server and never ships in the APK.

**Models off the server:**

- `/catalog/<path>.glb` redirects to the CDN for library pieces, which never change.
- Pieces built in code (curtains to a window, rugs, the media and storage pieces) are built once per path and
  written to the bucket, so the second person who asks for `HUT-120cm~fit@finish=SAB` gets it from the edge.

**Voice:** macOS `say` doesn't exist on a server.

- **Spoken replies:** Piper (open source, offline) speaks them in the container as a WAV, as `say` does today.
  The Quest 3S had no English voice on the headset, which is why the voice moved off it.
- **Speech-to-text** stays on Muse Voice Transcribe, which is already server-side.

**mojulo:** making a piece in another material rebuilds it with mojulo. There are two options:

- **Ship mojulo in the image:** the pinned commit, headless, with its warm-up browsers off as now.
- **Turn it off for v1:** colours still change per part, and material swaps come back later.

I'd turn it off for the first submission. It's the heaviest dependency and the least visible feature.

**Cost and abuse:**

- a turn limit per user per day;
- a cap on tool rounds per turn (four today);
- request size limits on audio;
- no audio kept after transcription.

### 4. The app as a release (2 to 3 days)

**Server address:** from the build, not `localhost`:

- `buildConfigField("String", "SERVER", "\"https://api.maison3d.app\"")`;
- a debug build keeps `http://localhost:8091` for `adb reverse`, so development stays as it is.
- Drop `usesCleartextTraffic` from the release manifest.

**Who it is:**

- **Entitlement:** the Platform SDK's entitlement check at start (store apps must check that the user owns the app).
- **Identity:** the user's ID and a proof token go to the server, which verifies them and finds their designs.

**First run:** a short panel that explains:

- hold A to talk, point and pull the trigger to grab;
- what is sent where: speech goes to Meta's model API, and the room's shape goes to our server when you scan.

Asking for the microphone happens there, not at launch.

**States it has to handle:**

- no network;
- the server busy;
- a turn that failed;
- a design that's still loading;

each with a message on the panel, not a log line.

**Signing and versions:**

- a release keystore kept in CI secrets;
- `versionCode` from the CI run number;
- `versionName` from the tag.

**Manifest:**

- confirm the `supportedDevices` list for Quest 3 and 3S;
- keep passthrough optional if the dictated VR room is the default (it is today);
- review every permission against what the app uses.

**Performance:**

- hold 72 fps with a furnished room: merge static pieces, cap texture sizes (the room surfaces already are);
- watch the draw calls a 40-piece scene makes.

### 5. Store paperwork and testing (2 to 4 days, partly waiting)

**Store listing:**

- name, short and long description;
- cover art, hero art and icon in the store's sizes;
- 5 or more screenshots taken in the headset;
- a trailer of 30 to 60 seconds.

The screenshots we render here are fine for drafts, not for the listing.

**Privacy policy and data use answers.** These cover:

- **Microphone:** audio is sent to Meta's model API for transcription, then dropped.
- **Spatial data:** a scanned room's shape is sent to our server.
- **What we keep:** saved designs.
- **Accounts:** how to delete them.

**Age rating** through the store's IARC questionnaire.

**The store's technical checks (VRC):**

- performance;
- the system menu;
- pausing when the headset comes off;
- entitlement;
- no crashes on launch with no network.

Run them on our own devices first, with the store's validator on the APK.

**Upload:** with `ovr-platform-util upload-quest-build` to a private release channel (ALPHA). Invite testers, fix
what they hit, then submit for review.

### 6. CI that ships (half a day)

`release.yml` runs on a tag `v*`. It:

1. builds the signed APK;
2. uploads it to the ALPHA channel;
3. builds and deploys the server image;
4. syncs the library models to the CDN.

The app id, the app secret, the keystore and the cloud credentials are repository secrets.

```yaml
- run: ./gradlew assembleRelease
- run: ovr-platform-util upload-quest-build --app-id "$APP_ID" --app-secret "$APP_SECRET" --apk app-release.apk --channel ALPHA
```

## Decisions to make first

1. **Where it's going:** the Horizon Store, a competition, or both. It changes step 5 and the deadline.
2. **Hosting:** Cloud Run, Fly.io or Render. Any works; I'd pick the one you already have an account with.
3. **mojulo at runtime:** in the image, or off for v1. I'd turn it off for v1.
4. **Accounts:** the Meta user ID through the Platform SDK, which ties a design to the store account and needs no
   sign-up screen, versus an anonymous device ID. I'd use the Meta user ID.
5. **Domain names:** for the API and the CDN.

## If it's a hackathon or competition entry instead

**Same steps 1 to 4:** a hosted server and an APK that finds it are what let a judge try it.

**Skip:** the store listing, IARC and the store's checks.

**Add:**

- a 2 to 3 minute video: a room furnished by voice in one take, then a material swap, the laser grab and the pot lights;
- the repo with a top-level README written for judges: what it is, how to run it, what is Meta's model API and what
  is ours;
- the signed APK as a release asset;
- a short write-up of the architecture: the diagram above.

**A demo-day mode is worth a day:**

- a "start from a furnished room" option that loads a saved design, so a judge sees the result in ten seconds and
  then changes it;
- a turn limit generous enough for judging.

## Rough total

**Six to ten working days** to a private store channel, plus the store's review time:

- the headset app changes are about a third of it;
- the server and hosting are another third;
- the paperwork, testing and media are the rest.

**A competition build is about four to six days.**
