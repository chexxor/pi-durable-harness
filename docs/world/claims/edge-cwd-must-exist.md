Claim: --cwd must already exist, and the run reports a filesystem error instead of that rule

Kind: claim. Area: edge. This page records one measured finding, and
`scripts/audit-doc-claims.mjs` re-runs its command on every suite run.

Measured at tree `38d0c2c0bf8b8063ad05fc93f01cc4e3554b5297`, pin `v1.5.1`
(sha `dd30101cfc5b0609411dd80b6f93adbc14db14cf`).
Any file count quoted below is the landing index's, so re-run the command rather than
remembering it.

## The finding

A run writes its lock sidecar into `<cwd>/.pi-harness`, so the directory `--cwd` names has to exist
already. A typo gets a raw Node filesystem error that quotes the path it tried to create and never names
the flag that caused it, and no page states the precondition. A reader who moves a session to a new
directory reads `EACCES` as a permissions problem.

## The command and what it answered

```bash
node cli.mjs --cwd /no/such/dir -p hi --faux hi
```

That run exits 1:

```text
EACCES: permission denied, mkdir '/no/such/dir/.pi-harness'
```

A directory that exists behaves as the pages describe, and the same flag pair answers normally:

```bash
mkdir -p .tmp/claims/edge && node cli.mjs --cwd .tmp/claims/edge --store .tmp/claims/edge/x.sqlite --faux one -p one
```

```text
one
```

## What a fix must do

A fix checks `--cwd` before the store opens and answers with the flag it was given, keeping pi-durable's
ownership rules and the one storage opener untouched. The wording must be this harness's own, because
pi spells no `--cwd` verb. The runbook lists this claim without fixing it.

## The block the gate reads

```claim
id: edge-cwd-must-exist
area: edge
state: open
claim: A run whose --cwd does not exist answers a raw mkdir error that names neither the flag nor the rule.
command: node cli.mjs --cwd /no/such/dir -p hi --faux hi
exit: 1
tree: 38d0c2c0bf8b8063ad05fc93f01cc4e3554b5297
pin: dd30101cfc5b0609411dd80b6f93adbc14db14cf
output:
  EACCES: permission denied, mkdir '/no/such/dir/.pi-harness'
absent: (--cwd .*must exist|the .*cwd.* has to exist)
```

## Related

- [The first-run tutorial](../tutorial/first-run.md) creates the scratch directory before it names one.
- [The CLI surface](../reference/cli-surface.md) states what `--cwd <dir>` answers.
- [The runbook](../runbooks/next-milestone.md) lists this claim for the next milestone.
