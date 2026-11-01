// Spike 01, the headset's side: hold the trigger and speak; what you said and what you pointed at go to the
// server, the agent changes the scene, and the change and its answer arrive here while the session stays live.
// Nothing here reloads the page: a reload would end the immersive session.
import * as THREE from 'three';

const ROOM_AFTER_MS = 3000; // report the room this long after the first plane appears

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r2 = (v) => Math.round(v * 100) / 100;
const vec = (v) => [r2(v.x), r2(v.y), r2(v.z)];

function log(msg) {
  const t = new Date().toLocaleTimeString();
  $('log').textContent = `${t}  ${msg}\n` + $('log').textContent.slice(0, 4000);
}

// --- the server ----------------------------------------------------------------------------------------------

const token = new URLSearchParams(location.search).get('t') ?? sessionStorage.getItem('maison.t') ?? '';
if (token) sessionStorage.setItem('maison.t', token);

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { 'x-maison-token': token, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `${res.status}`);
  return json;
}

let boot = null;
let after = 0;
let museListening = false;

function setLink(text) { $('link').textContent = text; }

function setListening(on) {
  museListening = on;
  $('listenDot').classList.toggle('on', on);
  $('listenText').textContent = on ? 'the agent is listening' : 'the agent is not listening (ask it to run listen)';
  if (!talk && panel.mode === 'idle') panelIdle();
}

// server-sent events, falling back to polling when a proxy holds them back
function connect() {
  const es = new EventSource(`api/events?t=${encodeURIComponent(token)}`);
  let hello = false;
  const giveUp = setTimeout(() => { if (!hello) { es.close(); poll(); } }, 5000);
  es.addEventListener('hello', (e) => {
    hello = true;
    clearTimeout(giveUp);
    const d = JSON.parse(e.data);
    boot = d.boot;
    after = d.seq;
    setListening(d.listening);
    applyScene(d.scene, true);
    setLink('live');
  });
  for (const type of ['scene', 'reply', 'heard', 'taken', 'listening']) {
    es.addEventListener(type, (e) => { after = Number(e.lastEventId) || after; on(type, JSON.parse(e.data)); });
  }
  es.onerror = () => {
    if (hello) return setLink('reconnecting…');
    clearTimeout(giveUp);
    es.close();
    poll();
  };
}

async function poll() {
  setLink('polling');
  for (;;) {
    try {
      const d = await api('GET', `api/poll?after=${after}&boot=${boot ?? ''}`);
      if (d.boot !== boot) {
        boot = d.boot;
        after = d.seq;
        if (d.scene) applyScene(d.scene, true);
      } else {
        for (const e of d.events) { after = e.seq; on(e.type, e.data); }
      }
      if (d.listening !== museListening) setListening(d.listening);
      setLink('polling');
    } catch (e) {
      setLink(`server unreachable: ${e.message}`);
    }
    await sleep(1000);
  }
}

function on(type, data) {
  if (type === 'scene') { applyScene(data); log(`scene v${data.version}: ${JSON.stringify(data.cube)}`); }
  if (type === 'listening') setListening(data.listening);
  if (type === 'heard') { log(`heard: ${data.text}`); panelSet('Heard', data.text, museListening ? 'the agent is on it…' : 'waiting for the agent to listen…', 'busy'); }
  if (type === 'taken') { log(`the agent took: ${data.text}`); panelSet('Working', data.text, 'the agent is on it…', 'busy'); }
  if (type === 'reply') { log(`reply: ${data.text}`); panelSet('Agent', data.text, '', 'reply'); speak(data.text); }
}

async function say(text, pointing) {
  try {
    await api('POST', 'api/say', { text, pointing });
  } catch (e) {
    log(`could not send: ${e.message}`);
    panelSet('Not sent', text, e.message, 'error');
  }
}

function speak(text) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

// --- three: the cube, the room, the panel --------------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.domElement.style.display = 'none';
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 50);
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(1, 3, 2);
scene.add(sun);

const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xe4b363, roughness: 0.5 }));
cube.userData.kind = 'cube';
scene.add(cube);
const want = { position: new THREE.Vector3(0, 1.2, -1.2), size: 0.25, color: new THREE.Color(0xe4b363), spin: false };

