Claim: a value-taking flag reads one word, so an unquoted reply loses its tail into the prompt

Kind: claim. Area: configuration. This page records one measured finding, and
`scripts/audit-doc-claims.mjs` re-runs its command on every suite run.

Measured at tree `2d8f431b34dee596d9fefc3b542d1ccb6f653e2a`, pin `v1.5.1`
(sha `dd30101cfc5b0609411dd80b6f93adbc14db14cf`).
Any file count quoted below is the landing index's, so re-run the command rather than
remembering it.

## The finding

`--faux` carries a scripted reply, and the option parser takes ONE argument. Written without quotes, a
multi-word reply splits: the first word becomes the reply, and the rest become prompt words. Nothing in the
run warns about that split, so a demo run that expects a whole sentence silently answers a single word.

## The command and what it answered

```bash
mkdir -p .tmp/claims && node cli.mjs --store .tmp/claims/faux1.sqlite --cwd .tmp/claims --faux one two -p "hello"
```

The run exits 0 and prints the inventory line, the model warning, and the answer:

```text
plane: packages=4 (@mjakl/pi-kagi-api,awesome-pi-themes,pi-deepinfra,pi-goal-x) extensions=4 loaded=4 bridged=4 commands=19 shortcuts=0 templates=0 skills=0 themes=73 contextFiles=0 theme=starry-night settings=0 unmappedSettings=0 skipped=none
warning [model]: pi's settings name strata-server/qwen3.8-flash-next-iq3_xxs, but this run did not ask for a real model (realModel): pi-ai's faux plane answers it, and the settings model is NOT substituted silently
one
```

Print mode keeps stdout to the answer text alone, so the answer `one` is the whole scripted reply and
`two hello` went to the prompt.

## What a fix must do

A fix either refuses a value-taking flag whose value looks like another flag, or it keeps the reply whole
and says which words it took. The refusal wording must be this harness's own, not pi's, because pi spells
no `--faux` verb. The runbook lists this claim without fixing it.

## The block the gate reads

```claim
id: config-faux-takes-one-value
area: configuration
state: open
claim: --faux reads ONE argument, so an unquoted reply loses its tail into the prompt words without a warning.
command: mkdir -p .tmp/claims && node cli.mjs --store .tmp/claims/faux1.sqlite --cwd .tmp/claims --faux one two -p "hello"
exit: 0
tree: 2d8f431b34dee596d9fefc3b542d1ccb6f653e2a
pin: dd30101cfc5b0609411dd80b6f93adbc14db14cf
output:
  plane: packages=4
  settings=0 unmappedSettings=0
  one
```

## Related

- [The CLI surface](../reference/cli-surface.md) states the one-argument rule and links this page.
- [The first-run tutorial](../tutorial/first-run.md) quotes the reply instead of leaving it bare.
- [The runbook](../runbooks/next-milestone.md) lists this claim for the next milestone.
