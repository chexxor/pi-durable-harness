# How-to: verify a claim offline

Kind: how-to. One task: re-check one claim page in `docs/world/claims/` and then re-check the whole set.
A claim page is a finding, not a fix, so "verified" here means the finding still answers.

Measured at tree `0687bc1e8f4f585c2e50d42b18526b51015462c1`, pin `v1.5.1`
(sha `dd30101cfc5b0609411dd80b6f93adbc14db14cf`). Every output block below is copied from a run on this
machine at that tree, so re-run the commands rather than copying the numbers.

## Read the block before running anything

Each claim page ends with a fenced block opened with the word `claim`. On
[the inventory claim page](../claims/config-settings-inventory-counts-nothing.md) the lines inside those
fences read, verbatim:

```text
id: config-settings-inventory-counts-nothing
area: configuration
claim: The inventory line prints settings=0 and unmappedSettings=0 while pi's settings for this directory exist.
command: node cli.mjs --store .tmp/claims/inv.sqlite --cwd .tmp/claims --faux hi -p hi; node scripts/diagnose-context-budget.mjs | head -1; grep -n 'const count = ' cli.mjs; grep -n 'settingsUnmapped:' src/agentplane.mjs
exit: 0
tree: 0687bc1e8f4f585c2e50d42b18526b51015462c1
pin: dd30101cfc5b0609411dd80b6f93adbc14db14cf
output:
  settings=0 unmappedSettings=0
  settings [cwd=/home/chexxor/Git/pi-durable-harness]: compaction.enabled=false
  const count = (list) => (Array.isArray(list) ? list.length : 0);
  settingsUnmapped: mappedSettings.unmapped,
```

Four fields decide whether the page is evidence at all: the `command` that ran, the `exit` code it answered,
and the `tree` and `pin` it was measured at. The `output` lines are what a later run must still print.

## Check that the tree and the pin still resolve

```bash
git rev-parse --verify 0687bc1e8f4f585c2e50d42b18526b51015462c1
git rev-parse --verify dd30101cfc5b0609411dd80b6f93adbc14db14cf
```

```text
0687bc1e8f4f585c2e50d42b18526b51015462c1
dd30101cfc5b0609411dd80b6f93adbc14db14cf
```

Both print their own sha and exit 0. A sha that no longer resolves exits 1 and prints no sha: the claim
then cites a tree this repo does not hold, so its quoted output proves nothing about this code. The pin
sha must equal the one `pi-main.pin.json` carries, which is what these two commands read back:

```bash
node scripts/sync-pi.mjs --offline --report | grep -E 'DRIFT|via=' | head -1
node cli.mjs --version
```

```text
  @earendil-works/pi-durable       pin=1.5.1 declared=1.5.1 resolved=1.5.1 via=lockfile-released
pin v1.5.1 (dd30101cfc5b) - 10 @earendil-works packages declared, 1.5.1/1.5.1/1.5.1/1.5.1/1.5.1/1.5.1/1.5.1/1.5.1/1.5.1/1.5.1
```

`--offline` keeps both commands on this machine. The report line says the pin was read from the committed
lockfile rather than from the network, and `--version` says the same release the harness resolves.

## Run the command the claim names

```bash
node cli.mjs --store .tmp/claims/inv.sqlite --cwd .tmp/claims --faux hi -p hi 2>&1 | head -1
node scripts/diagnose-context-budget.mjs | head -1
```

```text
plane: packages=4 (@mjakl/pi-kagi-api,awesome-pi-themes,pi-deepinfra,pi-goal-x) extensions=4 loaded=4 bridged=4 commands=19 shortcuts=0 templates=0 skills=0 themes=73 contextFiles=0 theme=starry-night settings=0 unmappedSettings=0 skipped=none
settings [cwd=/home/chexxor/Git/pi-durable-harness]: compaction.enabled=false defaultModel=qwen3.8-flash-next-iq3_xxs defaultProvider=strata-server theme=starry-night packages=["npm:@woksin/pi-context-budget"]
```

