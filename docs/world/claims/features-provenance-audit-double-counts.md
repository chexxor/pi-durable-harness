Claim: the provenance audit walks each tree once, so its count and its table name every file once

Kind: claim. Area: features. This page records one measured finding, and
`scripts/audit-claim-drift.mjs` re-runs its command on every suite run.

Measured at tree `2d8f431b34dee596d9fefc3b542d1ccb6f653e2a`, pin `v1.5.1`
(sha `dd30101cfc5b0609411dd80b6f93adbc14db14cf`).

## The finding, closed

`scripts/audit-provenance.mjs` used to walk `src`, `demo`, `scripts` and then `.` as well, and the
recursion under `.` re-walked the first three. Its printed count was therefore twice the files it
audits, and the generated table repeated a row for each of them. This finding is FIXED at this tree:
the `.` entry is gone, and the root-level sources are named separately by a non-recursive listing of
the repo root, so every tracked source is still checked for a `PROVENANCE:` header exactly once.

## The command that re-verifies it

```bash
node scripts/audit-provenance.mjs; node scripts/audit-provenance.mjs --markdown | grep -c '^| '; node scripts/audit-provenance.mjs --markdown | grep '^| ' | sort -u | wc -l; git ls-files '*.mjs' | wc -l; git ls-files '*.mjs' | grep -c '^scripts/audit-provenance.mjs$'
```

Verbatim:

```text
headers found in 68/68 source files
PROVENANCE PASS: every source file names the source it was extracted from, or says there is none
70
70
69
1
```

Read the counts in order: the header count the audit answers, its verdict, the table rows the generator
prints, the unique ones among those rows, the `.mjs` paths this repo tracks, and the one tracked path
that is the audit's own file. The invariant holds: 68 = 69 tracked minus that one file, which the audit
excludes by name rather than by skipping a tree, and the row count equals the unique-row count, so no
row repeats another. These counts come from the landing index, so they move with the tree — re-run the
command rather than remembering it.

## What the fix changed and did not change

The fix is at `scripts/audit-provenance.mjs:59`: the tree list is `["src", "demo", "scripts"]`, and a
new non-recursive `rootSourceFiles()` names the repo-root sources, with the audit's own file filtered
out by name. No provenance rule changed: every source file still names the source it was extracted
from, or says there is none. The page is regenerated, never hand-edited, with
`node scripts/audit-provenance.mjs --markdown > docs/world/reference/provenance.md`, and the drift gate
diff-checks that page against its generator on every suite run.

The close carries a certificate the gates resolve: `closed_by: checkpoint-claims-current`, the annotated tag
at the commit whose subject is `docs(world): make the claim set provably current at this tree`. `git
for-each-ref refs/tags/checkpoint-claims-current` names that tag and `git rev-parse --verify` resolves it, so
the close points at a commit this repo can show rather than at a paragraph. `scripts/claims-check.mjs` resolves
the certificate through git and both claim gates fail on a `state: fixed` claim whose certificate is missing or
unresolvable, which is why a close here is checked and not asserted.

## The block the gate reads

```claim
id: features-provenance-audit-double-counts
area: features
state: fixed
closed_by: checkpoint-claims-current
claim: The provenance audit answers 68/68 for the 69 tracked .mjs files (its own file excluded by name) and its generated table holds 70 rows, 70 of them unique.
command: node scripts/audit-provenance.mjs; node scripts/audit-provenance.mjs --markdown | grep -c '^| '; node scripts/audit-provenance.mjs --markdown | grep '^| ' | sort -u | wc -l; git ls-files '*.mjs' | wc -l; git ls-files '*.mjs' | grep -c '^scripts/audit-provenance.mjs$'
exit: 0
tree: 2d8f431b34dee596d9fefc3b542d1ccb6f653e2a
pin: dd30101cfc5b0609411dd80b6f93adbc14db14cf
absent: (re-walked the first three|twice the files it audits)
output:
  headers found in 68/68 source files
  PROVENANCE PASS: every source file names the source it was extracted from, or says there is none
  70
  70
  69
  1
```

## Related

- [What this repo proves](../explanation/what-this-repo-proves.md) states how to read the audit's verdict.
- [The provenance page](../reference/provenance.md) is the generated table this finding is about.
- [The claims index](../reference/claims-index.md) lists every claim and its state at HEAD.
- [The runbook](../runbooks/next-milestone.md) lists this claim for the next milestone.
