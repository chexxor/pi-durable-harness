Claim: --faux with no value swallows -p, so a prompt typed on stdin gets refused

Kind: claim. Area: edge. This page records one measured finding, and
`scripts/audit-doc-claims.mjs` re-runs its command on every suite run.

Measured at tree `0687bc1e8f4f585c2e50d42b18526b51015462c1`, pin `v1.5.1`
(sha `dd30101cfc5b0609411dd80b6f93adbc14db14cf`).

## The finding

A writer who spells `--faux` and then `-p`, meaning the reply to come from a pipe, loses the `-p`: `--faux`
takes it as its scripted reply. Print mode then sees no prompt and refuses, even though the pipe carried
text. The run still writes the store file, so a refused prompt leaves a store where the next run will look for a conversation.

## The command and what it answered

```bash
mkdir -p .tmp/claims/edge2 && (echo hi | node cli.mjs --store .tmp/claims/edge2/g.sqlite --faux -p; echo "cli exit=$?"); ls .tmp/claims/edge2
```

That chain answers `0` because it ends with `ls`; the subshell beside the run prints the refusal's own
exit code, which is what the page needs:

```text
plane: packages=5 (@mjakl/pi-kagi-api,awesome-pi-themes,pi-deepinfra,pi-goal-x,@woksin/pi-context-budget) extensions=5 loaded=5 bridged=5 commands=19 shortcuts=0 templates=0 skills=0 themes=73 contextFiles=0 theme=starry-night settings=0 unmappedSettings=0 skipped=none
warning [model]: pi's settings name strata-server/qwen3.8-flash-next-iq3_xxs, but this run did not ask for a real model (realModel): pi-ai's faux plane answers it, and the settings model is NOT substituted silently
print mode needs a prompt; run with --help
cli exit=1
g.sqlite
```

The refusal names the mode and the condition, and neither word names `--faux`, so the reader cannot tell
which flag was eaten. The `g.sqlite` line is the sidecar the refused run left in the directory, which is
where the next run in that directory looks for a conversation.

## What a fix must do

A fix treats a value-taking flag whose value is another flag as a refusal that names both, and it keeps the
offline demo rule that a scripted run never reaches a provider. The runbook lists this claim without fixing
it.

## The block the gate reads

```claim
id: edge-faux-swallows-print-flag
area: edge
claim: --faux with no value takes -p as its reply, so a piped prompt is refused and the store sidecar is still written.
command: mkdir -p .tmp/claims/edge2 && (echo hi | node cli.mjs --store .tmp/claims/edge2/g.sqlite --faux -p; echo "cli exit=$?"); ls .tmp/claims/edge2
exit: 0
tree: 0687bc1e8f4f585c2e50d42b18526b51015462c1
pin: dd30101cfc5b0609411dd80b6f93adbc14db14cf
output:
  plane: packages=5
  print mode needs a prompt; run with --help
  cli exit=1
  g.sqlite
```

## Related

- [The CLI surface](../reference/cli-surface.md) states `--faux <text>` and `--mode` in its verb table.
- [The first-run tutorial](../tutorial/first-run.md) quotes every scripted reply.
- [The runbook](../runbooks/next-milestone.md) lists this claim for the next milestone.
