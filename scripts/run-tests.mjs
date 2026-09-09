/**
 * Runs every `src/lib/*.test.ts` in its own Node process (`npm test`).
 *
 * The tests are plain scripts that print their checks and throw at the end if any
 * failed — no framework, no dependency, and `node --experimental-strip-types` runs
 * the TypeScript directly. This runner only finds them and reports which ones fail,
 * so adding a test file means writing the file and nothing else.
 */
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/* Type stripping arrived in Node 22.6. On anything older every file below fails with
   `bad option: --experimental-strip-types`, one line per test, and the real cause is
   nowhere in the output — which is exactly how CI ran zero of these tests while
   reporting a plain failure. Say it once, up front, instead. */
const MIN_NODE = 22;
const major = Number(process.versions.node.split('.')[0]);
if (major < MIN_NODE) {
  console.error(
    `These tests are TypeScript run directly by Node, which needs Node ${MIN_NODE}+ ` +
      `(--experimental-strip-types). This is Node ${process.versions.node}.`,
  );
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'src', 'lib');
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.test.ts'))
  .sort();

const failed = [];
for (const file of files) {
  const res = spawnSync(process.execPath, ['--experimental-strip-types', join(dir, file)], {
    stdio: 'inherit',
    cwd: root,
  });
  if (res.status !== 0) failed.push(file);
}

console.log(`\n${'='.repeat(52)}`);
if (failed.length) {
  console.log(`${failed.length} of ${files.length} test files FAILED: ${failed.join(', ')}`);
  process.exit(1);
}
console.log(`${files.length} test files passed.`);
