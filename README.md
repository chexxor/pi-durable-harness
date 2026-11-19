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
node cli.mjs --tui                          # pi's ROW surface instead of the window (`--row-view` spells it out)
node demo/tui-interactive.mjs --store harness.sqlite --writer-socket <the owner's socket>  # a viewer of someone else's session
```

That rule is proved against a REAL terminal, not only a pipe: `demo/tty.test.mjs` allocates a pty
(python3's stdlib `pty` module — Node has no pty primitive, and the harness code under test never sees
python), runs `node cli.mjs` inside it with no prompt and no `--mode`, and asserts the window answered the
typed line, painted pi's theme, committed the line exactly once on the store it owned, quit on a bare
`quit` line, and that the SAME command with piped stdin chooses print instead. Its store is seeded with one
SETTLED turn through the ordinary print path first — pi's footer prints one word per non-zero committed
total, so the words pi draws under the allocated pty are pi-durable's numbers — and the demo checks those
words (`↓` tokens, `R`/`W` cache, `CH…%`, `x.x%/128k`) and pi's `pwd (branch)` row in the painted stream, at
the repo cwd, while the ownership lock stays beside the store in the temp dir. The demo also drives the
command the README actually tells a terminal user to type — `npm run cli -- --store ... --cwd ...`, npm's
documented pass-through form — and asserts that run opens the same window, paints pi's theme, and commits
the typed line exactly once on the store IT owned. The pty is a kernel object, not a socket, so the demo
stays inside the offline proof.

What that window paints is pi's own UI, not a harness drawing: pi-tui's `TuiAltScreen` carries a `ScrollView`
over the transcript document, pi's message components (`UserMessageComponent`, `AssistantMessageComponent`,
`ToolExecutionComponent` redrawn through `updateArgs`/`updateResult`, `CompactionSummaryMessageComponent`,
`SkillInvocationMessageComponent`, `CustomMessageComponent`) draw pi-durable's committed entries one per
entry, pi's `CustomEditor` over pi-tui's `KeybindingsManager` is the input dock, and pi's `FooterComponent`
prints pwd · branch · tokens · cache · cost · context%/contextWindow · model · thinking from pi-durable's
committed numbers: pi's own totals read pi's entry SHAPES, which are not pi-durable's EntryRecords, so the
entries travel through `piSessionEntriesOf` (a read-only shape mapper — pi-durable's numbers are unchanged),
pi prints ONE WORD PER NON-ZERO committed total (`↓`/`↑` tokens, `R`/`W` cache, `CH…%` cache-hit rate,
`x.x%/contextWindow`, `$cost`), and this repo's offline faux plane commits `input` and `cost` as 0 — which
is why pi draws neither the `↑` nor the `$` word there — while the branch comes from `piGitBranchOf(cwd)`
and no `(auto)` marker appears while pi's settings say compaction is off. Its startup header is pi's exported pieces — pi's `CURRENT_SESSION_VERSION` inside a
pi-tui `Box` and pi's `keyHint` lines over pi-tui's keybinding names — and then says, in pi's own palette,
what this run actually is: `pi-durable session (this harness's node-sqlite store, not a pi session)`, and
the database this session reads and writes as a URL — `file:///…/run.sqlite (node-sqlite)`, spelled with
node:url's `pathToFileURL` over the same resolved path pi-durable's ONE storage opener was handed, so the
line names the store THIS invocation opened rather than a path a reader guesses, and pi-durable's own
session marker keeps it visibly distinct from pi's own sessions (which are JSONL files under a session dir).
A `--no-session` run says its state is in memory instead of pointing at a file it never wrote. The row
surface — pi-tui's `TuiMainScreen` painting the frames the headless fixtures assert — stays reachable
through `--tui`/`--row-view`. `demo/piscreen.test.mjs` (46 checks) proves the viewport, its clipping, pi's
`Spacer` placement and pi's components against pi-tui's own painted bytes; `demo/pieditor.test.mjs` (38 checks)
proves the typed draft reaches pi's `onSubmit`, that pi's footer words are drawn from pi-durable's committed
usage in that paint, and that the painted header carries the marker while one painted row carries the URL of
the store the test claimed; `demo/tty.test.mjs` (21 checks) asserts both lines, pi's `pwd (branch)` footer row
and pi's committed-total footer words, inside a real allocated pty.

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

### Who answers a run, and what a typed `/` means

A run that names NO model resolves pi's settings default (`defaultProvider` + `defaultModel` in pi's
`settings.json`, merged by pi's own `SettingsManager`) through pi's provider plane and REALLY calls that
provider — the credential comes from pi's own auth plane at pi's `agentDir`, and a plain `npm run cli`
in a terminal answers from it. pi-ai's faux plane is armed ONLY when `--faux` is spelled, so `--faux`
stays the explicit offline/demo flag rather than a fallback a run performs behind its user's back, and
the faux warning on stderr appears ONLY on a run that did not ask for a real model — never on a plain one.
Nothing is guessed: a run that asks for a real model while pi's settings name no default says so.
`demo/modeldefault.test.mjs` (23 checks, offline) measures the pair end to end — the plane's `modelRef`,
the agent record the Harness opens with, pi's `ModelRegistry.hasConfiguredAuth` for that model, and the
same pair as pi's screen paints it in its header (`model <provider>/<id>`) and its footer
(`(<provider>) <id>`) — on a `/quit`-only feed that admits NOTHING, which is why the demo stays in the
offline suite; the proof that the settings model really answered is the live pty run captured in
`.ai-work/pi-cli-parity-goal/proof-live-pty.json`.

Slash commands are dispatched at pi's OWN dock — pi-tui's `CustomEditor`, the component pi's interactive
layer mounts — by pi's OWN rule, read off the pinned dist by `src/slashplane.mjs` rather than remembered:
pi's builtin slash table, pi's EXACT-vs-`/name <args>` match rule, pi's built-in extension registrations,
and pi's `!`/`!!` bash rule. A draft pi-durable has state for runs on pi-durable's ONE command handler:
`/new`, `/model <ref>`, `/thinking <level>`, `/compact`, `/session`, `/copy`, `/tree`, `/clone`, and
`!cmd` / `!!cmd` through rpc.mjs' `bash` verb. A draft it has no plane for is refused BY NAME in pi's own
words — `/settings`, `/export`, `/fork` (pi matches it EXACTLY only and opens its own message selector,
so `/fork 2` is pi's ordinary message), pi's built-in extension commands `/llama` and `/mcp`, and `/model`
or `/thinking` spelled with no argument rather than a guessed one. `/quit` leaves through the ordinary
cleanup (the Harness closes and the writer lock is released) and is NEVER counted as a submitted
admission, while a whole typed line of `quit` still leaves through pi-durable's own quit-word rule; pi's
commands this harness does not take are listed by `/help` rather than hidden. `demo/slash.test.mjs` (30
checks) measures every one of those decisions at the dock, including what happens to the typed draft when the
command is refused, and the capability matrix names each of them.

## pi-durable vs pi

The pi package ecosystem is reused through pi's own library exports, and every capability pi has that
pi-durable does not is **named** rather than quietly dropped: [docs/package-support.md](docs/package-support.md)
is generated from `src/packages/matrix.mjs` by `scripts/render-matrix.mjs` — 138 rows
(21 native / 51 shimmed / 66 unsupported), evidence per row, plus the packages actually installed on
this machine and what loaded from them. `src/packages/loader.mjs` uses pi's `DefaultResourceLoader`,
`discoverAndLoadExtensions` and `loadProjectContextFiles`; `src/packages/adapter.mjs` maps pi's
`registerTool`, `tool_call`/`tool_result`/provider/compaction handlers, skills, prompts, themes and
context files onto pi-durable's `defineExtension`/`defineTool`/`hook`/`section`/`wrapTool` — a pi extension that registers a tool name the harness already offers becomes pi-durable's `wraps` slot (pi's `wrapRegisteredTool` case), so pi's argument repair and log line run AROUND pi-durable's own tool rather than beside it: `demo/packages.test.mjs` proves the wrapped `bash` ran exactly once (a marker file gained one line) and that pi's own execute never replaced the worker.
`demo/packages.test.mjs` (51 checks) proves the shim runs end to end on a fixture package and on the
four real pi packages installed here. `scripts/audit-pi-docs.mjs` re-reads pi's OWN docs inside the
pinned package — all fifteen that enumerate a surface this harness claims: packages.md, extensions.md,
rpc.md AND rpc-commands.md (pi's RPC verb list — 36 caps at this pin, 23 verbs answered on pi-durable planes
and 9 refused BY NAME), json.md (pi's event records), message-types.md (pi-ai's
message types), tui.md (pi-tui's components), rpc-extension-ui.md (pi's extension dialogs), session-format.md
(pi's session-file entry types), cli.md, sessions.md, compaction.md and slash-commands.md (pi's slash-command
table), keybindings.md (pi's named keybinding actions) and configuration.md (pi's configuration paths) — harvests the 443 capabilities they enumerate, and fails if any is named by neither a matrix row's `names` array nor by a call in harness code
with its comments stripped: `src/packages/matrix.mjs` is kept OUT of that code corpus, so the matrix cannot
vouch for itself, and a documented flag counts as taken only when a file that actually parses `argv` spells
that literal. What that audit forces into the open is pi's whole extension surface (its `ExtensionContext`
accessors and actions, its `ExtensionAPI` methods — `sendMessage`, `setModel`, `getActiveTools`,
`registerMcpServer`, `getSettings`, …), its Custom UI class (the `ctx.ui` dialogs, the in-TUI editor and
autocomplete, the renderer/theme knobs, pi-tui's dialog components, and the `extension_ui_request`/
`extension_ui_response` subprotocol), pi's RPC verb list (answered on pi-durable's planes, or refused by
name), pi-ai's message types, pi's session-file entry types, and pi's CLI verbs this harness does not take
(the 20 spellings pi's own `dist/cli/args.js` `Options:` block names and this harness has no plane for —
`--api-key`, `--session-id`, `--session-dir`, `--fork`, `--name`/`-n`, `--models`, `--no-builtin-tools`/`-nbt`,
`--no-mcp`, `--theme`/`--use-theme`, `--export`, `--verbose`, `--tui-mode`, `--approve`/`-a`,
`--no-approve`/`-na`, `--offline` — each refused BY NAME at the flag parser in pi's own help words, while
pi's `-v/-h/-p/-c/-r`, `--no-session`, `--faux`, `--model`, `--provider`, `--thinking`, pi's tool verbs,
pi's resource-path verbs (`--extension`/`-e`, `--skill`, `--prompt-template`) and pi's `--list-models [search]`
are honoured). `src/piflags.mjs` derives that flag table from pi's pinned `dist/cli/args.js` and THROWS if
pi's `Options:` block or one of pi's core spellings vanishes, so a flag pi adds at a later pin becomes a
refusal by name rather than a swallowed message) — every one named as native,
shimmed or unsupported with a reason a reader can check against the tree, none silently dropped.

