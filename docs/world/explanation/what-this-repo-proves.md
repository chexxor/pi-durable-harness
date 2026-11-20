# Explanation: what this repo proves, and how to read a verdict

Kind: explanation. This page answers one question: when a command here prints PASS, what did it actually
prove, and what did it not. It gives no steps to follow and states no flag surface; those live in the
how-to and reference pages.

Measured at tree `0687bc1e8f4f585c2e50d42b18526b51015462c1`, pin `v1.5.1`
(sha `dd30101cfc5b0609411dd80b6f93adbc14db14cf`). Every number below carries the command that prints it,
so a maintainer on a later tree re-measures rather than trusts.

## The proof layers

This repo stacks five checks, each one wider than the last. A verdict names the layer it stands on, and
reading the wrong layer is the mistake this page exists to prevent.

| Layer | The command that runs it | What a PASS proves | What it does not prove |
| --- | --- | --- | --- |
| The pin | `node scripts/sync-pi.mjs --offline --report` | the ten declared dependencies resolve to one release, and `fallback: null` means a missing one stops the run | that the release is current upstream — `--offline` prints a DRIFT line instead of measuring |
| The behaviour | every `demo/*.test.mjs` | one named pi behaviour answers on this machine, in this tree | anything about capabilities the demos do not exercise |
| The capability map | `node scripts/audit-pi-docs.mjs` | every capability pi's own docs enumerate is named by a matrix row or called by harness source | that a shimmed row works — the demos prove behaviour, this audit only proves the map covers pi's words |
| The tree | `node scripts/audit-orchestration.mjs`, `node scripts/audit-provenance.mjs` | no code-level dependency on the dropped orchestration layer, and every source file names where it came from | that the code is correct, only that it still names its extraction |
| The gaps | `node scripts/audit-doc-claims.mjs` | every claim page in `docs/world/claims/` still answers with the output that page quotes, at the tree that page cites | that any gap is fixed — a claim is a finding, and the runbook lists them without fixing them |

## The suite as one command

```bash
node scripts/suite.mjs
```

The run opens with one provenance line and ends with one tally:

```text
PROVENANCE tree=0687bc1e8f4f585c2e50d42b18526b51015462c1 branch=main uncommitted=29 node=v24.22.1 host=linux 7.2.15-300.fc45.x86_64 pin=v1.5.1 dependencySet=lockfile-released pinReport=offline
SUITE pass=24 fail=0 demos+audits=24 (tree=0687bc1e8f4f585c2e50d42b18526b51015462c1)
```

Read the two lines together. The tally counts the demos in `demo/` plus the audits named in `scripts/suite.mjs`'s
own audit list — read that list before you read the number, because "the suite is green" means those checks
and not every check this repo has. The provenance line is why a number is traceable at all: it names the tree,
the branch, how many paths were uncommitted, the Node version, the host, the pin, and how the dependency set
was classified. The `uncommitted=` count names the paths that were dirty when the run happened, so two runs
on one tree can print different values there. A green suite on a tree that does not name its pin would be a
verdict about nothing.

`scripts/suite.mjs` prints that line by the same rule the audit scripts print their own lines: anything that
reports a verdict prints the tree and the dependency set that produced it.

## Why the audits read this repo and never pi's docs as memory

`node scripts/audit-pi-docs.mjs` answers:

```text
PI-DOC AUDIT PASS: 443 capabilities enumerated by pi's 15 docs are each named by a matrix row (139 rows (51 shimmed / 66 unsupported / 22 native)) or called by harness source
```

Those counts exist because pi's docs are vendored into `node_modules` at the pin, and the audit enumerates
them from there. A capability pi names and the matrix does not is a finding, and the split in the parenthese
says which way each row went: shimmed on a pi-durable concept, unsupported with a reason, native because pi's
own code already answers it. The matrix stays falsifiable because its rows are data in
`src/packages/matrix.mjs`, not prose in a page — see the rule for generated pages in
[the ADR](../decisions/0001-docs-kinds-and-style.md).

## Why a generated page is regenerated and never hand-edited

```bash
node scripts/render-matrix.mjs | diff - docs/world/reference/package-support.md
node scripts/audit-provenance.mjs --markdown > /tmp/provenance-check.md
diff /tmp/provenance-check.md docs/world/reference/provenance.md
```

Both diffs printed nothing at the tree above, and a drift between a generator and its committed page is a
finding rather than something to patch by hand. Hand-editing a page would hide the one thing the matrix is
for: a disagreement between the data and the page a reader trusts. The provenance table repeats files —
131 rows against 67 unique ones — because the audit walks `src`, `demo`, `scripts` and then `.` again;
[the claim page](../claims/features-provenance-audit-double-counts.md) carries that as a finding, and
`node scripts/audit-provenance.mjs | head -1` prints the count it reports:

```text
headers found in 129/129 source files
```

## What this repo does not prove

- Upstream drift: `node scripts/sync-pi.mjs --offline --report` keeps the report on the machine, and its
  DRIFT line names the repo it did not contact. A maintainer who needs the measurement runs the same command
  without `--offline`, which leaves the offline proof.
- That pi's verbs this harness refuses are useless here: they are named by matrix rows so a reader can find
  the reason, which is a claim about the map, not about pi.
- Any functionality gap: those live in [docs/world/claims/](../claims/) as measured findings, and
  [the runbook](../runbooks/next-milestone.md) lists them for the next milestone to fix.
- Anything about a path this repo does not track. A page never cites a gitignored file as its evidence; it
  names the command that regenerates that evidence.

## Related

- [The parity sweep](../reference/parity-sweep.md) counts the refusals per pi doc.
- [The package support matrix](../reference/package-support.md) is the generated capability map.
- [The context-budget explanation](../explanation/context-budget.md) and
  [the execution log](../explanation/execution.md) are the two case histories this page sits above.
- [Verify a claim offline](../how-to/verify-a-claim-offline.md) re-checks one claim page's command.
