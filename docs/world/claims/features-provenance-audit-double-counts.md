Claim: the provenance audit walks the same trees twice, so its count and table repeat files

Kind: claim. Area: features. This page records one measured finding, and
`scripts/audit-doc-claims.mjs` re-runs its command on every suite run.

Measured at tree `0687bc1e8f4f585c2e50d42b18526b51015462c1`, pin `v1.5.1`
(sha `dd30101cfc5b0609411dd80b6f93adbc14db14cf`).

## The finding

`scripts/audit-provenance.mjs` walks `src`, `demo`, `scripts` and then `.` as well, so the recursion under
`.` re-walks the first three. The audit still passes — every file does name its source — but the number it
prints counts files twice, and the generated page repeats a row for each of them. The committed
[provenance page](../reference/provenance.md) is in sync with the generator, so this is not a stale page:
the double count is the finding.

## The command and what it answered

```bash
node scripts/audit-provenance.mjs | head -1; node scripts/audit-provenance.mjs --markdown | grep -c '^| '; node scripts/audit-provenance.mjs --markdown | grep '^| ' | sort -u | wc -l; git ls-files '*.mjs' | wc -l; grep -c 'sourceFiles(\["src", "demo", "scripts", "\.\."\]' scripts/audit-provenance.mjs
```

Verbatim:

```text
headers found in 129/129 source files
131
67
66
1
```

Read the counts in order: the header count the audit prints, the table rows the generator prints, the
unique ones among those rows, the `.mjs` paths this repo tracks, and the one line that causes the repeat.
The audit's count is twice the tracked one, so every row of the generated page names a file the row above
it already named. The three counts move when a file is added, so re-run the command rather than
remembering it.

## What a fix must do

A fix walks each tree once, or drops the `.` entry and names the root files separately, then regenerates
the page with `node scripts/audit-provenance.mjs --markdown > docs/world/reference/provenance.md`. It
changes no provenance rule: every source file still names where it came from. The runbook lists this claim
without fixing it.

## The block the gate reads

```claim
id: features-provenance-audit-double-counts
area: features
claim: The provenance audit reports 129/129 for 66 tracked .mjs files because it walks "." over the other trees.
command: node scripts/audit-provenance.mjs | head -1; node scripts/audit-provenance.mjs --markdown | grep -c '^| '; node scripts/audit-provenance.mjs --markdown | grep '^| ' | sort -u | wc -l; git ls-files '*.mjs' | wc -l; grep -c 'sourceFiles(\["src", "demo", "scripts", "\."\]' scripts/audit-provenance.mjs
exit: 0
tree: 0687bc1e8f4f585c2e50d42b18526b51015462c1
pin: dd30101cfc5b0609411dd80b6f93adbc14db14cf
output:
  headers found in 129/129 source files
  131
  67
  66
```

## Related

- [What this repo proves](../explanation/what-this-repo-proves.md) states how to read the audit's verdict.
- [The provenance page](../reference/provenance.md) is the generated table this finding is about.
- [The runbook](../runbooks/next-milestone.md) lists this claim for the next milestone.
