# pi-durable-harness

A single-agent coding harness built on `@earendil-works/pi-durable`, reusing the pi package
ecosystem (extensions, skills, prompt templates, themes, context files) and pi's CLI surface
(print / JSON / RPC / TUI).

It is extracted from the harness-generic parts of `~/Git/Durian-Pi`. Durian-Pi's multi-seat
orchestration (seats, the cross-seat work queue, broker/serve, genlock, per-item worktrees,
metrics, constitution, selfdev) is **dropped**, not reimplemented — `scripts/audit-orchestration.mjs`
checks that no code-level dependency on those concepts survives. Every extracted file carries a
provenance header naming its source, what changed, and why; `scripts/audit-provenance.mjs` checks
that claim mechanically (see [docs/provenance.md](docs/provenance.md)).

## Quick start

```bash
npm install
node scripts/sync-pi.mjs --offline --report  # PIN | DECLARED | RESOLVED, drift said as NOT MEASURED
node scripts/sync-pi.mjs --report           # the same three planes PLUS drift measured upstream (reaches network)
node scripts/suite.mjs                      # every offline demo + both audits, one tally (no keys, no network)
```

The suite runs the pin report with `--offline` (its provenance line ends `pinReport=offline`), because the
suite's claim is that a verdict came with no network. That offline-ness is measured, not asserted: running
the suite under `strace -f -e trace=connect` records **0** `AF_INET` connects — only `AF_UNIX`, which are
the demos' own unix sockets — while a `--report` that omits `--offline` records one
`connect(…, AF_INET, sin_port=htons(443))` to `github.com`, made by `git ls-remote`. `--offline` refuses
`--sync/--update/--observe/--link`: offline is a report mode, not a way to move a pin on evidence nobody
gathered.

Then the four CLI surfaces, each proved by `demo/cli.test.mjs` and `demo/tui.test.mjs`:

```bash
node cli.mjs -p "hello"                    # print mode: stdout is the final answer text only
node cli.mjs --mode json -p "hello"        # NDJSON: pi-durable's own entries, one per line
node cli.mjs --mode rpc                    # JSONL commands on stdin (status config read prompt watch abort compact)
node demo/tui-interactive.mjs --store harness.sqlite --writer-socket <the owner's socket>
```

All four open the SAME harness-invocation path (`src/cli-intent.mjs`), so the difference between them
is what is printed, not what is run. `node cli.mjs --store <path>` names the store;
`--conversation <id>` picks a conversation the last run printed.

### Attach behavior (one writer, many readers)

```bash
node cli.mjs --store work/h.sqlite -p "first"      # claims the store; prints the owner lock
node cli.mjs --store work/h.sqlite -p "second"     # re-attaches as a reader of the SAME line
node demo/attach-writer.mjs --store work/h.sqlite --cwd work      # a writer serving a socket for readers
node demo/attach-reader.mjs --store work/h.sqlite --cwd work      # reads/watches/prompt-queues via that socket
```

The rules, and where each is proved (`demo/attach.test.mjs`, 14 checks;
[docs/attach.md](docs/attach.md)):

- one writer owns the store's single mutation line (`src/ownership.mjs`: `claimWriter`);
- a second writer fails LOUDLY, naming the holder's `pid`, the `startedAt` time and the store path;
- attached readers read committed state and never open a second mutation line;
- queued writes land on that line **exactly once**, keyed by `requestId` (pi-durable's own
  `SubmissionDraft.requestId` admission), so a client may retry without duplicating input;
- a clean exit releases the lock; `SIGKILL` does not, so liveness is `process.kill(pid, 0)` and a
  stale lock is reclaimed, making the store reusable;
- the socket is transport only — pi-durable remains the only source of truth.

## Pin discipline

`pi-main.pin.json` pins a TAG (`v1.5.1`), never `main`. `scripts/sync-pi.mjs` reports drift on every
invocation, refuses refs upstream does not have, and prints the three planes (pin / declared /
resolved). Verified symbols come from the pinned dist `.d.ts` files, not from assumptions.

