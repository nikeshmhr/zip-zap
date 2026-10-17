// Fails if the built app's initial download (JS + CSS, gzipped) exceeds the budget (T7.5).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = 300;
const dir = 'dist/assets';
let total = 0;
for (const file of readdirSync(dir)) {
  if (!/\.(js|css)$/.test(file)) continue;
  const kb = gzipSync(readFileSync(join(dir, file))).length / 1024;
  total += kb;
  console.log(`${file.padEnd(32)} ${kb.toFixed(1)} KB gzipped`);
}
console.log(`Total: ${total.toFixed(1)} KB of ${BUDGET_KB} KB`);
if (total > BUDGET_KB) {
  console.error('Over the bundle budget.');
  process.exit(1);
}
