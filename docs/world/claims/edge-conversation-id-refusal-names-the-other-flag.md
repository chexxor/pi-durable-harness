Claim: --conversation is refused in --session's words, so the hint names the wrong flag

Kind: claim. Area: edge. This page records one measured finding, and
`scripts/audit-doc-claims.mjs` re-runs its command on every suite run.

Measured at tree `2d8f431b34dee596d9fefc3b542d1ccb6f653e2a`, pin `v1.5.1`
(sha `dd30101cfc5b0609411dd80b6f93adbc14db14cf`).
Any file count quoted below is the landing index's, so re-run the command rather than
remembering it.

## The finding

The help block spells `--conversation <id>`, and a run whose value is not an id answers with a sentence
about `--session`. The harness keeps pi's word `session` inside a refusal for a flag it spells `conversation`,
so the reader retypes a flag that does not exist here. pi's own word is preserved, which is the rule this
repo keeps, and the mismatch is what still needs fixing.

## The command and what it answered

```bash
grep -n -- '--conversation <id>' cli.mjs | head -1; node cli.mjs --conversation nope -p hi --faux hi --store .tmp/claims/j.sqlite
```

The first line is the help spelling, and the run exits 1 with the refusal:

```text
  --conversation <id>     open a specific conversation id
--session needs a conversation id, got "nope"
```

## What a fix must do

A fix names the flag the reader typed, and keeps pi's word for the concept beside it, in one sentence that
a reader can retype. It keeps pi's words for the concept, per the docs rule in
[the ADR](../decisions/0001-docs-kinds-and-style.md). The runbook lists this claim without fixing it.

## The block the gate reads

```claim
id: edge-conversation-id-refusal-names-the-other-flag
area: edge
state: open
claim: --conversation is refused in a sentence that spells --session, so the hint names a flag this CLI does not take.
command: grep -n -- '--conversation <id>' cli.mjs | head -1; node cli.mjs --conversation nope -p hi --faux hi --store .tmp/claims/j.sqlite
exit: 1
tree: 2d8f431b34dee596d9fefc3b542d1ccb6f653e2a
pin: dd30101cfc5b0609411dd80b6f93adbc14db14cf
output:
  --conversation <id>     open a specific conversation id
  --session needs a conversation id, got "nope"
```

## Related

- [The CLI surface](../reference/cli-surface.md) lists the refusals this harness spells itself.
- [The ADR](../decisions/0001-docs-kinds-and-style.md) states the rule about pi's words.
- [The runbook](../runbooks/next-milestone.md) lists this claim for the next milestone.
