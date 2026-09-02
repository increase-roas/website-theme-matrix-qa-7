# The intake layer

A builder tool that sits **on top of** the template. It reads the template's
config schema and writes a filled-in config. It does not modify the template's
components, its schema, or its deploy gate — and nothing in `src/` imports
anything from this folder.

Five phases. **Phase A is what exists today.**

| | | |
|---|---|---|
| **A** | Field manifest, examples, validation harness | **done** |
| B | Generator — writes a real `clients/<name>.config.ts` | not started |
| C | The intake form itself | not started |
| D | Review gate — draft site, approve, flip to client mode | not started |
| E | Auto-scaffold (advanced) | proposed, deferred |

---

## What Phase A is for

Before building a form, you need to know exactly what the form has to collect,
and you need proof that collecting those things is enough. Phase A produces
both, and it produces them in a way that cannot go stale.

**The problem it solves:** if the form kept its own list of fields, that list
would be a second copy of the schema — and second copies drift. That is the
entire defect class this template was built to eliminate. So the field list is
not typed by hand. It is read out of `src/config/schema.ts` at build time.

---

## What's here

```
intake/
  build-manifest.mjs      reads src/config/schema.ts → writes field-manifest.json
  field-manifest.json     GENERATED. 95 fields, every constraint, every default.
  validate.mjs            the proof: examples validate, guardrails still bite
  policy/
    field-policy.mjs      the ONLY hand-written list: ask / default / fixed / composed
  lib/
    load-schema.mjs       loads the template's real Zod schema into plain node
    assemble.mjs          intake answers → config object (in memory, Phase A only)
  examples/
    sun-pool.intake.json        the reference client, as intake answers
    northline-sauna.intake.json a fictional second client — different everything
```

## Two commands

```bash
node intake/build-manifest.mjs     # rebuild the field list from the schema
node intake/validate.mjs           # prove the examples work and the guards bite
```

Both are read-only with respect to the template. `build-manifest.mjs` writes
only `intake/field-manifest.json`; `validate.mjs` writes nothing at all.

---

## The anti-drift lock

`build-manifest.mjs` cross-checks the schema against `policy/field-policy.mjs`
and **exits 1** on any disagreement:

- a schema field with no policy entry → someone added a config field and never
  decided whether the form should ask for it
- a policy entry with no schema field → someone renamed or removed a config
  field and the intake layer still believes in it

Verified by adding a field to the schema and watching it fail:

```
  MANIFEST OUT OF SYNC WITH THE TEMPLATE SCHEMA
  Schema fields with no intake policy:
    + identity.driftProbe
```

So the template's schema stays the single source of truth, and the intake layer
cannot quietly fall behind it.

---

## The four field sources

Every one of the 95 fields is classified in `policy/field-policy.mjs`:

| source | count | meaning |
|---|---|---|
| `ask` | 44 | the form asks the client |
| `default` | 40 | pre-filled (navy + gold brand, fonts, radii); client may override |
| `fixed` | 3 | the generator always writes it; the form never shows it |
| `composed` | 8 | built from other answers, never typed directly |

The 40 defaults are mostly the brand ramp — 21 colours, 4 font values, 3 radii.
That is deliberate: a new client gets a complete, working look on submission and
overrides only what they want to change.

There is also a **never-ask** list of 18 values the template *derives*
(`phoneDisplay`, `telHref`, `yearsInBusiness`, `mapEmbedUrl`, `sameAs`,
`headerNav`, …). The form must never collect these and the generator must never
write them — a stored copy of a derived value is precisely the drift bug.

---

## Three rules the assembler enforces

**1. `deployMode` is always `'template'`.** An intake file cannot set it, even
if it contains the key. A generated config therefore *physically cannot deploy*
— the template's existing gate refuses `'template'` mode. No new gate was
needed and nothing in the template changed. Approval is a separate, deliberate
act that flips it to `'client'` (Phase D).

**2. Nav always starts with `{ type: 'categories' }`.** The generator never
writes a hardcoded category href. If an extra link points at a category route
that is off, assembly refuses it with a plain-English message rather than
letting the build fail later.

**3. An unchecked category is omitted, not written as `enabled: false`.**
Absent is the template's "off". A key sitting there with `enabled: false` is
something someone flips on by accident.

---

## What the harness proves

`node intake/validate.mjs` runs 19 checks against the template's **real** Zod
schema — imported from `src/config/schema.ts`, not reimplemented:

- both example intakes assemble into configs the schema accepts
- both come out in `template` mode with no hardcoded category links
- **11 negative cases**, each a real mistake a form could produce, each of which
  must be rejected: a nav link to an unchecked category (the saunas defect), a
  relative logo path (the category-hero 404), a phone typed `619-561-8587`
  instead of E.164, a founding year in the future, missing map coordinates, a
  colour written as `gold`, an `http://` site URL, zero opening hours, zero
  categories in client mode, an unknown category slug, a duplicate nav link
- the deployMode lock: an intake file that *tries* to set `deployMode: 'client'`
  still produces `'template'`

A validator that has never been shown to reject anything proves nothing. That is
why the negative cases are half the harness.

---

## Review warnings (feeds Phase D)

Separate from errors. These pass the build and still need a human, which is the
whole reason for the review step:

- favicon or share image still the template placeholder
- no social profiles at all (schema.org `sameAs` would be empty)
- no published email address
- no service areas
- brand colours left as the unmodified navy + gold default

Sun Pool's example intake currently trips 5 of these — correctly, because those
facts are genuinely unresolved rather than filled with plausible guesses.

---

## Secrets

None. `integrations` carries on/off flags and binding names only. GoHighLevel
keys, the Meta pixel ID and the CAPI token stay `wrangler secret put` values,
per client, exactly as they are today.

---

## Not yet built

The generator writes no file yet — `lib/assemble.mjs` builds the config object
in memory so the harness can validate it. Turning that into a real
`clients/<name>.config.ts`, with comments and formatting, plus the acceptance
test *"regenerate Sun Pool from its intake and diff against the hand-written
config"*, is Phase B.
