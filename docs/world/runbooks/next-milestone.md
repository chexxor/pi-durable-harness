# Runbook: what the next milestone takes

Kind: runbook. One page indexes every claim recorded in `docs/world/claims/`, and states what the next
milestone does with each one. It fixes nothing: a claim is a finding, and a fix is a commit with its own
proof, which this page cannot carry.

Measured at tree `0687bc1e8f4f585c2e50d42b18526b51015462c1`, pin `v1.5.1`
(sha `dd30101cfc5b0609411dd80b6f93adbc14db14cf`). The commands below print the set fresh on any tree, so
re-run them rather than trusting the numbers here.

## The set, counted

```bash
ls docs/world/claims | wc -l
node scripts/audit-doc-claims.mjs | tail -1
```

```text
10
DOC-CLAIM AUDIT PASS: every claim page under docs/world/claims re-answers with the output it quotes, at a tree and pin that resolve, and no page on the docs surface states what a claim says is missing
```

Ten pages, four areas, and the gate still passes, so every row below is a live finding rather than a
list that has rotted. The gate is `scripts/audit-doc-claims.mjs`, and
[the ADR](../decisions/0001-docs-kinds-and-style.md) states why a findings list is falsifiable at all.

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
- Claim: the provenance audit walks the same trees twice, so its count and table repeat files.
- Verify: `node scripts/audit-provenance.mjs | head -1; node scripts/audit-provenance.mjs --markdown | grep -c '^| '; node scripts/audit-provenance.mjs --markdown | grep '^| ' | sort -u | wc -l; git ls-files '*.mjs' | wc -l; grep -c 'sourceFiles(\["src", "demo", "scripts", "\."\]' scripts/audit-provenance.mjs`
- Next: walk each tree once, or drop the `.` entry and name the root files separately, then regenerate the
  page rather than editing it.

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
2. Fix the gap in code, keeping the rules the ADR names as binding: one storage opener, one mutation line,
   ownership claimed and released in `cli.mjs`'s main try and finally, the pin unmoved, no new dependency,
   pi's theme colours and pi's own words for refusals.
3. Re-run `node scripts/audit-doc-claims.mjs` and `node scripts/suite.mjs`, and read both tallies off the
   runs. A gate that fails is a page that stopped answering, not a fix that missed a test.
4. Regenerate the two generated pages with their generators, and re-measure any number a page quotes
   before that page quotes it again.
5. Land one commit, tag it, and move no older tag. Then re-measure the claim count against this page.

The order matters: a claim fixed and not re-verified is indistinguishable from a claim that rotted, and the
gate is what tells them apart.

## Related

- [The claim pages](../claims/) hold the commands and the verbatim outputs behind every row above.
- [Verify a claim offline](../how-to/verify-a-claim-offline.md) walks one page through the gate.
- [The ADR](../decisions/0001-docs-kinds-and-style.md) states the writing rules a fix must keep.
- [What this repo proves](../explanation/what-this-repo-proves.md) states what each verdict is proof of.
