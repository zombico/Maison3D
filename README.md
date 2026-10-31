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
- Before entering AR, press **Hold to talk** once on the page: it asks for the microphone and shows whether this
  browser can recognise speech. Typing in the page sends the same thing.
