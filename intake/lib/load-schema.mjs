/**
 * Loads the TEMPLATE'S OWN Zod schema into plain node.
 *
 * The intake layer must never keep its own copy of the config contract, so it
 * imports the real src/config/schema.ts. That file is TypeScript with
 * extensionless imports, which node cannot load directly, so it is compiled to
 * a throwaway ESM bundle in intake/.cache/ first.
 *
 * esbuild comes with vite, which the template already depends on — this adds no
 * dependency. Nothing outside intake/ is written to, and src/ is only read.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const CACHE = resolve(HERE, '../.cache');

export async function loadTemplateSchema() {
  mkdirSync(CACHE, { recursive: true });
  const esbuild = resolve(REPO, 'node_modules/.bin/esbuild');
  if (!existsSync(esbuild)) {
    console.error('esbuild not found. Run `npm install` in the repo root first.');
    process.exit(1);
  }
  execFileSync(
    esbuild,
    [
      resolve(REPO, 'src/config/schema.ts'),
      '--bundle',
      '--format=esm',
      '--platform=node',
      '--external:zod',
      `--outfile=${resolve(CACHE, 'schema.mjs')}`,
      '--log-level=error',
    ],
    { cwd: REPO, stdio: ['ignore', 'inherit', 'inherit'] },
  );
  return import(resolve(CACHE, 'schema.mjs') + `?t=${process.hrtime.bigint()}`);
}
