// The design as one file to take away: the room and every piece in a single GLB (each piece a node where it stands,
// its own meshes, materials and textures carried over), with its lights as glTF lights (KHR_lights_punctual: a lamp's
// bulb, a pot light pointing down, the day through the windows) so Blender, Godot, Unity or three.js light it as the
// page does; and a walkable world.html around that GLB that opens in any browser and enters VR on a Quest.
import { writeGlb } from '../70-inventory/ready.mjs';

/** A GLB's JSON and binary chunk. */
function readGlb(buf) {
  const jsonLen = buf.readUInt32LE(12), json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const o = 20 + jsonLen;
  const bin = o + 8 <= buf.length ? buf.subarray(o + 8, o + 8 + buf.readUInt32LE(o)) : Buffer.alloc(0);
  return { json, bin };
}

const yaw = (f) => { const t = Math.atan2(f[0], f[2]) / 2; return [0, Math.sin(t), 0, Math.cos(t)]; };

/**
 * One GLB from `parts` [{ glb, name, at?, facing? }] (the room first, at the origin) and `lights`
 * [{ at: [x, y, z], lumens, colour, kind: 'point' | 'spot' | 'sun', dir? }].
 */
export function mergeGlb(parts, lights = [], name = 'Maison3D room') {
  const out = { asset: { version: '2.0', generator: 'Maison3D' }, scene: 0, scenes: [{ name, nodes: [] }], nodes: [], meshes: [], materials: [], accessors: [], bufferViews: [], buffers: [], images: [], textures: [], samplers: [] };
  const used = new Set(), chunks = [];
  let length = 0;
  for (const part of parts) {
    const { json, bin } = readGlb(part.glb);
    const pad = (4 - (length % 4)) % 4;
    if (pad) { chunks.push(Buffer.alloc(pad)); length += pad; }
    const base = length; chunks.push(bin); length += bin.length;
    const off = { bv: out.bufferViews.length, acc: out.accessors.length, img: out.images.length, tex: out.textures.length, samp: out.samplers.length, mat: out.materials.length, mesh: out.meshes.length, node: out.nodes.length };
    for (const v of json.bufferViews ?? []) out.bufferViews.push({ ...v, buffer: 0, byteOffset: (v.byteOffset ?? 0) + base });
    for (const a of json.accessors ?? []) out.accessors.push({ ...a, ...(a.bufferView !== undefined ? { bufferView: a.bufferView + off.bv } : {}) });
    for (const i of json.images ?? []) out.images.push({ ...i, ...(i.bufferView !== undefined ? { bufferView: i.bufferView + off.bv } : {}) });
    for (const s of json.samplers ?? []) out.samplers.push({ ...s });
    for (const t of json.textures ?? []) out.textures.push({ ...t, ...(t.source !== undefined ? { source: t.source + off.img } : {}), ...(t.sampler !== undefined ? { sampler: t.sampler + off.samp } : {}) });
    const retex = (ref) => (ref ? { ...ref, index: ref.index + off.tex } : ref);
    for (const m of json.materials ?? []) {
      const pbr = m.pbrMetallicRoughness ? { ...m.pbrMetallicRoughness, baseColorTexture: retex(m.pbrMetallicRoughness.baseColorTexture), metallicRoughnessTexture: retex(m.pbrMetallicRoughness.metallicRoughnessTexture) } : undefined;
      if (pbr) for (const k of Object.keys(pbr)) if (pbr[k] === undefined) delete pbr[k];
      const mm = { ...m, ...(pbr ? { pbrMetallicRoughness: pbr } : {}) };
      for (const k of ['normalTexture', 'occlusionTexture', 'emissiveTexture']) if (m[k]) mm[k] = retex(m[k]);
      out.materials.push(mm);
    }
    for (const me of json.meshes ?? []) out.meshes.push({ ...me, primitives: me.primitives.map((p) => ({ ...p, attributes: Object.fromEntries(Object.entries(p.attributes).map(([k, v]) => [k, v + off.acc])), ...(p.indices !== undefined ? { indices: p.indices + off.acc } : {}), ...(p.material !== undefined ? { material: p.material + off.mat } : {}) })) });
    for (const n of json.nodes ?? []) {
      const { camera, ...rest } = n; // cameras do not travel
      out.nodes.push({ ...rest, ...(n.mesh !== undefined ? { mesh: n.mesh + off.mesh } : {}), ...(n.children ? { children: n.children.map((c) => c + off.node) } : {}) });
    }
    for (const e of json.extensionsUsed ?? []) used.add(e);
    // the piece: a node where it stands, turned to its facing, holding its own scene
    const roots = (json.scenes?.[json.scene ?? 0]?.nodes ?? []).map((n) => n + off.node);
    out.nodes.push({ name: part.name, ...(part.at ? { translation: part.at } : {}), ...(part.facing ? { rotation: yaw(part.facing) } : {}), children: roots });
    out.scenes[0].nodes.push(out.nodes.length - 1);
  }
  if (lights.length) {
    const defs = [];
    for (const l of lights) {
      const colour = hexToLinear(l.colour ?? '#ffd9a8');
      if (l.kind === 'sun') defs.push({ type: 'directional', color: colour, intensity: l.lux ?? 3 });
      else if (l.kind === 'spot') defs.push({ type: 'spot', color: colour, intensity: r(l.lumens / (2 * Math.PI * (1 - Math.cos(0.6)))), spot: { innerConeAngle: 0.35, outerConeAngle: 0.6 } });
      else defs.push({ type: 'point', color: colour, intensity: r(l.lumens / (4 * Math.PI)), range: 8 });
      // a spot (or the sun) points down its node's -z: turned to face the floor, or along its direction
      const rot = l.kind === 'spot' ? [-Math.SQRT1_2, 0, 0, Math.SQRT1_2] : l.kind === 'sun' ? [-0.3535534, 0.3535534, 0.1464466, 0.8535534] : null;
      out.nodes.push({ name: l.name ?? `light ${defs.length}`, translation: l.at ?? [0, 3, 0], ...(rot ? { rotation: rot } : {}), extensions: { KHR_lights_punctual: { light: defs.length - 1 } } });
      out.scenes[0].nodes.push(out.nodes.length - 1);
    }
    out.extensions = { KHR_lights_punctual: { lights: defs } };
    used.add('KHR_lights_punctual');
  }
  for (const k of ['images', 'textures', 'samplers']) if (!out[k].length) delete out[k];
  if (used.size) out.extensionsUsed = [...used];
  out.buffers.push({ byteLength: length });
  return writeGlb(out, Buffer.concat(chunks));
}
const r = (v) => Math.round(v * 100) / 100;
const hexToLinear = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const c = v / 255; return Math.round((c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4) * 1000) / 1000; }); };

