// Maison3D in the browser: the same server the headset app talks to, from any browser, and in VR from a Quest's
// browser (WebXR). The room and every piece come from the server as GLB (/room/…, /catalog/…). Talking is a turn
// (words, where you pointed, an area you highlighted) and the answer is the whole scene again. Everything else is done
// by hand, no model in between: adding from the library, dragging and turning pieces, sizes, finishes, colours, the
// room's size and surfaces (/api/tool calls the same tools Muse uses). Lamps, ceiling lights and windows light the room.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

const $ = (id) => document.getElementById(id);
const r3 = (v) => Math.round(v * 1000) / 1000;
const r2 = (v) => Math.round(v * 100) / 100;
const FT = 0.3048;

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
RectAreaLightUniformsLib.init();
const scene = new THREE.Scene();
scene.background = new THREE.Color('#1b1a18');
const ambient = new THREE.AmbientLight(0xffffff, 1.3); scene.add(ambient);
const sun = new THREE.DirectionalLight(0xfff4e6, 0.9); sun.position.set(1, 3, -2); scene.add(sun);

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
const pieces = new Map(); // id -> { model, obj, data }

/** The scene the server sent: the room (when it changed) and every piece where it stands. */
async function apply(r) {
  if (r.room) roomInfo = r.room;
  if (r.room?.shell && r.room.shell !== roomUrl) {
    roomUrl = r.room.shell;
    const shell = await load(r.room.shell);
    if (roomUrl === r.room.shell) { roomGroup.clear(); roomGroup.add(shell); lighting.glass(); }
  }
  const seen = new Set();
  let loading = 0;
  for (const p of r.scene ?? []) {
    seen.add(p.id);
    let e = pieces.get(p.id);
    if (!e || e.model !== p.model) {
      const old = e?.obj;
      e = { model: p.model, obj: null, data: p };
      pieces.set(p.id, e);
      loading++;
      load(p.model).then((obj) => {
        if (pieces.get(p.id) !== e) return;
        obj.traverse((o) => (o.userData.piece = p.id));
        e.obj = obj; place(obj, e.data.at, e.data.facing);
        if (old) piecesGroup.remove(old);
        piecesGroup.add(obj);
        if (selected === p.id) select(p.id);
      }).catch(() => status(`could not load ${p.name ?? p.id}`)).finally(() => { if (--loading === 0) status(''); });
    }
    e.data = p;
    if (e.obj) place(e.obj, p.at, p.facing);
  }
  for (const [id, e] of pieces) if (!seen.has(id)) { if (e.obj) piecesGroup.remove(e.obj); pieces.delete(id); if (selected === id) select(null); }
  if (loading) status(`bringing in ${loading} piece${loading > 1 ? 's' : ''}…`);
  lighting.update();
  if (selected) showPiece();
  if (panelKind === 'room') showRoom();
}
const place = (obj, at, f) => { obj.position.set(at[0], at[1], at[2]); obj.rotation.set(0, Math.atan2(f[0], f[2]), 0); };

// --- light: windows by day, lamps and ceiling lights by evening ------------------------------------------------------------
const lighting = (() => {
  const POOL = 8, pool = Array.from({ length: POOL }, () => { const l = new THREE.PointLight(0xffd9a8, 0, 7, 2); scene.add(l); return l; });
  const wins = Array.from({ length: 4 }, () => { const l = new THREE.RectAreaLight(0xfff6e8, 0, 1, 1); scene.add(l); return l; });
  let mode = store.get('maison-light') === 'evening' ? 'evening' : 'day', emitters = [], glassMats = [], last = 0;
  const M = { day: { ambient: 1.15, sun: 0.75, window: 5, windowColour: 0xfff6e8, lamp: 0.012, glass: '#e6f0f7' }, evening: { ambient: 0.28, sun: 0, window: 0.35, windowColour: 0x6d7fa8, lamp: 0.05, glass: '#1c273b' } };
  function assign() {
    camera.getWorldPosition(tmpV);
    const near = emitters.map((e) => ({ e, d: tmpV.distanceToSquared(e.pos) })).sort((a, b) => a.d - b.d);
    pool.forEach((l, i) => {
      const n = near[i]?.e;
      if (!n) { l.intensity = 0; return; }
      l.position.copy(n.pos); l.color.set(n.colour);
      l.intensity = (n.lumens / (4 * Math.PI)) * M[mode].lamp;
    });
  }
  return {
    get mode() { return mode; },
    set(m) { mode = m; store.set('maison-light', m); this.update(); this.glass(); $('light').textContent = m === 'day' ? 'Day' : 'Evening'; },
    update() {
      const S = M[mode];
      ambient.intensity = S.ambient; sun.intensity = S.sun;
      emitters = [];
      for (const e of pieces.values()) for (const at of e.data.light?.at ?? []) {
        // a downlight's light is a little below it, so the ceiling round it does not burn white
        const drop = e.data.mount === 'ceiling' ? 0.25 : 0;
        emitters.push({ pos: new THREE.Vector3(at[0], at[1] - drop, at[2]), lumens: e.data.light.lumens / e.data.light.at.length, colour: e.data.light.colour });
      }
      const ws = roomInfo?.windows ?? [];
      wins.forEach((l, i) => {
        const w = ws[i];
        if (!w) { l.intensity = 0; return; }
        const h = w.top - w.bottom, c = new THREE.Vector3(w.c[0], (w.top + w.bottom) / 2, w.c[1]);
        l.width = w.width; l.height = h; l.color.set(S.windowColour); l.intensity = S.window;
        l.position.copy(c).add(new THREE.Vector3(w.n[0], 0, w.n[1]).multiplyScalar(0.02));
        l.lookAt(c.clone().add(new THREE.Vector3(w.n[0], 0, w.n[1])));
      });
      assign();
    },
    glass() {
      glassMats = [];
      roomGroup.traverse((o) => { if (o.material && /^#e6f0f7$/i.test(o.material.name)) glassMats.push(o.material); });
      for (const m of glassMats) m.color.set(M[mode].glass);
    },
    tick(t) { if (t - last > 300) { last = t; assign(); } },
  };
})();
$('light').onclick = () => lighting.set(lighting.mode === 'day' ? 'evening' : 'day');
$('light').textContent = lighting.mode === 'day' ? 'Day' : 'Evening';

// --- where you are, what you point at --------------------------------------------------------------------------------------
const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
function viewer() {
  camera.getWorldPosition(tmpV);
  const d = new THREE.Vector3(); camera.getWorldDirection(d); d.y = 0; d.normalize();
  return { position: [tmpV.x, tmpV.y, tmpV.z].map(r3), forward: [d.x, 0, d.z].map(r3) };
}
const raycaster = new THREE.Raycaster();
let pointing = null;
const marker = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.09, 32), new THREE.MeshBasicMaterial({ color: 0xd9a066, side: THREE.DoubleSide, depthTest: false }));
marker.renderOrder = 10; marker.visible = false; scene.add(marker);

/** A hit's normal in the world, turned back toward the ray (the room is double-sided: its triangles may face either way). */
function facing(hit, direction) {
  const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
  return n.dot(direction) > 0 ? n.negate() : n;
}
/** What a ray meets first: { hit, piece (id) or null, normal (world) } or null. */
function cast(origin, direction) {
  raycaster.set(origin, direction);
  const roomHit = raycaster.intersectObject(roomGroup, true)[0];
  const pieceHit = raycaster.intersectObject(piecesGroup, true)[0];
  const hit = pieceHit && (!roomHit || pieceHit.distance < roomHit.distance) ? pieceHit : roomHit;
  if (!hit) return null;
  return { hit, roomHit, piece: hit.object.userData.piece ?? null, normal: facing(hit, direction) };
}
/** Points along a ray: what it meets first, shown with a ring, and kept for the next thing you say or add. */
function pointAlong(origin, direction) {
  const c = cast(origin, direction);
  if (!c) { clearPointing(); return null; }
  pointing = { ray: { origin: origin.toArray().map(r3), direction: direction.toArray().map(r3) }, ...(c.roomHit ? { distance: r3(c.roomHit.distance) } : {}) };
  marker.position.copy(c.hit.point).addScaledVector(c.normal, 0.01);
  marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), c.normal);
  marker.visible = true;
  const what = c.piece ? `the ${(pieces.get(c.piece)?.data.name ?? c.piece).toLowerCase()}` : Math.abs(c.normal.y) > 0.7 ? (c.normal.y > 0 ? 'the floor' : 'the ceiling') : 'a wall';
  $('pointing').hidden = false;
  $('pointing').textContent = `Pointing at ${what} — say “here” or “this”`;
  vrPanel.draw();
  return c;
}
function clearPointing() { pointing = null; marker.visible = false; $('pointing').hidden = true; vrPanel.draw(); }
const ndcRay = (e) => { raycaster.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera); return [raycaster.ray.origin.clone(), raycaster.ray.direction.clone()]; };

