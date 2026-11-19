#!/usr/bin/env node
// demo/recall.test.mjs - up-arrow recalls the prompt the user just typed, on BOTH input surfaces (headless
// captures plus ONE proof under an ALLOCATED pty over the real cli.mjs).
//
// WHY THIS FILE EXISTS: the user's fourth report was "pressing 'up' does not recall the last prompt I
// typed". The claim below is therefore about pi's own history machine and pi's own arrow key, and it is
// checked against what the two surfaces actually DO with a recalled line - a SECOND submission of the
// SAME text, admitted as its OWN new prompt, which is pi's own rule - rather than against a narrator's
// summary. pi's dist/modes/interactive/interactive-mode.js `setupEditorSubmitHandler` calls `session.prompt(text)`
// once per ENTER and pi's `Editor.addToHistory` doc says it is "Called after successful submission", so a
// recalled line re-asks: pi-durable's exactly-once admission still answers, but per REQUEST ID, and what
// the TUI's fallback names is the SUBMISSION EVENT (src/tui/writer.mjs), not the typed words.
//
// PROVENANCE: no Durian-Pi original for the pi-style half - Durian-Pi read whole lines with its own
// driver (~/Git/Durian-Pi/src/tui/client.mjs), so pi's `Editor` history was never pi's there. What is
// VERIFIED against the pinned packages, read on this machine at pin v1.5.1: pi-tui's PUBLIC
// `Editor.addToHistory` (dist/components/editor.d.ts, whose doc says "Called after successful submission";
// its body trims, skips empty, skips a CONSECUTIVE duplicate, `history.unshift` so index 0 is NEWEST, and
// caps at 100), pi's `historyIndex = -1` (not browsing) / `historyDraft` capture-restore machine
// (`navigateHistory(direction)`, `newIndex = historyIndex - direction`, so UP deepens), pi's arrow key
// being `tui.editor.cursorUp` whose default key is pi's own KeyId word `up` (dist/keys.d.ts, pi's exported
// `Key.up`/`Key.down` and `parseKey`/`matchesKey`), and pi's `EditorOptions`/`CustomEditorOptions`, which
// carry NO history option at this pin - so a `{ history }` constructor arg is silently dropped by pi,
// which is exactly what made up-arrow a no-op. The row half is the Durian-Pi machine (src/tui/viewmode.mjs
// and src/tui/driver.mjs, whose headers name their Durian-Pi originals); pi's RULES are re-derived there
// because that surface's overlay is not pi's `Editor`, and the capability matrix row for the difference
// cites this demo.
//
// Offline: pi-ai's faux plane answers every turn (no endpoint is contacted), the store is a temp sqlite
// file, and the pi-style dock paints into a captured terminal rather than a TTY. THE ONE EXCEPTION is the
// last section, which drives the REAL `cli.mjs` pi-screen path under an ALLOCATED pty through the committed
// helper `scripts/ptydrive.mjs` (python3's standard-library `pty`, ONE keystroke per pty write, ENTER as
// \r, pi's up arrow as ESC[A written ONCE): a pty is a kernel object, not a socket, and the child spells
// `--faux`, so that section is still offline - it exists because the symptom the user reported is a human
// pressing the up arrow at a real terminal, and pi's paint is what that human sees.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { claimWriter, releaseWriter, readOwner } from "../src/ownership.mjs";
import { harnessInvocation, settleInvocation } from "../src/cli-intent.mjs";
import { openStore, readEntries, listConversations } from "../src/readapi.mjs";
import { scriptTurn, transcript } from "../src/core.mjs";
import { writerSubmit, openWriterView } from "../src/tui/writer.mjs";
import { renderFrame } from "../src/tui/frame.mjs";
import { INPUT_MARK } from "../src/tui/frame.mjs";
import { createViewMode, PI_HISTORY_LIMIT } from "../src/tui/viewmode.mjs";
import { createUiDriver, DRIVER_KEYS } from "../src/tui/driver.mjs";
import { entryText, piAddToHistory } from "../src/tui/piscreen.mjs";
import { piDockLoop } from "../src/tui/pidockloop.mjs";
import { Key, TuiAltScreen, matchesKey, parseKey, stripTerminalSequences } from "@earendil-works/pi-tui";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";

