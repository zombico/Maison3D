# Maison3D

Furnish a real room by voice in a Quest headset. The headset's room scan becomes a room that Meta's models
(through the Meta Model API) design and rearrange with [mojulo](https://github.com/zombico/mojulo), and the
furniture appears over passthrough.

Folders are numbered in the order they are built: `0x` are spikes that prove one risky thing, `10`–`70` are the
product's parts, `90` is the demo.

## 00: room scan spike

What does the Quest browser expose about a scanned room? Planes and meshes, with their labels, saved as JSON.

1. On the headset, run Space Setup once (Settings > Physical space).
2. Connect it over USB with developer mode on.
3. Run the server and forward its port to the headset:
   ```bash
   npm install
   npm run spike:scan
   adb reverse tcp:8080 tcp:8080
   ```
4. In the Quest browser, open `http://localhost:8080` and press **Enter room**. Allow spatial data when asked.
   Trigger or pinch saves a scan; grip asks the headset to run Space Setup from inside the session.
5. On the laptop, open `http://localhost:8080/view.html` to see each saved scan from above.

Scans land in `00-spike-room-scan/scans/` (ignored by git: it is your home). Copy one you are happy to share into
the repo as a fixture for the next steps.

Coordinates are WebXR `local-floor`: y up, metres, -z forward where the session started.
