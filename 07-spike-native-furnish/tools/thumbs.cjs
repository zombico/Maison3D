// The library's previews: every catalogue piece rendered small (three.js in headless Chromium) to web/thumbs/<id>.jpg,
// from a running furnish server (its models, as the headset gets them). A floor piece from three-quarters above, a wall
// piece face on, a rug from above, a ceiling light from a little below. Run after the catalogue changes:
//   npm start   (another terminal)   then   node 07-spike-native-furnish/tools/thumbs.cjs [--only ID,ID] [--missing]
// Needs Playwright (npx playwright install chromium); three.js comes from its CDN, or THREE_DIR (a local copy).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

const SERVER = process.env.MAISON_SERVER ?? 'http://localhost:8091';
const OUT = path.join(__dirname, '..', 'web', 'thumbs');
const SIZE = 192;
const args = process.argv.slice(2), only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null, missing = args.includes('--missing');

const PAGE = `<!doctype html><html><body style="margin:0;background:#2b2925">
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const S = ${SIZE * 2};
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(S, S); renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.append(renderer.domElement);
const loader = new GLTFLoader();
window.render = async (id, mount) => {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#2b2925');
  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(1.5, 3, 2.5); scene.add(key);
  const g = (await loader.loadAsync('/catalog/' + encodeURIComponent(id) + '.glb')).scene;
  scene.add(g);
  const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3()), r = Math.max(0.05, box.getSize(new THREE.Vector3()).length() / 2);
  const dir = (mount === 'wall' || mount === 'window' ? new THREE.Vector3(0.35, 0.12, 1) : mount === 'rug' ? new THREE.Vector3(0.25, 1.6, 0.9) : mount === 'ceiling' ? new THREE.Vector3(0.9, -0.25, 1.3) : new THREE.Vector3(0.85, 0.6, 1.25)).normalize();
  const cam = new THREE.PerspectiveCamera(30, 1, r / 50, r * 50);
  cam.position.copy(c).addScaledVector(dir, r / Math.sin((30 / 2) * Math.PI / 180) * 0.86); cam.lookAt(c);
  renderer.render(scene, cam);
  const small = document.createElement('canvas'); small.width = small.height = ${SIZE};
  small.getContext('2d').drawImage(renderer.domElement, 0, 0, ${SIZE}, ${SIZE});
  g.traverse((o) => { o.geometry?.dispose?.(); for (const m of [o.material].flat()) { if (!m) continue; for (const k in m) m[k]?.isTexture && m[k].dispose(); m.dispose?.(); } });
  return small.toDataURL('image/jpeg', 0.82);
};
window.ready = true;
</script></body></html>`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const lib = (await (await fetch(`${SERVER}/api/library`)).json()).pieces;
  const todo = lib.filter((p) => (!only || only.includes(p.id)) && (!missing || !fs.existsSync(path.join(OUT, `${p.id}.jpg`))));
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  if (process.env.THREE_DIR) await page.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', (r) => r.fulfill({ path: path.join(process.env.THREE_DIR, r.request().url().split('three@0.170.0/')[1]), contentType: 'text/javascript' }));
  await page.goto(`${SERVER}/api/limit`); // the server's own origin, so the models load without CORS
  await page.setContent(PAGE);
  await page.waitForFunction(() => window.ready, null, { timeout: 60000 });
  let n = 0, failed = [];
  for (const p of todo) {
    try {
      const url = await page.evaluate(([id, mount]) => window.render(id, mount), [p.id, p.mount]);
      fs.writeFileSync(path.join(OUT, `${p.id}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
      if (++n % 50 === 0) console.log(`${n} of ${todo.length}`);
    } catch (e) { failed.push(`${p.id}: ${e.message.slice(0, 120)}`); }
  }
  await browser.close();
  console.log(`made ${n} previews in ${OUT}${failed.length ? `; ${failed.length} failed:\n${failed.join('\n')}` : ''}`);
})();
