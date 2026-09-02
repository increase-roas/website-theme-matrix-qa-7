#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const gate = spawnSync(process.execPath, [join(ROOT, 'scripts', 'gate.mjs'), '--json'], {
  cwd: ROOT,
  encoding: 'utf8',
});

const lastLine = gate.stdout.trim().split('\n').pop() ?? '';
let report;
try {
  report = JSON.parse(lastLine);
} catch {
  console.error('Template gate could not parse the deploy gate output.');
  process.stderr.write(gate.stderr);
  process.exit(1);
}

if (report.crashed) {
  console.error(`Template gate crashed: ${report.reason}`);
  process.exit(1);
}

const expected = new Set([
  'Config is not in client mode',
  'No placeholder facts',
  'At least one category enabled',
]);
const actual = new Set(
  report.results.filter((result) => result.level === 'FAIL').map((result) => result.check),
);
const missing = [...expected].filter((check) => !actual.has(check));
const unexpected = [...actual].filter((check) => !expected.has(check));

if (gate.status !== 1 || missing.length || unexpected.length) {
  if (gate.status !== 1) console.error(`Deploy gate exited ${gate.status}; template mode must remain blocked.`);
  if (missing.length) console.error(`Missing template locks: ${missing.join(', ')}`);
  if (unexpected.length) console.error(`Unexpected template failures: ${unexpected.join(', ')}`);
  process.exit(1);
}

console.log('Template source is clean and remains blocked by exactly the three required client locks.');
