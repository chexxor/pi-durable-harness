#!/usr/bin/env node
// src/tui/pidockloop.mjs - the harness's own loop around pi's input dock: pi's component decides
// what a keystroke MEANS, and the only decision this file makes is which pi-durable call a finished
// draft becomes.
//
// PROVENANCE: no Durian-Pi original - Durian-Pi never drove an input component (its
// ~/Git/Durian-Pi/src/tui/client.mjs read whole lines with its own driver and never handed a keystroke
// to a component), so there is nothing there to extract. Symbols VERIFIED AGAINST PINED packages, read
// on this machine at pin v1.5.1:
//   pi-tui `Editor.handleInput`, `Editor.getText/setText`, `Editor.onSubmit`, `Editor.onChange` (dist/components/editor.d.ts)
//   pi's PUBLIC history API `Editor.addToHistory` (pi-tui dist/components/editor.d.ts:90, whose doc says
//   "Add a prompt to history for up/down arrow navigation. Called after successful submission."), pi's recall
//   rule `navigateHistory` over `history`/`historyIndex` and its arrow keybinding `tui.editor.cursorUp`
//   (pi-tui dist/components/editor.js + dist/keybindings.js), and the MEASURED fact that pi's `EditorOptions`
//   at this pin carry only `paddingX`/`autocompleteMaxVisible` and pi's `CustomEditorOptions` add only
//   `embedWorkingStatus`, so pi has NO history constructor option and a `{ history }` 4th ctor arg is dropped
//   pi-coding-agent `CustomEditor.onEscape/onCtrlD/onAction` (dist/modes/interactive/components/custom-editor.d.ts)
//   pi's app-key defaults `app.interrupt`/`app.exit`/`app.clear` (dist/core/keybindings.d.ts `APP_KEYBINDINGS`)
//   pi's clear-the-draft rule `editor.setText("")` (dist/modes/interactive/interactive-mode.js `clearEditor`)
//   pi's draft dispatch `setupEditorSubmitHandler` (dist/modes/interactive/interactive-mode.js), whose
//   RULE this file asks src/slashplane.mjs about rather than retyping: which typed draft is a command
//   pi-durable's entry/usage/live reads (dist/entries.d.ts, dist/harness/harness.d.ts, dist/harness/live.d.ts)
// DROPPED from pi's own interactive layer, on purpose and named in the capability matrix rather than
// silently: pi's `InteractiveMode`/`AgentSessionRuntime` (there is no pi session here), pi's
// `autocomplete` provider is now HONOURED at the dock below (pi's own `CombinedAutocompleteProvider`
// installed through pi's PUBLIC `Editor.setAutocompleteProvider`, over pi's builtin slash table plus
// what pi-durable's plane discovered), so what stays DROPPED here is pi's model/thinking cycling
// (`app.model.*`, `app.thinking.*`: this harness picks its model once at open, so cycling would change
// state pi-durable never recorded), pi's `app.suspend`, and pi's `widgetsAbove`/`widgetsBelow` extension
// widgets (no pi extension UI here).
//
// WHAT THIS FILE DOES NOT DO: it does not open storage, claim the writer lock, close the Harness, or
// decide what a keystroke means. Those stay with the caller and with pi's keybinding layer, which is
// what keeps the ownership/admission rules provable where the other demos already prove them.

import { Container } from "@earendil-works/pi-tui";
import { CURRENT_SESSION_VERSION } from "@earendil-works/pi-coding-agent";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { transcript } from "../core.mjs";
import { createSyncState, openWatch, snapshotSync } from "./sync.mjs";
import { writerSubmit } from "./writer.mjs";
import { dispatchLine, piAutocompleteCommands, piAutocompleteMaxVisible } from "../slashplane.mjs";
import { entryText, installPiTheme, piAddToHistory, piContextOf, piDockOf, piFooterOf, piGitBranchOf, piHeaderOf, piLiveRows, piMarkdownTheme, piModelOf, piNoteRows, piScreen, piSessionEntriesOf, piStatusRows, piTranscriptDocument } from "./piscreen.mjs";

