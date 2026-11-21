Claim: the repo carries no dependency tree, so an offline clone cannot install

Kind: claim. Area: install. This page records one measured finding, and
`scripts/audit-doc-claims.mjs` re-runs its command on every suite run.

Measured at tree `d294f882c252ecaf925dd6b53378b08e5e97cf3d`, pin `v1.5.1`
(sha `dd30101cfc5b0609411dd80b6f93adbc14db14cf`).
Any file count quoted below is the landing index's, so re-run the command rather than
remembering it. Re-run the command before quoting a number again.

## The finding

`package.json` declares ten `@earendil-works` dependencies and `package-lock.json` is committed, but the
repo tracks no `node_modules` path. `npm install` is the only documented way to get them, and it reaches
the registry. Nothing documents how a reader on a machine without the registry resolves the same ten
packages, even though `scripts/sync-pi.mjs --offline --report` proves that the PIN plane can be read
offline.

## The command and what it answered

```bash
git ls-files node_modules | wc -l; git ls-files package-lock.json | wc -l; node scripts/sync-pi.mjs --offline --report | grep -m0 '' >/dev/null; node scripts/sync-pi.mjs --offline --report | tail -1
```

That command answers, verbatim:

```text
0
1
  @earendil-works/pi-durable       pin=1.5.1 declared=1.5.1 resolved=1.5.1 via=lockfile-released
```

The first line counts tracked `node_modules` paths, the second counts the committed lockfile, and the
third is the pin report's first plane row.

## What a fix must do

A fix names a command that resolves the ten declared packages against the committed lockfile without a
registry, or states plainly that the install step needs network and that the pin report is the check that
follows it. The runbook lists this claim without fixing it.

## The block the gate reads

```claim
id: install-dependencies-not-vendored
area: install
state: open
claim: The tracked repo carries no node_modules, so installing needs the registry, and no page names an offline route.
command: git ls-files node_modules | wc -l; git ls-files package-lock.json | wc -l; node scripts/sync-pi.mjs --offline --report | grep -E 'DRIFT|via=' | head -1
exit: 0
tree: d294f882c252ecaf925dd6b53378b08e5e97cf3d
pin: dd30101cfc5b0609411dd80b6f93adbc14db14cf
output:
  0
  1
absent: (npm install --offline|--offline --install|vendor the ten)
```

## Related

- [The first-run tutorial](../tutorial/first-run.md) shows the install step and the pin report.
- [What this repo proves](../explanation/what-this-repo-proves.md) explains the pin plane.
- [The runbook](../runbooks/next-milestone.md) lists this claim for the next milestone.