## Pi parity — what is honoured, and what is refused BY NAME

[docs/parity-sweep.md](docs/parity-sweep.md) is the committed summary of the divergence sweep against pi's
own pinned docs; the full per-section walk with evidence lines sits in `.ai-work/pi-tui-parity-goal/pi-parity-sweep.md`
(gitignored state, same numbers). Seven docs carry the surfaces the reported symptoms live on — `tui.md`,
`keybindings.md`, `slash-commands.md`, `cli.md`, `sessions.md`, `compaction.md`, `configuration.md` — and their
**228 harvested caps** are claimed by **43 of the 138 matrix rows**: 60 native, 45 shimmed, 112 refused BY NAME,
11 covered by harness code only (a file that actually parses `argv` spells the flag, so no row need restate the parser).
The sweep is measured, not remembered: `scripts/audit-pi-docs.mjs` re-reads pi's docs every run and FAILS on any cap
neither a row's `names` nor harness code covers, so a capability pi gains at a later pin becomes a finding rather than
a swallowed verb.

Honoured — pi's OWN components, mounted rather than reimplemented:

* the pi-style screen IS pi-tui's `TuiAltScreen` over pi's `ProcessTerminal`, with pi's `ScrollView`/`VStack`/`Spacer`
  composition and pi's theme palette only — pi's fullscreen keybinding actions (all 14, `previousPrompt`, `search`,
  `top`, `bottom`, …) are pi's, and pi's `CustomEditor` + `KeybindingsManager` + `TUI_KEYBINDINGS` are the input dock,
  so pi's key TABLE decides what a keystroke means (47 `tui.*` ids bound, pi's own key words read off pi's pinned dist);