const ROOT = process.cwd();
const checks = [];
function record(ok, label, detail = "") {
 checks.push({ ok, label });
 console.log(`  ${ok ? "ok " : "NOT"} ${label}${detail ? `: ${detail}` : ""}`);
}

/** pi-tui's public `Terminal` interface (dist/terminal.d.ts), captured rather than sent to a TTY. */
function captureTerminal(columns, rows, sink) {
 const terminal = {
  start: (onInput, onResize) => {},
  stop: () => {},
  write: (data) => { sink.push(data); },
  moveBy: (lines) => {},
  hideCursor: () => {},
  showCursor: () => {},
  clearLine: () => {},
  clearFromCursor: () => {},
  clearScreen: () => {},
  setTitle: (title) => {},
  setProgress: (_state) => {},
  drainInput: async () => [],
 };
 Object.defineProperty(terminal, "columns", { get: () => columns });
 Object.defineProperty(terminal, "rows", { get: () => rows });
 Object.defineProperty(terminal, "kittyProtocolActive", { get: () => false });
 return terminal;
}

function splitPaintedRows(bytes) {
 return bytes.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "\n").split("\n").map((line) => stripTerminalSequences(line)).filter((line) => line.trim());
}

/**
 * The committed pty driver: scripts/ptydrive.mjs. Helper flags go BEFORE `--`, the child argv AFTER (a flag
 * after `--` belongs to the child). Keystrokes travel as `--feed-hex` so the exact bytes - ENTER is \r, pi's
 * up arrow is ONE write of ESC[A - reach the pty without a shell interpreting them. The helper writes ONE
 * keystroke per pty write and writes `PREFIX.screen` (raw painted bytes, pi's cursor control still visible)
 * plus `PREFIX.plain`, unescaped with pi-tui's OWN `stripTerminalSequences`, so this file reads the real
 * terminal's paint the same way it reads every other paint in this repo.
 */