function applyScene(s, instant = false) {
  if (!s?.cube) return;
  const c = s.cube;
  want.position.fromArray(c.position);
  want.size = c.size;
  want.color.set(c.color);
  want.spin = c.spin;
  if (instant) {
    cube.position.copy(want.position);
    cube.scale.setScalar(want.size);
    cube.material.color.copy(want.color);
  }
}

// the room as the headset detects it: faint fills to point at, labelled for the agent
const ids = new WeakMap();
let nextId = 1;
const idOf = (o, p) => (ids.has(o) ? ids.get(o) : (ids.set(o, `${p}${nextId++}`), ids.get(o)));
const COLORS = { floor: 0x5bd16a, wall: 0x4f8cff, ceiling: 0x8a8a8a, 'door frame': 0xff9a3c, 'window frame': 0x3fe0e0 };
const room = new Map(); // XRPlane | XRMesh -> { obj, changed }

function planeObject(plane) {
  const shape = new THREE.Shape(plane.polygon.map((p) => new THREE.Vector2(p.x, p.z)));
  const geom = new THREE.ShapeGeometry(shape).rotateX(Math.PI / 2); // shape x,y -> plane space x,z
  const obj = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({
    color: COLORS[plane.semanticLabel] ?? 0xe05bd1, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false,
  }));
  const edge = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(plane.polygon.map((p) => new THREE.Vector3(p.x, 0, p.z))),
    new THREE.LineBasicMaterial({ color: COLORS[plane.semanticLabel] ?? 0xe05bd1, transparent: true, opacity: 0.5 }));
  obj.add(edge);
  obj.userData = { kind: 'plane', label: plane.semanticLabel ?? null, id: idOf(plane, 'p') };
  return obj;
}

function meshObject(mesh) {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(mesh.vertices), 3));
  geom.setIndex(new THREE.BufferAttribute(new Uint32Array(mesh.indices), 1));
  const obj = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color: 0xe05bd1, wireframe: true, transparent: true, opacity: 0.25 }));
  obj.userData = { kind: 'mesh', label: mesh.semanticLabel ?? null, id: idOf(mesh, 'm') };
  return obj;
}

function syncRoom(frame, ref) {
  const seen = new Set();
  const visit = (xr, space, make) => {
    seen.add(xr);
    let d = room.get(xr);
    if (d && d.changed !== xr.lastChangedTime) { scene.remove(d.obj); d = null; }
    if (!d) {
      d = { obj: make(xr), changed: xr.lastChangedTime };
      d.obj.matrixAutoUpdate = false;
      room.set(xr, d);
      scene.add(d.obj);
    }
    const pose = frame.getPose(space, ref);
    d.obj.visible = !!pose;
    if (pose) { d.obj.matrix.fromArray(pose.transform.matrix); d.obj.matrixWorldNeedsUpdate = true; }
  };
  for (const p of frame.detectedPlanes ?? []) visit(p, p.planeSpace, planeObject);
  for (const m of frame.detectedMeshes ?? []) if (m.semanticLabel !== 'global mesh') visit(m, m.meshSpace, meshObject);
  for (const [xr, d] of room) if (!seen.has(xr)) { scene.remove(d.obj); room.delete(xr); }
}

// what the agent reads as the room: each thing's label, centre and extent in metres
function roomSummary() {
  const out = [];
  for (const { obj } of room.values()) {
    if (!obj.visible) continue;
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj, true);
    const { kind, label, id } = obj.userData;
    out.push({ id, kind, label, center: vec(box.getCenter(new THREE.Vector3())), size: vec(box.getSize(new THREE.Vector3())), top: r2(box.max.y) });
  }
  return out;
}

// the panel: what is happening, floating below your gaze
const panelCanvas = Object.assign(document.createElement('canvas'), { width: 1024, height: 320 });
const panelTexture = new THREE.CanvasTexture(panelCanvas);
panelTexture.colorSpace = THREE.SRGBColorSpace;
const panelMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.156), new THREE.MeshBasicMaterial({ map: panelTexture, transparent: true, depthTest: false }));
panelMesh.renderOrder = 10;
scene.add(panelMesh);
const panel = { mode: 'idle' };

function wrap(ctx, text, width) {
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    const tryLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(tryLine).width > width && line) { lines.push(line); line = word; } else line = tryLine;
  }
  if (line) lines.push(line);
  return lines;
}