* a typed prompt is answered and painted: the admission goes through pi-durable's ONE writer, and a run that names no
  model resolves pi's `settings.json` default through pi's provider plane and REALLY calls it — pi-ai's faux plane is
  armed ONLY under the explicit `--faux` flag, never as a fallback behind the user's back;
* `/model` lists pi's candidates through `get_available_models` and `/model <ref>` switches the model THIS run answers
  with (header `model <provider>/<id>` and footer repaint, proven by the NEXT answer); pi's `settings.json` default is
  NOT rewritten without an explicit ask;
* typing `/` at the dock gives pi's OWN autocomplete dropdown — pi's `CombinedAutocompleteProvider` + `fuzzyFilter`
  installed through pi's PUBLIC `Editor.setAutocompleteProvider`, pi's slash-trigger rule in pi's `Editor.handleInput`,
  pi's visible count from pi's `SettingsManager.getAutocompleteMaxVisible()` — fed with pi's own data (the builtin slash
  table, discovered prompt templates, `skill:` rows, package extension commands, and the `model`/`thinking` argument
  menus); pi's `(1/9)` counter and ENTER reaching pi's completion are measured in `demo/autocomplete.test.mjs`;
* up-arrow recalls the last prompt typed, at BOTH surfaces: pi's `tui.editor.cursorUp` at the pi-style screen resubmits
  it through pi's PUBLIC `Editor.addToHistory` — seeded from committed `pi.user` rows, because pi offers no history
  constructor option at this pin — and `shimmed :: pi's prompt-history recall at the harness's OWN row overlay` covers
  `--tui`/`--row-view`.

