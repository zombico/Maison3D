// Installs the mojulo pinned in mojulo/pin.json: a shallow clone at that exact commit in .mojulo/src (ignored by
// git), then its runtime dependencies. Its data lives apart from the Claude plugin's (~/.mojulo) in .mojulo/home, so
// the two never share a database. Re-run after changing the pin.
//   node mojulo/setup.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pin = JSON.parse(readFileSync(join(root, 'mojulo', 'pin.json'), 'utf8'));
const src = join(root, '.mojulo', 'src');
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, GIT_LFS_SKIP_SMUDGE: '1' } });

mkdirSync(join(root, '.mojulo', 'home'), { recursive: true });
if (!existsSync(join(src, '.git'))) {
  mkdirSync(src, { recursive: true });
  run('git', ['init', '-q'], src);
  run('git', ['remote', 'add', 'origin', pin.repo], src);
}
const have = (() => { try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src }).toString().trim(); } catch { return ''; } })();
if (have !== pin.commit) {
  console.log(`mojulo: fetching ${pin.branch} at ${pin.commit.slice(0, 7)}`);
  run('git', ['fetch', '-q', '--depth', '1', 'origin', pin.commit], src);
  run('git', ['checkout', '-q', '--detach', pin.commit], src);
}
console.log('mojulo: installing its dependencies');
run('npm', ['ci', '--omit=dev', '--no-audit', '--no-fund', '--loglevel=error'], join(src, 'control'));
const version = JSON.parse(readFileSync(join(src, 'control', 'package.json'), 'utf8')).version;
console.log(`mojulo ${version} (${pin.branch} @ ${pin.commit.slice(0, 7)}) is ready: data in .mojulo/home`);