Both lines still answer, so the finding still holds: the run counts nothing in its two settings columns
while pi's settings for this directory exist. Compare a claim the same way: read the block's `output` list
top to bottom, and look for those strings in the run's combined stdout and stderr, in that order. Extra
lines are fine; a missing one is not.

The full command in that block also writes its store under `.tmp/claims/`, which this repo ignores. Keep
scratch stores there, so a verification run never dirties a tracked path.

## Check every claim in one step

```bash
node scripts/audit-doc-claims.mjs
```

The run answers one line per page, then a tally and a verdict:

```text
claim config-faux-takes-one-value answers as quoted (area configuration, tree 0687bc1e8f4f, pin dd30101cfc5b)
claim config-settings-inventory-counts-nothing answers as quoted (area configuration, tree 0687bc1e8f4f, pin dd30101cfc5b)
claim edge-conversation-id-refusal-names-the-other-flag answers as quoted (area edge, tree 0687bc1e8f4f, pin dd30101cfc5b)
claim edge-cwd-must-exist answers as quoted (area edge, tree 0687bc1e8f4f, pin dd30101cfc5b)
claim edge-faux-swallows-print-flag answers as quoted (area edge, tree 0687bc1e8f4f, pin dd30101cfc5b)
claim edge-store-swallows-next-flag answers as quoted (area edge, tree 0687bc1e8f4f, pin dd30101cfc5b)
claim features-no-cli-way-to-inspect-a-store answers as quoted (area features, tree 0687bc1e8f4f, pin dd30101cfc5b)
claim features-provenance-audit-double-counts answers as quoted (area features, tree 0687bc1e8f4f, pin dd30101cfc5b)
claim install-dependencies-not-vendored answers as quoted (area install, tree 0687bc1e8f4f, pin dd30101cfc5b)
claim install-node-floor-undocumented answers as quoted (area install, tree 0687bc1e8f4f, pin dd30101cfc5b)
claims checked=10 pass=10 fail=0 areas=configuration=2 edge=4 features=2 install=2 (pages under docs/world/claims=10)
DOC-CLAIM AUDIT PASS: every claim page under docs/world/claims re-answers with the output it quotes, at a tree and pin that resolve, and no page on the docs surface states what a claim says is missing
```

The tally counts pages in the findings directory, and the area counts say the set covers four areas. The
verdict also names the third check the gate runs: a page whose `absent` regex already appears in another
page on the docs surface fails, so the docs cannot state a gap the claim says is missing.

## Tell that the check worked

```bash
node scripts/audit-doc-claims.mjs > /dev/null; echo $?
ls docs/world/claims | wc -l
```

```text
0
10
```

| What you check | What it means |
| --- | --- |
| exit 0 and one line per page | every page re-answered with the output it quotes |
| exit 1 and indented findings | a page drifted, a sha stopped resolving, or a docs page states a gap |
| tally equals the page count | the set is complete, so a page outside the directory is not being counted |

A stale line fails rather than passing quietly. Written for this page, and deleted afterwards, one scratch
page whose expected line names a version no run printed:

```text
claims checked=11 pass=10 fail=1 areas=configuration=2 edge=4 features=3 install=2 (pages under docs/world/claims=11)
  scratch-drift-demo: no output line answers v1.0.0 this machine did not answer
DOC-CLAIM AUDIT FAIL: 1 claim findings
```

That run exits 1. The gate also refuses a command that reaches the network, before running it, so a claim
cannot pass on whatever upstream says today.

## Where the gate runs by itself

`node scripts/suite.mjs` runs the gate as one of its four audits, and its last line counts it:

```text
SUITE pass=24 fail=0 demos+audits=24 (tree=0687bc1e8f4f585c2e50d42b18526b51015462c1)
```

Read the audit list in `scripts/suite.mjs` before you read that number, because the tally counts the demos
and the named audits, not every check this repo has.

## Related

- [The claim pages](../claims/) hold the findings this page re-checks, and
  [the runbook](../runbooks/next-milestone.md) lists them for the next milestone.
- [What this repo proves](../explanation/what-this-repo-proves.md) states what each verdict layer proves.
- [The first-run tutorial](../tutorial/first-run.md) runs the suite before it runs any claim.