The four surfaces reported THIS round are the RENDERING of that screen — scrolling, the harness's own status lines,
the dock's hint rows, and what a refusal does to the typed draft. Each is a matrix decision that names the pi
component pi's own code runs, and nothing here reimplements one:

* **scrolling stays exactly where pi's alt-screen keys put it**: pi's `ScrollView` keeps its own scroll state
  (`followingEnd`/`currentScrollTop`/`transientScrollbarVisible`) inside the ONE container pi-tui's `TuiAltScreen`
  composes, and pi's own class matches the 14 `tui.altScreen.*` ids through pi's GLOBAL `getKeybindings()` registry,
  so the harness never re-binds them — pi's `pageUp` leaves the transcript WHERE it was scrolled (the same painted rows
  persist across the following changed frames, no snap to the bottom), `pageDown` pages back, pi's `ctrl+home` lands on
  the document TOP and pi's `ctrl+end` lands on the document END with pi's transient `┃` scrollbar thumb; pi's follow-end
  engages ONLY once the view sits at that end, so a commit typed while the view is scrolled up stays OFF screen and the
  same commit typed after pi's `ctrl+end` lands ON screen. pi binds NO default key for `lineUp`/`lineDown`/`halfPageUp`/`halfPageDown`
  at this pin (pi's table carries `defaultKeys` [] and `getKeys` answers []), pi's `search` keystroke answers no id at
  this dock for any byte form tried here, and nothing here invents a key or binds an unbound action.
* **the harness's own status/metadata lines become their OWN WRAPPED rows in pi's transcript region while the window is
  open** — `src/tui/pidockloop.mjs`' `notes`/`say` hand every such line to pi's `piNoteRows` (`src/tui/piscreen.mjs`), one
  pi `Text` per line, so pi's width handling does ALL the splitting: pi's exported `wrapTextWithAnsi` (pi-tui `dist/utils.d.ts:56`)
  plus pi's `wrapSingleLine`/`breakLongWord` (`dist/components/text.js` breaks a token longer than the width character by
  character). The ack triple `submitted: requestId=… submissionId=… status=…`, a `model: set_model: …` line and a refusal
  line each take as many rows as pi's width handling needs and NO painted row is wider than the terminal, while pi's bordered
  dock/draft rows stay whole. Raw stderr writes stay ONLY for runs with no window open (print/JSON/RPC/headless) — measured
  byte-for-byte against the same run before the change. pi's animated indicators (`IdleStatus`, `WorkingStatusIndicator`,
  `setWorkingIndicator`, `setEditorWorkingStatusIndicator`, `isEmbeddedStatus`) and pi's `ProgramStatusReporter` stay
  refused BY NAME: this screen draws pi-durable's `LiveState` as pi `Text` rows instead.
