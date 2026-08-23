/**
 * Append translation keys to src/lib/i18n.ts without hand-editing a 1000-line file.
 *
 *   node scripts/i18n-add.mjs strings.json
 *
 * `strings.json` is `{ "en": { "key": "text" }, "de": { "key": "Text" } }`.
 * Keys that already exist in a language are skipped (never silently overwritten),
 * and every key must be present in BOTH languages — a missing German string falls
 * back to English at runtime, which is the kind of thing nobody notices for months.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = resolve(root, 'src/lib/i18n.ts');
const input = JSON.parse(readFileSync(resolve(process.cwd(), process.argv[2]), 'utf8'));

const en = input.en ?? {};
const de = input.de ?? {};
const missing = Object.keys(en).filter((k) => !(k in de)).concat(Object.keys(de).filter((k) => !(k in en)));
if (missing.length) {
  console.error(`Keys missing a translation: ${missing.join(', ')}`);
  process.exit(1);
}

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const raw = readFileSync(file, 'utf8');
// the repo is edited on Windows, so the file may well be CRLF — work on plain
// lines and put the original ending back, rather than silently rewriting them all
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
const lines = raw.split(/\r?\n/);

/** [firstRow, closingBrace] line indices of the block opened by `  <lang>: {` */
function blockRange(lang) {
  const start = lines.findIndex((l) => l === `  ${lang}: {`);
  if (start < 0) throw new Error(`no ${lang} block`);
  for (let i = start + 1; i < lines.length; i++) if (lines[i] === '  },') return [start + 1, i];
  throw new Error(`unterminated ${lang} block`);
}

let added = 0;
// de first: it sits after en in the file, so inserting there leaves en's line
// indices untouched and the second pass needs no recomputation
for (const lang of ['de', 'en']) {
  const source = lang === 'en' ? en : de;
  const [from, at] = blockRange(lang);
  const block = lines.slice(from, at).join('\n');
  const rows = Object.entries(source)
    .filter(([k]) => !block.includes(`'${k}':`))
    .map(([k, v]) => `    '${esc(k)}': '${esc(v)}',`);
  if (!rows.length) continue;
  added += rows.length;
  lines.splice(at, 0, ...rows, '');
}

writeFileSync(file, lines.join(eol));
console.log(`i18n: added ${added} row(s)`);
