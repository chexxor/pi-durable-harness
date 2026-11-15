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
node cli.mjs -p "hello"               # print mode
node cli.mjs --mode json -p "hello"   # NDJSON agent events
node cli.mjs --mode rpc               # JSONL commands on stdin
node cli.mjs                          # interactive TUI
```

The store lives in the current directory (`harness.sqlite` by default). Run the harness twice in
the same directory: the second invocation attaches to the first session as a reader instead of
opening a second mutation line - see [docs/attach.md](docs/attach.md).

## Pin discipline

`pi-main.pin.json` pins a TAG (v1.5.1), never `main`. `scripts/sync-pi.mjs` reports drift on every
invocation, refuses refs upstream does not have, and prints the three planes (pin / declared /
resolved). Verified symbols come from the pinned dist `.d.ts` files, not from assumptions.

## Layout

| Path | What it is |
|---|---|
| `src/core.mjs` | spine: storage -> registry -> tools -> env -> Harness.open -> root conversation |
| `src/providers.mjs`, `src/spend.mjs` | model registry + usage/price accounting |
| `src/toolsurface.mjs`, `src/executionenv.mjs` | tool guardrails and the execution environment |
| `src/readapi.mjs`, `src/eventfeed.mjs`, `src/viewmodel.mjs` | the single read-only read API + event feed |
| `src/tui/` | pi-tui transcript view and input |
| `cli.mjs`, `src/rpc.mjs` | print / json / rpc surfaces |
| `src/packages/` | pi package discovery + the extension compatibility shim |
| `src/ownership.mjs`, `src/attach.mjs` | store ownership and the multiplexer attach path |
| `demo/` | the offline demo suite (no keys, no network) |
| `docs/` | capability matrix, attach semantics, provenance notes |
