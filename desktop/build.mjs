// desktop/build.mjs — build frontend, fold static+public into standalone, package.
import { execSync } from 'node:child_process';
import { cpSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.join(__dirname, '..', 'frontend');
const standalone = path.join(frontend, '.next', 'standalone');

// 1. Build the Next standalone output.
execSync('yarn build', { cwd: frontend, stdio: 'inherit' });

// 2. standalone output does NOT copy these — do it manually (known Next quirk).
cpSync(path.join(frontend, '.next', 'static'), path.join(standalone, '.next', 'static'), {
  recursive: true,
});
cpSync(path.join(frontend, 'public'), path.join(standalone, 'public'), { recursive: true });

// 3. Package. With no args, builds the current OS/arch. CI passes target flags,
//    e.g. `node build.mjs --win --x64` or `node build.mjs --linux --arm64`.
const targets = process.argv.slice(2).join(' ');
execSync(`electron-builder ${targets}`, { cwd: __dirname, stdio: 'inherit' });
