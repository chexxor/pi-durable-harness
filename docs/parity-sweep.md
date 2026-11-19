# Pi parity sweep — what this harness honours from pi, and what it refuses BY NAME

This is the committed summary of the divergence sweep; the full per-section walk, with the evidence lines,
is `.ai-work/pi-tui-parity-goal/pi-parity-sweep.md` (gitignored state, same numbers). Nothing on this page is
remembered: every count below is re-measurable by the commands at the bottom, at
`git rev-parse HEAD` = the commit this page was written on, pin `v1.5.1` / sha
`dd30101cfc5b0609411dd80b6f93adbc14db14cf`, no pin bump, no new dependency.

Status words, identical in the matrix, in `docs/package-support.md`, and here:

* **native** — pi's own component/code serves it here unchanged; this harness only mounts it.
* **shimmed** — honoured, but through pi's exports with a mapping this harness writes.
* **unsupported** — refused BY NAME: the refusal prints pi's own words for the capability, and the matrix row
  says why. Nothing pi has is swallowed, guessed, or silently dropped.

## What the sweep measured

* pi's pinned docs inside the installed package (`node_modules/@earendil-works/pi-coding-agent/docs/`) are the
  authority, not pi's marketing copy. **15** of them enumerate a surface this harness claims; the sweep walked
  the **7** that describe the surfaces the reported symptoms live on — `tui.md`, `keybindings.md`,
  `slash-commands.md`, `cli.md`, `sessions.md`, `compaction.md`, `configuration.md` — and the audit walks all 15.
* Those 7 docs hold **228 harvested caps**, claimed by **43 distinct matrix rows** out of 139
  (46 doc-level mentions − 3 rows claimed by two docs). Reconciled with EXACT `names` matching:
  **60 native / 45 shimmed / 112 unsupported / 11 covered by harness code only** (no row names them — listed below).
* All 15 docs, all caps: **443 capabilities over 139 rows (51 shimmed / 66 unsupported / 22 native)**, every doc at
  100 %: tui.md 18/18 · keybindings.md 90/90 · configuration.md 20/20 · slash-commands.md 27/27 · cli.md 64/64 ·
  sessions.md 7/7 · compaction.md 2/2 · packages.md 3/3 · extensions.md 130/130 · rpc.md 7/7 · rpc-commands.md 36/36 ·
  json.md 1/1 · message-types.md 13/13 · rpc-extension-ui.md 9/9 · session-format.md 16/16 — sums to 443.
* `docs/package-support.md` is the rendered view of the SAME rows and is **GENERATED ONLY** by
  `node scripts/render-matrix.mjs > docs/package-support.md`. It is never hand-edited, so the table cannot drift
  from `src/packages/matrix.mjs` — edit the data, not the doc.

## The seven docs, section by section

Each line is `pi's own heading (caps) :: row status :: row capability :: the caps under that heading`.

### tui.md — 18/18 caps

| pi's heading | caps | row |
| --- | --- | --- |
| Compose built-in components | 13 | **native** `pi-tui components this harness composes` (2: `TruncatedText` `Container`) · **native** `pi-tui's fullscreen screen and layout pieces (pi's window, not pi's row print)` (3: `VStack` `Spacer` `ScrollView`) · **REFUSED BY NAME** `pi-tui's dialogs and layout pieces this harness does not compose (the window uses the rows above)` (8: `Markdown` `Image` `HStack` `SelectList` `SettingsList` `Loader` `CancellableLoader` `MouseRegion`) |
| Handle keyboard input and focus | 2 | **native** `pi's in-TUI editor as the input dock` (2: `KeybindingsManager` `CustomEditor`) |
| Build a minimal custom screen | 3 | **REFUSED BY NAME** the dialogs row again (3: `Input` `Editor` `Focusable`) — pi's `ctx.ui` lifecycle belongs to the extension-UI plane, which is refused by name; a bridged extension that calls `ctx.ui` throws rather than hanging on a dialog nothing renders |

### keybindings.md — 90/90 caps

