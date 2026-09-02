#!/usr/bin/env node
/**
 * INTAKE VALIDATION HARNESS — Phase A's proof.
 *
 * Runs three things and exits non-zero if any of them is wrong:
 *
 *   1. The manifest is in sync with the template's schema.
 *   2. Every example intake file assembles into a config that the template's
 *      REAL Zod schema accepts. Not a copy of the schema — the schema itself,
 *      imported from src/config/schema.ts.
 *   3. Every guardrail still bites. Each negative case below is a real mistake
 *      an intake form could produce; the harness mutates a good intake, runs
 *      it through, and fails if the mistake is NOT caught.
 *
 * (3) is the half people skip. A validator that has never been shown to reject
 * anything is not evidence of anything. These cases are the defects from the
 * original build, expressed as form input.
 *
 * Usage:  node intake/validate.mjs
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { assembleConfig, reviewWarnings, IntakeError } from './lib/assemble.mjs';
import { loadTemplateSchema } from './lib/load-schema.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLES = resolve(HERE, 'examples');

const g = (s) => `\x1b[32m${s}\x1b[0m`;
const r = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

let failures = 0;
const ok = (msg) => console.log(`  ${g('PASS')}  ${msg}`);
const bad = (msg, detail) => {
  failures++;
  console.log(`  ${r('FAIL')}  ${msg}`);
  if (detail) console.log(dim(`        ${detail}`));
};

const clone = (o) => JSON.parse(JSON.stringify(o));
const issuePaths = (err) => err.issues.map((i) => i.path.join('.')).join(', ');

/* ------------------------------------------------------------------ */

console.log('\nINTAKE LAYER — Phase A validation\n');

/* 1. Manifest freshness -------------------------------------------- */
console.log('1. Field manifest vs. the template schema');
try {
  execFileSync(process.execPath, [resolve(HERE, 'build-manifest.mjs'), '--check'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  ok('field-manifest.json matches src/config/schema.ts');
} catch (e) {
  bad('field-manifest.json is stale or out of sync', String(e.stdout ?? '') + String(e.stderr ?? ''));
}

/* 2. Examples validate against the real schema ---------------------- */
const { clientConfigSchema } = await loadTemplateSchema();

console.log('\n2. Example intakes → config → the template\'s real Zod schema');
const files = readdirSync(EXAMPLES).filter((f) => f.endsWith('.intake.json'));
if (files.length === 0) bad('no example intake files found');

const goodIntakes = {};
for (const file of files) {
  const name = basename(file, '.intake.json');
  const intake = JSON.parse(readFileSync(resolve(EXAMPLES, file), 'utf8'));
  goodIntakes[name] = intake;
  let config;
  try {
    config = assembleConfig(intake);
  } catch (e) {
    bad(`${name}: assembly threw`, e.message);
    continue;
  }
  const parsed = clientConfigSchema.safeParse(config);
  if (!parsed.success) {
    bad(`${name}: schema REJECTED the generated config`, issuePaths(parsed.error));
    for (const i of parsed.error.issues) console.log(dim(`        ${i.path.join('.')}: ${i.message}`));
    continue;
  }
  const cats = Object.keys(parsed.data.categories);
  ok(
    `${name}: valid — ${cats.length ? cats.join(', ') : 'no categories'} · ` +
      `deployMode "${parsed.data.deployMode}" · ${parsed.data.nav.items.length} nav items`,
  );

  // The generated config must be un-deployable until a human approves it.
  if (parsed.data.deployMode !== 'template') {
    bad(`${name}: generated config is not in template mode — it could deploy unreviewed`);
  }
  // And it must never hard-code a category link.
  const hardCoded = parsed.data.nav.items.filter(
    (i) => i.type === 'link' && /^\/(hot-tubs|swim-spas|saunas|massage-chairs|cold-plunges)\/?$/.test(i.href),
  );
  if (hardCoded.length) bad(`${name}: nav contains a hard-coded category link`, JSON.stringify(hardCoded));

  const warns = reviewWarnings(intake, parsed.data);
  if (warns.length) {
    console.log(dim(`        review will flag ${warns.length}: ${warns[0]}`));
  }
}

/* 3. Negative cases — every guardrail must still bite ---------------- */
console.log('\n3. Guardrails (each of these MUST be rejected)');

const base = () => clone(goodIntakes['sun-pool']);

const NEGATIVE = [
  {
    name: 'nav link to a category that is not checked (the saunas defect)',
    mutate: (i) => i.nav.extraLinks.push({ label: 'Saunas', href: '/saunas' }),
  },
  {
    name: 'nav link duplicating an automatic category link',
    mutate: (i) => i.nav.extraLinks.push({ label: 'Hot Tubs', href: '/hot-tubs' }),
  },
  {
    name: 'unknown category slug',
    mutate: (i) => i.categories.push({ slug: 'infrared-pod' }),
  },
  {
    name: 'relative logo path (the category-hero 404)',
    mutate: (i) => (i.brand.logos.nav = 'assets/logo-nav.png'),
  },
  {
    name: 'phone typed the way a human writes it, not E.164',
    mutate: (i) => (i.contact.phone = '619-561-8587'),
  },
  {
    name: 'founding year in the future',
    mutate: (i) => (i.business.foundedYear = 2099),
  },
  {
    name: 'missing map coordinates',
    mutate: (i) => {
      delete i.location.latitude;
      delete i.location.longitude;
    },
  },
  {
    name: 'colour that is not a 6-digit hex',
    mutate: (i) => (i.brand.colors = { accent: 'gold' }),
  },
  {
    name: 'http:// site URL instead of https://',
    mutate: (i) => (i.business.siteUrl = 'http://sunpoolandspasupply.com'),
  },
  {
    name: 'no opening hours at all',
    mutate: (i) => (i.hours = []),
  },
  {
    name: 'no categories checked, with deployMode forced to client',
    mutate: (i) => (i.categories = []),
    forceClient: true,
  },
];

for (const t of NEGATIVE) {
  const intake = base();
  t.mutate(intake);
  let config;
  try {
    config = assembleConfig(intake);
  } catch (e) {
    if (e instanceof IntakeError) {
      ok(`${t.name} — refused before the schema: ${dim(e.message.split('.')[0])}`);
      continue;
    }
    bad(`${t.name} — threw an unexpected error`, e.message);
    continue;
  }
  if (t.forceClient) config.deployMode = 'client';
  const parsed = clientConfigSchema.safeParse(config);
  if (parsed.success) {
    bad(`${t.name} — WAS ACCEPTED. The guardrail does not work.`);
  } else {
    ok(`${t.name} — rejected at ${dim(issuePaths(parsed.error))}`);
  }
}

/* 4. The deployMode lock -------------------------------------------- */
console.log('\n4. The review lock');
const sneaky = base();
sneaky.deployMode = 'client';
sneaky.business.deployMode = 'client';
const sneakyConfig = assembleConfig(sneaky);
if (sneakyConfig.deployMode === 'template') {
  ok('an intake file cannot set deployMode — the generator always writes "template"');
} else {
  bad('an intake file was able to set deployMode. A form submission could reach production.');
}

/* ------------------------------------------------------------------ */
console.log('');
if (failures) {
  console.log(r(`${failures} check(s) failed.\n`));
  process.exit(1);
}
console.log(g('All intake checks passed.\n'));