/** A page that walks round `glb` in any browser, and enters VR on a Quest: the GLB inside it, three.js from its CDN. */
export function worldHtml(glb, { title = 'Maison3D room', start = [0, 1.6, 2], target = [0, 1, 0] } = {}) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#1b1a18;font:14px system-ui,sans-serif;color:#f4f1ec}#hint{position:fixed;left:12px;bottom:12px;background:rgba(24,22,20,.72);padding:8px 12px;border-radius:10px}#vr{position:fixed;right:12px;top:12px}</style>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"}}</script>
</head><body><div id="hint">${title} — drag to look, scroll to move in, W A S D to walk</div><div id="vr"></div>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.xr.enabled = true;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#1b1a18');
scene.add(new THREE.AmbientLight(0xffffff, 0.9));
const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 80); camera.position.set(${start.join(', ')});
const controls = new OrbitControls(camera, renderer.domElement); controls.target.set(${target.join(', ')}); controls.update();
const resize = () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }; addEventListener('resize', resize); resize();
const bytes = Uint8Array.from(atob(document.getElementById('glb').textContent.trim()), (c) => c.charCodeAt(0));
new GLTFLoader().parse(bytes.buffer, '', (g) => { g.scene.traverse((o) => { if (o.isLight) o.intensity *= 0.02; }); scene.add(g.scene); });
navigator.xr?.isSessionSupported('immersive-vr').then((ok) => ok && document.getElementById('vr').append(VRButton.createButton(renderer)));
const keys = new Set(); addEventListener('keydown', (e) => keys.add(e.key.toLowerCase())); addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
renderer.setAnimationLoop(() => {
  const f = new THREE.Vector3(); camera.getWorldDirection(f); f.y = 0; f.normalize(); const s = new THREE.Vector3(-f.z, 0, f.x), m = new THREE.Vector3();
  if (keys.has('w')) m.add(f); if (keys.has('s')) m.sub(f); if (keys.has('d')) m.add(s); if (keys.has('a')) m.sub(s);
  if (m.lengthSq()) { m.normalize().multiplyScalar(0.04); camera.position.add(m); controls.target.add(m); }
  controls.update(); renderer.render(scene, camera);
});
</script>
<script id="glb" type="application/octet-stream">${glb.toString('base64')}</script>
</body></html>
`;
}

// --- a zip (stored, no compression: the GLB, USDZ and HTML inside are compressed or binary already) -----------------------
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
/** A zip of `files` [{ name, data: Buffer }]. */
export function zip(files) {
  const locals = [], centrals = [];
  let offset = 0;
  const now = new Date(), dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1), dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8'), crc = crc32(f.data), size = f.data.length;
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8);
    local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(size, 18); local.writeUInt32LE(size, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(0, 10);
    central.writeUInt16LE(dosTime, 12); central.writeUInt16LE(dosDate, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(size, 20); central.writeUInt32LE(size, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, name, f.data); centrals.push(central, name);
    offset += 30 + name.length + size;
  }
  const dir = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

/**
 * The design through mojulo (`m`: a mojulo client): our room and its pieces bound as a mesh onto a sketch, placed as a
 * figure in a mojulo floorplan the room's size (its own walls x-rayed, no windows of its own: ours are in the mesh), and
 * exported by mojulo: its walkable world.html, a USDZ for AR Quick Look, its lit GLB and a Godot 4 project. Returns the
 * files [{ name, path }] it wrote (a directory's files listed one by one).
 */
export async function throughMojulo(m, glbPath, { width, depth, centre = [0, 0], title = 'Maison3D room' }) {
  const FT = 0.3048, pad = 1, W = Math.round((width / FT) * 100) / 100, H = Math.round((depth / FT) * 100) / 100, stamp = Date.now().toString(36);
  const holder = await m.call('create_sketch', { title: `${title}: the furnished room`, ref: `m3d_mesh_${stamp}`, manifest: { title: `${title}: the furnished room`, viewBox: { width: 100, height: 100 }, stations: [{ id: 'room', kind: 'input', label: 'Maison3D room' }] } });
  await m.call('bind_mesh_render', { ref: holder.ref, glb_path: glbPath, scale: 1 / FT, source: 'maison3d', note: 'the room and its furniture, exported by Maison3D' });
  // our x runs east and our z south; the plan's y runs the other way (its north edge at y = -pad), feet, z up
  const manifest = {
    kind: 'floorplan', title, seed: 7, width: W + 2 * pad, height: H + 2 * pad, rooms: [{ x: pad, y: pad, w: W, h: H, glyph: 'L', items: [] }], doors: [],
    furnish: false, windows: false, xrayWalls: true, view: 'cutaway',
    figures: { maison: { meshRef: holder.ref, transform: { pos: [pad + W / 2 - centre[0] / FT, -(pad + H / 2) + centre[1] / FT, 0.03], rotZ: 0, scale: 1 } } },
  };
  const room = await m.call('create_sketch', { title, ref: `m3d_room_${stamp}`, manifest });
  const out = [];
  for (const [args, name] of [[{ format: 'html' }, 'world.html'], [{ format: 'usdz' }, 'room.usdz'], [{ format: 'glb', lit: true }, 'room-mojulo.glb'], [{ engine: 'godot' }, 'godot']]) {
    const r = await m.call('export_model', { ref: room.ref, ...args });
    if (r.ok && (r.path ?? r.dir)) out.push({ name, path: r.path ?? r.dir }); // a Godot project comes back as its folder
  }
  return { ref: room.ref, files: out };
}