/** How many previous committed prompts pi's Editor history starts with; pi's history is UNEXPORTED at this
 * pin (pi's `EditorOptions` has no history field), so the seed is pi-durable's committed user entries handed
 * to pi through pi's PUBLIC `addToHistory`, oldest first, so pi's own `history.unshift` leaves the NEWEST at
 * index 0, which is what pi's up-arrow reads (`historyIndex` -1 -> 0). */
const HISTORY_SEED = 8;

/** Install pi's discovered theme record for THIS run at pi's own theme slots, so pi's components - not
 * only the harness's rows - use pi's palette. pi's settings name the theme; pi's loader found its record
 * in this cwd's package, so the hue is pi's, never one typed here. Returns pi's installed theme name, or
 * null when the run's settings name nothing pi's plane found (pi then keeps its builtin default). */
export function piRunThemeOf(parts) {
 const name = parts?.resources?.themeName ?? null;
 const record = (parts?.resources?.themes ?? []).filter((theme) => theme?.name === name)[0] ?? null;
 if (!record) return null;
 const theme = installPiTheme(record);
 return theme?.name ?? name;
}

/** What store THIS run's session lives in, spelled as a URL. pi-durable's storage opener is
 * `openNodeSqliteStorage(absolutePath)` (dist/storage/storage.d.ts' SqliteStorage), the path it was
 * handed is `parts.intent.store`, and pi-durable exposes NO storage URL accessor at this pin - so the
 * `file://` form is Node's OWN `pathToFileURL` over the resolved path - the same `resolve()` pi-durable's
 * opener uses (core.mjs: `openNodeSqliteStorage(resolve(storePath))`) - never a scheme typed here. A
 * `--no-session` run opened pi-durable's in-memory Session (parts.backend "memory"), which has no URL
 * to name, so it says so instead of pointing at a file the run never wrote.
 */
export function piSessionLines(parts) {
 const store = parts?.intent?.store ?? null;
 const backend = parts?.backend ?? null;
 if (backend === "memory" || !store) {
  return { session: "pi-durable session in memory (no store file written; pi's own sessions are JSONL files)", store: null, backend };
 }
 return {
  session: `pi-durable session (this harness's ${backend} store, not a pi session)`,
  store: `${pathToFileURL(resolve(store))} (${backend})`,
  backend,
 };
}

/** pi's startup header rows for this run: pi's version constant, the pi-durable-session marker over
 * pi-durable's ONE store (with its URL), pi's model record line, the pi packages this run's plane
 * loaded, and pi's key hints spelled from pi-tui's own keybinding names. The store lines describe the
 * open THIS invocation made, so the marker cannot name a store another process owns.
 */
export function piRunHeader(parts, { agent = null } = {}) {
 const version = CURRENT_SESSION_VERSION;
 const model = piModelOf(parts, { agent });
 const session = piSessionLines(parts);
 const resources = [
  ...(parts?.resources?.packages ?? []).map((found) => `package ${String(found?.name ?? found?.package ?? "")}`),
  ...(parts?.resources?.skills ?? []).map((skill) => `skill ${String(skill?.name ?? "")}`),
  ...(parts?.resources?.promptTemplates ?? []).map((template) => `template ${String(template?.name ?? "")}`),
 ];
 const at = parts?.intent?.cwd ?? parts?.cwd ?? null;
 return {
  header: piHeaderOf({ version, modelLine: `${model.provider}/${model.id}`, resources: resources.slice(0, 6), sessionLine: session.session, storeLine: session.store, hints: [["tui.input.submit", "to send the draft"], ["tui.input.newLine", "to add a line"], ["tui.editor.undo", "to undo"]] }),
  session,
 };
}

