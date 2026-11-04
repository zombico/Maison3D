// Maison3D in the browser: the same server the headset app talks to, from any browser, and in VR from a Quest's
// browser (WebXR). The room and every piece come from the server as GLB (/room/…, /catalog/…); a turn is words (typed,
// or held-to-talk and transcribed by the server) plus where you pointed, and the answer is the whole scene again.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

const $ = (id) => document.getElementById(id);

// --- your own room on the server ---------------------------------------------------------------------------------------
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
const newId = () => (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
let design = store.get('maison-design') ?? newId();
store.set('maison-design', design);

async function api(path, body) {
  const r = await fetch(path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-maison-design': design }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `the server said ${r.status}`), { body: j });
  return j;
}

// --- the 3D view -----------------------------------------------------------------------------------------------------------
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#1b1a18');
scene.add(new THREE.AmbientLight(0xffffff, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(1, 3, -2); scene.add(sun);

// the camera rides on a rig, so VR can step and turn you around the room
const rig = new THREE.Group(); scene.add(rig);
const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 60);
rig.add(camera);
camera.position.set(2.3, 1.7, 1.9); // the back right corner, looking across the room
const controls = new OrbitControls(camera, canvas);
controls.target.set(-0.6, 0.9, -0.9);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = 0.4; controls.maxDistance = 9; controls.maxPolarAngle = Math.PI * 0.92;
controls.update();
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

const loader = new GLTFLoader();
const models = new Map(); // url -> Promise<gltf scene>
const load = (url) => { if (!models.has(url)) { const p = loader.loadAsync(url).then((g) => g.scene); models.set(url, p); p.catch(() => models.delete(url)); } return models.get(url).then((s) => s.clone(true)); };

const roomGroup = new THREE.Group(), piecesGroup = new THREE.Group();
scene.add(roomGroup, piecesGroup);
let roomUrl = null, roomInfo = null;
const pieces = new Map(); // id -> { model, obj }

/** The scene the server sent: the room (when it changed) and every piece where it stands. */
async function apply(r) {
  if (r.room?.shell && r.room.shell !== roomUrl) {
    roomUrl = r.room.shell;
    const shell = await load(r.room.shell);
    if (roomUrl === r.room.shell) { roomGroup.clear(); roomGroup.add(shell); }
  }
  if (r.room) roomInfo = r.room;
  const seen = new Set();
  let loading = 0;
  for (const p of r.scene ?? []) {
    seen.add(p.id);
    let e = pieces.get(p.id);
    if (!e || e.model !== p.model) {
      const old = e?.obj;
      e = { model: p.model, obj: null };
      pieces.set(p.id, e);
      loading++;
      load(p.model).then((obj) => {
        if (pieces.get(p.id) !== e) return;
        obj.traverse((o) => (o.userData.piece = p.id));
        e.obj = obj; place(obj, e.at, e.facing);
        if (old) piecesGroup.remove(old);
        piecesGroup.add(obj);
      }).catch(() => status(`could not load ${p.id}`)).finally(() => { if (--loading === 0) status(''); });
    }
    e.at = p.at; e.facing = p.facing; e.name = p.name;
    if (e.obj) place(e.obj, p.at, p.facing);
  }
  for (const [id, e] of pieces) if (!seen.has(id)) { if (e.obj) piecesGroup.remove(e.obj); pieces.delete(id); }
  if (loading) status(`bringing in ${loading} piece${loading > 1 ? 's' : ''}…`);
}
const place = (obj, at, f) => { obj.position.set(at[0], at[1], at[2]); obj.rotation.set(0, Math.atan2(f[0], f[2]), 0); };

// --- where you are, what you point at --------------------------------------------------------------------------------------
const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
function viewer() {
  camera.getWorldPosition(tmpV);
  const d = new THREE.Vector3(); camera.getWorldDirection(d); d.y = 0; d.normalize();
  return { position: [tmpV.x, tmpV.y, tmpV.z].map(r3), forward: [d.x, 0, d.z].map(r3) };
}
const r3 = (v) => Math.round(v * 1000) / 1000;
const raycaster = new THREE.Raycaster();
let pointing = null;
const marker = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.09, 32), new THREE.MeshBasicMaterial({ color: 0xd9a066, side: THREE.DoubleSide, depthTest: false }));
marker.renderOrder = 10; marker.visible = false; scene.add(marker);

/** Points along a ray: what it meets first, shown with a ring, and kept for the next thing you say. */
function pointAlong(origin, direction) {
  raycaster.set(origin, direction);
  const roomHit = raycaster.intersectObject(roomGroup, true)[0];
  const pieceHit = raycaster.intersectObject(piecesGroup, true)[0];
  const hit = pieceHit && (!roomHit || pieceHit.distance < roomHit.distance) ? pieceHit : roomHit;
  if (!hit) { clearPointing(); return; }
  pointing = { ray: { origin: origin.toArray().map(r3), direction: direction.toArray().map(r3) }, ...(roomHit ? { distance: r3(roomHit.distance) } : {}) };
  const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
  marker.position.copy(hit.point).addScaledVector(n, 0.01);
  marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  marker.visible = true;
  const id = hit.object.userData.piece, what = id ? `the ${(pieces.get(id)?.name ?? id).toLowerCase()}` : Math.abs(n.y) > 0.7 ? (n.y > 0 ? 'the floor' : 'the ceiling') : 'a wall';
  $('pointing').hidden = false;
  $('pointing').textContent = `Pointing at ${what} — say “here” or “this”`;
  vrPanel.draw();
}
function clearPointing() { pointing = null; marker.visible = false; $('pointing').hidden = true; }

// a click (not a drag) points
let down = null;
canvas.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
canvas.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
  const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  pointAlong(raycaster.ray.origin.clone(), raycaster.ray.direction.clone());
});

