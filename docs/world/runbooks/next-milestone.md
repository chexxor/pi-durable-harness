# Runbook: what the next milestone takes

Kind: runbook. One page indexes every claim recorded in `docs/world/claims/`, and states what the next
milestone does with each one. It fixes nothing: a claim is a finding, and a fix is a commit with its own
proof, which this page cannot carry.

Measured at tree `38d0c2c0bf8b8063ad05fc93f01cc4e3554b5297`, pin `v1.5.1`
(sha `dd30101cfc5b0609411dd80b6f93adbc14db14cf`). The commands below print the set fresh on any tree, so
re-run them rather than trusting the numbers here. Any file count quoted below is the landing index's.

## The set, counted

```bash
ls docs/world/claims | wc -l
node scripts/audit-doc-claims.mjs | tail -1
node scripts/audit-claim-drift.mjs | tail -1
node scripts/audit-claim-drift.mjs | grep '^claims checked'
node scripts/audit-invariants.mjs | tail -1
```

```text
10
DOC-CLAIM AUDIT PASS: every claim page under docs/world/claims re-answers with the output it quotes, at a tree and pin that resolve, and no page on the docs surface states what a claim says is missing
CLAIM-DRIFT AUDIT PASS: every claim answers on this tree and cites a tree and pin that still hold, every state fixed claim names a closed_by certificate that git resolves, every generated page equals its generator, and no tracked page states a gap the claims say is open
claims checked=10 current=10 stale=0 areas=configuration=2 edge=4 features=2 install=2 states=fixed=1 open=9
INVARIANTS AUDIT PASS: 6/6 rules kept on 31 tracked .mjs at tree 38d0c2c0bf8b8063ad05fc93f01cc4e3554b5297 - one storage opener in the two files it names, one mutation line, the ownership claim released in cli.mjs' main finally, no raw SQL, the pin unmoved, no dependency added
```

Ten pages, four areas, and both claim gates pass, so every row below is a live finding rather than a
list that has rotted. The tally's `states` counts say one finding is closed at this tree and nine are
open, and `current=10 stale=0` says every page re-answered here at a tree this repo can still reach.
The gates are `scripts/audit-doc-claims.mjs`, which re-answers each page, and
`scripts/audit-claim-drift.mjs`, which adds that the set is current here, that a `state: fixed` page names
a `closed_by` certificate git resolves, and that the four generated pages still equal their generators.
The line below them is the sixth suite audit, `scripts/audit-invariants.mjs`, which reads the structural
rules the ADR binds off the tracked source once and fails on the count - 6/6 rules kept here, on 31 of the
72 tracked `.mjs` files, the other 41 named as exempt in its own output. [The claims index](../reference/claims-index.md)
is generated from the same rows and lists every page with the state and tree it cites, and
[the invariants page](../reference/invariants.md) prints the same rows the gate reads, as a table.
[The ADR](../decisions/0001-docs-kinds-and-style.md) states why a findings list is falsifiable at all.

## Install

### install-node-floor-undocumented

- Area: install
- Claim: no page names a Node floor, so a reader cannot tell which Node a run needs.
- Verify: `node -v`
- Next: measure a floor instead of guessing one, and state the number beside the command that proves it.

### install-dependencies-not-vendored

- Area: install
- Claim: the repo carries no dependency tree, so an offline clone cannot install.
- Verify: `git ls-files node_modules | wc -l; git ls-files package-lock.json | wc -l; node scripts/sync-pi.mjs --offline --report | grep -E 'DRIFT|via=' | head -1`
- Next: name a command that resolves the ten declared packages against the committed lockfile without a
  registry, or state plainly that install needs network and that the pin report is the check after it.

## Configuration

### config-faux-takes-one-value

- Area: configuration
- Claim: a value-taking flag reads one word, so an unquoted reply loses its tail into the prompt.
- Verify: `mkdir -p .tmp/claims && node cli.mjs --store .tmp/claims/faux1.sqlite --cwd .tmp/claims --faux one two -p "hello"`
- Next: refuse a value-taking flag whose value looks like another flag, or keep the reply whole and say
  which words it took. The wording is this harness's own, since pi spells no `--faux` verb.

### config-settings-inventory-counts-nothing

- Area: configuration
- Claim: the run's inventory line counts zero settings even when the scope files hold keys.
- Verify: `node cli.mjs --store .tmp/claims/inv.sqlite --cwd .tmp/claims --faux hi -p hi; node scripts/diagnose-context-budget.mjs | head -1; grep -n 'const count = ' cli.mjs; grep -n 'settingsUnmapped:' src/agentplane.mjs`
- Next: make the two columns count what they claim to count, and name the keys the run mapped and left
  unmapped. Change no mapping rule in `src/settings.mjs`.

## Features

### features-no-cli-way-to-inspect-a-store

