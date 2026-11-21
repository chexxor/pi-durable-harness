Claim: no CLI verb reads a store back, so reading a session needs the RPC protocol

Kind: claim. Area: features. This page records one measured finding, and
`scripts/audit-doc-claims.mjs` re-runs its command on every suite run.

Measured at tree `38d0c2c0bf8b8063ad05fc93f01cc4e3554b5297`, pin `v1.5.1`
(sha `dd30101cfc5b0609411dd80b6f93adbc14db14cf`).
Any file count quoted below is the landing index's, so re-run the command rather than
remembering it.

## The finding

A run commits entries into a store, and reading them back is an API (`src/readapi.mjs`) plus RPC verbs
under `--mode rpc`. No flag spells the read: `--help` names `--conversation <id>` to open a conversation,
but nothing lists conversations or entries for an operator to ask "what did this directory commit?". The
read path exists and works; only its command surface is missing.

## The command and what it answered

```bash
node cli.mjs --help | grep -c -- '--list-conversations'; printf '{"type":"status"}\n' | node cli.mjs --mode rpc --store .tmp/claims/rpc1.sqlite --cwd .tmp/claims --faux x | tail -1
```

The first count is zero, and the second command answers through the RPC surface:

```text
0
{"type":"response","command":"status","success":true,"data":{"pid":2716504,"conversationId":1,"newestEntry":null,"usage":{"models":{},"tools":{}}}}
```

That store holds no turn, so `newestEntry` is `null` there. The same record on a store that holds a turn
names an entry number and the plane that answered, and a `read` record answers one item per committed
entry.

## What a fix must do

A fix spells the read on the CLI surface: a verb that lists conversations for a store, and one that prints
a conversation's entries, both reading through `src/readapi.mjs` only. It adds no second storage opener
and no SQL. The runbook lists this claim without fixing it.

## The block the gate reads

```claim
id: features-no-cli-way-to-inspect-a-store
area: features
state: open
claim: No CLI verb lists a store's conversations or entries; the read path exists as an API and as RPC records.
command: node cli.mjs --help | grep -c -- '--list-conversations'; printf '{"type":"status"}\n' | node cli.mjs --mode rpc --store .tmp/claims/rpc1.sqlite --cwd .tmp/claims --faux x | tail -1
exit: 0
tree: 38d0c2c0bf8b8063ad05fc93f01cc4e3554b5297
pin: dd30101cfc5b0609411dd80b6f93adbc14db14cf
output:
  0
  {"type":"response","command":"status"
  newestEntry
absent: (--list-conversations|--entries|--show-conversation)
```

## Related

- [The first-run tutorial](../tutorial/first-run.md) reads a turn back through `--mode rpc`.
- [The CLI surface](../reference/cli-surface.md) states the verbs this harness answers.
- [The runbook](../runbooks/next-milestone.md) lists this claim for the next milestone.