Current state on this machine: `PIN tag "v1.5.1"`, `DECLARED 10 packages, all resolving 1.5.1`,
`RESOLVED all 10 pinned packages`, `via=lockfile-released`, no `LOUD FALLBACK` line. With network, drift is
measured and reported as one published tag (`v1.5.2`) behind the pin; offline, the drift line says
`not measured this run (--offline)` rather than claiming the pin is current.

## Reading a session

`src/readapi.mjs` is the one read-only surface: `openStore` (pi-durable's opener + a `readOnly`
Harness), `readEntries`, `listConversations`, `usage`. `src/eventfeed.mjs` adds the feed — committed
rows plus the in-flight partial — and `src/viewmodel.mjs` decides how each becomes a line.

Two choices are load-bearing, and the demos exist to keep them honest (`demo/readapi.test.mjs`, 20 checks):

- **A partial is a row, never an entry.** pi-durable's progress commits are deferred ("the Session
  adopts it in memory, shows it to watches and views, and resolves, but stores it later"), so an
  in-flight partial may never be stored, and a crash loses it. A viewer that counted it as an entry
  would report a turn that may not exist.
- **`--since` is pi-durable's boundary, not an offset.** `ConversationWindow.from` says where a scan
  starts, and `ConversationTranscript.resume` says what continues it; pi-durable's own doc for that
  layer says "Nothing counts entries or computes ranges from entry IDs, which have holes" — entry
  IDs have holes, so an offset of ours would be wrong at the first gap.

A read-only Harness can watch ("the Harness stays usable for reads and watches", pi-durable's own
words), which is why `watch` is one RPC command and why a viewer never needs a second mutation line.
Opening the sqlite file itself read-only does not work: measured
`openNodeSqliteStorage(path, { mode: "read-only" })` → `"attempt to write a readonly database"`
because the opener applies migrations on open — see [docs/attach.md](docs/attach.md).

## Settings, models, spend

`src/settings.mjs` resolves pi's `settings.json` (global + project scopes) through pi's own
`SettingsManager` into pi-durable's named settings and agent config; the defaults are pi-durable's
own exported constants (`DEFAULT_RETRY_POLICY`, `DEFAULT_COMPACTION_POLICY`, `DEFAULT_PROGRESS_POLICY`,
`DEFAULT_RESTART_LIMIT`), and what pi names and pi-durable does not is returned as **rows**, not folded
away. `demo/settings.test.mjs` (27 checks) also reads the policy back out of pi-durable's own durable
state (`conversation.agent()`), so "compaction off" survives a reopen instead of being a per-process flag.

`src/providers.mjs` builds pi's model plane (`ModelRuntime`/`ModelRegistry`) and resolves model refs by
the prefix rule it extracted from Durian-Pi's `seatmodel.mjs`; `src/spend.mjs` keeps a JSONL money
ledger separate from pi-durable's usage plane, and classifies endpoints (loopback free, LAN not free).

## pi-durable vs pi