// --- a highlighted area: a rectangle on the floor, a wall or the ceiling -----------------------------------------------------
let area = null;
const areaMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xd9a066, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
const areaEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)), new THREE.LineBasicMaterial({ color: 0xd9a066 }));
areaMesh.add(areaEdge); areaMesh.visible = false; areaMesh.renderOrder = 5; scene.add(areaMesh);
/** Starts an area where a ray meets the room: the plane it is on (floor, a wall, the ceiling). */
function areaStart(origin, direction) {
  raycaster.set(origin, direction);
  const h = raycaster.intersectObject(roomGroup, true)[0];
  if (!h) return null;
  const n = facing(h, direction);
  if (Math.abs(n.y) > 0.7) { const floor = h.point.y < ((roomInfo?.floorY ?? 0) + (roomInfo?.ceilingY ?? 2.6)) / 2; return { surface: floor ? 'floor' : 'ceiling', y: floor ? (roomInfo?.floorY ?? 0) : (roomInfo?.ceilingY ?? h.point.y), start: h.point.clone() }; }
  // the wall it is on: the nearest of the room's wall planes
  const w = (roomInfo?.walls ?? []).map((w) => ({ w, d: Math.abs((h.point.x - w.c[0]) * w.n[0] + (h.point.z - w.c[1]) * w.n[1]) })).sort((a, b) => a.d - b.d)[0]?.w;
  if (!w) return null;
  return { surface: 'wall', wall: w, start: h.point.clone() };
}
/** The area from its start to where a ray meets its plane now. */
function areaTo(a, origin, direction) {
  const ray = new THREE.Ray(origin, direction), plane = a.surface === 'wall' ? new THREE.Plane(new THREE.Vector3(a.wall.n[0], 0, a.wall.n[1]), -(a.wall.n[0] * a.wall.c[0] + a.wall.n[1] * a.wall.c[1])) : new THREE.Plane(new THREE.Vector3(0, 1, 0), -a.y);
  const p = ray.intersectPlane(plane, new THREE.Vector3());
  if (!p) return null;
  if (a.surface === 'wall') {
    const along = new THREE.Vector3(a.wall.along[0], 0, a.wall.along[1]), base = new THREE.Vector3(a.wall.c[0], 0, a.wall.c[1]);
    const s0 = a.start.clone().sub(base).dot(along), s1 = p.clone().sub(base).dot(along), y0 = a.start.y, y1 = p.y;
    const sm = (s0 + s1) / 2, ym = (y0 + y1) / 2, centre = base.clone().addScaledVector(along, sm).setY(ym);
    return { surface: 'wall', wall: a.wall.id, centre: centre.toArray().map(r3), size: [r2(Math.abs(s1 - s0)), r2(Math.abs(y1 - y0))], u: [a.wall.along[0], a.wall.along[1]], normal: [a.wall.n[0], 0, a.wall.n[1]] };
  }
  const cx = (a.start.x + p.x) / 2, cz = (a.start.z + p.z) / 2;
  return { surface: a.surface, centre: [r3(cx), r3(a.y), r3(cz)], size: [r2(Math.abs(p.x - a.start.x)), r2(Math.abs(p.z - a.start.z))], u: [1, 0], normal: [0, a.surface === 'floor' ? 1 : -1, 0] };
}
function showArea(a, final) {
  if (!a || a.size[0] < 0.05 || a.size[1] < 0.05) { areaMesh.visible = false; if (final) clearArea(); return; }
  areaMesh.visible = true;
  areaMesh.position.set(a.centre[0], a.centre[1] + (a.surface === 'floor' ? 0.012 : a.surface === 'ceiling' ? -0.012 : 0), a.centre[2]);
  if (a.surface === 'wall') { areaMesh.position.add(new THREE.Vector3(a.normal[0], 0, a.normal[2]).multiplyScalar(0.012)); areaMesh.rotation.set(0, Math.atan2(a.normal[0], a.normal[2]), 0); areaMesh.scale.set(a.size[0], a.size[1], 1); }
  else { areaMesh.rotation.set(-Math.PI / 2, 0, 0); areaMesh.scale.set(a.size[0], a.size[1], 1); }
  if (!final) return;
  area = a;
  const where = a.surface === 'wall' ? `on ${a.wall}` : `on the ${a.surface}`;
  $('area').hidden = false;
  $('area').firstElementChild.textContent = `Area ${a.size[0]} × ${a.size[1]} m ${where} — say what goes in it, or`;
  // one tap: what is made to this area, no model in between
  const acts = a.surface === 'wall' ? [['Window here', () => tool('opening', { action: 'add', kind: 'window', in_area: true })], ['Door here', () => tool('opening', { action: 'add', kind: 'door', in_area: true })], ['Frame here', () => addPiece({ id: 'ART-FRAME', mount: 'wall' })]]
    : a.surface === 'floor' ? [['Rug here', () => addPiece({ id: 'RUGM-9x12ft', mount: 'rug' })], ['Add…', () => showLibrary()]]
    : [['Pot lights here', () => tool('potlights', { action: 'grid', in_area: true })]];
  const box = $('area').querySelector('.acts'); box.innerHTML = '';
  for (const [label, run] of acts) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = async () => { await run(); if (label !== 'Add…') clearArea(); }; box.append(b); }
  vrPanel.draw();
}
function clearArea() { area = null; areaMesh.visible = false; $('area').hidden = true; vrPanel.draw(); }
$('area').querySelector('.x').onclick = clearArea;
let highlightMode = false;
$('highlight').onclick = () => { highlightMode = !highlightMode; $('highlight').setAttribute('aria-pressed', String(highlightMode)); if (highlightMode) status('Drag over the floor, a wall or the ceiling to mark an area'); else status(''); };