/** pi's footer for this run, from pi-durable's committed entries only. pi's totals read pi's OWN entry
 * shapes, so the entries travel through piSessionEntriesOf() (pi's `{type:"message"}` rows carrying pi-durable's
 * own `usage` records); pi's context numbers stay over pi-durable's EntryRecords, which is what piContextOf
 * reads; and the branch is piGitBranchOf() over the run cwd, which pi's footer.js appends as ` (${branch})`.
 * Every other field stays pi-durable's read of this conversation. */
function piRunFooter({ parts, entries, ui, context, agent = null }) {
 const model = piModelOf(parts, { agent });
 return piFooterOf({
  entries: piSessionEntriesOf(entries),
  conversationId: parts.conversation.id,
  leafId: entries[0]?.id ?? null,
  entryCount: entries.length,
  cwd: parts?.intent?.cwd ?? parts?.cwd,
  gitBranch: piGitBranchOf(parts?.intent?.cwd ?? parts?.cwd),
  model: { id: model.id, provider: model.provider, contextWindow: model.contextWindow, reasoning: model.reasoning },
  routedModel: null,
  providers: (parts?.models?.getProviders?.() ?? []).length,
  contextUsage: piContextOf(entries, parts?.models, model),
  thinkingLevel: parts?.settings?.thinkingLevel ?? null,
  autoCompactEnabled: parts?.settings?.compaction?.enabled === true,
 });
}

/** The loop: feed pi's dock, and let pi's callbacks say what happened. `reader()` yields keystroke
 * chunks - a real terminal hands one keystroke per chunk (an escape sequence arrives whole), a scripted
 * session hands whole lines, which this file splits into characters because pi-tui's overlay takes one
 * keystroke at a time. `keystrokes` says which kind, because a chat line may legally start with `q`.
 * Returns the tally a demo asserts: pi's drafts, pi-durable's acknowledgements, cancels, and why it left. */
