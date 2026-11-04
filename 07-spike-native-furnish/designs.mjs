// One design per visitor. The server was written for one person (the headset on the laptop), its design in module
// state: the scene, the room's finishes, the conversation, the dictated room. `slot(make)` keeps those names but makes
// each one the current request's: a request runs inside `withDesign(id, fn)` (AsyncLocalStorage), and the slot reads and
// writes that design's own value, made fresh by `make()` the first time. Outside any request (the headset's own
// turns, the tests) it is the local design, as before.
import { AsyncLocalStorage } from 'node:async_hooks';

const als = new AsyncLocalStorage();
const LOCAL = { id: 'local', used: Date.now() };
const designs = new Map([['local', LOCAL]]);
const MAX = Number(process.env.MAISON_MAX_DESIGNS) || 400; // the oldest idle visitor's design goes first
const IDLE = (Number(process.env.MAISON_DESIGN_HOURS) || 6) * 3600e3;

/** Runs `fn` with design `id` (made fresh on first use) as the current one. */
export function withDesign(id, fn) {
  let d = designs.get(id);
  if (!d) {
    if (designs.size >= MAX) evict();
    d = { id, used: Date.now() };
    designs.set(id, d);
  }
  d.used = Date.now();
  return als.run(d, fn);
}
function evict() {
  const now = Date.now(), byAge = [...designs.values()].filter((d) => d !== LOCAL).sort((a, b) => a.used - b.used);
  for (const d of byAge) if (now - d.used > IDLE) designs.delete(d.id);
  while (designs.size >= MAX && byAge.length) designs.delete(byAge.shift().id);
}
export const designCount = () => designs.size;
const current = () => als.getStore() ?? LOCAL;

/**
 * A value that belongs to the current design: an array or an object made by `make()`, behind a proxy that forwards
 * everything (reads, writes, deletes, keys, spreading, JSON) to the current design's own copy.
 */
export function slot(make) {
  const key = Symbol('slot'), sample = make();
  const real = () => { const d = current(); return (d[key] ??= make()); };
  const bind = (t, v) => (typeof v === 'function' ? v.bind(t) : v);
  return new Proxy(Array.isArray(sample) ? [] : {}, {
    get: (_, k) => { const t = real(); return bind(t, Reflect.get(t, k)); },
    set: (_, k, v) => Reflect.set(real(), k, v),
    has: (_, k) => Reflect.has(real(), k),
    deleteProperty: (_, k) => Reflect.deleteProperty(real(), k),
    ownKeys: () => Reflect.ownKeys(real()),
    getOwnPropertyDescriptor: (_, k) => {
      const d = Reflect.getOwnPropertyDescriptor(real(), k);
      // an array's length is not configurable on the proxy's own target either: report it as the target has it
      return d && k === 'length' ? { ...d, configurable: false } : d && { ...d, configurable: true };
    },
    defineProperty: (_, k, desc) => Reflect.defineProperty(real(), k, desc),
  });
}