| pi's heading | caps | row |
| --- | --- | --- |
| Assign keybindings · Key syntax | 0 | pi's `<agent-dir>/keybindings.json` and its key syntax are measured where used, not here: `src/tui/pidockloop.mjs` never feeds pi's `userBindings` slot, and that absence is named in the `configuration.md` walk below |
| Cursor movement | 14 | **native** `pi's editor keybinding actions at pi's own dock` (12) · **shimmed** `pi's prompt-history recall at the harness's OWN row overlay (the row surface is this harness's input machine, not pi's Editor)` (2: `tui.editor.cursorUp` `tui.editor.cursorDown`) |
| Text editing | 9 | **native** the dock row (9: `deleteCharBackward` `deleteCharForward` `deleteWordBackward` `deleteWordForward` `deleteToLineStart` `deleteToLineEnd` `yank` `yankPop` `undo`) |
| Input and selection | 10 | **native** `pi's input keybinding actions at pi's own dock (newline, submit, autocomplete trigger)` (3: `tui.input.newLine` `tui.input.submit` `tui.input.tab`) · **REFUSED BY NAME** `pi's selection-copy keybinding (ctrl+c at the dock is pi's clear/exit key, not copy)` (1: `tui.input.copy`) · **REFUSED BY NAME** `pi's select-list keybinding actions (no select list is composed here)` (6: `tui.select.up` `.down` `.pageUp` `.pageDown` `.confirm` `.cancel`) |
| Fullscreen | 14 | **native** `pi's alt-screen keybinding actions (pi's fullscreen viewport, which IS this harness's pi-style screen)` (all 14, including `previousPrompt` `nextPrompt` `search` `searchNext` `searchPrevious` `searchClose` `top` `bottom`) |
| Application | 6 | **shimmed** `pi's app-key defaults for the dock (the keystrokes that cancel, clear and exit)` (3: `app.interrupt` `app.clear` `app.exit`) · **REFUSED BY NAME** `pi's message/tree/tools/clipboard/external-editor/suspend keybindings (no carrier at this dock)` (3: `app.suspend` `app.editor.external` `app.clipboard.pasteImage`) |
| Sessions | 10 | **REFUSED BY NAME** `pi's session-picker and tree-navigator keybindings (no pi session picker or tree navigator is composed here)` (10: `app.session.new` `.tree` `.fork` `.resume` `.togglePath` `.toggleSort` `.toggleNamedFilter` `.rename` `.delete` `.deleteNoninvasive`) |
| Models and Thinking | 7 | **REFUSED BY NAME** `pi's model/model-list/thinking keybindings (the selector dialogs they open are refused elsewhere)` (7: `app.model.select` `.cycleForward` `.cycleBackward` `app.models.save` `app.thinking.cycle` `.save` `.toggle`) |
| Display and Message Queue | 4 | **REFUSED BY NAME** the message/tree/tools/… row (4: `app.tools.expand` `app.message.copy` `.followUp` `.dequeue`) |
| Tree Navigation | 11 | **REFUSED BY NAME** the session-picker/tree-navigator row (11: `app.tree.foldOrUp` `.unfoldOrDown` `.editLabel` `.toggleLabelTimestamp` `.filter.default` `.filter.noTools` `.filter.userOnly` `.filter.labeledOnly` `.filter.all` `.filter.cycleForward` `.filter.cycleBackward`) |
| Scoped Models Selector | 5 | **REFUSED BY NAME** the model/model-list/thinking row (5: `app.models.enableAll` `.clearAll` `.toggleProvider` `.reorderUp` `.reorderDown`) |

### slash-commands.md — 27/27 caps

