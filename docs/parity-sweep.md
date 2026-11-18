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
  the **7** that describe the surfaces the four reported symptoms live on — `tui.md`, `keybindings.md`,
  `slash-commands.md`, `cli.md`, `sessions.md`, `compaction.md`, `configuration.md` — and the audit walks all 15.
* Those 7 docs hold **228 harvested caps**, claimed by **43 distinct matrix rows** out of 138
  (46 doc-level mentions − 3 rows claimed by two docs). Reconciled with EXACT `names` matching:
  **60 native / 45 shimmed / 112 unsupported / 11 covered by harness code only** (no row names them — listed below).
* All 15 docs, all caps: **443 capabilities over 138 rows (51 shimmed / 66 unsupported / 21 native)**, every doc at
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
`sessions.md`. The other 95 of 138 rows serve pi's `packages.md`, `extensions.md`, `rpc.md`, `rpc-commands.md`,
`json.md`, `message-types.md`, `rpc-extension-ui.md`, `session-format.md` — the same rows, in the rendered table.

## The four reported symptoms, as rows

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

## Re-measure it

```
node scripts/suite.mjs                       # offline demos + audits; expect fail=0
node scripts/audit-pi-docs.mjs               # 443 caps over pi's 15 docs, 138 rows -> PASS or it names the gap
node scripts/audit-provenance.mjs            # provenance header in every source file
node scripts/audit-orchestration.mjs         # no dependency on the dropped orchestration concepts
node scripts/render-matrix.mjs > docs/package-support.md   # the ONLY way this table changes
diff docs/package-support.md <(node scripts/render-matrix.mjs)   # must be empty
```

The row view stays reachable via `--tui`/`--row-view`; a TTY default stays the pi-style screen; a piped run never
opens a window that sits open forever. Refusals print pi's own words — no invented wording, no invented theme colours.
