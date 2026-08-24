// Fails if a vendored jQuery file does not match the SHA-256 recorded in test/vendor/vendor.json.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../test/vendor/', import.meta.url));
const manifest = JSON.parse(readFileSync(dir + 'vendor.json', 'utf8'));
for (const [file, { sha256 }] of Object.entries(manifest)) {
  const actual = createHash('sha256').update(readFileSync(dir + file)).digest('hex');
  if (actual !== sha256) throw new Error(`${file}: sha256 ${actual} != recorded ${sha256}`);
}

const allowed = new Set([...Object.keys(manifest), 'vendor.json', 'SOURCES.md']);
for (const file of readdirSync(dir)) {
  if (!allowed.has(file)) throw new Error(`${file}: present in test/vendor/ but not listed in vendor.json`);
}

console.log(`vendored jQuery files verified: ${Object.keys(manifest).length}`);
