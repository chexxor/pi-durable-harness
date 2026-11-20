# How-to: run two processes against one store

Kind: how-to. This page names one task, its steps, and the check that says it worked.

Measured at tree `0687bc1e8f4f585c2e50d42b18526b51015462c1`, pin `v1.5.1`
(sha `dd30101cfc5b0609411dd80b6f93adbc14db14cf`). Every line below is copied from a run on that tree.

## The task

One store holds one conversation. Exactly one process owns it at a time, and any other process attaches
to that owner as a reader. See the rules and their proofs in
[the attach reference](../reference/attach.md).

## Start the owner

`--hold` keeps the owner open after its turn, so a second process has something to attach to.

```bash
mkdir -p .tmp/two-processes
node cli.mjs --store .tmp/two-processes/w.sqlite --cwd .tmp/two-processes --faux "the owner ran" -p "hello from the owner" --hold 8000 &
```

## Wait, then run the second process

```bash
node cli.mjs --store .tmp/two-processes/w.sqlite --cwd .tmp/two-processes --faux "second says two" -p "two"
```

That run exits 0 and answers:

```text
attached as reader to pid 2590410 (root conversation 1)
pi.assistant: [{"type":"text","text":"the owner ran"}]
pi.system: 
pi.user: hello from the owner
queued onto the owner: submission 13 (requestId rpc:2590410:prompt)
```

Read those lines in order: the second process attached to the owner's pid, printed the transcript rows the
owner had committed, and queued its own input onto that owner. The second process never opened a mutation
line; the owner settled the queue.

## Force the reader path by name

`--attach` states the intent instead of letting the run decide:

```bash
node cli.mjs --store .tmp/two-processes/w.sqlite --cwd .tmp/two-processes --attach -p "anything"
```

Against a live owner the first line is the same:

```text
attached as reader to pid 2590410 (root conversation 1)
```

Against a store no process owns, `--attach` refuses and exits 1:

```text
--attach needs a live owner; the store is not claimed
```

## Say what a second writer costs you

The CLI takes the reader path, so it never asks to claim a held store. A process that does claim one gets
this refusal, copied from `demo/attach-writer.mjs` run twice against the same store:

```bash
node demo/attach-writer.mjs --store .tmp/two-processes/w.sqlite --cwd .tmp/two-processes --hold 1000
```

```text
store already owned: /home/chexxor/Git/pi-durable-harness/.tmp/two-processes/w.sqlite is held by pid 2582066 since 2026-11-19T21:35:28.522Z (socket /home/chexxor/Git/pi-durable-harness/.tmp/two-processes/.pi-harness/agent-b7dfb39075e567d9.sock). Run again without a writer claim to ATTACH as a reader, or stop that process. Claiming anyway writes a second mutation line into one store.
```

That run exits 1 and leaves the store untouched. The refusal names the holder's pid, the store, the holder's
start time, and the socket to attach through.

## Check that it worked

| What you check | What you see |
| --- | --- |
| the owner answered | the owner's own stdout holds its answer text and exits 0 |
| the reader attached by pid | the line `attached as reader to pid 2590410 (root conversation 1)` |
| the queue landed once | the line `queued onto the owner: submission 13 (requestId rpc:2590410:prompt)`, and a reopen of the store holds one `pi.user` row for that text |
| the release worked | the owner exited, so `--attach` now answers `--attach needs a live owner; the store is not claimed` |

`demo/attach.test.mjs` proves the same phases with two real processes, and the suite runs it. Its phase list
names the killed-owner case, where a stale lock must read as free rather than owned.

## Related

- [The first-run tutorial](../tutorial/first-run.md) walks a single process.
- [The CLI surface](../reference/cli-surface.md) states `--attach` and `--hold` beside the verbs they answer.
- [Verify a claim offline](./verify-a-claim-offline.md) re-checks the measured lines on any page here.