async function driveTerminal(argv, feeds, capture) {
 const args = [join(ROOT, "scripts", "ptydrive.mjs"), "--capture", capture, "--timeout", "45", "--after", "2", "--gap", "0.9", "--quiet", "--json"];
 for (const hex of feeds) args.push("--feed-hex", hex);
 args.push("--", ...argv);
 const helper = spawn("node", args, { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
 let out = "";
 let err = "";
 helper.stdout.on("data", (chunk) => { out += chunk.toString(); });
 helper.stderr.on("data", (chunk) => { err += chunk.toString(); });
 await new Promise((done) => helper.once("exit", done));
 if (helper.exitCode !== 0) return { exit: null, sent: null, screen: "", plain: "", error: `pty helper exited ${helper.exitCode}: ${err.slice(0, 200)}` };
 const summary = out.split("\n").map((line) => line.trim()).filter((line) => line.startsWith("{"));
 if (!summary.length) return { exit: null, sent: null, screen: "", plain: "", error: `pty helper answered without its JSON summary: ${out.slice(0, 200)}` };
 try {
  const parsed = JSON.parse(summary[0]);
  return { exit: parsed.exit, sent: parsed.sent, screen: readFileSync(`${capture}.screen`, "utf8"), plain: readFileSync(`${capture}.plain`, "utf8"), error: null };
 } catch (err2) {
  return { exit: null, sent: null, screen: "", plain: "", error: `pty helper answered unparseably: ${String(err2?.message ?? err2)}: ${out.slice(0, 200)}` };
 }
}

async function storeUserTexts(storePath) {
 const viewer = await openStore(storePath);
 const rows = await listConversations(viewer);
 const texts = [];
 for (const row of rows) {
  const page = await readEntries(viewer, row.id, { limit: 50 });
  texts.push(...page.items.filter((entry) => entry?.kind === "pi.user").map((entry) => entryText(entry)).filter((text) => text));
 }
 return texts;
}

const UP = "\u001b[A";
const DOWN = "\u001b[B";
const ENTER = "\r";

async function main() {
 const dir = mkdtempSync(join(tmpdir(), "dh-recall-"));
 const store = join(dir, "s.sqlite");
 const marker = "the recalled answer is scripted";
 const first = "an earlier question";
 const settled = "the settled question";
 const recalled = "remember the number seven";

 // 1) Two committed prompts FIRST, so the dock's history SEED has something to recall. They go through
 // the same admission every surface uses (src/tui/writer.mjs' writerSubmit, the ONE mutation line).
 const claim = claimWriter(store);
 record(claim.mode === "writer" && readOwner(store).owned,
  "this process claimed the store before either surface opened (one writer, one mutation line)",
  `pid=${process.pid} lock=${claim.path}`);
 const parts = await harnessInvocation({ store, cwd: dir, faux: marker, messages: [] }, { context: BACKGROUND_CONTEXT });
 const seedAcks = [];
 for (const text of [settled, first]) {
  if (parts.intent.faux) scriptTurn(parts.faux, [marker]);
  seedAcks.push(await writerSubmit(parts, text, { context: BACKGROUND_CONTEXT }));
 }
 await settleInvocation(parts);
 const committedBefore = await storeUserTexts(store);
 record(committedBefore.includes(settled) && committedBefore.includes(first),
  "two committed pi.user prompts exist before the dock opens, so up-arrow has a SEED and not a remembered list",
  `rows=${JSON.stringify(committedBefore)}`);

 // 2) pi's own ARROW KEY, spelled with pi-tui's own exports: the demo types an escape sequence exactly
 // once, and pi-tui's parser - not a table here - says it is pi's `Key.up` (KeyId word `up`).
 record(parseKey(UP) === Key.up && matchesKey(UP, Key.up) && !matchesKey(UP, Key.down) && DRIVER_KEYS.history.includes(Key.up) && DRIVER_KEYS.history.includes(Key.down),
  "the up arrow is pi's OWN key: pi-tui's parseKey/matchesKey name it `up`, and DRIVER_KEYS.history carries pi's Key.up/Key.down",
  `Key.up=${JSON.stringify(Key.up)} parse=${JSON.stringify(parseKey(UP))} parseDown=${JSON.stringify(parseKey(DOWN))}`);

 // 3) THE PI-STYLE DOCK: pi's own Editor, pi's own key table, pi's own history array.
 // The keystrokes are: TYPE `recalled` ENTER, UP ENTER (pi recalls and resubmits), then UP UP ENTER
 // (pi browses DEEPER - it lands on a committed seed prompt, not on what the user typed).
 const WIDTH = 76;
 const TALL = 24;
 const sink = [];
 const ui = new TuiAltScreen(captureTerminal(WIDTH, TALL, sink), false, undefined);
 ui.start();
 const report = [];
 // pi-ai's faux provider answers from a QUEUE, so a session that submits N prompts arms N replies (the
 // SAME rule cli.mjs' piScreenRun passes into piDockLoop's `submit` hook).
 const submit = async (text, ctx) => {
  if (parts.intent.faux) scriptTurn(parts.faux, [marker]);
  return await writerSubmit(parts, text, { context: ctx });
 };
 const keys = [
  ...Array.from(recalled), ENTER,
  UP, ENTER,
  UP, UP, ENTER,
  ...Array.from("q"), ENTER,
 ];
 const tally = await piDockLoop({
  parts,
  ui,
  size: () => ({ columns: WIDTH, rows: TALL }),
  context: BACKGROUND_CONTEXT,
  keystrokes: true,
  reader: () => keys,
  report: (line) => { report.push(line); },
  submit,
 });
 ui.clear();
 ui.requestRender();
 ui.stop();
 const painted = splitPaintedRows(sink.join(""));
 const paintedText = stripTerminalSequences(sink.join(""));
 const reportText = report.join("\n");

 // 3a) pi's own history array, read off pi's own component: newest-first, no consecutive duplicate,
 // the typed prompt at index 0 because pi just submitted it.
 record(tally.piHistory[0] === first && tally.piHistory[1] === recalled && tally.piHistory.includes(settled),
  "pi's OWN `Editor.history` (not a harness list) is newest-first: the resubmitted seed prompt is NEWEST, above the prompt typed and recalled THIS session, above the older seed",
  `piHistory=${JSON.stringify(tally.piHistory)} seed=${JSON.stringify(tally.history)}`);
 record(tally.piHistory.filter((text) => text === recalled).length === 1,
  "pi's OWN no-consecutive-duplicate rule ran: a prompt typed once, recalled and resubmitted is ONE history entry",
  `duplicates=${tally.piHistory.filter((text) => text === recalled).length}`);

 // 3b) the recalls actually RESUBMITTED, and pi-durable admitted each exactly once.
 record(tally.drafts.filter((text) => text === recalled).length === 2,
  "pi's up-arrow handed the SAME prompt back to pi's Editor twice: once typed, once recalled",
  `drafts=${JSON.stringify(tally.drafts)}`);
 const seedRecall = tally.drafts.filter((text) => text === first);
 record(seedRecall.length === 1,
  "pi's browse-DEEPER rule (up twice) landed on a COMMITTED seed prompt and resubmitted it, not on the typed one",
  `drafts=${JSON.stringify(tally.drafts)} first=${JSON.stringify(first)}`);
 const ids = (tally.acks ?? []).map((ack) => ack?.requestId);
 const subIds = (tally.acks ?? []).map((ack) => ack?.submissionId);
 record(tally.submitted === 3 && ids.length === 3 && new Set(ids).size === 3 && new Set(subIds).size === 3,
  "three ENTERs made THREE admissions on THREE requestIds and THREE submissionIds: pi's rule is ONE NEW PROMPT per finished draft, so pi's up arrow re-asks rather than replaying; pi-durable's exactly-once admission still answers per requestId (src/rpc.mjs' `msg.requestId ?? msg.id`, src/attach.mjs' client round-trip), and the TUI's fallback names the SUBMISSION EVENT rather than the typed words",
  `submitted=${tally.submitted} requestIds=${JSON.stringify(ids)} submissionIds=${JSON.stringify(subIds)}`);
 const after = await storeUserTexts(store);
 record(after.filter((text) => text === recalled).length === 2 && after.filter((text) => text === first).length === 2,
  "the store holds the recalled prompt TWICE - typed once, resubmitted once by pi's up arrow - and the committed seed prompt twice (seeded, then asked again by pi's browse-DEEPER rule): ONE pi.user row PER submission, while pi's OWN Editor history still carries the typed prompt ONCE (pi's consecutive-duplicate rule, asserted above)",
  `rows=${JSON.stringify(after)}`);
 const firstSeedAck = seedAcks[1];
 const dockAcks = tally.acks ?? [];
 const admitted = dockAcks.filter((ack) => ack?.status === "done" || ack?.status === "placed" || ack?.status === "queued");
 const recallOfSeedAck = dockAcks[dockAcks.length - 1];
 record(admitted.length === tally.submitted && new Set(subIds).size === tally.submitted && !subIds.includes(firstSeedAck?.submissionId) && recallOfSeedAck?.status === "placed" && !reportText.includes("nothing was typed"),
  "every recall got its OWN admission and its own answer ack, INCLUDING the recall of an already-committed seed prompt (a different submissionId, so pi-durable really starts a run for it) - the measured symptom was a recall landing on the seed's submissionId, which answered `status=done` and committed nothing",
  `acks=${JSON.stringify(dockAcks)} seeded=${JSON.stringify(firstSeedAck)} recall=${JSON.stringify(recallOfSeedAck)} report=${JSON.stringify(report.slice(0, 2))}`);
 record(paintedText.includes(recalled) && painted.filter((row) => row.trim() === recalled).length > 0,
  "pi PAINTED the recalled line inside its own dock, so a human sees the recall rather than inferring it",
  `rows=${JSON.stringify(painted.filter((row) => row.trim() === recalled).slice(0, 2))}`);
 record(painted.filter((row) => row.trim() === first).length > 0,
  "pi painted the deeper recall too, so pi's browse-DEEPER state is visible in the frames",
  `rows=${JSON.stringify(painted.filter((row) => row.trim() === first).slice(0, 2))}`);
 // piAddToHistory is the harness's ONE route to pi's PUBLIC method, and it THROWS rather than
 // silently doing nothing if a pin stops shipping it, so a dropped API turns this demo red instead of
 // quietly returning pi's measured no-op (`status=nothing was typed`).
 const piRoute = { history: [] };
 const piEditorish = { addToHistory: (text) => { piRoute.history.unshift(String(text ?? "").trim()); } };
 let dropped = null;
 try {
  piAddToHistory(piEditorish, ` ${recalled} `);
 } catch (err) {
  dropped = String(err?.message ?? err);
 }
 let droppedToo = null;
 try {
  piAddToHistory({ history: [] }, "probe");
 } catch (err) {
  droppedToo = String(err?.message ?? err);
 }
 record(dropped === null && piRoute.history[0] === recalled,
  "pi's PUBLIC addToHistory (trimmed by pi's own body) is the seed/push route, not a constructor option pi does not have",
  `piRoute=${JSON.stringify(piRoute.history)}`);
 record(droppedToo !== null && droppedToo.includes("addToHistory"),
  "the route THROWS when pi's addToHistory is missing, so a pin that drops the API cannot restore the no-op",
  `throws=${JSON.stringify(droppedToo)}`);

 // 4) THE ROW SURFACE: Durian-Pi's one-line overlay (src/tui/viewmode.mjs) driven by pi's own key NAMES
 // (src/tui/driver.mjs' DRIVER_KEYS.history through pi-tui's matchesKey). The row view keeps the
 // remember-the-view-under rule, so pi's history MACHINERY cannot serve it and its rules are re-derived;
 // this section asserts the re-derived machine agrees with pi's arithmetic.
 const view = createViewMode();
 view.noteHistory(settled);
 view.noteHistory(first);
 record(view.browsing === -1 && view.history[0] === first && view.history.length === 2,
  "pi's newest-first seeding (unshift) is what the row machine holds, and `-1` means not browsing",
  `history=${JSON.stringify(view.history)} browsing=${view.browsing}`);
 view.enterInput("run the tests now");
 const deep = view.recallHistory(-1);
 const deeper = view.recallHistory(-1);
 const back = view.recallHistory(1);
 const restored = view.recallHistory(1);
 const refused = view.recallHistory(1);
 record(deep.browsed && deep.typed === first && deeper.browsed && deeper.typed === settled,
  "pi's navigateHistory arithmetic: up is -1 so it DEEPENS the index, and up-up lands on the OLDER committed prompt",
  `deep=${JSON.stringify(deep)} deeper=${JSON.stringify(deeper)}`);
 record(back.browsed && back.typed === first,
  "pi's down arrow (+1) returns toward the newest prompt",
  `back=${JSON.stringify(back)}`);
 record(restored.browsed && restored.typed === "run the tests now",
  "pi's draft RESTORE: back at historyIndex -1 the line the user was typing comes back whole",
  `restored=${JSON.stringify(restored)}`);
 record(refused.browsed === false && refused.why === "nothing further",
  "pi's out-of-range refusal (`newIndex < -1`) rather than a wrap or a silent repeat",
  `refused=${JSON.stringify(refused)}`);
 record(view.noteHistory("") === false && view.noteHistory("   ") === false && view.noteHistory(first) === false,
  "pi's skip-empty and no-CONSECUTIVE-duplicate rules are the row machine's too (pi's body compares index 0)",
  `history=${JSON.stringify(view.history)}`);
 const capped = createViewMode();
 for (let i = 0; i < PI_HISTORY_LIMIT + 7; i += 1) capped.noteHistory(`prompt ${i}`);
 record(capped.history.length === PI_HISTORY_LIMIT && capped.history[0] === `prompt ${PI_HISTORY_LIMIT + 6}`,
  "pi's own 100-entry cap (pi's `if (this.history.length > 100) this.history.pop()`) bounds the row machine too",
  `length=${capped.history.length} newest=${JSON.stringify(capped.history[0])} limit=${PI_HISTORY_LIMIT}`);

 // 5) the row machine under the real driver, feeding pi's arrow key: the recalled line is a SECOND
 // submission of the same text, admitted once, and answered.
 const view2 = await openWriterView(parts, { conversationId: parts.conversation.id, context: BACKGROUND_CONTEXT });
 const pending = [];
 const frames = [];
 const driver = createUiDriver({
  getSize: () => ({ columns: WIDTH, rows: TALL }),
  readState: async () => await view2.read(),
  paint: async (state, { width, height }) => {
   // `overlay: driver.view` is what the ROW surface does on a real terminal (cli.mjs' writerTui hands the
   // same thing to the writer view's paint), so the demo asserts the frame a user actually sees.
   const frame = await renderFrame(state, { width, height, conversationId: parts.conversation.id, overlay: driver.view, overlayAt: 1 });
   frames.push(frame);
   return frame;
  },
  pollMs: 700,
  onInput: (line) => { pending.push(line); },
  // The row surface seeds pi's history from pi-durable's committed `pi.user` prompts, oldest first -
  // the same seed rule cli.mjs' writerTui uses (ROW_HISTORY_SEED).
  history: (await transcript(parts.conversation, BACKGROUND_CONTEXT, 200))
   .filter((entry) => entry?.kind === "pi.user").map((entry) => entryText(entry)).filter((text) => text)
   .slice(0, 8).reverse(),
  // A real terminal keeps pi's quits (ESC/Ctrl+C) and pi's own Ctrl+R refresh, so a prompt may START
  // with `q` or `r` (measured: with the headless bare-`r` rule a prompt reached the agent truncated).
  quitOnBareQ: false,
  refreshOnBareR: false,
 });
 const upMarks = [];
 const downMarks = [];
 let typedAfterUp = null;
 for (const key of [...Array.from(recalled), ENTER, UP, DOWN, UP, ENTER]) {
  const before = driver.marks.length;
  driver.noteData(key);
  const delta = driver.marks.slice(before);
  if (key === UP) {
   upMarks.push(...delta);
   typedAfterUp = driver.view.typed;
  }
  if (key === DOWN) downMarks.push(...delta);
  await driver.tickIfDirty();
 }
 const rowsBeforeRowSurface = (await storeUserTexts(store)).filter((text) => text === recalled).length;
 const flushed = [];
 while (pending.length) {
  const line = pending.shift();
  if (parts.intent.faux) scriptTurn(parts.faux, [marker]);
  flushed.push(await writerSubmit(parts, line, { context: BACKGROUND_CONTEXT }));
 }
 record(flushed.length === 2 && new Set(flushed.map((ack) => ack?.requestId)).size === 2 && new Set(flushed.map((ack) => ack?.submissionId)).size === 2,
  "the row surface recalled and resubmitted the SAME line as its OWN second admission (two requestIds, two submissionIds): pi's rule is one new prompt per ENTER, on this surface too",
  `flushed=${JSON.stringify(flushed)}`);
 const rowsAfterRowSurface = (await storeUserTexts(store)).filter((text) => text === recalled).length;
 record(rowsAfterRowSurface === rowsBeforeRowSurface + flushed.length,
  "the row surface's recalled resubmission added its own pi.user row as well - one row per admission, which the text-derived requestId used to swallow into the first row",
  `before=${rowsBeforeRowSurface} after=${rowsAfterRowSurface} admitted=${flushed.length} rows=${JSON.stringify(await storeUserTexts(store))}`);
 record(upMarks.every((reason) => reason === "history recalled") && upMarks.length === 2 && downMarks.every((reason) => reason === "history recalled") && typedAfterUp === recalled,
  "pi's own arrow key drove pi's history move on the row surface: the mark says `history recalled` (up, browse back, up again) and the OVERLAY holds the recalled line",
  `upMarks=${JSON.stringify(upMarks)} downMarks=${JSON.stringify(downMarks)} typedAfterUp=${JSON.stringify(typedAfterUp)}`);
 // The other half of pi's arrow rule: an arrow over a line that ALREADY has text and is not browsing is
 // pi's CURSOR MOVE, not a history jump - and on this one-line overlay it must type NOTHING. The measured
 // bug this fixes was the raw escape bytes landing inside the prompt.
 const caret = createUiDriver({
  getSize: () => ({ columns: WIDTH, rows: TALL }),
  readState: async () => null,
  paint: async () => ({ rows: [], painted: { lines: [] } }),
  history: [first],
 });
 caret.noteData("ab");
 const caretMark = caret.marks.length;
 caret.noteData(UP);
 const caretDelta = caret.marks.slice(caretMark);
 record(caretDelta.length === 1 && /cursor move on a one-line overlay/.test(String(caretDelta[0])) && caret.view.typed === "ab",
  "an arrow over a NON-empty non-browsing line is pi's cursor move, so NOTHING is typed into the line (no escape bytes in the prompt)",
  `delta=${JSON.stringify(caretDelta)} typed=${JSON.stringify(caret.view.typed)}`);
 record(driver.history[0] === recalled && driver.view.browsing === -1,
  "the row machine's history is newest-first and a submit leaves browsing, as pi's exitHistoryBrowsing does",
  `history=${JSON.stringify(driver.history)} browsing=${driver.view.browsing}`);
 const overlayFrames = frames.length;
 record(overlayFrames > 0, "the row surface repainted for every keystroke (poll, not freelock)",
  `frames=${overlayFrames}`);
 // What the row view DOES show, measured rather than assumed: the typed draft is PAINTED over one frame row
 // (src/tui/frame.mjs' withInputOverlay, composed through pi-tui's own `compositeTuiLine`), so a recalled
 // line is VISIBLE and not merely resubmitted. Before this fix a user at `--tui` typed BLIND: raw mode echoes
 // nothing and no row carried the mark (measured: 0 marked rows in every painted frame). The overlay covers
 // the WHOLE row it stands on, so no frame text shows through the middle of a word, and while the overlay is
 // closed the frame underneath comes back whole (the viewmode header's rule).
 const markedRows = frames.flatMap((frame) => (frame.painted?.lines ?? []).map(String)).filter((row) => stripTerminalSequences(row).startsWith(INPUT_MARK));
 const markedPlain = markedRows.map((row) => stripTerminalSequences(row).replace(/\s+$/, ""));
 const recalledRows = markedPlain.filter((row) => row === `${INPUT_MARK}${recalled}`);
 const residue = markedPlain.filter((row) => /newest|end of transcript/.test(row.slice(INPUT_MARK.length)));
 record(markedRows.length > 0 && recalledRows.length >= 1 && residue.length === 0,
  "the row surface PAINTS the draft being typed and the RECALLED line over one frame row, whole-row covered",
  `markedRows=${markedRows.length} recalledRows=${recalledRows.length} residue=${residue.length} lastDraft=${JSON.stringify(markedPlain.slice(-1))}`);
 const idleFrames = frames.filter((frame) => (frame.painted?.lines ?? []).every((row) => !stripTerminalSequences(String(row)).startsWith(INPUT_MARK)));
 record(idleFrames.length >= 2 && frames.length > idleFrames.length,
  "while the overlay is closed the frame comes back whole and carries NO mark row (the overlay covers, never replaces, the view)",
  `idleFrames=${idleFrames.length} overlayFrames=${frames.length - idleFrames.length} frames=${frames.length}`);

 // 6) the headless half of the bare-`r` split: the SCRIPTED surface keeps Durian-Pi's refresh answer, so
 // a bare `r` on an empty line repaints and types nothing (a prompt may still start with `r` once typing
 // has begun).
 const scripted = createUiDriver({
  getSize: () => ({ columns: WIDTH, rows: TALL }),
  readState: async () => null,
  paint: async () => ({ rows: [], painted: { lines: [] } }),
  refreshOnBareR: true,
 });
 const idle = scripted.noteData("r");
 record(idle.quit === null && scripted.marks.some((reason) => reason.startsWith("refresh")) && scripted.typedOut.length === 0,
  "the scripted surface keeps the bare-`r` refresh and types nothing, which is what the headless demos rely on",
  `marks=${JSON.stringify(scripted.marks)}`);

 // 7) THE SYMPTOM AT THE REAL TERMINAL: pi's up arrow typed into an ALLOCATED pty over the REAL cli.mjs
 // pi-screen path (cli.mjs' piScreenRun -> src/tui/pidockloop.mjs' piDockLoop), not over this file's captured
 // terminal. A pty is a kernel object rather than a socket and the child spells `--faux`, so this stays an
 // offline proof, but it is the human's own keystrokes: TYPE the prompt, ENTER, pi's UP ARROW written ONCE
 // as ESC[A, ENTER, then pi's quit word.
 const ptyDir = mkdtempSync(join(tmpdir(), "dh-recall-pty-"));
 const ptyStore = join(ptyDir, "s.sqlite");
 const ptyCapture = join(ptyDir, "run");
 const typed = "alpha one";
 const ptyRun = await driveTerminal(
  ["node", join(ROOT, "cli.mjs"), "--store", ptyStore, "--cwd", ptyDir, "--width", "78", "--height", "16", "--faux", "probe"],
  [Buffer.from(`${typed}\r`).toString("hex"), Buffer.from("\u001b[A\r").toString("hex"), Buffer.from("quit\r").toString("hex")],
  ptyCapture,
 );
 record(ptyRun.error === null && ptyRun.exit === 0 && ptyRun.sent === 3,
  "the real cli at its pi-style dock took pi's typed ENTER, pi's UP ARROW as ONE pty write (ESC[A), and pi's quit word, then exited cleanly",
  `exit=${ptyRun.exit} keystrokesWritten=${ptyRun.sent} paintedBytes=${ptyRun.screen.length} error=${ptyRun.error ?? "-"}`);
 // The ack is now painted as its OWN wrapped transcript row (the alt screen is open, so pidockloop's `say`
 // routes it into the document rather than into raw stderr), so each ack is matched by pi-durable's OWN
 // identity triple anywhere in the paint rather than by a line prefix. A painted row stays visible while
 // later frames change around it, so the same triple can be matched MORE THAN ONCE; what counts is the
 // number of DISTINCT triples, which is the number of prompts pi-durable admitted.
 const ptyAcks = [...ptyRun.plain.matchAll(/requestId=(\S+) submissionId=(\d+) status=(\w+)/g)];
 const ptyAckTriples = new Set(ptyAcks.map((m) => m.slice(1).join("/")));
 record(ptyAckTriples.size === 2 && ptyAcks.every((m) => m[3] === "placed" || m[3] === "queued" || m[3] === "done"),
  "at the real terminal the recalled line became its OWN new prompt: TWO admitted prompts, proven by TWO DISTINCT requestId/submissionId/status triples in pi's paint (each admitted once), not by counting painted rows",
  `distinctTriples=${ptyAckTriples.size} matches=${ptyAcks.length} triples=${JSON.stringify([...ptyAckTriples])}`);
 const ptyRows = await storeUserTexts(ptyStore);
 record(ptyRows.filter((text) => text === typed).length === 2,
  "the store carries a pi.user row for the typed prompt AND for the prompt pi's up arrow recalled and resubmitted - a recalled line is a new prompt in pi's own rule, so pi-durable commits it and pi answers it again",
  `rows=${JSON.stringify(ptyRows)}`);
 const ptyPaintRows = splitPaintedRows(ptyRun.screen);
 const ptyTypedRows = ptyPaintRows.filter((row) => row.trim() === typed);
 const ptyAnswerRows = ptyPaintRows.filter((row) => row.trim() === "probe");
 record(ptyTypedRows.length >= 2 && ptyAnswerRows.length >= 1 && ptyPaintRows.length > 10,
  "pi's paint carries a row for EACH submission and an ANSWER row after the recalled one, so a human at the terminal SEES the recall and its answer rather than inferring them from a tally",
  `typedRows=${ptyTypedRows.length} answerRows=${ptyAnswerRows.length} paintedRows=${ptyPaintRows.length}`);
 record(!ptyRun.plain.includes("nothing was typed"),
  "pi's up arrow found pi's history at the real dock - pi's own refusal for an empty history (`nothing was typed`) never appears in the paint",
  `refusal=${JSON.stringify(ptyRun.plain.includes("nothing was typed"))}`);
 record(/[^\r\n]*cancelled=\d+ quit=quit/.test(ptyRun.plain),
  "the dock named WHY it left after pi's quit word, so the recall run ended on pi's own rule rather than being cut off",
  `leave=${JSON.stringify((/[^\r\n]*cancelled=\d+ quit=quit/.exec(ptyRun.plain) ?? [""])[0].slice(-140))}`);
 record(!readOwner(ptyStore).owned,
  "the pty run released the store it owned, so the recall proof left no writer behind",
  `owner=${JSON.stringify(readOwner(ptyStore))}`);

 await settleInvocation(parts);
 await parts.harness.close(BACKGROUND_CONTEXT);
 const released = releaseWriter(store);
 const owner = readOwner(store);
 record(released && !owner.owned,
  "the recall runs ran the ordinary cleanup: the Harness closed and this process released its claim",
  `released=${released} owner=${JSON.stringify(owner)}`);

 const failed = checks.filter((check) => !check.ok);
 console.log(`recall: ${checks.length - failed.length}/${checks.length} checks passed`);
 if (failed.length) process.exitCode = 1;
}

await main();
