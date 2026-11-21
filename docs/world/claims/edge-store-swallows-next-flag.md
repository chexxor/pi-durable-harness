Claim: a value-taking flag swallows the next flag, so a store path can eat a verb

Kind: claim. Area: edge. This page records one measured finding, and
`scripts/audit-doc-claims.mjs` re-runs its command on every suite run.

Measured at tree `2d8f431b34dee596d9fefc3b542d1ccb6f653e2a`, pin `v1.5.1`
(sha `dd30101cfc5b0609411dd80b6f93adbc14db14cf`).
Any file count quoted below is the landing index's, so re-run the command rather than
remembering it.

## The finding

`--store` takes one argument, and a missing value makes the NEXT flag that argument. The run below spells
`--store` with nothing after it, so the store becomes a file literally named `--mode`, the `json` mode never
applies, and the run exits 0 as a normal text turn. Nothing names the flag that was eaten, so a typo silently
changes what the run was.

## The command and what it answered

The probe runs inside a scratch directory so the file it writes stays under the gitignored `.tmp` tree:

```bash
mkdir -p .tmp/claims/swallow && cd .tmp/claims/swallow && node ../../../cli.mjs --cwd . --faux one --store --mode json -p hi; ls
```

The run answers `one`, and the directory listing after it names the store it wrote:

```text
one
--mode
```

The store file's name is `--mode`, and the run printed text rather than pi's NDJSON records, so `--mode`
never reached the mode plane.

## What a fix must do

A fix refuses a value-taking flag whose value starts with `-` and names both the flag and the value it
found, or it errors when a flag's value is missing. It keeps the one option table this harness reads from
pi's pinned release. The runbook lists this claim without fixing it.

## The block the gate reads

```claim
id: edge-store-swallows-next-flag
area: edge
state: open
claim: A --store with no value takes the next flag as its path, so the run writes a store named --mode and exits 0.
command: mkdir -p .tmp/claims/swallow && cd .tmp/claims/swallow && node ../../../cli.mjs --cwd . --faux one --store --mode json -p hi; ls
exit: 0
tree: 2d8f431b34dee596d9fefc3b542d1ccb6f653e2a
pin: dd30101cfc5b0609411dd80b6f93adbc14db14cf
absent: (file literally named .--mode.|Nothing names the flag that was eaten)
output:
  one
  --mode
```

## Related

- [The CLI surface](../reference/cli-surface.md) states the one-argument rule and links this claim.
- [faux takes one value](config-faux-takes-one-value.md) is the same rule on another flag.
- [The runbook](../runbooks/next-milestone.md) lists this claim for the next milestone.