function panelSet(title, body = '', foot = '', mode = 'idle') {
  panel.mode = mode;
  const ctx = panelCanvas.getContext('2d');
  const W = panelCanvas.width, H = panelCanvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(21, 19, 15, 0.86)';
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, 36);
  ctx.fill();
  ctx.fillStyle = museListening ? '#5bd16a' : '#6b6458';
  ctx.beginPath();
  ctx.arc(W - 48, 48, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = { busy: '#e4b363', reply: '#7fd0ff', error: '#ff8a7a' }[mode] ?? '#b9b1a3';
  ctx.font = '600 40px system-ui, sans-serif';
  ctx.fillText(title, 40, 70);
  ctx.fillStyle = '#ece6da';
  ctx.font = '46px system-ui, sans-serif';
  wrap(ctx, body, W - 80).slice(0, 3).forEach((l, i) => ctx.fillText(l, 40, 140 + i * 56));
  ctx.fillStyle = '#b9b1a3';
  ctx.font = '34px system-ui, sans-serif';
  ctx.fillText(foot, 40, H - 28);
  panelTexture.needsUpdate = true;
}

function panelIdle() {
  panelSet('Maison3D', 'Hold the trigger and speak', museListening ? 'the agent is listening' : 'the agent is not listening yet', 'idle');
}

const xrCam = new THREE.Vector3();
const xrDir = new THREE.Vector3();
function placePanel(first) {
  const cam = renderer.xr.getCamera();
  cam.getWorldPosition(xrCam);
  cam.getWorldDirection(xrDir);
  xrDir.y = 0;
  xrDir.normalize();
  const target = xrCam.clone().addScaledVector(xrDir, 0.9);
  target.y -= 0.28;
  if (first) panelMesh.position.copy(target);
  else panelMesh.position.lerp(target, 0.05);
  panelMesh.lookAt(xrCam);
}

// --- talking: hold the trigger, speak, let go -----------------------------------------------------------------
// The Quest browser has no SpeechRecognition and its keyboard does not open inside XR (the xr-voice tests found
// both), so the headset records with MediaRecorder and transcribes in the page with a small Whisper model: no key,
// and the audio never leaves the headset. Only the words go to the server.

const TRANSFORMERS = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.js';
const MODEL = 'Xenova/whisper-tiny.en';
const MIN_RECORDING_MS = 400;

const voice = { mic: 'not asked', model: 'not loaded' };
let micStream = null;
let transcriber = null;
let modelLoading = null;

function setVoice(key, value) {
  voice[key] = value;
  $('voiceState').textContent = `microphone: ${voice.mic} · voice model: ${voice.model}`;
}

async function ensureMic() {
  if (micStream) return micStream;
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('no microphone access in this browser');
  micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  setVoice('mic', 'allowed');
  return micStream;
}

function ensureModel() {
  modelLoading ??= (async () => {
    setVoice('model', 'loading…');
    const mod = await import(TRANSFORMERS);
    mod.env.allowLocalModels = false;
    if (mod.env.backends?.onnx?.wasm) mod.env.backends.onnx.wasm.numThreads = 1;
    transcriber = await mod.pipeline('automatic-speech-recognition', MODEL, {
      quantized: true,
      progress_callback: (p) => {
        if (p?.status !== 'progress' || p.progress == null) return;
        const pct = Math.round(p.progress); // transformers.js reports 0–100
        setVoice('model', `loading ${pct}%`);
        if (session) panelSet('Loading voice model', `${pct}%`, 'first time only', 'busy');
      },
    });
    setVoice('model', 'ready');
    return transcriber;
  })().catch((e) => {
    modelLoading = null;
    setVoice('model', `failed: ${e.message}`);
    throw e;
  });
  return modelLoading;
}

async function to16kMono(blob) {
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const mono = new Float32Array(decoded.length);
    for (let c = 0; c < decoded.numberOfChannels; c++) {
      const ch = decoded.getChannelData(c);
      for (let i = 0; i < ch.length; i++) mono[i] += ch[i] / decoded.numberOfChannels;
    }
    if (decoded.sampleRate === 16000) return mono;
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
    const buf = offline.createBuffer(1, mono.length, decoded.sampleRate);
    buf.getChannelData(0).set(mono);
    const src = offline.createBufferSource();
    src.buffer = buf;
    src.connect(offline.destination);
    src.start();
    return (await offline.startRendering()).getChannelData(0);
  } finally {
    ctx.close().catch(() => {});
  }
}

function pickMime() {
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (window.MediaRecorder?.isTypeSupported?.(m)) return m;
  }
  return '';
}

