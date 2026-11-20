import { readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
function walk(path) {
  for (const name of readdirSync(path)) {
    const file = path + '/' + name;
    if (statSync(file).isDirectory()) walk(file);
    else if (file.endsWith('.js') || file.endsWith('.mjs')) {
      const r = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
      if (r.status) process.exit(r.status);
    }
  }
}
walk('server/src');
walk('server/database');
walk('server/tests');
console.log('Server JavaScript syntax checks passed.');