| pi's heading | caps | row |
| --- | --- | --- |
| Models and settings | 7 | **shimmed** `pi's slash commands dispatched at pi's own dock, honoured where pi-durable has state` (2: `/model` `/thinking`) · **REFUSED BY NAME** `pi's built-in slash commands this harness cannot honour, refused BY NAME in pi's own words` (4: `/settings` `/scoped-models` `/login` `/logout`) · **REFUSED BY NAME** `pi's built-in EXTENSION slash commands (registered by pi's own built-in extensions)` (1: `/llama`) |
| Sessions and context | 9 | **shimmed** the dock row (5: `/new` `/session` `/tree` `/clone` `/compact`) · **REFUSED BY NAME** the built-in row (3: `/resume` `/name` `/import`) · **REFUSED BY NAME** `pi's /fork is refused BY NAME: pi's dock matches it EXACTLY only and opens its own selector` (1: `/fork`, so `/fork 2` is pi's ordinary message) |
| Export and share | 4 | **shimmed** the dock row (1: `/copy`) · **REFUSED BY NAME** the built-in row (3: `/export` `/share` `/bug`) |
| Runtime and project | 6 | **native** `pi's /quit leaves the session through the ordinary cleanup` (1: `/quit`) · **REFUSED BY NAME** the built-in row (4: `/trust` `/reload` `/hotkeys` `/changelog`) · **REFUSED BY NAME** the extension row (1: `/mcp`) |
| Commands added by resources | 1 | **shimmed** `pi's unknown \`/name\` and pi's template/skill command names keep pi's Normal message submission` (1: `/skill:name`) |

### cli.md — 64/64 caps

| pi's heading | caps | row |
| --- | --- | --- |
| Invocation and output | 2 | harness code only (1: `--print`) · **REFUSED BY NAME** `pi's session export verb` (1: `--export`) |
| Models | 4 | harness code only (1: `--thinking`) · **shimmed** `the model a run answers with, and pi-ai's faux plane beside it` (1: `--provider`) · **shimmed** `model listing` (1: `--list-models`) · **REFUSED BY NAME** `credential and OAuth commands` (1: `--api-key`) |
| Sessions | 8 | **shimmed** `session identity flags` (5: `--continue` `--resume` `--session-id` `--session-dir` `--no-session`) · harness code only (1: `--session`) · **REFUSED BY NAME** `pi's fork-at-invocation flag` (1: `--fork`) · **REFUSED BY NAME** `pi's session metadata verbs (and pi's --name at invocation)` (1: `--name`) |
| Tools · Enable codemode · How codemode works · Tool search | 4 (+0 +0) | harness code only (3: `--tools` `--exclude-tools` `--no-tools`) · **REFUSED BY NAME** `built-in extension and MCP opt-out` (2: `--no-builtin-tools` `--no-mcp`) |
| Resources | 9 | **shimmed** `per-resource opt-out flags` (5: `--no-extensions` `--no-skills` `--no-prompt-templates` `--no-themes` `--no-context-files`) · **shimmed** `pi's explicit resource paths at invocation (--extension/-e, --skill, --prompt-template; --theme refused)` (2: `--skill` `--theme`) · **REFUSED BY NAME** `prompt template at invocation (--prompt-template)` (1: `--prompt-template`) · **shimmed** `theme at invocation (--use-theme)` (1: `--use-theme`) |
| Prompts and process | 6 | harness code only (2: `--append-system-prompt` `--system-prompt`) · **shimmed** `pi's own rendering and version flags` (3: `--tui-mode` `--verbose` `--version`) · **shimmed** `pi's offline mode` (1: `--offline`) |
| Common tasks · Update Pi or packages · Aliases and command options | 12 | **shimmed** `pi's structured-output flag (--json)` (1: `--mode`) · **shimmed** the model row (1: `--model`) · **shimmed** model listing (1: `--models`) · **REFUSED BY NAME** `package install` (3: `--extension` `--local` `--extensions`) · **shimmed** `pi's own package update verbs` (2: `--all` `--force`; plus `--self` from Aliases) · **shimmed** the rendering row (1: `--no-refresh`) · **REFUSED BY NAME** `credential and OAuth commands` (2: `--approve` `--no-approve`) |
| Credential commands | 5 | **shimmed** the `--json` row (1: `--json`) · **REFUSED BY NAME** `pi's credential check surface` (1: `--credentials`) · **REFUSED BY NAME** `credential and OAuth commands` (3: `--no-browser` `--min-expiry` + the pair above) |
| MCP commands | 13 | **REFUSED BY NAME** `pi's MCP plane (and pi's mcp add/login options)` (5: `--env` `--url` `--header` `--timeout` `--description`) · **REFUSED BY NAME** `credential and OAuth commands` (7: `--bearer-token-env-var` `--oauth-*` `--exposure`) · harness code only (1: `--cwd`) |

### sessions.md — 7/7 caps

Continue or switch sessions (6): **shimmed** `session identity flags` (3) · harness code only (1: `--session`) · **REFUSED BY NAME** `pi's fork-at-invocation flag` (1) · **REFUSED BY NAME** `pi's session metadata verbs (and pi's --name at invocation)` (1). Control session storage (1): **shimmed** the same flags row. Pi's prose sections — Choose how to branch, Manage conversation context, Export or share a session, Report a bug — harvest 0 caps; `/tree` `/fork` `/clone` are walked under `slash-commands.md`, compaction under `compaction.md`.

### compaction.md — 2/2 caps harvested (the harvest limit is measured)

How It Works (2): **native** `compaction` (1: `CompactionEntry`) · **REFUSED BY NAME** `branch summarization` (1: `BranchSummaryEntry`). pi documents its compaction settings keys (`enabled` true, `reserveTokens` 16384, `keepRecentTokens` 20000) UNBACKTICKED inside a json block, so the audit gate harvested nothing for them; measured against pi-durable's `DEFAULT_COMPACTION_POLICY` those two documented numbers match exactly (`backgroundTokens` 32768 is pi-durable's own addition), and `src/settings.mjs` maps `enabled`/`reserveTokens`/`keepRecentTokens`/`modelOverrides` while reporting any other key as unmapped. Every other compaction heading (When It Triggers, Overflow and Length Recovery Ordering, Split user-message spans, Cut Point Rules, CompactionEntry Structure, Branch Summarization, Summary Format, Custom Summarization via Extensions, Settings, Per-model overrides) yields 0 caps because pi writes that surface as prose and json blocks rather than named components.