// --- the conversation -------------------------------------------------------------------------------------------------------
const lines = [];
function log(kind, text, small) {
  const el = document.createElement('div');
  el.className = `msg ${kind}`;
  el.textContent = text;
  if (small) { const s = document.createElement('small'); s.textContent = small; el.append(s); }
  $('log').append(el);
  while ($('log').children.length > 8) $('log').firstChild.remove();
  lines.push([kind, text]); while (lines.length > 4) lines.shift();
  vrPanel.draw();
}
let statusText = '';
function status(t) { statusText = t; $('status').textContent = t; vrPanel.draw(); }
let busy = false;
function setBusy(b, t = '') { busy = b; document.body.classList.toggle('busy', b); status(t); }

let voiceOn = store.get('maison-voice') !== 'off';
const voiceBtn = $('voice');
const showVoice = () => { voiceBtn.textContent = voiceOn ? 'Voice on' : 'Voice off'; voiceBtn.setAttribute('aria-pressed', String(voiceOn)); };
voiceBtn.onclick = () => { voiceOn = !voiceOn; store.set('maison-voice', voiceOn ? 'on' : 'off'); if (!voiceOn) speechSynthesis?.cancel(); showVoice(); };
showVoice();
function speak(text) {
  if (!voiceOn || !text || !('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  const v = speechSynthesis.getVoices().find((x) => /^en(-|_)/i.test(x.lang) && /natural|google|samantha|daniel/i.test(x.name)) ?? speechSynthesis.getVoices().find((x) => /^en/i.test(x.lang));
  if (v) u.voice = v;
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}
function showLimit(l) { if (!l || l.left == null) return; $('limit').hidden = false; $('limit').textContent = `${l.left} of ${l.of} turns left today`; if (innerWidth <= 760 && !busy) status(`${l.left} turns left today`); }

async function turn(text) {
  if (busy || !text.trim()) return;
  $('intro').classList.add('tucked');
  log('you', text);
  setBusy(true, 'Thinking…');
  try {
    const r = await api('/api/turn', { text, pointing, room: { viewer: viewer() }, voice: false });
    await apply(r);
    if (r.reply) { log('maison', r.reply); speak(r.reply); }
    showLimit(r.limit);
  } catch (e) {
    log('error', e.message);
    if (e.body?.scene) await apply(e.body);
    showLimit(e.body?.limit);
  } finally {
    clearPointing();
    setBusy(false);
  }
}

$('say').addEventListener('submit', (e) => { e.preventDefault(); const t = $('text').value; $('text').value = ''; turn(t); });
const EXAMPLES = [
  'Make this a calm Japandi living room',
  'A slatted media console against the right wall with a 65 inch TV above it',
  'A dining table for six with chairs around it on the left',
  'Herringbone floor and limewash walls',
  'Pinch-pleat curtains on the window ahead, hung high',
  'A round moroccan rug under the coffee table',
  'Pot lights in a grid over the room',
  'Make the sofa sage green',
];
for (const t of EXAMPLES) { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.onclick = () => turn(t); $('examples').append(b); }
$('help').onclick = () => $('intro').classList.toggle('tucked');
$('close').onclick = () => $('intro').classList.add('tucked');
$('restart').onclick = () => { if (!confirm('Start over in an empty room?')) return; design = newId(); store.set('maison-design', design); location.reload(); };

// --- hold to talk: a 16 kHz mono WAV, transcribed by the server ----------------------------------------------------------------
let rec = null;
async function startTalking() {
  if (rec || busy) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    const ctx = new AudioContext(), src = ctx.createMediaStreamSource(stream), proc = ctx.createScriptProcessor(4096, 1, 1), chunks = [];
    proc.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    src.connect(proc); proc.connect(ctx.destination);
    rec = { stream, ctx, src, proc, chunks, t0: performance.now() };
    speechSynthesis?.cancel();
    $('mic').classList.add('on'); status('Listening… let go when you are done');
  } catch (e) { log('error', 'The microphone is not available: allow it for this page, or type instead.'); }
}
async function stopTalking() {
  if (!rec) return;
  const { stream, ctx, src, proc, chunks, t0 } = rec; rec = null;
  $('mic').classList.remove('on');
  src.disconnect(); proc.disconnect(); stream.getTracks().forEach((t) => t.stop());
  const rate = ctx.sampleRate; await ctx.close();
  if (performance.now() - t0 < 350) { status(''); return; }
  const wav = toWav(chunks, rate, 16000);
  setBusy(true, 'Hearing…');
  try {
    const { said } = await api('/api/hear', { audio: base64(wav) });
    setBusy(false);
    if (!said) { status('I did not catch that'); return; }
    await turn(said);
  } catch (e) { setBusy(false); log('error', e.message); }
}
function toWav(chunks, from, to) {
  const n = chunks.reduce((s, c) => s + c.length, 0), all = new Float32Array(n);
  let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
  const ratio = from / to, m = Math.floor(n / ratio), pcm = new Int16Array(m);
  for (let i = 0; i < m; i++) {
    const a = Math.floor(i * ratio), b = Math.min(n, Math.floor((i + 1) * ratio));
    let s = 0; for (let k = a; k < b; k++) s += all[k];
    const v = Math.max(-1, Math.min(1, s / Math.max(1, b - a)));
    pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  const buf = new ArrayBuffer(44 + pcm.byteLength), d = new DataView(buf);
  const str = (off, s) => [...s].forEach((ch, i) => d.setUint8(off + i, ch.charCodeAt(0)));
  str(0, 'RIFF'); d.setUint32(4, 36 + pcm.byteLength, true); str(8, 'WAVE'); str(12, 'fmt ');
  d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true); d.setUint32(24, to, true); d.setUint32(28, to * 2, true);
  d.setUint16(32, 2, true); d.setUint16(34, 16, true); str(36, 'data'); d.setUint32(40, pcm.byteLength, true);
  new Int16Array(buf, 44).set(pcm);
  return new Uint8Array(buf);
}
function base64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); }

