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
