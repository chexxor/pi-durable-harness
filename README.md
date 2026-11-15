# pi-durable-harness

A single-agent coding harness built on `@earendil-works/pi-durable`, reusing the pi package
ecosystem (extensions, skills, prompt templates, themes, context files) and pi's CLI surface.

It is extracted from the harness-generic parts of `~/Git/Durian-Pi`. Durian-Pi's multi-seat
orchestration (seats, the cross-seat work queue, broker/serve, genlock, per-item worktrees,
metrics, constitution, selfdev) is **dropped**, not reimplemented. Every extracted file carries a
provenance header naming its Durian-Pi source, what changed, and why.

## What is the backend

One durable Session over one storage opener:

```
openNodeSqliteStorage(path)  ->  Harness.open(storage, {models, registry, env}, context)
```

The durable Session atomically commits immutable entries, full task records and Chord-tracked
documents; only committed state is observable, and a commit marked deferred may be observed before
it is stored (pi-durable spec). This harness never runs its own SQL and never reimplements state
the harness already owns.

## Quick start

```bash
npm install
node scripts/sync-pi.mjs --report     # PIN | DECLARED | RESOLVED, drift on every run
node scripts/suite.mjs                # every offline demo, one provenance line, pass/fail tally
node cli.mjs -p "hello"               # print mode          } these three are the CLI surfaces task-7
node cli.mjs --mode json -p "hello"   # NDJSON agent events } proves with demo/cli.test.mjs; until that demo
node cli.mjs --mode rpc               # JSONL commands      } is in the tree, the modes below are written and
node cli.mjs                          # interactive TUI     } syntax-checked, not yet exercised offline
```

The store lives in the current directory (`harness.sqlite` by default). Run the harness twice in
the same directory: the second invocation attaches to the first session as a reader instead of
opening a second mutation line - see [docs/attach.md](docs/attach.md).

## Pin discipline

`pi-main.pin.json` pins a TAG (v1.5.1), never `main`. `scripts/sync-pi.mjs` reports drift on every
invocation, refuses refs upstream does not have, and prints the three planes (pin / declared /
resolved). Verified symbols come from the pinned dist `.d.ts` files, not from assumptions.

## Reading a session

`src/readapi.mjs` is the one read-only surface: `openStore` (pi-durable's opener + a `readOnly`
Harness), `readEntries`, `listConversations`, `usage`. `src/eventfeed.mjs` adds the feed -
committed rows plus the in-flight partial - and `src/viewmodel.mjs` decides how each becomes a line.

Two of these choices are load-bearing, and the demos exist to keep them honest:

- **A partial is a row, never an entry.** pi-durable's progress commits are deferred ("the Session
  adopts it in memory, shows it to watches and views, and resolves, but stores it later"), so an
  in-flight partial may never be stored, and a crash loses it. A viewer that counted it as an entry
  would report a turn that may not exist. See `demo/readapi.test.mjs`.
- **`--since` is pi-durable's boundary, not an offset.** `ConversationWindow.from` says where a scan
  starts, and `ConversationTranscript.resume` says what continues it; pi-durable's own doc for that
  layer says "Nothing counts entries or computes ranges from entry IDs, which have holes" - entry
  IDs have holes, so an offset of ours would be wrong at the first gap.

A read-only Harness can watch ("the Harness stays usable for reads and watches", pi-durable's own
words), which is why `watch` is one of the RPC commands and why a viewer never needs a second
mutation line: see [docs/attach.md](docs/attach.md) for the ownership rules and the measured
failure of the read-only file open.

## pi-durable vs pi

The pi package ecosystem is reused through pi's own library exports, and every capability pi has
that pi-durable does not is named rather than quietly dropped: [docs/package-support.md](docs/package-support.md)
is generated from `src/packages/matrix.mjs` by `scripts/render-matrix.mjs` (native / shimmed /
unsupported, one row per capability, evidence per row).

## Layout

| Path | What it is |
|---|---|
| `src/core.mjs` | spine: storage -> registry -> tools -> env -> Harness.open -> root conversation |
| `src/providers.mjs`, `src/spend.mjs` | model registry + usage/price accounting |
| `src/toolsurface.mjs`, `src/executionenv.mjs` | tool guardrails and the execution environment |
| `src/readapi.mjs`, `src/eventfeed.mjs`, `src/viewmodel.mjs` | the single read-only read API + event feed |
| `src/tui/` | pi-tui transcript view and input (pending: task-6 not landed yet; no code here claims it) |
| `cli.mjs`, `src/rpc.mjs` | print / json / rpc surfaces |
| `src/packages/` | pi package discovery + the extension compatibility shim |
| `src/ownership.mjs`, `src/attach.mjs` | store ownership and the multiplexer attach path |
| `demo/` | the offline demo suite (no keys, no network) |
| `docs/` | capability matrix, attach semantics, provenance notes |
