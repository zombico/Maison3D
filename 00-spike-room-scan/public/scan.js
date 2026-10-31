// Spike 00: what does the Quest browser expose about the room?
// Plain WebXR (plane-detection, mesh-detection) so the answer is about the platform, not a wrapper.
// Everything is recorded in the session's local-floor space: y up, metres, -z forward at session start.
import * as THREE from 'three';

const AUTO_SAVE_MS = 3000;           // after the first plane appears
const MESH_GEOMETRY_LIMIT = 4096;    // vertices; bounded (furniture) meshes are far smaller, the global mesh is not

const enterBtn = document.getElementById('enter');
const fullBox = document.getElementById('full');
const statusEl = document.getElementById('status');

const COLORS = {
  floor: 0x5bd16a, ceiling: 0x8a8a8a, wall: 0x4f8cff, 'door frame': 0xff9a3c, 'window frame': 0x3fe0e0,
  table: 0xe05bd1, couch: 0xe05bd1, bed: 0xe05bd1, screen: 0xe05bd1, storage: 0xe05bd1, lamp: 0xe05bd1,
  plant: 0xe05bd1, 'wall art': 0xe05bd1, 'global mesh': 0xffffff, other: 0xf2d544,
};
const colorOf = (label) => COLORS[label] ?? COLORS.other;

function log(msg) {
  console.log(msg);
  statusEl.textContent += msg + '\n';
}

// --- three ---------------------------------------------------------------------------------------------------

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
scene.add(new THREE.AxesHelper(0.3)); // the session origin, on the floor

// --- ids: stable per detected object within a session ------------------------------------------------------

const ids = new WeakMap();
let nextId = 1;
function idOf(obj, prefix) {
  if (!ids.has(obj)) ids.set(obj, `${prefix}${nextId++}`);
  return ids.get(obj);
}

// --- drawing the room over passthrough ---------------------------------------------------------------------

const drawnPlanes = new Map(); // XRPlane -> { obj, changed }
const drawnMeshes = new Map(); // XRMesh -> { obj, changed }

function planeObject(plane) {
  const pts = plane.polygon.map((p) => new THREE.Vector3(p.x, p.y, p.z));
  const geom = new THREE.BufferGeometry().setFromPoints(pts);
  const obj = new THREE.LineLoop(geom, new THREE.LineBasicMaterial({ color: colorOf(plane.semanticLabel) }));
  obj.matrixAutoUpdate = false;
  return obj;
}

function meshObject(mesh) {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(mesh.vertices), 3));
  geom.setIndex(new THREE.BufferAttribute(new Uint32Array(mesh.indices), 1));
  const global = mesh.semanticLabel === 'global mesh';
  const obj = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({
    color: colorOf(mesh.semanticLabel), wireframe: true, transparent: true, opacity: global ? 0.15 : 0.8,
  }));
  obj.matrixAutoUpdate = false;
  return obj;
}

function sync(drawn, detected, space, make, frame, ref) {
  for (const [xr, d] of drawn) {
    if (!detected.has(xr)) { scene.remove(d.obj); drawn.delete(xr); }
  }
  for (const xr of detected) {
    let d = drawn.get(xr);
    if (d && d.changed !== xr.lastChangedTime) { scene.remove(d.obj); d = null; }
    if (!d) {
      d = { obj: make(xr), changed: xr.lastChangedTime };
      drawn.set(xr, d);
      scene.add(d.obj);
    }
    const pose = frame.getPose(space(xr), ref);
    d.obj.visible = !!pose;
    if (pose) d.obj.matrix.fromArray(pose.transform.matrix);
  }
}

// --- the snapshot ------------------------------------------------------------------------------------------

const r = (v) => Math.round(v * 1000) / 1000;
const vec = (v) => [r(v.x), r(v.y), r(v.z)];
const poseJson = (t) => ({
  position: [r(t.position.x), r(t.position.y), r(t.position.z)],
  orientation: [t.orientation.x, t.orientation.y, t.orientation.z, t.orientation.w].map((q) => Math.round(q * 1e6) / 1e6),
  matrix: Array.from(t.matrix, (m) => Math.round(m * 1e6) / 1e6),
});

function capturePlane(plane, frame, ref) {
  const pose = frame.getPose(plane.planeSpace, ref);
  if (!pose) return null;
  const m = new THREE.Matrix4().fromArray(pose.transform.matrix);
  return {
    id: idOf(plane, 'p'),
    label: plane.semanticLabel ?? null,
    orientation: plane.orientation ?? null,
    pose: poseJson(pose.transform),
    polygon: plane.polygon.map((p) => [r(p.x), r(p.z)]), // in the plane's own space, where y = 0
    world: plane.polygon.map((p) => vec(new THREE.Vector3(p.x, p.y, p.z).applyMatrix4(m))),
  };
}

function captureMesh(mesh, frame, ref, full) {
  const pose = frame.getPose(mesh.meshSpace, ref);
  if (!pose) return null;
  const m = new THREE.Matrix4().fromArray(pose.transform.matrix);
  const v = mesh.vertices;
  const local = new THREE.Box3();
  const world = new THREE.Box3();
  const p = new THREE.Vector3();
  for (let i = 0; i < v.length; i += 3) {
    p.set(v[i], v[i + 1], v[i + 2]);
    local.expandByPoint(p);
    world.expandByPoint(p.applyMatrix4(m));
  }
  const vertexCount = v.length / 3;
  const out = {
    id: idOf(mesh, 'm'),
    label: mesh.semanticLabel ?? null,
    pose: poseJson(pose.transform),
    vertexCount,
    triangleCount: mesh.indices.length / 3,
    localBox: { min: vec(local.min), max: vec(local.max) }, // with pose: the oriented box of a furniture mesh
    worldBox: { min: vec(world.min), max: vec(world.max) },
  };
  if (vertexCount <= MESH_GEOMETRY_LIMIT || full) {
    out.vertices = Array.from(v, r); // mesh space
    out.indices = Array.from(mesh.indices);
  }
  return out;
}

