Claim: no page names a Node floor, so a reader cannot tell which Node a run needs

Kind: claim. Area: install. This page records one measured finding, and
`scripts/audit-doc-claims.mjs` re-runs its command on every suite run.

Measured at tree `38d0c2c0bf8b8063ad05fc93f01cc4e3554b5297`, pin `v1.5.1`
(sha `dd30101cfc5b0609411dd80b6f93adbc14db14cf`).
Any file count quoted below is the landing index's, so re-run the command rather than
remembering it. Re-run the command before quoting the number again.

## The finding

The machine that developed this harness answers `v24.22.1`, and the ten `@earendil-works` packages it
imports ship ESM sources whose syntax this repo uses. No page states the oldest Node that answers here,
and nothing proves one: the number exists only as whatever the development machine happens to run. A
reader on an older Node gets a syntax error with no hint that the floor, not the harness, caused it.

## The command and what it answered

```bash
node -v
```

```text
v24.22.1
```

The gate also checks the docs surface, which searches tracked files under `README.md` and `docs/world`
outside `docs/world/claims`. That search finds no stated floor, and a claim may not invent one either:
naming a floor would need a check that runs on the oldest supported Node, and this repo has none.

## What a fix must do

A fix measures a floor instead of guessing one: run the suite against candidate Node versions, or read the
`node_modules` packages' own declared minimum, and state the number beside the command that proves it.
The runbook lists this claim without fixing it.

## The block the gate reads

```claim
id: install-node-floor-undocumented
area: install
state: open
claim: No page states the oldest Node that answers here, and nothing proves one.
command: node -v
exit: 0
tree: 38d0c2c0bf8b8063ad05fc93f01cc4e3554b5297
pin: dd30101cfc5b0609411dd80b6f93adbc14db14cf
output:
  v24.22.1
absent: (requires Node|Node [0-9]+\.[0-9]+|minimum Node)
```

## Related

- [The first-run tutorial](../tutorial/first-run.md) prints `node -v` and links this page.
- [What this repo proves](../explanation/what-this-repo-proves.md) says what a PASS is proof of.
- [The runbook](../runbooks/next-milestone.md) lists this claim for the next milestone.