- Area: features
- Claim: no CLI verb reads a store back, so reading a session needs the RPC protocol.
- Verify: on the page — the command counts a read verb in `--help`, then asks the RPC surface for `status`.
- Next: spell the read on the CLI surface: one verb lists conversations for a store, one prints a
  conversation's entries, both reading through `src/readapi.mjs` only. No second storage opener, no SQL.

### features-provenance-audit-double-counts

- Area: features
- Claim: the audit used to walk the same trees twice, and it now walks each tree once, so this finding is
  closed at this tree.
- Verify: `node scripts/audit-provenance.mjs; node scripts/audit-provenance.mjs --markdown | grep -c '^| '; node scripts/audit-provenance.mjs --markdown | grep '^| ' | sort -u | wc -l; git ls-files '*.mjs' | wc -l; git ls-files '*.mjs' | grep -c '^scripts/audit-provenance.mjs$'`
- Next: none for this one. The page carries the block the drift gate re-verifies, and its state is `fixed`,
  so a milestone that changes the audit re-reads that block rather than picking a new gap.

## Edge cases

### edge-cwd-must-exist

- Area: edge
- Claim: `--cwd` has to name a directory that is already there, and the run answers a filesystem error
  instead of that rule.
- Verify: `node cli.mjs --cwd /no/such/dir -p hi --faux hi`
- Next: check `--cwd` before the store opens and answer with the flag it was given. Keep the ownership
  rules and the one storage opener untouched.

### edge-conversation-id-refusal-names-the-other-flag

- Area: edge
- Claim: `--conversation` is refused in `--session`'s words, so the hint names the wrong flag.
- Verify: `grep -n -- '--conversation <id>' cli.mjs | head -1; node cli.mjs --conversation nope -p hi --faux hi --store .tmp/claims/j.sqlite`
- Next: name the flag the reader typed, and keep pi's word for the concept beside it in one sentence a
  reader can retype.

### edge-store-swallows-next-flag

- Area: edge
- Claim: a value-taking flag swallows the next flag, so a store path can eat a verb.
- Verify: `mkdir -p .tmp/claims/swallow && cd .tmp/claims/swallow && node ../../../cli.mjs --cwd . --faux one --store --mode json -p hi; ls`
- Next: refuse a value-taking flag whose value starts with `-` and name both the flag and the value it
  found. Keep the one option table read from pi's pinned release.

### edge-faux-swallows-print-flag

- Area: edge
- Claim: `--faux` with no value swallows `-p`, so a prompt typed on stdin gets refused.
- Verify: `mkdir -p .tmp/claims/edge2 && (echo hi | node cli.mjs --store .tmp/claims/edge2/g.sqlite --faux -p; echo "cli exit=$?"); ls .tmp/claims/edge2`
- Next: treat a value-taking flag whose value is another flag as a refusal that names both, and keep the
  rule that a scripted run never reaches a provider.

## How a milestone takes one claim

1. Open the claim page and run its `command` from the repo root. If it no longer answers, the finding is
   stale: re-measure it and rewrite the page's block, or delete the page if the gap is gone.
2. Fix the gap in code, keeping the rules the ADR names as binding: one storage opener in the two files the
   rule names, one mutation line (`writerSubmit`, defined once in `src/tui/writer.mjs`), the ownership claim
   released inside `cli.mjs`'s main finally, no SQL statement and no sqlite module other than pi-durable's
   opener, the pin unmoved, and no dependency the pin does not already carry. `scripts/audit-invariants.mjs`
   is what fails if one of those slips, naming the file and the line, so a fix that breaks a structural rule
   fails the suite rather than passing on behaviour no demo imports.
3. Re-run `node scripts/audit-invariants.mjs`, `node scripts/audit-doc-claims.mjs`,
   `node scripts/audit-claim-drift.mjs`, and `node scripts/suite.mjs`, and read all four tallies off the
   runs. A gate that fails is a page that stopped answering or a structural rule that stopped holding, not
   a fix that missed a test.
4. Regenerate the four generated pages with their generators - `docs/world/reference/package-support.md`,
   `docs/world/reference/provenance.md`, `docs/world/reference/claims-index.md`, and
   `docs/world/reference/invariants.md` - and re-measure any number a page quotes before that page
   quotes it again. `scripts/audit-claim-drift.mjs` fails on a page that stopped matching its generator.
5. Land one commit, tag it, and move no older tag. Then re-measure the claim count against this page.

The order matters: a claim fixed and not re-verified is indistinguishable from a claim that rotted, and the
gate is what tells them apart.

## Related

- [The claim pages](../claims/) hold the commands and the verbatim outputs behind every row above, and
  [the claims index](../reference/claims-index.md) lists them with the state each one carries.
- [Verify a claim offline](../how-to/verify-a-claim-offline.md) walks one page through the gate.
- [The ADR](../decisions/0001-docs-kinds-and-style.md) states the writing rules a fix must keep.
- [What this repo proves](../explanation/what-this-repo-proves.md) states what each verdict is proof of.