function capture(session, frame, ref, reason) {
  const full = fullBox.checked;
  const viewer = frame.getViewerPose(ref);
  return {
    version: 1,
    reason,
    capturedAt: new Date().toISOString(),
    space: 'webxr local-floor: y up, metres, -z forward at session start',
    userAgent: navigator.userAgent,
    enabledFeatures: session.enabledFeatures ?? null,
    roomCaptureAvailable: typeof session.initiateRoomCapture === 'function',
    viewer: viewer ? poseJson(viewer.transform) : null,
    planes: [...(frame.detectedPlanes ?? [])].map((pl) => capturePlane(pl, frame, ref)).filter(Boolean),
    meshes: [...(frame.detectedMeshes ?? [])].map((me) => captureMesh(me, frame, ref, full)).filter(Boolean),
  };
}

async function post(scan) {
  const res = await fetch('/api/scan', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(scan),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const { file, summary } = await res.json();
  log(`saved ${file}: planes ${JSON.stringify(summary.planes)}, meshes ${JSON.stringify(summary.meshes)}`);
}

// --- haptics: the only feedback inside the headset ---------------------------------------------------------

function pulse(source, times = 1) {
  const h = source?.gamepad?.hapticActuators?.[0];
  if (!h?.pulse) return;
  for (let i = 0; i < times; i++) setTimeout(() => h.pulse(0.6, 70), i * 140);
}

// --- the session -------------------------------------------------------------------------------------------

let session = null;
let pending = null;      // { reason, source } — captured on the next frame, where poses are available
let firstPlaneAt = 0;
let autoSaved = false;
let lastScan = null;

async function roomCapture(source) {
  if (typeof session?.initiateRoomCapture !== 'function') {
    log('initiateRoomCapture is not available in this browser');
    pulse(source, 3);
    return;
  }
  try {
    await session.initiateRoomCapture();
    log('room capture finished');
  } catch (e) {
    log(`room capture failed: ${e.message}`); // the browser allows it once per session
    pulse(source, 3);
  }
}

function onFrame(time, frame) {
  if (frame && session) {
    const ref = renderer.xr.getReferenceSpace();
    const planes = frame.detectedPlanes ?? new Set();
    const meshes = frame.detectedMeshes ?? new Set();
    sync(drawnPlanes, planes, (p) => p.planeSpace, planeObject, frame, ref);
    sync(drawnMeshes, meshes, (m) => m.meshSpace, meshObject, frame, ref);

    if (planes.size && !firstPlaneAt) firstPlaneAt = time;
    if (firstPlaneAt && !autoSaved && time - firstPlaneAt > AUTO_SAVE_MS) {
      autoSaved = true;
      pending ??= { reason: 'auto' };
    }
    if (pending) {
      const { reason, source } = pending;
      pending = null;
      lastScan = capture(session, frame, ref, reason);
      post(lastScan).then(() => pulse(source, 2), (e) => { log(`save failed: ${e.message}`); pulse(source, 3); });
    }
  }
  renderer.render(scene, camera);
}

async function enter() {
  enterBtn.disabled = true;
  statusEl.textContent = '';
  try {
    session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['plane-detection', 'mesh-detection', 'hand-tracking', 'anchors'],
    });
  } catch (e) {
    log(`requestSession failed: ${e.message}`);
    enterBtn.disabled = false;
    return;
  }
  log(`enabled features: ${JSON.stringify(session.enabledFeatures ?? 'not reported')}`);
  log(`initiateRoomCapture: ${typeof session.initiateRoomCapture === 'function' ? 'available' : 'absent'}`);

  session.addEventListener('select', (e) => { pending = { reason: 'trigger', source: e.inputSource }; });
  session.addEventListener('squeeze', (e) => roomCapture(e.inputSource));
  session.addEventListener('end', () => {
    if (!lastScan) log('no room saved: run Space Setup in Settings > Physical space, or press grip inside the session');
    for (const d of [...drawnPlanes.values(), ...drawnMeshes.values()]) scene.remove(d.obj);
    drawnPlanes.clear();
    drawnMeshes.clear();
    renderer.setAnimationLoop(null);
    session = null;
    pending = null;
    firstPlaneAt = 0;
    autoSaved = false;
    lastScan = null;
    enterBtn.disabled = false;
  });

  await renderer.xr.setSession(session);
  renderer.setAnimationLoop(onFrame);
}

async function init() {
  if (!navigator.xr) {
    enterBtn.textContent = 'No WebXR here';
    log('navigator.xr is missing: open this page in the Quest browser at http://localhost:8080 (after adb reverse)');
    return;
  }
  if (!window.isSecureContext) log('not a secure context: WebXR needs https or http://localhost');
  const ok = await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
  enterBtn.textContent = ok ? 'Enter room' : 'immersive-ar not supported';
  enterBtn.disabled = !ok;
  enterBtn.addEventListener('click', enter);
}

init();
