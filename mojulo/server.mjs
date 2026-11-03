// The pinned mojulo as an MCP server over stdio, for an MCP host (.mcp.json) or for client.mjs. Runs the source
// install that setup.mjs made, with its own data folder.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const entry = join(root, '.mojulo', 'src', 'control', 'scripts', 'mcp-stdio.mjs');
export const home = join(root, '.mojulo', 'home');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!existsSync(entry)) {
    process.stderr.write('mojulo is not installed for this project yet: run `npm run mojulo:setup`\n');
    process.exit(1);
  }
  const child = spawn(process.execPath, [entry], { stdio: 'inherit', env: { ...process.env, MOJULO_HOME: home, MOJULO_DISTRIBUTION: 'source' } });
  child.on('exit', (code) => process.exit(code ?? 0));
}