const raycaster = new THREE.Raycaster();
const marker = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.045, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthTest: false }));
marker.visible = false;
scene.add(marker);
let talk = null;      // { controller, recorder, chunks, mime, startedAt, pointing }
let transcribing = false;

function aim(controller) {
  if (!controller) return null;
  raycaster.setFromXRController(controller);
  const targets = [cube, ...[...room.values()].map((d) => d.obj).filter((o) => o.visible)];
  return raycaster.intersectObjects(targets, false)[0] ?? null;
}

function pointing(controller) {
  const hit = aim(controller);
  if (!hit) return controller ? { target: null, ray: { origin: vec(raycaster.ray.origin), direction: vec(raycaster.ray.direction) } } : null;
  const { kind, label, id } = hit.object.userData;
  return { target: kind, label: label ?? null, id: id ?? null, point: vec(hit.point), distance: r2(hit.distance) };
}

function pulse(controller, strength = 0.5, ms = 60) {
  controller?.userData.source?.gamepad?.hapticActuators?.[0]?.pulse?.(strength, ms);
}

function startTalking(controller) {
  if (talk || transcribing) return;
  if (!micStream || !transcriber) {
    // asking from inside XR may work once the browser has a grant; the page buttons are the sure way
    panelSet('Not ready yet', !micStream ? 'Allowing the microphone…' : 'Loading the voice model…', 'or use the buttons on the page first', 'busy');
    (async () => { await ensureMic(); await ensureModel(); panelIdle(); })().catch((e) => panelSet('Voice not ready', e.message, 'on the page: Allow mic, then Load voice model', 'error'));
    return;
  }
  window.speechSynthesis?.cancel();
  const mime = pickMime();
  const t = { controller, chunks: [], mime, startedAt: performance.now(), pointing: null,
    recorder: new MediaRecorder(micStream, mime ? { mimeType: mime } : undefined) };
  talk = t;
  t.recorder.ondataavailable = (e) => { if (e.data?.size) t.chunks.push(e.data); };
  t.recorder.onstop = () => transcribe(t);
  t.recorder.start();
  pulse(controller);
  panelSet('Listening', 'speak, then let go', '', 'busy');
}

function stopTalking(controller) {
  if (!talk || talk.controller !== controller) return;
  talk.pointing = pointing(controller);
  talk.recorder.stop(); // onstop transcribes and sends
}

async function transcribe(t) {
  talk = null;
  marker.visible = false;
  if (performance.now() - t.startedAt < MIN_RECORDING_MS || !t.chunks.length) {
    panelSet("Didn't catch that", 'hold the trigger while you speak', '', 'error');
    return;
  }
  transcribing = true;
  panelSet('Transcribing', '…', 'on the headset, a few seconds', 'busy');
  let text = '';
  try {
    const audio = await to16kMono(new Blob(t.chunks, { type: t.mime || 'audio/webm' }));
    text = String((await transcriber(audio))?.text ?? '').trim();
  } catch (e) {
    log(`transcription failed: ${e.message}`);
    panelSet('Transcription failed', e.message, '', 'error');
    return;
  } finally {
    transcribing = false;
  }
  if (!text || /^[[(].*[\])]$/.test(text)) { // Whisper marks silence as [BLANK_AUDIO] or (silence)
    panelSet("Didn't catch that", 'nothing heard', 'hold the trigger and speak', 'error');
    return;
  }
  pulse(t.controller, 0.7, 80);
  say(text, t.pointing ?? pointing(t.controller));
}

// --- the session ---------------------------------------------------------------------------------------------

const controllers = [0, 1].map((i) => {
  const c = renderer.xr.getController(i);
  c.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -4)]),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 })));
  c.addEventListener('connected', (e) => { c.userData.source = e.data; });
  c.addEventListener('disconnected', () => { c.userData.source = null; });
  c.addEventListener('selectstart', () => startTalking(c));
  c.addEventListener('selectend', () => stopTalking(c));
  scene.add(c);
  return c;
});

let session = null;
let mode = 'immersive-ar'; // or immersive-vr where AR is not offered: the cube over a grid instead of the room
const grid = new THREE.GridHelper(8, 16, 0x6b6458, 0x3a362f);
grid.visible = false;
scene.add(grid);
let firstPlaneAt = 0;
let roomSent = false;
let panelPlaced = false;
let last = 0;

