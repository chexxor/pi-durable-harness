Claim: the run's inventory line counts zero settings even when the scope files hold keys

Kind: claim. Area: configuration. This page records one measured finding, and
`scripts/audit-doc-claims.mjs` re-runs its command on every suite run.

Measured at tree `d294f882c252ecaf925dd6b53378b08e5e97cf3d`, pin `v1.5.1`
(sha `dd30101cfc5b0609411dd80b6f93adbc14db14cf`).
Any file count quoted below is the landing index's, so re-run the command rather than
remembering it.

## The finding

Every run prints its plane inventory line, and its two settings columns print `0` on this repo's own
directory even though pi's global and project settings hold keys for it. Two source lines explain the
zeros: `cli.mjs`'s `count` returns 0 for a value that is not an array, and the inventory counts
`settingsPaths`, which the plane sets to a record; the second column reads
`res.unmappedSettings` while `src/agentplane.mjs` names the field `settingsUnmapped`. A reader who trusts
those columns believes the run saw no settings and nothing unmapped.

## The command and what it answered

```bash
node cli.mjs --store .tmp/claims/inv.sqlite --cwd .tmp/claims --faux hi -p hi; node scripts/diagnose-context-budget.mjs | head -1; grep -n 'const count = ' cli.mjs; grep -n 'settingsUnmapped:' src/agentplane.mjs
```

The lines that carry the finding, verbatim:

```text
plane: packages=4 (@mjakl/pi-kagi-api,awesome-pi-themes,pi-deepinfra,pi-goal-x) extensions=4 loaded=4 bridged=4 commands=19 shortcuts=0 templates=0 skills=0 themes=73 contextFiles=0 theme=starry-night settings=0 unmappedSettings=0 skipped=none
settings [cwd=/home/chexxor/Git/pi-durable-harness]: compaction.enabled=false defaultModel=qwen3.8-flash-next-iq3_xxs defaultProvider=strata-server theme=starry-night packages=["npm:@woksin/pi-context-budget"]
  const count = (list) => (Array.isArray(list) ? list.length : 0);
  settingsUnmapped: mappedSettings.unmapped,
```

The first line is one run's inventory, the second names the keys pi resolved for this directory, and the
last two name the code that produces the zeros.

## What a fix must do

A fix makes the two columns count the things they claim to count, and names the keys the run mapped and
left unmapped. It changes no mapping rule in `src/settings.mjs`, and it keeps pi-durable's exported
defaults as the source of any default number. The runbook lists this claim without fixing it.

## The block the gate reads

```claim
id: config-settings-inventory-counts-nothing
area: configuration
state: open
claim: The inventory line prints settings=0 and unmappedSettings=0 while pi's settings for this directory exist.
command: node cli.mjs --store .tmp/claims/inv.sqlite --cwd .tmp/claims --faux hi -p hi; node scripts/diagnose-context-budget.mjs | head -1; grep -n 'const count = ' cli.mjs; grep -n 'settingsUnmapped:' src/agentplane.mjs
exit: 0
tree: d294f882c252ecaf925dd6b53378b08e5e97cf3d
pin: dd30101cfc5b0609411dd80b6f93adbc14db14cf
absent: (count the things they claim to count|names the keys the run mapped and left unmapped)
output:
  settings=0 unmappedSettings=0
  settings [cwd=/home/chexxor/Git/pi-durable-harness]: compaction.enabled=false
  const count = (list) => (Array.isArray(list) ? list.length : 0);
  settingsUnmapped: mappedSettings.unmapped,
```

## Related

- [Settings and policy keys](../reference/settings-and-policy-keys.md) states what the run reads and links
  this page.
- [What this repo proves](../explanation/what-this-repo-proves.md) says what a count is proof of.
- [The runbook](../runbooks/next-milestone.md) lists this claim for the next milestone.