const mic = $('mic');
mic.addEventListener('pointerdown', (e) => { e.preventDefault(); mic.setPointerCapture(e.pointerId); startTalking(); });
mic.addEventListener('pointerup', stopTalking);
mic.addEventListener('pointercancel', stopTalking);
addEventListener('keydown', (e) => { if (e.code === 'Space' && !e.repeat && document.activeElement !== $('text')) { e.preventDefault(); startTalking(); } });
addEventListener('keyup', (e) => { if (e.code === 'Space' && document.activeElement !== $('text')) stopTalking(); });

// --- VR: a laser on each controller, grip to talk, trigger to point, thumbstick to step and turn --------------------------------
navigator.xr?.isSessionSupported('immersive-vr').then((ok) => ok && $('vr').append(VRButton.createButton(renderer, { optionalFeatures: ['local-floor', 'bounded-floor'] }))).catch(() => {});
const factory = new XRControllerModelFactory();
const hands = [0, 1].map((i) => {
  const c = renderer.xr.getController(i), grip = renderer.xr.getControllerGrip(i);
  grip.add(factory.createControllerModel(grip));
  const laser = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0xd9a066 }));
  laser.scale.z = 4; c.add(laser);
  const h = { c, grip, laser, source: null, stick: 0 };
  c.addEventListener('connected', (e) => (h.source = e.data));
  c.addEventListener('disconnected', () => (h.source = null));
  c.addEventListener('selectend', () => { const [o, d] = aim(c); pointAlong(o, d); });
  c.addEventListener('squeezestart', startTalking);
  c.addEventListener('squeezeend', stopTalking);
  rig.add(c, grip);
  return h;
});
function aim(c) {
  const o = new THREE.Vector3(), d = new THREE.Vector3(0, 0, -1);
  c.getWorldPosition(o); c.getWorldQuaternion(tmpQ); d.applyQuaternion(tmpQ).normalize();
  return [o, d];
}