The pi package ecosystem is reused through pi's own library exports, and every capability pi has that
pi-durable does not is **named** rather than quietly dropped: [docs/package-support.md](docs/package-support.md)
is generated from `src/packages/matrix.mjs` by `scripts/render-matrix.mjs` — 82 rows
(8 native / 32 shimmed / 42 unsupported), evidence per row, plus the packages actually installed on
this machine and what loaded from them. `src/packages/loader.mjs` uses pi's `DefaultResourceLoader`,
`discoverAndLoadExtensions` and `loadProjectContextFiles`; `src/packages/adapter.mjs` maps pi's
`registerTool`, `tool_call`/`tool_result`/provider/compaction handlers, skills, prompts, themes and
context files onto pi-durable's `defineExtension`/`defineTool`/`hook`/`section`.
`demo/packages.test.mjs` (35 checks) proves the shim runs end to end on a fixture package and on the
four real pi packages installed here. `scripts/audit-pi-docs.mjs` re-reads pi's OWN docs inside the
pinned package (packages.md, extensions.md, rpc.md, cli.md, sessions.md, compaction.md), harvests the
capabilities they enumerate (213 of them), and fails if any is named by neither a matrix row's `names`
array nor by a call in harness code with its comments stripped — `src/packages/matrix.mjs` is kept OUT of
the code corpus, so the matrix cannot vouch for itself, and a flag counts as taken only when a file that
actually parses argv spells that literal. What that audit forces into the open is pi's whole extension
surface: its ExtensionContext accessors, its ExtensionAPI methods (`sendMessage`, `setModel`,
`getActiveTools`, `registerMcpServer`, `getSettings`, …), its Custom UI class (ctx.ui dialogs, the in-TUI
editor, autocomplete, theme/renderer knobs), and its CLI verbs this harness does not take (`--export`,
`--name`, `--thinking`, `--skill`/`--theme`, `--json`, `--version`, `--offline`, `--credentials`, pi's
package-update aliases (`--all`/`--force`/`--self`) and pi's mcp add/login options (`--env`, `--url`,
`--header`, `--timeout`, `--description`) — every one named as shimmed or unsupported with a reason a
reader can check against the tree, none silently dropped. What that audit now forces into the open is pi's whole extension
surface: its ExtensionContext accessors, its ExtensionAPI methods (`sendMessage`, `setModel`,
`getActiveTools`, `registerMcpServer`, `getSettings`, …), and its Custom UI class (ctx.ui dialogs, the
in-TUI editor, autocomplete, theme/renderer knobs) — all named as shimmed or unsupported with a reason.

## Layout

| Path | What it is |
|---|---|
| `src/core.mjs` | spine: storage → registry → tools → env → `Harness.open` → root conversation |
| `src/cli-intent.mjs`, `cli.mjs`, `src/rpc.mjs` | one intent shape, one harness-invocation path: print / json / rpc |
| `src/ownership.mjs`, `src/attach.mjs` | store ownership (one writer) and the multiplexer attach path |
| `src/readapi.mjs`, `src/eventfeed.mjs`, `src/viewmodel.mjs` | the single read-only read API + event feed |
| `src/tui/` | pi-tui view: rows, sync/watch planes, frame + paint, input overlay, headless driver |
| `src/settings.mjs`, `src/providers.mjs`, `src/spend.mjs` | settings/policy resolution, model plane, money ledger |
| `src/toolsurface.mjs`, `src/executionenv.mjs` | tool guardrails, custom tools, and the execution environment |
| `src/packages/` | pi package discovery, pi's own loader, the extension shim, the capability matrix |
| `demo/` | the offline demo suite (no keys, no network); `*-interactive`/`*-writer`/`*-reader` are fixtures |
| `scripts/` | `suite.mjs` (demos + audits), `sync-pi.mjs`, `render-matrix.mjs`, the three audits |
| `docs/` | capability matrix, attach semantics, provenance table |

## Provenance

## Was the source repo touched?

`~/Git/Durian-Pi` is read-only to this harness, and that is checkable rather than asserted:

```bash
rg -l "pi-durable-harness" ~/Git/Durian-Pi            # -> no matches: none of our content landed there
git -C ~/Git/Durian-Pi status --short                  # its own dirty set, which is not ours
```

The dirty files Durian-Pi carries now (`docs/NEXT.md`, `docs/SELFDEV.md`) are its own selfdev work —
their diffs are pitfall write-ups about Durian-Pi's pointer tooling, written at 07:59-08:00 on 2026-11-15
by that repo's own agent, and the file list never gains a path this harness writes. Our session only ever
*read* that tree: every file we extracted names the source path in its provenance header, and
`docs/provenance.md` lists all of them.

`docs/provenance.md` is generated by `scripts/audit-provenance.mjs --markdown` and lists every source
file with its provenance line, whether that line names the pinned symbols it was read against, and
whether it says what was dropped. Files with no original say `no Durian-Pi original` — "we wrote this
ourselves" is itself a claim, so it gets a header too.