export async function piDockLoop({
 parts,
 ui,
 size = () => ({ columns: 80, rows: 24 }),
 context = BACKGROUND_CONTEXT,
 reader,
 keystrokes = false,
 submit = null,
 report = null,
 window = true,
 history = null,
 limit = 200,
 watch = true,
 settleMs = 40,
 repaint = null,
 quitWords = ["q", "quit", "exit"],
 shouldStop = null,
}) {
 const submitDraft = submit ?? ((text, ctx) => writerSubmit(parts, text, { context: ctx }));
 // WHERE pi-durable's OWN status lines go. While pi's alt screen is open (`window`, spelled by cli.mjs'
 // piScreenRun below), a RAW stderr write is painted BY THE TERMINAL over pi's frame: the alt screen owns
 // the terminal, and pi's hardware cursor is wherever pi last drew, so `submitted: requestId=...` used to
 // tear across pi's bordered dock (the user's second symptom). While a window is open the line is instead
 // carried to pi's transcript document as pi's OWN wrapped rows (`piNoteRows`: pi's `Text.render(width)`
 // word-wraps at the render width), and only a caller with NO window open - the headless/print/RPC/JSON
 // surfaces, or a demo asserting on the lines - writes raw stderr, byte-for-byte as before. A caller that
 // wants its own channel still passes `report`, which is what the offline demos use to capture them.
 const notes = [];
 const say = report ?? ((line) => {
  if (window) { notes.push(line); return; }
  process.stderr.write(`${line}\n`);
 });
 const cwd = parts?.intent?.cwd ?? parts?.cwd ?? null;
 const markdownTheme = piMarkdownTheme();
 const committed = async () => await transcript(parts.conversation, context, limit);

 // pi's theme first: pi's components read pi's theme slots, so the palette has to be installed before
 // any component is built.
 const themeName = piRunThemeOf(parts);

 // pi's Editor history seeded from pi-durable's committed user entries, OLDEST first (pi's `addToHistory`
 // body is `history.unshift(trimmed)`, so the LAST one handed over ends up at index 0 = newest, which is
 // what pi's up-arrow reads first). pi has NO history constructor option at this pin (see the header: pi's
 // `EditorOptions`/`CustomEditorOptions` carry no such field, so a `{ history }` arg is silently dropped -
 // measured as `status=nothing was typed` on up-arrow over a store that already had committed prompts), so
 // the seed travels through pi's PUBLIC method below instead. A caller-supplied `history` list follows the
 // same oldest-first convention; pi-durable's entry page is newest-first, so pi's NEWEST `HISTORY_SEED` user
 // prompts are the page's first `HISTORY_SEED` user rows, reversed.
 const seeded = Array.isArray(history) ? history : (await committed()).filter((entry) => entry?.kind === "pi.user").map((entry) => entryText(entry)).filter((text) => text).slice(0, HISTORY_SEED).reverse();

 // pi's autocomplete list, built once after pi's theme is installed: pi's own dropdown recipe
 // (dist/modes/interactive/interactive-mode.js `createBaseAutocompleteProvider`) runs over pi's builtin
 // slash table plus pi's discovered templates, package extension commands and `skill:` rows, and pi's
 // `model`/`thinking` argument menus answer from pi-durable's own candidate lists. What pi can offer and
 // this harness cannot is named inside src/slashplane.mjs (pi's file-path completion, pi's `login` arguments).
 const autocompleteCommands = await piAutocompleteCommands(parts, { cwd });

 const dock = piDockOf(ui, { autocompleteCommands, cwd, autocompleteMaxVisible: piAutocompleteMaxVisible(cwd) });
 const editor = dock.editor;
 // pi's seed path is pi's OWN method, not a constructor option pi does not have (see above): handing the
 // committed prompts over in oldest-first order through `addToHistory` is what puts them in pi's `history`
 // array in pi's own newest-first order, so pi's `tui.editor.cursorUp` -> `navigateHistory(-1)` rule has
 // something to recall and up-arrow stops being a no-op.
 for (const text of seeded) piAddToHistory(editor, text);
 const drafts = [];
 const seenDrafts = [];
 const slash = [];
 const cancelled = [];
 const seenCancels = [];
 const seenExpansions = [];
 const seenClears = [];
 const quit = { word: null };
 const acks = [];
 const paints = { count: 0 };

 // pi's OWN callbacks: pi's keybinding layer decides which keystroke is which action, and this file only
 // records that it decided.
 editor.onSubmit = (text) => { drafts.push(text); seenDrafts.push(text); };
 editor.onEscape = () => { cancelled.push("escape"); seenCancels.push("escape"); };
 editor.onCtrlD = () => { quit.word = quit.word ?? "ctrl+d"; };
 // pi's OWN double-tap rule, `handleCtrlC()` (pi-coding-agent dist/modes/interactive/interactive-mode.js:3594):
 // the FIRST `app.clear` (ctrl+c) calls pi's `clearEditor()` and remembers when; only a SECOND one inside
 // 500 ms shuts down. Before this the harness left on the FIRST ctrl+c, which is a different product's rule
 // (pi keeps typing alive after one ctrl+c, which is also why pi's hint says `<key> twice to exit`).
 let lastClearTime = 0;
 editor.onAction("app.clear", () => {
  const now = Date.now();
  if (now - lastClearTime < 500) quit.word = quit.word ?? "ctrl+c";
  else { lastClearTime = now; editor.setText(""); seenClears.push(dock.keybindings.getKeys("app.clear")); }
 });

 // The live plane is pi-durable's own: pi-durable's watch delivers frames, and pi's status rows and
 // in-flight tool boxes are built from pi-durable's `pi.live` doc, never from a spinner written here.
 const liveState = watch ? createSyncState(parts.conversation.id) : null;
 const liveWatch = liveState ? await openWatch({ harness: parts.harness }, parts.conversation.id, { state: liveState, context }) : null;

 // pi-durable's `Conversation.agent()` record is the model this conversation answers with NOW, and a
 // `/model` at the dock changes it through `conversation.configure({ model })`, so the header and
 // footer ask it again at every paint rather than freezing the model this invocation opened with -
 // a frozen one would name a model that did not answer the NEXT prompt. This is a read through the
 // conversation handle this run already holds; it opens no storage and admits nothing, and a read
 // failure falls back to what pi's provider plane resolved at open (piModelOf's own rule).
 const currentAgent = async () => {
  try { return await parts.conversation.agent(context); } catch { return null; }
 };
// pi builds its viewport ONCE per session (`createChatViewport` runs once in pi's own
  // interactive-mode.js) and keeps pi's ScrollView, chatContainer, status container and footer container
  // alive between frames, because pi's scroll position and pi's transient scrollbar live INSIDE pi's
  // ScrollView (`currentScrollTop`, `followingEnd`, `transientScrollbarVisible`). So they are built here,
  // outside `paint()`, and refilled IN PLACE below: a fresh ScrollView per paint restarts pi's scroll
  // state (`followingEnd` starts true, `currentScrollTop` 0), which is what snapped a view pi's own
  // `tui.altScreen.pageUp` had scrolled back to the content end on the very next frame.
  const transcriptDocument = new Container();
  const statusBox = new Container();
  const footerBox = new Container();
  const screen = piScreen({ document: transcriptDocument, editor, status: statusBox, footer: footerBox });
  const paint = async () => {
   const at = size();
   const entries = await committed();
   const agent = await currentAgent();
   const live = liveState ? snapshotSync(liveState, { conversationId: parts.conversation.id }) : null;
   const pendingTools = {};
   const built = piTranscriptDocument({ entries, ui, cwd, markdownTheme, pendingTools, prepend: piRunHeader(parts, { agent }).header, existing: transcriptDocument });
   for (const component of piLiveRows({ live: live?.live, pendingTools, ui, cwd })) built.document.addChild(component);
   // pi-durable's own status lines take the LAST rows of pi's transcript region, in the order the loop
   // said them, so the newest acknowledgement sits in the row just above pi's dock. They live in pi's
   // chatContainer, so they page up and out of the way like the committed rows do, and pi's `follow:
   // "end"` keeps the newest one in view while the view sits at the end.
   for (const row of piNoteRows(notes)) built.document.addChild(row);
   statusBox.clear();
   for (const row of piStatusRows(live?.live)) statusBox.addChild(row);
   footerBox.clear();
   footerBox.addChild(piRunFooter({ parts, entries, ui, context, agent }));
   // pi's OWN guard (`setLayoutRoot` returns when the root is the same component) makes a stable root
   // cheap, so a repaint is pi's invalidate-and-request-render pair.
   ui.setLayoutRoot(screen.root);
  ui.invalidate();
  ui.requestRender();
  // pi schedules frames on a throttled timer (tui.js `scheduleRender`, `MIN_RENDER_INTERVAL_MS`), so a
  // paint only lands once that timer runs; a headless capture has to let pi's own timer fire before the
  // bytes are read, and a real terminal has the same pause between keystrokes.
  if (settleMs) await new Promise((sleep) => setTimeout(sleep, settleMs));
  paints.count += 1;
  if (repaint) repaint({ entries, live, at });
  return { entries, live };
 };

 // pi draws the empty dock before any input, which is what a real terminal shows first.
 await paint();

 // pi's Editor draws its caret into its OWN render (a fake-caret marker pi-tui resolves into a cursor
 // move); the fullscreen composite keeps the hardware cursor hidden, so the caret has to be read off the
 // component's own paint - which is also what proves pi echoed the keystrokes rather than the harness.
 const caret = { marker: false, row: null };
 const noteCaret = () => {
  if (caret.marker || !editor.getText()) return;
  const rendered = (editor.render(size().columns) ?? []).join("\n");
  const marker = /_pi:[a-z]+/.exec(rendered);
  if (!marker) return;
  caret.marker = true;
  caret.row = rendered.split("\n").filter((line) => line.includes(marker[0]))[0] ?? null;
 };

 // The harness's only decisions: a finished pi draft becomes ONE pi-durable admission, a cancel clears
 // the draft with pi's own rule, and a quit word ends the run. Ownership (claim/release/close) stays with
 // the caller, which is why this file never opens storage or claims a lock.
 const drain = async () => {
  while (drafts.length) {
   const text = drafts.shift();
   // pi decides what a finished draft MEANS when it starts with `/` or `!` - its own submit handler
   // (`setupEditorSubmitHandler`, dist/modes/interactive/interactive-mode.js) matches the draft against
   // pi's builtin slash table and pi's `!`/`!!` bash rule before it submits anything. That rule is read
   // off pi's pinned dist by src/slashplane.mjs, so the answer below is pi's decision and not a list
   // remembered here; what it honours runs on pi-durable's ONE command handler (src/rpc.mjs' `handle()`),
   // what it cannot is refused BY NAME in pi's own words, and `/quit` clears the draft and leaves.
   // A plain draft falls through to `submitDraft` (the caller's ONE admission), which stays the only thing
   // a typed line can become; on a leading-`/` branch pi's OWN template/skill expansion is what enters that
   // admission (src/slashplane.mjs' `expanded`, pi's boundary in docs/prompt-templates.md), never a second
   // mutation line and never a re-implementation of the expansion.
   const decision = await dispatchLine(text, parts, { context, report: say });
   slash.push(decision);
   if (decision.handled !== "fallthrough") {
    for (const line of decision.lines) say(line);
    // WHERE THE DRAFT GOES AFTER pi's DECISION. pi-tui's own `Editor.submitValue()` (dist/components/
    // editor.js:1145) has ALREADY taken the draft out of pi's Editor (`this.state = { lines: [""], ... }`
    // runs before `this.onSubmit(result)`), so the dock is empty at the moment this branch runs, and
    // pi's PUBLIC `Editor.setText` (dist/components/editor.js:928) is the only way to hand a draft back.
    // pi's own clear-the-draft rule (`clearEditor()` in interactive-mode.js: setText("") and nothing
    // else) is what this branch follows for a command pi RAN (`ran`) or for `/quit` (`quit`: pi's own
    // `/quit` handler at interactive-mode.js:2784 does `this.editor.setText("")` before shutdown).
    // A command pi-durable REFUSED BY NAME is not a command pi ran, and pi's own rule for a command it
    // could NOT run is to put the typed text back where the user can fix it or cancel it: pi does exactly
    // that at interactive-mode.js:2799 (`this.showWarning("A bash command is already running. Press Esc to
    // cancel it first."); this.editor.setText(text);`) and in pi's `showExtensionCustom` dialog, which
    // saves the draft with `editor.getExpandedText?.() ?? editor.getText()` (:2414) and restores it with
    // `this.editor.setText(savedText)` when the dialog closes (:2426 `restoreEditor`). So the typed
    // command stays in pi's dock after the refusal - pi's Editor owns that draft, wraps it at the render
    // width itself, and pi's Esc rule below (`editor.setText("")`) is what clears it. Nothing is admitted
    // here either: the refusal never reaches `submitDraft`, which stays the only mutation a draft takes.
    if (decision.handled === "refused") editor.setText(text);
    else editor.setText("");
    // pi adds a `!cmd`/`!!cmd` draft to ITS history BEFORE it runs the command (interactive-mode.js:2802),
    // so up-arrow recalls a bash line the user ran. pi does NOT record the builtin slash commands it handles
    // in the editor - that is pi's own rule about which call sites exist, not a menu this file hides.
    if (decision.handled === "ran" && decision.kind === "bash") piAddToHistory(editor, text);
    if (decision.handled === "quit") { quit.word = decision.quit; return true; }
    continue;
   }
   if (quitWords.includes(text.trim().toLowerCase())) {
    quit.word = quit.word ?? text.trim().toLowerCase();
    return true;
   }
   // pi expands a prompt template and a skill command BEFORE the input enters the agent (dist/core/agent-session.js: `_expandSkillCommand` then `expandPromptTemplate`, and `prompt: expandedText`), so the ADMISSION takes pi's expansion. The hint below is the SAME sentence cli.mjs' print path and row surface already print (`expanded pi's <kind> (<name>) into the submitted input`), so the pi-style screen says what the other surfaces say.
   if (decision.expansion === "template" || decision.expansion === "skill") {
    say(`expanded pi's ${decision.expansion} (${text.split(/\s+/)[0].slice(1)}) into the submitted input`);
    seenExpansions.push(decision.expansion);
   }
   const ack = await submitDraft(decision.expanded ?? text, context);
   acks.push(ack);
   // pi's own history rule: pi's `Editor.addToHistory` doc says "Called after successful submission.", and pi
   // calls it at pi's OWN submission sites (interactive-mode.js:2824 and pi's "Normal message submission"
   // :2840). This is what makes pi's up-arrow recall the prompt the user just sent; a quit word never got
   // here, so pi never records it, and a slash command never gets here either (pi's rule above).
   piAddToHistory(editor, text);
   // pi's own clear-the-draft rule (`clearEditor()` in interactive-mode.js): setText(""), nothing else.
   editor.setText("");
   say(`submitted: requestId=${ack?.requestId} submissionId=${ack?.submissionId} status=${ack?.status ?? ack?.skipped}`);
  }
  if (cancelled.length) {
   say(`cancelled: ${cancelled.shift()}`);
   editor.setText("");
  }
  return quit.word !== null;
 };

 if (reader) {
  for await (const chunk of reader()) {
   const keys = keystrokes ? [chunk] : [...`${chunk}${chunk.endsWith("\n") ? "" : "\n"}`];
   for (const key of keys) {
    editor.handleInput(key);
    noteCaret();
    if (drafts.length || cancelled.length || quit.word) break;
   }
   if (await drain()) break;
   await paint();
  }
 }
 else {
  // No reader: pi's OWN input routing does the feeding. pi-tui's terminal reads the real terminal
  // (`ProcessTerminal.start()` hands it an input handler) and `tui.js handleTerminalInput` delivers the
  // bytes to `this.focusedComponent.handleInput`, so the harness never reads stdin or parses a keystroke
  // itself; pi's keybinding layer above turns them into the callbacks this file records.
  ui.setFocus(editor);
  for (;;) {
   await new Promise((sleep) => setTimeout(sleep, settleMs));
   noteCaret();
   if (await drain()) break;
   // A shutdown signal is NOT a keystroke, so pi's keybinding layer cannot name it: the caller says
   // when the session was asked to stop, and this loop leaves so the caller's ordinary cleanup (close
   // the Harness, release the claim) runs instead of a hard kill that leaves a stale lock.
   if (shouldStop?.() === true) { quit.word = quit.word ?? "signal"; break; }
   await paint();
  }
 }

 if (liveWatch) await liveWatch.stop();
 return {
  theme: themeName,
  drafts: seenDrafts,
  slash,
  expansions: seenExpansions,
  clears: seenClears,
  caret,
  notes: notes.slice(),
  acks,
  submitted: acks.length,
  cancelled: seenCancels.length,
  quit: quit.word,
  paints: paints.count,
  history: seeded,
  piHistory: editor.history.slice(),
  conflicts: dock.conflicts,
  keys: {
   submit: dock.keybindings.getKeys("tui.input.submit"),
   interrupt: dock.keybindings.getKeys("app.interrupt"),
   exit: dock.keybindings.getKeys("app.exit"),
   clear: dock.keybindings.getKeys("app.clear"),
  },
 };
}
