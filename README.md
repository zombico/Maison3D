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