// what you said and what Maison3D answered, on a small panel by your left hand
const vrPanel = (() => {
  const cv = document.createElement('canvas'); cv.width = 768; cv.height = 384;
  const g = cv.getContext('2d'), tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.16), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  mesh.position.set(0, 0.09, -0.08); mesh.rotation.x = -0.6;
  const wrap = (t, w) => { const out = []; let line = ''; for (const word of t.split(' ')) { const next = line ? `${line} ${word}` : word; if (g.measureText(next).width > w && line) { out.push(line); line = word; } else line = next; } if (line) out.push(line); return out; };
  return {
    mesh,
    draw() {
      g.clearRect(0, 0, cv.width, cv.height);
      g.fillStyle = 'rgba(24,22,20,0.86)'; g.beginPath(); g.roundRect(0, 0, cv.width, cv.height, 28); g.fill();
      g.font = '600 26px system-ui, sans-serif'; g.fillStyle = '#d9a066';
      g.fillText(statusText || (pointing ? 'Pointing: say “here” or “this”' : 'Hold grip to talk · trigger to point'), 24, 44);
      let y = 92; g.font = '26px system-ui, sans-serif';
      for (const [kind, text] of lines.slice(-3)) {
        g.fillStyle = kind === 'you' ? '#e8e2d6' : kind === 'error' ? '#f0a08a' : '#f4f1ec';
        for (const l of wrap(`${kind === 'you' ? 'You: ' : ''}${text}`, cv.width - 48).slice(0, 3)) { if (y > cv.height - 16) break; g.fillText(l, 24, y); y += 34; }
        y += 8;
      }
      tex.needsUpdate = true;
    },
  };
})();
vrPanel.draw();

let saved = null;
renderer.xr.addEventListener('sessionstart', () => {
  // stand where the browser camera was, facing the same way; the room's floor is the floor you stand on
  saved = { pos: camera.position.clone(), quat: camera.quaternion.clone(), target: controls.target.clone() };
  controls.enabled = false;
  const v = viewer();
  rig.position.set(v.position[0], 0, v.position[2]);
  rig.rotation.set(0, Math.atan2(-v.forward[0], -v.forward[2]), 0);
  camera.position.set(0, 0, 0); camera.quaternion.identity();
  const left = hands.find((h) => h.source?.handedness === 'left') ?? hands[0];
  left.grip.add(vrPanel.mesh);
});
renderer.xr.addEventListener('sessionend', () => {
  rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
  if (saved) { camera.position.copy(saved.pos); camera.quaternion.copy(saved.quat); controls.target.copy(saved.target); }
  controls.enabled = true; controls.update();
});

function xrFrame() {
  for (const h of hands) {
    if (!h.source) continue;
    const [o, d] = aim(h.c);
    raycaster.set(o, d);
    const hit = raycaster.intersectObjects([roomGroup, piecesGroup], true)[0];
    h.laser.scale.z = hit ? hit.distance : 4;
    const axes = h.source.gamepad?.axes ?? [];
    const x = axes[2] ?? 0, y = axes[3] ?? 0;
    const was = h.stick;
    h.stick = Math.abs(x) > 0.7 ? Math.sign(x) : y < -0.7 ? 2 : 0;
    if (h.stick === was || h.stick === 0) continue;
    camera.getWorldPosition(tmpV);
    const before = tmpV.clone();
    if (h.stick === 2) {
      // step to where you point, on the floor
      if (hit && hit.face && hit.face.normal.clone().transformDirection(hit.object.matrixWorld).y > 0.7) { rig.position.x += hit.point.x - before.x; rig.position.z += hit.point.z - before.z; }
    } else {
      rig.rotation.y -= (h.stick * Math.PI) / 6; rig.updateMatrixWorld(true);
      camera.getWorldPosition(tmpV); rig.position.x += before.x - tmpV.x; rig.position.z += before.z - tmpV.z;
    }
  }
}

renderer.setAnimationLoop(() => {
  if (renderer.xr.isPresenting) xrFrame(); else controls.update();
  renderer.render(scene, camera);
});

// --- start: your room as the server has it ----------------------------------------------------------------------------------------
(async () => {
  try {
    await apply(await api('/api/scene'));
    showLimit(await api('/api/limit'));
    if (pieces.size) $('intro').classList.add('tucked');
  } catch (e) { log('error', `The server is not answering: ${e.message}`); }
})();