// --- selecting, dragging and turning pieces by hand -------------------------------------------------------------------------
let selected = null;
const box = new THREE.Box3Helper(new THREE.Box3(), 0xd9a066); box.visible = false; scene.add(box);
function select(id) {
  selected = id && pieces.get(id)?.obj ? id : null;
  box.visible = !!selected;
  if (selected) { box.box.setFromObject(pieces.get(selected).obj); showPiece(); }
  else if (panelKind === 'piece') closePanel();
}
/** Moves a piece by hand: where it ended up comes back checked (an overlap is moved beside, said in the log). */
async function sendMove(id, obj) {
  try {
    const f = new THREE.Vector3(0, 0, 1).applyQuaternion(obj.quaternion);
    const r = await api('/api/move', { id, at: obj.position.toArray().map(r3), facing: [r3(f.x), 0, r3(f.z)] });
    await apply(r);
    if (r.error) note(r.error); else if (r.issues?.length) note(r.issues.join('; '));
    if (selected === id) box.box.setFromObject(pieces.get(id).obj);
  } catch (e) { note(e.message); }
}
/** The plane a piece moves on: the floor or what it stands on, or its wall. */
function dragPlane(p) {
  if (p.data.mount === 'wall') return new THREE.Plane(new THREE.Vector3(p.data.facing[0], 0, p.data.facing[2]), -(p.data.facing[0] * p.data.at[0] + p.data.facing[2] * p.data.at[2]));
  return new THREE.Plane(new THREE.Vector3(0, 1, 0), -p.data.at[1]);
}
let drag = null; // { id, plane, offset, moved, kind: 'piece' | 'area', start }
canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  // a preview being placed: a click sets it down
  if (placing) { e.preventDefault(); controls.enabled = false; drag = { placingDrop: true }; return; }
  const [o, d] = ndcRay(e);
  const c = cast(o, d);
  drag = { x: e.clientX, y: e.clientY, moved: false };
  if (e.shiftKey || highlightMode) {
    const a = areaStart(o, d);
    if (a) { drag.kind = 'area'; drag.area = a; controls.enabled = false; }
    return;
  }
  if (c?.piece && pieces.get(c.piece)?.data.grab) {
    const p = pieces.get(c.piece), plane = dragPlane(p), hit = new THREE.Ray(o, d).intersectPlane(plane, new THREE.Vector3());
    if (hit) { drag.kind = 'piece'; drag.id = c.piece; drag.plane = plane; drag.offset = p.obj.position.clone().sub(hit); controls.enabled = false; }
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (placing) { const [o, d] = ndcRay(e); previewAlong(o, d); }
  if (!drag?.kind) return;
  if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) drag.moved = true;
  if (!drag.moved) return;
  const [o, d] = ndcRay(e);
  if (drag.kind === 'area') { drag.now = areaTo(drag.area, o, d); showArea(drag.now, false); return; }
  const hit = new THREE.Ray(o, d).intersectPlane(drag.plane, new THREE.Vector3());
  const p = pieces.get(drag.id);
  if (hit && p?.obj) { p.obj.position.copy(hit.add(drag.offset)); if (p.data.mount !== 'wall') p.obj.position.y = p.data.at[1]; box.box.setFromObject(p.obj); box.visible = true; }
});
canvas.addEventListener('pointerup', (e) => {
  const was = drag; drag = null; controls.enabled = true;
  if (!was) return;
  if (was.placingDrop) { const [o, d] = ndcRay(e); previewAlong(o, d); dropPlacing(); return; }
  if (was.kind === 'area' && was.moved) { showArea(was.now, true); return; }
  if (was.kind === 'piece' && was.moved) { select(was.id); sendMove(was.id, pieces.get(was.id).obj); return; }
  if (was.moved) return;
  // a click: point there, and select the piece if it is one
  const [o, d] = ndcRay(e);
  const c = pointAlong(o, d);
  select(c?.piece ?? null);
});
addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea')) return;
  if (e.key === 'Escape') { if (placing) { cancelPlacing(); return; } select(null); clearPointing(); clearArea(); closePanel(); }
  if (placing && (e.key === 'q' || e.key === 'Q' || e.key === 'e' || e.key === 'E')) { placing.yaw += ((/q/i.test(e.key) ? 1 : -1) * (e.shiftKey ? 90 : 15) * Math.PI) / 180; if (placing.pose) placing.obj.rotation.y = placing.pose.wall ? placing.obj.rotation.y : placing.yaw; return; }
  if (!selected) return;
  if (e.key === 'q' || e.key === 'Q') tool('move', { id: selected, turn: e.shiftKey ? 90 : 15 });
  if (e.key === 'e' || e.key === 'E') tool('move', { id: selected, turn: e.shiftKey ? -90 : -15 });
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); tool('remove', { id: selected }); }
});

/** A tool by hand, no model: the scene back, anything it said in the log. */
async function tool(name, args, { quiet = false, pointing: pointed } = {}) {
  try {
    const r = await api('/api/tool', { name, args, pointing: pointed ?? pointing, area, room: { viewer: viewer() } });
    await apply(r);
    const res = r.result ?? {};
    if (res.error) note(res.error);
    else if (!quiet) { const said = [res.area, ...(res.issues ?? [])].filter(Boolean); if (said.length) note(said.join('; ')); }
    return res;
  } catch (e) { note(e.message); return { error: e.message }; }
}

