// Calling the pinned mojulo from our own code (the laptop server, spike scripts): starts it over stdio and speaks
// MCP. `const m = await connect(); const r = await m.call('create_sketch', {...}); m.close();`
// `r` is the tool's JSON answer (parsed when it is JSON).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { entry, home } from './server.mjs';

export async function connect({ log = () => {} } = {}) {
  if (!existsSync(entry)) throw new Error('mojulo is not installed for this project yet: run `npm run mojulo:setup`');
  // flat tool list: our code calls mojulo's tools by name (create_sketch, design_interior…), not through its packs
  const p = spawn(process.execPath, [entry], { env: { ...process.env, MOJULO_HOME: home, MOJULO_DISTRIBUTION: 'source', MOJULO_TOOL_PACKS: 'off' }, stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '', id = 0;
  const waiting = new Map();
  p.stdout.on('data', (d) => {
    buf += d;
    for (let i; (i = buf.indexOf('\n')) >= 0; ) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      const m = JSON.parse(line);
      waiting.get(m.id)?.(m);
      waiting.delete(m.id);
    }
  });
  p.stderr.on('data', (d) => log(String(d)));
  const rpc = (method, params) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      waiting.set(n, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
      p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: n, method, params }) + '\n');
    });
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'maison3d', version: '0' } });
  p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  return {
    server: init.serverInfo,
    async call(name, args = {}) {
      const r = await rpc('tools/call', { name, arguments: args });
      const text = (r.content ?? []).map((c) => c.text ?? '').join('');
      if (r.isError) throw new Error(`${name}: ${text.slice(0, 400)}`);
      try { return JSON.parse(text); } catch { return text; }
    },
    close: () => p.kill(),
  };
}