* **the dock's hint rows say pi's own `keyHint` words, and only for actions this dock actually handles**: the ctrl+k ACTION
  was already pi's — pi-coding-agent's `CustomEditor extends Editor`, so pi-tui's own Editor branch
  `if (kb.matches(data, "tui.editor.deleteToLineEnd")) this.deleteToEndOfLine();` (`dist/components/editor.js:661-662`) runs,
  and its body (`:1393`) deletes `currentLine.slice(this.state.cursorCol)` — CARET to END OF LINE, leaving the words before
  the caret ALONE. What was wrong was pi-durable's LABEL `ctrl+k to clear the draft`, which named neither pi's words nor a
  true action; pi's own dock hint line is `keyHint("tui.editor.deleteToLineEnd", "to delete to end")`
  (`dist/modes/interactive/interactive-mode.js:766`) and pi's `docs/keybindings.md:79` spells the same id `Delete to line end`.
  `src/tui/piscreen.mjs` now carries `piDockHints` as the list of actions this dock handles, and `piStatusRows` paints a hint
  row ONLY when pi's exported `keyText(word)` answers a non-empty key — an action pi binds no key to contributes NO row
  rather than a false hint.
* **a refusal BY NAME wraps into as many screen rows as pi's width handling needs, and the typed command STAYS in the dock**:
  for a decision pi-durable RAN (`ran`) or acted on (`quit`) pi's clear-the-draft rule (`clearEditor()`) still runs; for a
  refusal the typed draft is handed BACK to pi's Editor through pi's PUBLIC `setText` (pi-tui `dist/components/editor.js:928`),
  because pi-tui's own `submitValue()` (`:1145`) empties the state BEFORE `onSubmit` runs and pi's OWN precedent for a command
  it could not run is to keep the typed text — pi's `showWarning("A bash command is already running…"); this.editor.setText(text);`
  (`interactive-mode.js:2798-2799`) and pi's `showExtensionCustom` save-and-restore (`:2415`/`:2427`). pi's own Esc rule then
  clears a kept draft, which is what a human uses to drop one. The refusal WORDING is unchanged pi-durable wording, split only
  by pi's wrapping (measured at a 44×26 pty: `/goal keep going` paints over 7 rows and still sits BETWEEN pi's dock borders;
  the longer command is wrapped by pi's Editor itself into a TWO-ROW dock draft, and the store gains NO `pi.user` row for
  either, so the refusal never reaches `submitDraft` and `writerSubmit` stays the ONE mutation line; re-measured at a 52×26
  pty by `demo/renderparity.test.mjs`, where the SAME refusal words occupy 6 rows of at most 52 characters on this screen
  against ONE 262-character row on the tree at `checkpoint-pi-tui-parity`).

