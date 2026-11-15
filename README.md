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
node scripts/suite.mjs                      # every offline demo + the three audits, one tally (no keys, no network)
node scripts/diagnose-context-budget.mjs     # pi's settings/package plane for THIS cwd, and why a session kept native compaction
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
npm run cli                                # a plain run IN A TERMINAL: the interactive window, this directory's store
npm run cli -- --store run.sqlite -p "hi"  # npm swallows its OWN flags, so harness flags travel after `--`
node cli.mjs -p "hello"                    # print mode: stdout is the final answer text only
node cli.mjs --mode json -p "hello"        # NDJSON: pi's session header + event records (docs/json.md)
node cli.mjs --mode rpc                    # pi's protocol: {"type":"prompt",...} in, {"type":"response",...} out
node cli.mjs --tui                          # the interactive TUI over the session THIS process owns
node demo/tui-interactive.mjs --store harness.sqlite --writer-socket <the owner's socket>  # a viewer of someone else's session
```

That rule is proved against a REAL terminal, not only a pipe: `demo/tty.test.mjs` allocates a pty
(python3's stdlib `pty` module — Node has no pty primitive, and the harness code under test never sees
python), runs `node cli.mjs` inside it with no prompt and no `--mode`, and asserts the window answered the
typed line, painted pi's theme, committed the line exactly once on the store it owned, quit on a bare
`quit` line, and that the SAME command with piped stdin chooses print instead. The demo also drives the
command the README actually tells a terminal user to type — `npm run cli -- --store ... --cwd ...`, npm's
documented pass-through form — and asserts that run opens the same window, paints pi's theme, and commits
the typed line exactly once on the store IT owned. The pty is a kernel object, not a socket, so the demo
stays inside the offline proof.

Every surface also prints its own plane inventory on stderr (`plane: packages=… extensions=… loaded=…
bridged=… templates=… skills=… themes=… theme=… skipped=…`), counted from what THIS run loaded, plus a
`warning [model]:` line when pi's settings name a default model the run did not ask for — pi's default
model is never substituted silently, because answering for an endpoint that never spoke would be a lie.
The provider plane reads pi's credentials the way pi does (`readStoredCredential`, provider-composer's own
"stored credential" precedence over models.json's inline key) and never writes one.

pi's INPUT expansion is one seam too: `src/promptplane.mjs` applies pi's substitution table to a `/template`
and pi's `<skill name= location=>` block to a `/skill:name` BEFORE the text enters the agent — the same
expansion for print, JSON, RPC and the typed TUI line (pi documents both halves in
`docs/prompt-templates.md` / `docs/skills.md`). A command a discovered pi package registers (`/goal`) is
**refused by name** instead: pi dispatches extension commands inside pi's CLI, which this harness does not
run, and `get_commands` lists them with `invocation: "unsupported"`.

pi's THEME palette is on the rows this TUI draws (`src/tui/theme.mjs`): pi's `theme` setting names the theme,
pi's loader discovered its record, and the SGR codes come from that file's `concreteColors`/`fgAnsi` maps —
a theme that lacks a token leaves those rows uncoloured rather than guessing a hue.

All four open the SAME harness-invocation path (`src/cli-intent.mjs`), so the difference between them
is what is printed, not what is run.

RPC mode speaks pi's own protocol, and pi's own `RpcClient` (exported by the pinned package) drives it:
a command is `{id?, type: "<verb>", ...params}` and the answer is `{id?, type: "response", command,
success, data}` — a failed answer carries pi's `error` and no invented fields. The verbs are pi's 34
from `rpc-commands.md`, answered on pi-durable's planes (or refused **by name** when pi-durable has no
plane: `cycle_model`, `set_steering_mode`, `abort_retry`, `abort_bash`, `export_html`, `set_session_name`,
…), plus four harness-only reads (`status`, `config`, `read`, `watch`) that name durable state. Events
stream as pi's records from **committed entries only** — no fabricated streaming deltas. stdin is
bidirectional (each line is answered as it arrives, never drained to EOF), and `SIGTERM`/`SIGINT` clean
up through the ordinary path: settle what was queued, close the Harness, release the ownership lock.
`demo/rpc.test.mjs` (52 checks) proves exactly this, with pi's `RpcClient` as the client. `node cli.mjs --store <path>` names the store;
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

Two choices are load-bearing, and the demos exist to keep them honest (`demo/readapi.test.mjs`, 23 checks):

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
away. `demo/settings.test.mjs` (28 checks) also reads the policy back out of pi-durable's own durable
state (`conversation.agent()`), so "compaction off" survives a reopen instead of being a per-process flag.

The switch has an EFFECT, not only a value: pi-durable gates BOTH automatic compaction paths on the
resolved policy (`compactionPolicy` in `dist/harness/compaction.js`, `thresholdCompaction` and the overflow
branch in `dist/harness/generation.js`), and the demo shows a grown context plus an explicit `compact()`
under `enabled: false` committing **no** `pi.compaction` entry. What pi's context budget does in THIS
workspace — including why one long session kept native compaction after the project settings landed, and
which sessions handed off through the package instead (`fromHook: true`) — is worked out from the tree by
`scripts/diagnose-context-budget.mjs`, written up in [docs/context-budget.md](docs/context-budget.md).

`src/providers.mjs` builds pi's model plane (`ModelRuntime`/`ModelRegistry`) and resolves model refs by
the prefix rule it extracted from Durian-Pi's `seatmodel.mjs`; `src/spend.mjs` keeps a JSONL money
ledger separate from pi-durable's usage plane, and classifies endpoints (loopback free, LAN not free).

## pi-durable vs pi

The pi package ecosystem is reused through pi's own library exports, and every capability pi has that
pi-durable does not is **named** rather than quietly dropped: [docs/package-support.md](docs/package-support.md)
is generated from `src/packages/matrix.mjs` by `scripts/render-matrix.mjs` — 102 rows
(11 native / 39 shimmed / 52 unsupported), evidence per row, plus the packages actually installed on
this machine and what loaded from them. `src/packages/loader.mjs` uses pi's `DefaultResourceLoader`,
`discoverAndLoadExtensions` and `loadProjectContextFiles`; `src/packages/adapter.mjs` maps pi's
`registerTool`, `tool_call`/`tool_result`/provider/compaction handlers, skills, prompts, themes and
context files onto pi-durable's `defineExtension`/`defineTool`/`hook`/`section`/`wrapTool` — a pi extension that registers a tool name the harness already offers becomes pi-durable's `wraps` slot (pi's `wrapRegisteredTool` case), so pi's argument repair and log line run AROUND pi-durable's own tool rather than beside it: `demo/packages.test.mjs` proves the wrapped `bash` ran exactly once (a marker file gained one line) and that pi's own execute never replaced the worker.
`demo/packages.test.mjs` (51 checks) proves the shim runs end to end on a fixture package and on the
four real pi packages installed here. `scripts/audit-pi-docs.mjs` re-reads pi's OWN docs inside the
pinned package — all twelve that enumerate a surface this harness claims: packages.md, extensions.md,
rpc.md AND rpc-commands.md (pi's 34 RPC verbs), json.md (pi's event records), message-types.md (pi-ai's
message types), tui.md (pi-tui's components), rpc-extension-ui.md (pi's extension dialogs), session-format.md
(pi's session-file entry types), cli.md, sessions.md, compaction.md — harvests the 306 capabilities they
enumerate, and fails if any is named by neither a matrix row's `names` array nor by a call in harness code
with its comments stripped: `src/packages/matrix.mjs` is kept OUT of that code corpus, so the matrix cannot
vouch for itself, and a documented flag counts as taken only when a file that actually parses `argv` spells
that literal. What that audit forces into the open is pi's whole extension surface (its `ExtensionContext`
accessors and actions, its `ExtensionAPI` methods — `sendMessage`, `setModel`, `getActiveTools`,
`registerMcpServer`, `getSettings`, …), its Custom UI class (the `ctx.ui` dialogs, the in-TUI editor and
autocomplete, the renderer/theme knobs, pi-tui's dialog components, and the `extension_ui_request`/
`extension_ui_response` subprotocol), pi's RPC verb list (answered on pi-durable's planes, or refused by
name), pi-ai's message types, pi's session-file entry types, and pi's CLI verbs this harness does not take
(`--export`, `--name`, `--fork`, `--thinking`, `--skill`/`--theme`, `--json`, `--version`, `--offline`,
`--credentials`, pi's package-update aliases and mcp add/login options) — every one named as native,
shimmed or unsupported with a reason a reader can check against the tree, none silently dropped.

## How the work was executed

[docs/execution.md](docs/execution.md) records the protocol as it ran: the sequential spine first (task-1
pin/deps, then task-2 harness core — every sibling imports the core, so it has to land first), then the
module tasks as siblings each owning a DISJOINT file set with its own verification contract, each closed
by a checkpoint tag in git. The file-disjointness is the machine-checkable half of "these could run in
parallel": no file appears in two task rows, and the doc prints the command that re-derives that table
from the tags.

## Layout

| Path | What it is |
|---|---|
| `src/core.mjs` | spine: storage → registry → tools → env → `Harness.open` → root conversation |
| `src/cli-intent.mjs`, `cli.mjs`, `src/rpc.mjs` | one intent shape, one harness-invocation path: print / json / rpc |
| `src/ownership.mjs`, `src/attach.mjs` | store ownership (one writer) and the multiplexer attach path |
| `src/readapi.mjs`, `src/eventfeed.mjs`, `src/viewmodel.mjs` | the single read-only read API + event feed |
| `src/tui/` | pi-tui view: rows, sync/watch planes, frame + paint, pi's theme palette, input overlay, headless driver |
| `src/agentplane.mjs`, `src/promptplane.mjs` | the ONE plane every surface composes before `Harness.open` (pi's settings, providers, packages, context files) and pi's input expansion (templates, skill commands) |
| `src/settings.mjs`, `src/providers.mjs`, `src/spend.mjs` | settings/policy resolution, model plane, money ledger |
| `src/toolsurface.mjs`, `src/executionenv.mjs` | tool guardrails, custom tools, and the execution environment |
| `src/packages/` | pi package discovery, pi's own loader, the extension shim, the capability matrix |
| `demo/` | the offline demo suite (no keys, no network); `*-interactive`/`*-writer`/`*-reader` are fixtures |
| `scripts/` | `suite.mjs` (demos + audits), `sync-pi.mjs`, `render-matrix.mjs`, the three audits |
| `docs/` | capability matrix, attach semantics, provenance table |

## Provenance

Every source file carries a header naming the Durian-Pi file it was extracted from — and what was
changed or omitted — or saying outright that there is no Durian-Pi original. `scripts/audit-provenance.mjs`
checks that claim against the tree (`PROVENANCE PASS: 97/97 source files carry a header`), and
`docs/provenance.md` is that audit's output: a table of file → source → what changed, so the extraction is
re-derivable rather than a paragraph of prose.

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