### configuration.md — 20/20 caps

Agent directory (12): **native** `the configuration files pi's own library plane reads for this run` (8: `<agent-dir>/settings.json` `models.json` `auth.json` `AGENTS.override.md` `extensions/` `skills/` `prompts/` `themes/`) · **REFUSED BY NAME** `the configuration paths pi's own plane reads but this harness does not` (4: `<agent-dir>/keybindings.json` `mcp.json` `SYSTEM.md` `APPEND_SYSTEM.md`). Project `.pi` directory (8): the same two rows (5 native: `settings.json` `extensions/` `skills/` `prompts/` `themes/` · 3 refused: `mcp.json` `SYSTEM.md` `APPEND_SYSTEM.md`). Context files (0 caps from that heading's prose) — pi's `AGENTS.md` walk is honoured where it runs, through pi's own `loadProjectContextFiles` in `src/packages/loader.mjs`.

## The 11 caps no matrix row names — covered by harness code only

`cli.md`: `--help` `--print` `--thinking` `--session` `--tools` `--exclude-tools` `--no-tools`
`--append-system-prompt` `--system-prompt` `--cwd` · `sessions.md`: `--session`. These are pi's verbs this harness
HAS, spelled in the files that parse `argv` — `cli.mjs`'s parser, `src/cli-intent.mjs`, `src/piflags.mjs`,
`src/core.mjs` — rather than restated by a row. The audit gate counts them covered only because a file that
actually parses `argv` spells the literal, which is what keeps them honest without a row that would only restate the parser.

## Rows that serve two sweep docs (why 46 mentions collapse to 43 rows)

`shimmed :: session identity flags`, `unsupported :: pi's fork-at-invocation flag`,
`unsupported :: pi's session metadata verbs (and pi's --name at invocation)` — each claimed by both `cli.md` and
`sessions.md`. The other 96 of 139 rows serve pi's `packages.md`, `extensions.md`, `rpc.md`, `rpc-commands.md`,
`json.md`, `message-types.md`, `rpc-extension-ui.md`, `session-format.md` — the same rows, in the rendered table.

## Symptom rows — the INPUT plane (a typed prompt, `/model`, dock autocomplete, up-arrow recall)

1. **A typed prompt gets answered and painted** — `native :: pi-tui's fullscreen screen and layout pieces` +
   `native :: pi's in-TUI editor as the input dock` + `native :: session` for the admission, and the answer really
   comes from pi's settings-default model through pi's provider plane; pi-ai's faux plane is armed ONLY under `--faux`.
2. **`/model` selects a model** — `shimmed :: pi's slash commands dispatched at pi's own dock…` (bare `/model` lists
   pi's candidates via `get_available_models`; `/model <ref>` switches the model THIS run answers with, header and
   footer repaint) + `shimmed :: model listing`; pi's `settings.json` default is NOT rewritten without an explicit ask;
   `/settings` and `/scoped-models` stay refused BY NAME.
3. **Slash autocomplete at the dock** — `native :: pi's input keybinding actions at pi's own dock (… autocomplete
   trigger)` (`tui.input.tab`) + the RE-DECIDED row `shimmed :: pi's editor autocomplete dropdown over pi's commands,
   templates and skills` (`AutocompleteProviderFactory` `CombinedAutocompleteProvider` `autocompleteMaxVisible`
   `setAutocompleteProvider` `fuzzyFilter`). Still refused BY NAME inside that row: pi's file-path completion
   (`fdPath` handed as `null`), pi's `login` argument menu, and pi's `ModelSelectorComponent` dialog.
4. **Up-arrow recalls the last prompt typed** — `native :: pi's in-TUI editor as the input dock` at the pi-style screen
   (pi's `Editor.addToHistory`, seeded from committed `pi.user` rows, because pi has NO history constructor option at
   this pin) + `shimmed :: pi's prompt-history recall at the harness's OWN row overlay` for `--tui/--row-view`.
   A recalled line is pi's NEW prompt: two ENTERs over the same words are TWO admissions, TWO requestIds and TWO
   committed `pi.user` rows (measured at a real pty in `demo/recall.test.mjs`), while pi's own `Editor.history` keeps
   the words ONCE because pi's `addToHistory` skips a CONSECUTIVE duplicate — which is why the writer's fallback
   requestId names the SUBMISSION EVENT (`tui:<pid>:<n>`) rather than the typed words.

## Symptom rows — the RENDERING plane (scrolling, harness status lines, dock hints, refusals)

1. **Scrolling snaps back to the bottom** — `native :: pi's alt-screen keybinding actions (pi's fullscreen viewport,
   which IS this harness's pi-style screen)` and `native :: pi-tui's fullscreen screen and layout pieces`. The scroll
   state lives INSIDE pi's `ScrollView` (`followingEnd`/`currentScrollTop`/`transientScrollbarVisible`) in the ONE
   container pi-tui composes — pi-tui's `scroll-view.js` THROWS on a second `addChild`/`removeChild`/`clear`, so a
   rebuilt container is not an option — and pi's own `TuiAltScreen` class matches the 14 `tui.altScreen.*` ids through
   pi's GLOBAL `getKeybindings()` registry. Measured at a 70×30 real pty: pi's `pageUp` keeps the transcript where it
   was scrolled, `pageDown` pages back, `ctrl+home` is the document TOP, `ctrl+end` is the document END with pi's
   transient `┃` scrollbar thumb, and follow-end engages ONLY at the end (a commit typed while the view is scrolled up
   stays OFF screen; the same commit after `ctrl+end` lands ON screen); pi's `pageDown` is FED as pi's OWN bytes `ESC[6~`
   in `demo/keybindings.test.mjs` (53 checks), and the segment ANSWERING that feed carries the newest prompt row and NO
   document-top row — the page back is measured on pi's own keystroke, not asserted (that run tallies `topSegments == 2 && endSegments == 3`
   over 13 segments). pi's mouse wheel is the NEW native row `native :: pi's mouse wheel over the transcript and pi's ScrollView view state (pi's alt-screen wheel path, NOT a keybinding id)`: pi's alt screen decodes `ESC[<64;20;10M`/`ESC[<65;20;10M` through its `parseWheelEvent`/`routeWheel` and hands it to `new WheelScrollAccelerator(options.wheelScrollLines ?? 1)`, pi's dock attributes NO keybinding id to either form, and `demo/scrollwheel.test.mjs` (17 checks) measures at a 48×16 pty that ONE gesture moves EXACTLY ONE transcript row, a wheel-down gesture returns the region EXACTLY, pi's `pageUp` shifts every still-visible row 5 rows down (a page, not a tick) and pi's `pageDown` returns the view EXACTLY — plus pi's `ScrollView` view state read IN PROCESS. `lineUp`/`lineDown`/`halfPageUp`/`halfPageDown`
   stay UNBOUND at this pin and stay unbound here; `search` answers no id at this dock for any byte form tried.
2. **The harness's own lines tear across the dock** — `unsupported :: pi's animated status indicators and its program
   status reporter`, RE-DECIDED for this surface: pi's `IdleStatus`/`WorkingStatusIndicator`/`WorkingIndicatorOptions`/
   `setWorkingIndicator`/`setEditorWorkingStatusIndicator`/`isEmbeddedStatus` and `ProgramStatusReporter` stay refused BY
   NAME, but the harness's OWN words are no longer raw stderr over an open window. `src/tui/pidockloop.mjs`' `notes`/`say`
   hand every such line to `piNoteRows` (`src/tui/piscreen.mjs`), one pi `Text` per line, appended into pi's TRANSCRIPT
   document AFTER the live rows and BEFORE `statusBox.clear()`, so pi's width handling does ALL the splitting — pi's
   exported `wrapTextWithAnsi` (pi-tui `dist/utils.d.ts:56`) plus pi's `wrapSingleLine`/`breakLongWord` (`dist/components/text.js`
   breaks an over-long token character by character). Measured at a 44×26 pty: the ack and the `model:`/`get_available_models:`
   lines own rows 5-19, pi broke `…/131`+`072/true` mid-token, pi's dock borders stayed at rows 20 and 26, widest painted row
   44. Raw stderr stays ONLY for runs with no window open (print/JSON/RPC/headless), measured byte-for-byte (459 bytes, diff
   identical modulo ids) against the same run before the change. The identity triple and the ONE mutation line are unchanged.
3. **A stale dock hint (`ctrl+k to clear the draft`)** — `native :: pi's editor keybinding actions at pi's own dock`.
   The ACTION was always pi's: pi-coding-agent's `CustomEditor extends Editor`, so pi-tui's branch
   `if (kb.matches(data, "tui.editor.deleteToLineEnd")) this.deleteToEndOfLine();` (`dist/components/editor.js:661-662`) runs and
   its body (`:1393`) deletes `currentLine.slice(this.state.cursorCol)` — CARET→EOL, and that is now MEASURED at a real
   70×30 pty in `demo/keybindings.test.mjs`: `keep drop` + FIVE separate pi `cursorLeft` feeds + pi's ONE `0x0b` feed paints
   a segment carrying pi's `keep` and NO row carrying pi's `drop`, pi's ENTER after it answers `status=placed`, and pi's
   `ctrl+a` + `0x0b` on `draft hello world` leaves pi's draft EMPTY (that segment carries pi's typed words nowhere) so pi's
   ENTER answers `status=nothing`/`was typed` and the store's ONLY `pi.user` text for the run is `keep`, read back through
   `src/readapi.mjs`. The LABEL was the bug; pi's own words are pi's exported `keyHint("tui.editor.deleteToLineEnd", "to delete to
   end")` (`interactive-mode.js:766`) and pi's `docs/keybindings.md:79` `Delete to line end`. `src/tui/piscreen.mjs` now exports
   `piDockHints` (the actions this dock actually handles) and `piStatusRows` paints a hint row ONLY when pi's exported
   `keyText(word)` answers a non-empty key, so an unbound action contributes NO row rather than a false hint (measured
   IN PROCESS: `piStatusRows` over `[["tui.editor.historyPrevious", …], ["tui.altScreen.lineUp", …]]` gains only pi's
   `idle` row, and the bound-plus-unbound mix paints EXACTLY the bound rows). No harness code decodes ctrl+k.
4. **A refusal BY NAME wipes the typed command** — `shimmed :: pi's slash commands dispatched at pi's own dock, honoured
   where pi-durable has state`. pi's clear-the-draft rule (`clearEditor()`) still runs for a decision pi-durable RAN (`ran`)
   or acted on (`quit`); a REFUSED draft goes back through pi's PUBLIC `setText` (pi-tui `dist/components/editor.js:928`) because
   pi-tui's own `submitValue()` (`:1145`) emptied the state before `onSubmit`, and pi's OWN precedent for a command it could not
   run is to keep the typed text — `interactive-mode.js:2799` `this.editor.setText(text);` after
   `showWarning("A bash command is already running…")`, and pi's `showExtensionCustom` `saveEditor`/`restoreEditor`
   (`:2415`/`:2427`). The refusal WORDING is unchanged pi-durable wording, split only by pi's wrapping; pi's own Esc rule
   (`onEscape` → cancel → `setText("")`) clears a kept draft. Measured at a 44×26 pty: `/goal keep going` paints over 7 rows
   and still sits between pi's dock borders on the next frame; the longer command is wrapped by pi's Editor into a TWO-ROW
   dock draft; the store gains NO `pi.user` row for either, so `writerSubmit` stays the ONE mutation line.

**Measured TWICE in ONE run** — `demo/renderparity.test.mjs` (33 checks) is the RENDERING plane as PAINTED ROWS: the
SAME 14-keystroke script runs through the committed `scripts/ptydrive.mjs` at a 52×26 pty, once on this tree's `cli.mjs`
and once on the tree at the tag `checkpoint-pi-tui-parity` (extracted inside the demo with `git archive`; `git ls-files
node_modules` prints nothing, so the extracted tree gets a symlink to the SAME pinned pi — only the code under test
changes). Rows are rebuilt from pi-tui's painted bytes after every frame end, and a keystroke that changed no frame means
the screen UNCHANGED, which is what makes the tagged tree answering `ctrl+end` with no repaint a measurement. Every rule
this goal fixed is recorded PASSING here and FAILING on the tagged screen in the same run:

* scrolling: pi's `pageUp` leaves the view PUT (pi's document-top row present, the newest prompt absent, 1 repaint) against
  the tagged tree's snap-back (top absent, newest present, 2 repaints); the view is still PUT after the NEXT prompt (3
  repaints vs 2); follow-end is NOT at the content end after a fifth prompt and IS after `ctrl+end` here (false/true)
  against the tagged tree already pinned to the end (true/true); `ctrl+end` REPAINTS (1 frame, pi's `┃` thumb on 7 rows)
  against 0 repaints and 0 thumb rows there; 24 frames painted here against 22 there.
* harness lines: `submitted:`/`set_model:` rows sit between pi's two dock borders in 17 of the tagged tree's 22 frames and
  in 0 of this screen's 24; `status=placed` owns a row of its own under its `submitted:` row in 16 frames here and 0 there;
  the widest row carrying an ack line is 52 — exactly the terminal width — here and 64 there.
* hints: 24 frames carry a dock hint row equal to pi's exported `keyHint("tui.editor.deleteToLineEnd", …)` output here and
  0 there; pi-durable's stale `to clear the draft` label appears 0 times in this capture and 2 times in the tagged one.
* refusals: the refused draft stays IN the dock (1 of 1 dock rows) here and 0 of 1 there; the `refused:` block spans 6 rows
  of at most 52 characters here against ONE row 262 characters wide there.
* unchanged, recorded holding on BOTH screens: pi's Box borders are WHOLE in every frame (0 bad frames on each side), pi's
  Esc still clears a kept draft, the refusal still closes with `refused by name` and names the verb (6 rows here, 1 there),
  every `submitted:` row still spells `requestId=` and `submissionId=` (85 rows here, 16 there), both runs exit 0 answering
  all 14 keystrokes, and the store gains the SAME 7 `pi.user` rows with NO `/goal` row on EITHER tree — the refusal's
  WORDING is byte-identical between the two screens once spaces are stripped (229 characters each).

Everything else on those surfaces stays refused BY NAME in pi's own words, in the rows above and below.

## Re-measure it

```
node scripts/suite.mjs                       # offline demos + audits; expect fail=0
node scripts/audit-pi-docs.mjs               # 443 caps over pi's 15 docs, 139 rows -> PASS or it names the gap
node scripts/audit-provenance.mjs            # provenance header in every source file
node scripts/audit-orchestration.mjs         # no dependency on the dropped orchestration concepts
node scripts/render-matrix.mjs > docs/package-support.md   # the ONLY way this table changes
diff docs/package-support.md <(node scripts/render-matrix.mjs)   # must be empty
```

The row view stays reachable via `--tui`/`--row-view`; a TTY default stays the pi-style screen; a piped run never
opens a window that sits open forever. Refusals print pi's own words — no invented wording, no invented theme colours.