// --- panels: the library, the room, a piece ----------------------------------------------------------------------------------
let panelKind = null;
const panel = $('panel');
function openPanel(kind, html) {
  panelKind = kind; panel.hidden = false; $('intro').classList.add('tucked');
  panel.innerHTML = `<button class="x" type="button" aria-label="Close">×</button>${html}`;
  panel.querySelector('.x').onclick = closePanel;
}
function closePanel() { panel.hidden = true; panelKind = null; }
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// the library: every piece, by category, searchable; a click adds it where you point, into your area, or in front of you
// The library: no judgment here, no model. Every piece, by category or found by its words (typed, or said: talking while
// the library is open searches it); a picked piece comes into the room as a see-through preview that follows the
// pointer (on the floor, its wall, the ceiling or what it stands on), turns with Q and E, and lands where you click.
let library = null, libCat = 'Living', libQuery = '', libHits = null;
const ORDER = ['Living', 'Dining', 'Bedroom', 'Storage', 'Media', 'Lighting', 'Rugs', 'Decor', 'Windows', 'Office', 'Appliances', 'More'];
const byId = (id) => library?.find((p) => p.id === id);
const sizeText = (p) => `${p.size[0]} × ${p.mount === 'wall' || p.mount === 'window' ? p.size[1] : p.size[2]} m`;
async function loadLibrary() { library ??= (await api('/api/library')).pieces; return library; }
/** What the library shows now: the search's hits, or the category's pieces. */
function libList() { return libHits ? libHits.map(byId).filter(Boolean) : library.filter((p) => p.category === libCat); }
/** Searches the library by its words (no model): the hits replace the category. */
async function searchLibrary(q) {
  libQuery = q.trim();
  if (!libQuery) { libHits = null; refreshLibrary(); return; }
  try { libHits = (await api(`/api/search?q=${encodeURIComponent(libQuery)}`)).ids; } catch { libHits = []; }
  refreshLibrary();
}
let refreshLibrary = () => {};
async function showLibrary() {
  await loadLibrary();
  const cats = [...new Set(library.map((p) => p.category))].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  openPanel('library', `<h2>Library</h2>
    <div class="row searchrow"><input type="search" id="libq" placeholder="Search, or hold the mic: “walnut sideboard”" value="${esc(libQuery)}"><button class="btn" id="libmic" type="button" title="Hold to search by voice">🎤</button></div>
    <div class="tabs">${cats.map((c) => `<button type="button" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <div class="grid" id="liblist"></div>
    <p class="hint" id="libhint"></p>`);
  refreshLibrary = () => {
    if (panelKind !== 'library') return;
    panel.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', !libHits && b.dataset.cat === libCat));
    const list = libList().slice(0, 240);
    $('liblist').innerHTML = list.map((p) => `<button type="button" class="card" data-id="${esc(p.id)}" title="${esc(p.name)}"><img loading="lazy" alt="" src="/thumbs/${encodeURIComponent(p.id)}.jpg" onerror="this.style.visibility='hidden'"><span>${esc(p.name)}</span><small>${sizeText(p)}</small></button>`).join('')
      || `<p class="hint">Nothing in the library matches “${esc(libQuery)}”. For ideas rather than names, close the library and ask Maison3D.</p>`;
    $('libhint').textContent = libHits ? `${libHits.length} found for “${libQuery}”` : area ? 'Pick a piece: it goes into your highlighted area, sized to fit.' : 'Pick a piece, then click where it goes (Q and E turn it, Esc cancels).';
  };
  refreshLibrary();
  let typing = 0;
  $('libq').oninput = (e) => { clearTimeout(typing); typing = setTimeout(() => searchLibrary(e.target.value), 220); };
  panel.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => { libCat = b.dataset.cat; libHits = null; libQuery = ''; $('libq').value = ''; refreshLibrary(); }));
  $('liblist').onclick = (e) => { const b = e.target.closest('[data-id]'); if (b) pick(byId(b.dataset.id)); };
  const lm = $('libmic');
  lm.onpointerdown = (e) => { e.preventDefault(); lm.setPointerCapture(e.pointerId); startTalking(); };
  lm.onpointerup = stopTalking; lm.onpointercancel = stopTalking;
}

/** A picked piece: into the highlighted area, at the window, or as a preview to place by hand. */
async function pick(p) {
  if (!p) return;
  if (area || p.mount === 'window') { await addPiece(p); return; }
  await startPlacing(p);
}
async function addPiece(p) {
  let args = { item: p.id };
  if (area) args.in_area = true;
  else if (p.mount === 'window') { /* the window pointed at, or the one you face */ }
  else if (pointing) args.at_pointing = true;
  else if (p.mount === 'wall') { note('Click the wall where it goes first (or highlight an area on it).'); return; }
  else { const v = viewer(); args.at = [r3(v.position[0] + v.forward[0] * 1.6), r3(v.position[2] + v.forward[2] * 1.6)]; args.face = 'me'; }
  const res = await tool('place', args);
  if (!res.error) { if (!res.area && !res.issues?.length) note(`Added ${res.piece?.id ?? p.name}`); clearPointing(); if (area) clearArea(); if (res.piece) select(res.piece.id); }
}

// the preview: the real piece, see-through, following the pointer
let placing = null; // { p, obj, yaw, pose }
async function startPlacing(p) {
  cancelPlacing();
  status(`Bringing in ${p.name}…`);
  const obj = await load(`/catalog/${encodeURIComponent(p.id)}.glb`);
  obj.traverse((o) => { if (o.material) { o.material = [o.material].flat().map((m) => Object.assign(m.clone(), { transparent: true, opacity: 0.55, depthWrite: false })); if (o.material.length === 1) o.material = o.material[0]; } });
  const v = viewer();
  placing = { p, obj, yaw: Math.atan2(-v.forward[0], -v.forward[2]), pose: null };
  obj.visible = false; scene.add(obj);
  if (innerWidth <= 760 && !renderer.xr.isPresenting) closePanel();
  status(renderer.xr.isPresenting ? `${p.name}: pull the trigger where it goes (thumbstick turns it, A cancels)` : `${p.name}: click where it goes (Q and E turn it, Esc cancels)`);
}
function cancelPlacing() { if (placing) { scene.remove(placing.obj); placing = null; status(''); } }
/** Where the preview stands for a ray: on the floor, against the wall it meets, under the ceiling, or on top of a piece. */
function previewAlong(origin, direction) {
  if (!placing) return;
  const { p, obj } = placing, [w, h, d] = p.size, floor = roomInfo?.floorY ?? 0, ceil = roomInfo?.ceilingY ?? 2.6;
  raycaster.set(origin, direction);
  const roomHit = raycaster.intersectObject(roomGroup, true)[0], pieceHit = raycaster.intersectObject(piecesGroup, true)[0];
  const hit = pieceHit && (!roomHit || pieceHit.distance < roomHit.distance) ? pieceHit : roomHit;
  let pose = null;
  if (p.mount === 'wall') {
    if (roomHit) { const n = facing(roomHit, direction); if (Math.abs(n.y) < 0.3) pose = { at: roomHit.point.clone().addScaledVector(n, d / 2 + 0.005).setY(roomHit.point.y - h / 2), yaw: Math.atan2(n.x, n.z), wall: true }; }
  } else if (p.mount === 'ceiling') {
    const at = new THREE.Ray(origin, direction).intersectPlane(new THREE.Plane(new THREE.Vector3(0, -1, 0), ceil), new THREE.Vector3());
    if (at) pose = { at: at.setY(ceil - h) };
  } else if (p.mount === 'surface' && hit === pieceHit && facing(pieceHit, direction).y > 0.7) {
    pose = { at: pieceHit.point.clone(), on: pieceHit.object.userData.piece };
  } else {
    const at = new THREE.Ray(origin, direction).intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -floor), new THREE.Vector3());
    if (at) pose = { at: at.setY(floor) };
  }
  placing.pose = pose ? { ...pose, ray: { origin: origin.toArray().map(r3), direction: direction.toArray().map(r3) } } : null;
  obj.visible = !!pose;
  if (pose) { obj.position.copy(pose.at); obj.rotation.set(0, pose.wall ? pose.yaw : placing.yaw, 0); }
}
/** Sets the preview down: the piece placed there by the server (an overlap moved beside, said in the log). */
async function dropPlacing() {
  if (!placing?.pose) return;
  const { p, pose, yaw } = placing, f = [r3(Math.sin(yaw)), 0, r3(Math.cos(yaw))];
  let args = { item: p.id }, extra = {};
  if (pose.wall) { args.at_pointing = true; extra.pointing = { ray: pose.ray }; }
  else if (pose.on) args = { ...args, on: pose.on, at: [r3(pose.at.x), r3(pose.at.y), r3(pose.at.z)], facing: f };
  else args = { ...args, at: [r3(pose.at.x), r3(pose.at.z)], facing: f };
  cancelPlacing();
  const res = await tool('place', args, extra);
  if (!res.error) { if (!res.issues?.length) note(`Added ${res.piece?.id ?? p.name}`); if (res.piece) select(res.piece.id); }
}
$('add').onclick = () => (panelKind === 'library' ? closePanel() : showLibrary());

// a piece: its name, turn, size, finish, colours, remove
function showPiece() {
  const e = pieces.get(selected);
  if (!e) return;
  const p = e.data, parts = Object.entries(p.parts ?? {});
  openPanel('piece', `<h2>${esc(p.name)}</h2>
    <div class="row"><label>Turn</label><button class="btn" data-turn="15">⟲ 15°</button><button class="btn" data-turn="-15">⟳ 15°</button><button class="btn" data-turn="90">90°</button></div>
    ${p.sized ? `<div class="row"><label>Size</label><button class="btn" data-size="smaller">Smaller</button><button class="btn" data-size="larger">Larger</button></div>` : ''}
    ${p.finishes ? `<div class="row"><label>Finish</label><select id="fin">${['', ...p.finishes].map((f) => `<option value="${esc(f)}" ${f === (p.finish ?? '') ? 'selected' : ''}>${f ? esc(f) : 'as built'}</option>`).join('')}</select></div>` : ''}
    ${parts.length ? `<div class="row"><label>Colours</label>${parts.map(([k, v]) => `<span title="${esc(k)}"><input type="color" data-part="${esc(k)}" value="${/^#[0-9a-f]{6}$/i.test(v) ? v : '#888888'}"> <small>${esc(k)}</small></span>`).join(' ')}</div>` : ''}
    <div class="row"><button class="btn danger" id="del">Remove</button></div>
    <p class="hint">Drag it to move it; Q and E turn it. Or say what to change: “make this walnut”.</p>`);
  panel.querySelectorAll('[data-turn]').forEach((b) => (b.onclick = () => tool('move', { id: selected, turn: Number(b.dataset.turn) })));
  panel.querySelectorAll('[data-size]').forEach((b) => (b.onclick = async () => { const r = await tool('resize', { id: selected, size: b.dataset.size }); if (r.piece) select(r.piece.id); }));
  const fin = $('fin'); if (fin) fin.onchange = () => tool('material', { id: selected, material: fin.value || 'original' });
  panel.querySelectorAll('[data-part]').forEach((i) => (i.onchange = () => tool('recolour', { id: selected, part: i.dataset.part, colour: i.value })));
  $('del').onclick = () => tool('remove', { id: selected });
}

// the room: its size and what its floor, walls and ceiling are made of
const SURF = { floor: ['', 'planks', 'herringbone', 'tile', 'checker', 'hex', 'marble', 'terrazzo', 'concrete', 'carpet'], wall: ['', 'stucco', 'limewash', 'brick', 'subway', 'shiplap', 'concrete'], ceiling: ['', 'stucco', 'planks'] };
function showRoom() {
  const s = roomInfo?.size;
  openPanel('room', `<h2>The room</h2>
    ${s ? `<div class="row"><label>Size, ft</label><input type="number" id="rw" step="0.5" min="5" max="60" value="${r2(s.width / FT)}"> × <input type="number" id="rd" step="0.5" min="5" max="60" value="${r2(s.depth / FT)}"> <span class="hint">wide × deep</span></div>
    <div class="row"><label>Height, ft</label><input type="number" id="rh" step="0.25" min="7" max="20" value="${r2(s.height / FT)}"> <button class="btn primary" id="resizeRoom">Set size</button></div>` : '<p class="hint">This is a scanned room: its size comes from the scan.</p>'}
    ${['floor', 'wall', 'ceiling'].map((k) => `<div class="row"><label>${k === 'wall' ? 'Walls' : k[0].toUpperCase() + k.slice(1)}</label><select data-surf="${k}">${SURF[k].map((f) => `<option value="${f}">${f || 'paint'}</option>`).join('')}</select><input type="color" data-paint="${k}" value="${k === 'floor' ? '#b08d62' : k === 'wall' ? '#ece8e1' : '#f5f4f0'}"></div>`).join('')}
    <p class="hint">Pieces stay where they are when the room shrinks; anything a wall now runs through is pushed back inside.</p>`);
  const set = $('resizeRoom');
  if (set) set.onclick = () => tool('room_size', { width: r3($('rw').value * FT), depth: r3($('rd').value * FT), height: r3($('rh').value * FT) });
  panel.querySelectorAll('[data-surf]').forEach((sel) => (sel.onchange = () => tool('surface', { surface: sel.dataset.surf === 'wall' ? 'all' : sel.dataset.surf, finish: sel.value || 'none' })));
  panel.querySelectorAll('[data-paint]').forEach((i) => (i.onchange = () => tool('paint', { wall: i.dataset.paint === 'wall' ? 'all' : i.dataset.paint, colour: i.value })));
}
$('roomBtn').onclick = () => (panelKind === 'room' ? closePanel() : showRoom());

// export: the whole room as one file
$('export').onclick = () => { $('exportMenu').hidden = !$('exportMenu').hidden; };
$('exportMenu').onclick = async (e) => {
  const b = e.target.closest('[data-export]'); if (!b) return;
  $('exportMenu').hidden = true;
  status('Putting the room together…');
  try {
    const r = await fetch(`/api/export.${b.dataset.export}`, { headers: { 'x-maison-design': design } });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `the server said ${r.status}`);
    const blob = await r.blob(), name = r.headers.get('x-filename') ?? `maison3d-room.${b.dataset.export === 'mojulo' ? 'zip' : b.dataset.export}`;
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    status('');
  } catch (err) { status(''); note(err.message); }
};
api('/api/export/formats').then((f) => { if (f.mojulo) $('exportMojulo').hidden = false; }).catch(() => {});

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
const note = (t) => log('note', t);
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
  // what this turn was about: cleared after it, unless the person has pointed or highlighted again meanwhile
  const sent = { pointing, area };
  try {
    const r = await api('/api/turn', { text, pointing, area, room: { viewer: viewer() }, voice: false });
    await apply(r);
    if (r.reply) { log('maison', r.reply); speak(r.reply); }
    showLimit(r.limit);
  } catch (e) {
    log('error', e.message);
    if (e.body?.scene) await apply(e.body);
    showLimit(e.body?.limit);
  } finally {
    if (pointing === sent.pointing) clearPointing();
    if (area === sent.area) clearArea();
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
  'A chandelier over the dining table and a floor lamp by the sofa',
  'Pot lights in a grid over the room',
  'Make the sofa sage green',
];
for (const t of EXAMPLES) { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.onclick = () => turn(t); $('examples').append(b); }
$('help').onclick = () => { closePanel(); $('intro').classList.toggle('tucked'); };
$('close').onclick = () => $('intro').classList.add('tucked');
$('restart').onclick = () => { if (!confirm('Start over in an empty room?')) return; design = newId(); store.set('maison-design', design); location.reload(); };

// --- hold to talk: a 16 kHz mono WAV, transcribed by the server ----------------------------------------------------------------
let rec = null, browserSR = null;
const libraryOpen = () => panelKind === 'library' || vrLib?.open;
function heardSearch(said) {
  note(`Searching the library: “${said}”`);
  if ($('libq')) $('libq').value = said;
  searchLibrary(said).then(() => vrLib?.showHits());
}
async function startTalking() {
  if (rec || busy || browserSR) return;
  // searching the library on a desktop browser that recognises speech itself: free, nothing leaves the browser
  const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (libraryOpen() && SR && !renderer.xr.isPresenting) {
    browserSR = new SR(); browserSR.lang = 'en-US'; browserSR.interimResults = false;
    browserSR.onresult = (e) => { const said = e.results[0]?.[0]?.transcript; if (said) heardSearch(said); };
    browserSR.onend = () => { browserSR = null; $('mic').classList.remove('on'); $('libmic')?.classList.remove('on'); status(''); };
    browserSR.start(); $('mic').classList.add('on'); $('libmic')?.classList.add('on'); status('Listening… say what you are looking for');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    const ctx = new AudioContext(), src = ctx.createMediaStreamSource(stream), proc = ctx.createScriptProcessor(4096, 1, 1), chunks = [];
    proc.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    src.connect(proc); proc.connect(ctx.destination);
    rec = { stream, ctx, src, proc, chunks, t0: performance.now() };
    speechSynthesis?.cancel();
    $('mic').classList.add('on'); $('libmic')?.classList.add('on'); status(libraryOpen() ? 'Listening… say what you are looking for' : 'Listening… let go when you are done');
  } catch (e) { log('error', 'The microphone is not available: allow it for this page, or type instead.'); }
}
async function stopTalking() {
  if (browserSR) { browserSR.stop(); return; }
  if (!rec) return;
  const { stream, ctx, src, proc, chunks, t0 } = rec; rec = null;
  $('mic').classList.remove('on'); $('libmic')?.classList.remove('on');
  src.disconnect(); proc.disconnect(); stream.getTracks().forEach((t) => t.stop());
  const rate = ctx.sampleRate; await ctx.close();
  if (performance.now() - t0 < 350) { status(''); return; }
  const wav = toWav(chunks, rate, 16000);
  setBusy(true, 'Hearing…');
  try {
    const { said } = await api('/api/hear', { audio: base64(wav) });
    setBusy(false);
    if (!said) { status('I did not catch that'); return; }
    // with the library open, words search it (no model); else they go to Maison3D
    if (libraryOpen()) { heardSearch(said); return; }
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
addEventListener('keydown', (e) => { if (e.code === 'Space' && !e.repeat && !e.target.matches('input, select, textarea')) { e.preventDefault(); startTalking(); } });
addEventListener('keyup', (e) => { if (e.code === 'Space' && !e.target.matches('input, select, textarea')) stopTalking(); });

// --- VR: a laser on each controller. Grip: talk. Trigger: point, or hold it on a piece to move it (thumbstick turns it).
// B: hold and sweep to highlight an area. Thumbstick: forward steps to where you point, left or right turns you. ----------
navigator.xr?.isSessionSupported('immersive-vr').then((ok) => ok && $('vr').append(VRButton.createButton(renderer, { optionalFeatures: ['local-floor', 'bounded-floor'] }))).catch(() => {});
const factory = new XRControllerModelFactory();
const hands = [0, 1].map((i) => {
  const c = renderer.xr.getController(i), grip = renderer.xr.getControllerGrip(i);
  grip.add(factory.createControllerModel(grip));
  const laser = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0xd9a066 }));
  laser.scale.z = 4; c.add(laser);
  const h = { c, grip, laser, source: null, stick: 0, hold: null, b: false, areaDraft: null };
  c.addEventListener('connected', (e) => (h.source = e.data));
  c.addEventListener('disconnected', () => (h.source = null));
  c.addEventListener('selectstart', () => {
    const [o, d] = aim(c);
    // the library panel, or a preview being placed, take the trigger first
    if (panelHit(o, d)) { h.panelPress = true; return; }
    if (placing) return;
    // on a piece: it may be a hold (move it) or a pull (point at it); off one: a point
    const hit = cast(o, d);
    if (hit?.piece && pieces.get(hit.piece)?.data.grab) {
      const p = pieces.get(hit.piece), plane = dragPlane(p), at = new THREE.Ray(o, d).intersectPlane(plane, new THREE.Vector3());
      h.hold = { id: hit.piece, t0: performance.now(), plane, offset: at ? p.obj.position.clone().sub(at) : new THREE.Vector3(), moving: false, start: o.clone().add(d) };
    } else if (hit) {
      // on the room itself: a pull points; a pull dragged across the surface draws an area there
      h.sweep = { draft: areaStart(o, d), start: hit.hit.point.clone(), drawing: false };
    }
  });
  c.addEventListener('selectend', () => {
    if (h.panelPress) { h.panelPress = false; const [o, d] = aim(c), ph = panelHit(o, d); if (ph) vrLib.click(ph.uv); return; }
    if (placing) { const [o, d] = aim(c); previewAlong(o, d); dropPlacing(); return; }
    const hold = h.hold, sweep = h.sweep; h.hold = null; h.sweep = null;
    if (hold?.moving) { sendMove(hold.id, pieces.get(hold.id).obj); return; }
    if (sweep?.drawing) { const [o, d] = aim(c); showArea(areaTo(sweep.draft, o, d), true); return; }
    const [o, d] = aim(c), hit = pointAlong(o, d);
    select(hit?.piece ?? null);
  });
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
      g.fillText(statusText || (area ? `Area ${area.size[0]} × ${area.size[1]} m: say what goes in it` : pointing ? 'Pointing: say “here” or “this”' : 'Grip: talk · Trigger: point, drag an area · A: library'), 24, 44);
      let y = 92; g.font = '26px system-ui, sans-serif';
      for (const [kind, text] of lines.slice(-3)) {
        g.fillStyle = kind === 'you' ? '#e8e2d6' : kind === 'error' ? '#f0a08a' : kind === 'note' ? '#b9b3a8' : '#f4f1ec';
        for (const l of wrap(`${kind === 'you' ? 'You: ' : ''}${text}`, cv.width - 48).slice(0, 3)) { if (y > cv.height - 16) break; g.fillText(l, 24, y); y += 34; }
        y += 8;
      }
      tex.needsUpdate = true;
    },
  };
})();
vrPanel.draw();

// The library in VR: a panel in front of you (A or X opens and closes it). Tabs, a page of previews, pages; the laser
// picks; holding the grip while it is open searches it by voice. A picked piece rides the laser as a preview.
const vrLib = (() => {
  const W = 1024, H = 768, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.72), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  mesh.visible = false; mesh.renderOrder = 20; scene.add(mesh);
  const imgs = new Map(), PER = 12;
  let page = 0, hover = null, rects = [];
  const img = (id) => { if (!imgs.has(id)) { const im = new Image(); im.onload = () => self.draw(); im.src = `/thumbs/${encodeURIComponent(id)}.jpg`; imgs.set(id, im); } return imgs.get(id); };
  const round = (x, y, w, h, r, fill) => { g.fillStyle = fill; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); };
  const self = {
    mesh, open: false,
    show() {
      // in front of you, a little below eye height, facing you
      camera.getWorldPosition(tmpV);
      const f = new THREE.Vector3(); camera.getWorldDirection(f); f.y = 0; f.normalize();
      mesh.position.copy(tmpV).addScaledVector(f, 0.95); mesh.position.y = tmpV.y - 0.12;
      mesh.lookAt(tmpV.x, mesh.position.y, tmpV.z);
      mesh.visible = true; self.open = true; page = 0;
      loadLibrary().then(() => self.draw());
    },
    hide() { mesh.visible = false; self.open = false; hover = null; },
    showHits() { page = 0; self.draw(); },
    draw() {
      if (!library) return;
      rects = [];
      g.clearRect(0, 0, W, H); round(0, 0, W, H, 28, 'rgba(24,22,20,0.94)');
      g.fillStyle = '#f4f1ec'; g.font = '600 34px system-ui, sans-serif'; g.fillText('Library', 28, 52);
      g.fillStyle = '#b9b3a8'; g.font = '24px system-ui, sans-serif';
      g.fillText(libHits ? `${libHits.length} for “${libQuery}” — hold grip to search again` : 'Hold grip and say what you are looking for', 170, 50);
      const cat = (label, x, y, w, on, act) => { const hv = hover === act; round(x, y, w, 40, 20, on ? '#d9a066' : hv ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.07)'); g.fillStyle = on ? '#1d1a17' : '#f4f1ec'; g.font = '22px system-ui, sans-serif'; g.fillText(label, x + 14, y + 28); rects.push({ x, y, w, h: 40, act }); };
      const cats = [...new Set(library.map((p) => p.category))].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
      cats.forEach((c, i) => cat(c, 28 + (i % 6) * 162, 78 + Math.floor(i / 6) * 48, 152, !libHits && c === libCat, `cat:${c}`));
      const list = libList(), pages = Math.max(1, Math.ceil(list.length / PER)); page = Math.min(page, pages - 1);
      list.slice(page * PER, page * PER + PER).forEach((p, i) => {
        const x = 28 + (i % 4) * 244, y = 186 + Math.floor(i / 4) * 170, act = `pick:${p.id}`;
        round(x, y, 232, 160, 14, hover === act ? 'rgba(217,160,102,0.35)' : 'rgba(255,255,255,0.06)');
        const im = img(p.id); if (im.complete && im.naturalWidth) g.drawImage(im, x + 8, y + 8, 110, 110);
        g.fillStyle = '#f4f1ec'; g.font = '20px system-ui, sans-serif';
        const words = p.name.split(' '); let line = '', ly = y + 32, lines = 0;
        for (const w of words) { const t = line ? `${line} ${w}` : w; if (g.measureText(t).width > 100 && line) { g.fillText(line, x + 124, ly); ly += 24; line = w; if (++lines === 3) { line = ''; break; } } else line = t; }
        if (line && lines < 4) g.fillText(line, x + 124, ly);
        g.fillStyle = '#b9b3a8'; g.font = '17px system-ui, sans-serif'; g.fillText(sizeText(p), x + 10, y + 146);
        rects.push({ x, y, w: 232, h: 160, act });
      });
      if (!list.length) { g.fillStyle = '#b9b3a8'; g.font = '24px system-ui, sans-serif'; g.fillText('Nothing matches. For ideas, close the library and ask Maison3D.', 28, 260); }
      cat('◀ Back', 28, 708, 150, false, 'prev'); cat('Next ▶', 846, 708, 150, false, 'next'); cat('Close', 680, 708, 150, false, 'close');
      g.fillStyle = '#b9b3a8'; g.font = '22px system-ui, sans-serif'; g.fillText(`${page + 1} of ${pages}`, 440, 736);
      tex.needsUpdate = true;
    },
    /** What the laser is over on the panel (uv), or null. */
    at(uv) { const x = uv.x * W, y = (1 - uv.y) * H; return rects.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)?.act ?? null; },
    hoverAt(uv) { const a = uv ? self.at(uv) : null; if (a !== hover) { hover = a; self.draw(); } },
    click(uv) {
      const a = self.at(uv); if (!a) return;
      if (a === 'close') self.hide();
      else if (a === 'prev') { page = Math.max(0, page - 1); self.draw(); }
      else if (a === 'next') { page++; self.draw(); }
      else if (a.startsWith('cat:')) { libCat = a.slice(4); libHits = null; libQuery = ''; page = 0; self.draw(); }
      else if (a.startsWith('pick:')) { self.hide(); pick(byId(a.slice(5))); }
    },
  };
  return self;
})();
const panelHit = (o, d) => { if (!vrLib.open) return null; raycaster.set(o, d); return raycaster.intersectObject(vrLib.mesh, false)[0] ?? null; };

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

let lastFrame = 0;
function xrFrame(t) {
  const dt = Math.min(0.1, (t - lastFrame) / 1000 || 0); lastFrame = t;
  for (const h of hands) {
    if (!h.source) continue;
    const [o, d] = aim(h.c);
    const gp = h.source.gamepad, axes = gp?.axes ?? [], x = axes[2] ?? 0, y = axes[3] ?? 0;
    // A (right) or X (left): the library opens and closes; with a preview on the laser, it cancels it
    const aDown = !!gp?.buttons?.[4]?.pressed;
    if (aDown && !h.a) { if (placing) cancelPlacing(); else if (vrLib.open) vrLib.hide(); else vrLib.show(); }
    h.a = aDown;
    const ph = panelHit(o, d);
    if (vrLib.open && h.source.handedness !== 'left') vrLib.hoverAt(ph?.uv ?? null);
    if (ph) { h.laser.scale.z = ph.distance; continue; }
    raycaster.set(o, d);
    const hit = raycaster.intersectObjects([roomGroup, piecesGroup], true)[0];
    h.laser.scale.z = hit ? hit.distance : 4;
    // a preview rides the right laser; the thumbstick turns it
    if (placing && h.source.handedness !== 'left') {
      previewAlong(o, d);
      if (Math.abs(x) > 0.2) { placing.yaw -= x * dt * 1.8; if (placing.pose && !placing.pose.wall) placing.obj.rotation.y = placing.yaw; }
      continue;
    }
    // a held piece follows the laser; the thumbstick turns it
    if (h.hold) {
      const p = pieces.get(h.hold.id);
      if (!h.hold.moving && (performance.now() - h.hold.t0 > 220 || o.clone().add(d).distanceTo(h.hold.start) > 0.05)) h.hold.moving = true;
      if (h.hold.moving && p?.obj) {
        const at = new THREE.Ray(o, d).intersectPlane(h.hold.plane, new THREE.Vector3());
        if (at) { p.obj.position.copy(at.add(h.hold.offset)); if (p.data.mount !== 'wall') p.obj.position.y = p.data.at[1]; }
        if (Math.abs(x) > 0.2 && p.data.mount !== 'wall') p.obj.rotation.y -= x * dt * 1.8;
        box.box.setFromObject(p.obj); box.visible = true;
      }
      continue;
    }
    // a trigger sweep across a surface: the area follows the laser once it has moved 10 cm from where it started
    if (h.sweep?.draft) {
      const now = areaTo(h.sweep.draft, o, d);
      if (!h.sweep.drawing && now && Math.max(...now.size) > 0.1) h.sweep.drawing = true;
      if (h.sweep.drawing) showArea(now, false);
      continue;
    }
    // B (the right hand's second face button): hold and sweep to highlight an area
    const bDown = !!gp?.buttons?.[5]?.pressed && h.source.handedness !== 'left';
    if (bDown && !h.b) { h.areaDraft = areaStart(o, d); }
    if (bDown && h.areaDraft) showArea(areaTo(h.areaDraft, o, d), false);
    if (!bDown && h.b && h.areaDraft) { showArea(areaTo(h.areaDraft, o, d), true); h.areaDraft = null; }
    h.b = bDown;
    const was = h.stick;
    h.stick = Math.abs(x) > 0.7 ? Math.sign(x) : y < -0.7 ? 2 : 0;
    if (h.stick === was || h.stick === 0) continue;
    camera.getWorldPosition(tmpV);
    const before = tmpV.clone();
    if (h.stick === 2) {
      // step to where you point, on the floor
      if (hit && hit.face && Math.abs(facing(hit, d).y) > 0.7 && hit.point.y < 0.3) { rig.position.x += hit.point.x - before.x; rig.position.z += hit.point.z - before.z; }
    } else {
      rig.rotation.y -= (h.stick * Math.PI) / 6; rig.updateMatrixWorld(true);
      camera.getWorldPosition(tmpV); rig.position.x += before.x - tmpV.x; rig.position.z += before.z - tmpV.z;
    }
  }
}

// ?debug: the page's state, for tests
if (new URLSearchParams(location.search).has('debug')) window.__m3d = { hands, pieces, get area() { return area; }, get pointing() { return pointing; }, get placing() { return placing; }, vrLib, rig, camera };

renderer.setAnimationLoop((t) => {
  if (renderer.xr.isPresenting) xrFrame(t); else controls.update();
  lighting.tick(t);
  renderer.render(scene, camera);
});

// --- start: your room as the server has it ----------------------------------------------------------------------------------------
(async () => {
  try {
    await apply(await api('/api/scene'));
    lighting.set(lighting.mode);
    showLimit(await api('/api/limit'));
    if (pieces.size) $('intro').classList.add('tucked');
  } catch (e) { log('error', `The server is not answering: ${e.message}`); }
})();