Refused BY NAME — pi has them, pi-durable has no plane for them at this pin, and the refusal prints pi's own words:
pi's selector dialogs and their keybindings (`/settings`, `/scoped-models`, `app.model.select`, `app.models.*`,
`app.thinking.*`), pi's session picker and tree navigator (`app.session.*`, `app.tree.*`, `/resume`, `/name`, `/import`,
`--fork`, `--name`, pi's session-file addressing via `--session-id`/`--session-dir` — pi-durable keeps ONE store per
directory, so `--session-dir` is refused rather than guessed at a second store), pi's `/fork` (pi matches it EXACTLY
only and opens its own message selector, so `/fork 2` is pi's ordinary message), pi's built-in extension commands
`/llama` and `/mcp`, `/export` `/share` `/bug` `/trust` `/reload` `/hotkeys` `/changelog`, pi's credential and OAuth
commands (`--api-key`, `--approve`/`-a`, `--no-approve`/`-na`, `--credentials`, pi's `--oauth-*`), pi's MCP plane,
pi's `Image`/`Markdown`/`SelectList`/`SettingsList`/`Loader`/`CancellableLoader`/`MouseRegion` components, pi's
`Input`/`Editor`/`Focusable` and the whole `ctx.ui` extension-UI subprotocol (`extension_ui_request`/`extension_ui_response`
— an extension that calls it throws loudly rather than hanging on a dialog nothing renders), pi's `BranchSummaryEntry`
branch summarization, pi's `<agent-dir>/keybindings.json`, `SYSTEM.md` and `APPEND_SYSTEM.md` paths, and pi's
selection-copy keybinding (`ctrl+c` at the dock is pi's clear/exit key, never copy).

How each of those claims is checked: one committed offline demo per fixed surface — FIVE of them (`autocomplete`, `recall`,
`keybindings`, `pieditor`, `renderparity`) drive a REAL pty through `scripts/ptydrive.mjs`, pi's own python3-stdlib pty helper, one
keystroke per write, `demo/tty.test.mjs` allocates its own python3 pty inline for the row surface, and the rest
(`piscreen`, `slash`, `modeldefault`) drive the same code paths in-process — asserting
against pi-tui's painted bytes read back through pi's PUBLIC `Terminal` interface with pi's own
`stripTerminalSequences`, not against this harness's notion of what it drew. `demo/renderparity.test.mjs` (33 checks) is the
RENDERING plane of the pi-style screen, and it measures the SAME 14-keystroke script TWICE at a 52×26 pty — once on this
screen, once on the tree at the tag `checkpoint-pi-tui-parity` (extracted with `git archive`, the pinned pi
symlinked in), i.e. the screen exactly as it was BEFORE this goal touched it — rebuilding the visible rows after every
pi-tui frame end from the painted bytes. Both captures are read in ONE run, so each of the ELEVEN screen rules this goal
fixed (pageUp staying put instead of snapping back, the view staying put through the next prompt, follow-end engaging only
at the bottom, `ctrl+end` actually repainting, ack rows never inside the dock, an ack line owning its own wrapped rows,
no harness row wider than the terminal, the dock hint row equal to pi's own `keyHint` output, pi-durable's stale
`to clear the draft` label appearing nowhere, a refused command keeping its text IN the dock, one refusal spanning many
rows) is recorded PASSING on this screen and FAILING on the tagged one — 22 discriminating checks — while the seven rules
that must NOT have changed (pi's Box borders whole in every frame, pi's Esc still clearing a kept draft, the refusal still
BY NAME, the ack identity triple still spelling `requestId=`/`submissionId=`, both runs answering all 14 keystrokes,
the SAME 7 `pi.user` store rows and no `/goal` row on either tree, and the refusal wording byte-identical once spaces
are stripped) are recorded holding on BOTH. `node scripts/suite.mjs` runs the lot
offline (no keys, no network) and reports fail=0; the one proof that needs the network is marked as such in
`.ai-work/` rather than blended into the offline suite.

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
| `demo/` | the offline demo suite (no keys, no network); `*-interactive`/`*-writer`/`*-reader` are fixtures; `tty`/`autocomplete`/`recall`/`keybindings`/`pieditor`/`renderparity`/`piscreen`/`slash`/`modeldefault` are the per-surface parity demos — `autocomplete`/`recall`/`keybindings`/`pieditor`/`renderparity` drive a real pty through `scripts/ptydrive.mjs` (`renderparity` drives the SAME script twice, on this tree and on the tree at `checkpoint-pi-tui-parity`), `tty` allocates its own python3 pty inline, the rest run in-process |
| `scripts/` | `suite.mjs` (demos + audits), `sync-pi.mjs`, `render-matrix.mjs`, `ptydrive.mjs` (the committed pty driver every TUI proof runs through), the three audits |
| `docs/` | capability matrix, the pi-parity sweep, attach semantics, provenance table, execution protocol |

## Provenance

Every source file carries a header naming the Durian-Pi file it was extracted from — and what was
changed or omitted — or saying outright that there is no Durian-Pi original. `scripts/audit-provenance.mjs`
checks that claim against the tree (`PROVENANCE PASS: 125/125 source files carry a header`), and
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
