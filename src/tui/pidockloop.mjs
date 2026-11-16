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
//   pi-coding-agent `CustomEditor.onEscape/onCtrlD/onAction` (dist/modes/interactive/components/custom-editor.d.ts)
//   pi's app-key defaults `app.interrupt`/`app.exit`/`app.clear` (dist/core/keybindings.d.ts `APP_KEYBINDINGS`)
//   pi's clear-the-draft rule `editor.setText("")` (dist/modes/interactive/interactive-mode.js `clearEditor`)
//   pi-durable's entry/usage/live reads (dist/entries.d.ts, dist/harness/harness.d.ts, dist/harness/live.d.ts)
// DROPPED from pi's own interactive layer, on purpose and named in the capability matrix rather than
// silently: pi's `InteractiveMode`/`AgentSessionRuntime` (there is no pi session here), pi's
// `autocomplete` provider, pi's model/thinking cycling (`app.model.*`, `app.thinking.*`: this harness
// picks its model once at open, so cycling would change state pi-durable never recorded), pi's
// `app.suspend`, and pi's `widgetsAbove`/`widgetsBelow` extension widgets (no pi extension UI here).
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
import { entryText, installPiTheme, piContextOf, piDockOf, piFooterOf, piHeaderOf, piLiveRows, piMarkdownTheme, piModelOf, piScreen, piStatusRows, piTranscriptDocument } from "./piscreen.mjs";

/** How many previous committed prompts pi's Editor history starts with; pi's own history object is
 * unexported at this pin, so the seed is pi-durable's committed user entries, oldest first. */
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
export function piRunHeader(parts) {
 const version = CURRENT_SESSION_VERSION;
 const model = piModelOf(parts);
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

/** pi's footer for this run, from pi-durable's committed entries only. */
function piRunFooter({ parts, entries, ui, context }) {
 const model = piModelOf(parts);
 return piFooterOf({
  entries,
  conversationId: parts.conversation.id,
  leafId: entries[0]?.id ?? null,
  entryCount: entries.length,
  cwd: parts?.intent?.cwd ?? parts?.cwd,
  model: { id: model.id, provider: model.provider, contextWindow: model.contextWindow, reasoning: model.reasoning },
  routedModel: null,
  providers: (parts?.models?.getProviders?.() ?? []).length,
  contextUsage: piContextOf(entries, parts?.models, model),
  thinkingLevel: parts?.settings?.thinkingLevel ?? null,
  autoCompactEnabled: parts?.settings?.compaction?.enabled === true,
  gitBranch: null,
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
 history = null,
 limit = 200,
 watch = true,
 settleMs = 40,
 repaint = null,
 quitWords = ["q", "quit", "exit"],
 shouldStop = null,
}) {
 const submitDraft = submit ?? ((text, ctx) => writerSubmit(parts, text, { context: ctx }));
 const say = report ?? ((line) => process.stderr.write(`${line}\n`));
 const cwd = parts?.intent?.cwd ?? parts?.cwd ?? null;
 const markdownTheme = piMarkdownTheme();
 const committed = async () => await transcript(parts.conversation, context, limit);

 // pi's theme first: pi's components read pi's theme slots, so the palette has to be installed before
 // any component is built.
 const themeName = piRunThemeOf(parts);

 // pi's Editor history seeded from pi-durable's committed user entries, oldest first.
 const seeded = Array.isArray(history) ? history : (await committed()).filter((entry) => entry?.kind === "pi.user").map((entry) => entryText(entry)).filter((text) => text).slice(-HISTORY_SEED);

 const dock = piDockOf(ui, { history: seeded });
 const editor = dock.editor;
 const drafts = [];
 const seenDrafts = [];
 const cancelled = [];
 const seenCancels = [];
 const quit = { word: null };
 const acks = [];
 const paints = { count: 0 };

 // pi's OWN callbacks: pi's keybinding layer decides which keystroke is which action, and this file only
 // records that it decided.
 editor.onSubmit = (text) => { drafts.push(text); seenDrafts.push(text); };
 editor.onEscape = () => { cancelled.push("escape"); seenCancels.push("escape"); };
 editor.onCtrlD = () => { quit.word = quit.word ?? "ctrl+d"; };
 editor.onAction("app.clear", () => { quit.word = quit.word ?? "ctrl+c"; });

 // The live plane is pi-durable's own: pi-durable's watch delivers frames, and pi's status rows and
 // in-flight tool boxes are built from pi-durable's `pi.live` doc, never from a spinner written here.
 const liveState = watch ? createSyncState(parts.conversation.id) : null;
 const liveWatch = liveState ? await openWatch({ harness: parts.harness }, parts.conversation.id, { state: liveState, context }) : null;

 const headerParts = piRunHeader(parts).header;
 const paint = async () => {
  const at = size();
  const entries = await committed();
  const live = liveState ? snapshotSync(liveState, { conversationId: parts.conversation.id }) : null;
  const pendingTools = {};
  const built = piTranscriptDocument({ entries, ui, cwd, markdownTheme, pendingTools, prepend: headerParts });
  for (const component of piLiveRows({ live: live?.live, pendingTools, ui, cwd })) built.document.addChild(component);
  const status = new Container();
  for (const row of piStatusRows(live?.live)) status.addChild(row);
  const screen = piScreen({ document: built.document, editor, status, footer: piRunFooter({ parts, entries, ui, context }) });
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
   if (quitWords.includes(text.trim().toLowerCase())) {
    quit.word = quit.word ?? text.trim().toLowerCase();
    return true;
   }
   const ack = await submitDraft(text, context);
   acks.push(ack);
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
  caret,
  acks,
  submitted: acks.length,
  cancelled: seenCancels.length,
  quit: quit.word,
  paints: paints.count,
  history: seeded,
  conflicts: dock.conflicts,
  keys: {
   submit: dock.keybindings.getKeys("tui.input.submit"),
   interrupt: dock.keybindings.getKeys("app.interrupt"),
   exit: dock.keybindings.getKeys("app.exit"),
   clear: dock.keybindings.getKeys("app.clear"),
  },
 };
}