function onFrame(time, frame) {
  const dt = Math.min((time - last) / 1000, 0.1);
  last = time;
  if (frame && session) {
    const ref = renderer.xr.getReferenceSpace();
    syncRoom(frame, ref);
    if (room.size && !firstPlaneAt) firstPlaneAt = time;
    if (firstPlaneAt && !roomSent && time - firstPlaneAt > ROOM_AFTER_MS) {
      roomSent = true;
      const objects = roomSummary();
      api('POST', 'api/room', { objects }).then(() => log(`room sent: ${objects.length} things`), (e) => log(`room not sent: ${e.message}`));
    }
    placePanel(!panelPlaced);
    panelPlaced = true;
  }
  // ease toward what the agent set
  const k = 1 - Math.exp(-dt * 8);
  cube.position.lerp(want.position, k);
  cube.scale.setScalar(THREE.MathUtils.lerp(cube.scale.x, want.size, k));
  cube.material.color.lerp(want.color, k);
  if (want.spin) cube.rotation.y += dt * 1.2;
  // while talking, show what the ray is on
  const hit = talk?.controller ? aim(talk.controller) : null;
  marker.visible = !!hit;
  if (hit) {
    marker.position.copy(hit.point);
    marker.lookAt(hit.point.clone().add(hit.face?.normal.clone().transformDirection(hit.object.matrixWorld) ?? new THREE.Vector3(0, 1, 0)));
  }
  renderer.render(scene, camera);
}

async function enter() {
  $('enter').disabled = true;
  try {
    session = await navigator.xr.requestSession(mode, {
      requiredFeatures: ['local-floor'],
      optionalFeatures: mode === 'immersive-ar' ? ['plane-detection', 'mesh-detection', 'hand-tracking'] : ['hand-tracking'],
    });
  } catch (e) {
    log(`could not enter ${mode}: ${e.message}`);
    $('enter').disabled = false;
    return;
  }
  log(`in ${mode}; features: ${JSON.stringify(session.enabledFeatures ?? 'not reported')}`);
  grid.visible = mode === 'immersive-vr';
  renderer.setClearColor(0x15130f, mode === 'immersive-vr' ? 1 : 0);
  session.addEventListener('end', () => {
    for (const d of room.values()) scene.remove(d.obj);
    room.clear();
    renderer.setAnimationLoop(null);
    session = null;
    firstPlaneAt = 0;
    roomSent = false;
    panelPlaced = false;
    $('enter').disabled = false;
    log(`left ${mode}`);
  });
  panelIdle();
  await renderer.xr.setSession(session);
  renderer.setAnimationLoop(onFrame);
}

// --- the page ------------------------------------------------------------------------------------------------

$('typed').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('text').value.trim();
  if (!text) return;
  $('text').value = '';
  say(text, null);
});

// voice setup on the flat page, where permission prompts and the model download can be seen
$('mic').addEventListener('click', () => ensureMic().catch((e) => setVoice('mic', `refused: ${e.message}`)));
$('model').addEventListener('click', () => ensureModel().catch(() => {}));

// the page's own hold-to-talk, to try the voice path before entering XR
const talkBtn = $('talk');
talkBtn.addEventListener('pointerdown', () => { startTalking(null); if (talk) talkBtn.textContent = 'Listening… let go to send'; });
for (const ev of ['pointerup', 'pointerleave']) {
  talkBtn.addEventListener(ev, () => { stopTalking(null); talkBtn.textContent = 'Hold to talk'; });
}
if (!window.MediaRecorder) { talkBtn.disabled = true; talkBtn.textContent = 'No recording in this browser'; }

async function init() {
  if (!token) log('no token in the address: open the URL the server printed (it ends in ?t=…)');
  connect();
  if (!navigator.xr) { $('enter').textContent = 'No WebXR here'; return; }
  const ar = await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
  const vr = ar || (await navigator.xr.isSessionSupported('immersive-vr').catch(() => false));
  mode = ar ? 'immersive-ar' : 'immersive-vr';
  $('enter').textContent = ar ? 'Enter AR' : vr ? 'Enter VR (no AR here)' : 'No immersive mode here';
  $('enter').disabled = !vr;
  $('enter').addEventListener('click', enter);
  log(`recording: ${window.MediaRecorder ? 'yes' : 'no'}; speech synthesis: ${window.speechSynthesis ? 'yes' : 'no'}`);
}

panelIdle();
init();
