#!/usr/bin/env node
// demo/pieditor.test.mjs - pi's OWN input dock: keystrokes go to pi's `CustomEditor`, pi's keybinding
// layer decides what they mean, and the ONLY thing the harness decides is which pi-durable call a
// finished draft becomes. Every claim is made against CAPTURED PAINT BYTES and a store read-back, not
// against a narrator's summary.
//
// PROVENANCE: no Durian-Pi original - Durian-Pi never drove an input component (its
// ~/Git/Durian-Pi/src/tui/client.mjs read whole lines with its own driver, so pi's caret, borders,
// history and keybinding hints were never pi's there). What is VERIFIED AGAINST PINED packages, read
// on this machine at pin v1.5.1: pi-tui's `Editor.handleInput/getText/setText/onSubmit/onChange`
// (dist/components/editor.d.ts), pi-coding-agent's `CustomEditor.onEscape/onCtrlD/onAction`
// (dist/modes/interactive/components/custom-editor.d.ts), pi's `APP_KEYBINDINGS` defaults
// (dist/core/keybindings.d.ts), pi's `clearEditor()` rule (interactive-mode.js), pi-tui's public
// `Terminal` interface (dist/terminal.d.ts) and `TuiAltScreen.setLayoutRoot`, and pi-durable's
// entry reads (dist/entries.d.ts). DROPPED/omitted from pi's own interactive layer, and named in the
// capability matrix rather than silently: pi's `InteractiveMode`/`AgentSessionRuntime`, pi's
// `autocomplete` provider, pi's model/thinking cycling, pi's `widgetsAbove`/`widgetsBelow`.
//
// WHY A PTY AT ALL, AND WHY scripts/ptydrive.mjs: Node has no pty primitive and the harness must not add a
// dependency for a test, so the ONE pty check goes through the committed helper scripts/ptydrive.mjs, which
// allocates the terminal with python3's standard-library `pty` module and writes ONE keystroke per pty write,
// spaced (--after the first paint, then --gap) the way a human types. It replaced an inline allocator here that
// wrote both feeds within ~0.2 s of each other and of the first paint, which raced the submitted draft's paint
// (the draft was typed but never visible in the capture). The code under test never sees python: it is a normal
// Node child whose stdio is the pty's slave side, and a pty is a kernel object, not a socket, so the run stays
// inside the offline proof (pi-ai's faux plane answers; no provider endpoint is contacted).
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

import { claimWriter, releaseWriter, readOwner } from "../src/ownership.mjs";
import { harnessInvocation, settleInvocation } from "../src/cli-intent.mjs";
import { openStore, readEntries, listConversations } from "../src/readapi.mjs";
import { piDockLoop, piRunHeader, piSessionLines } from "../src/tui/pidockloop.mjs";
import { entryText } from "../src/tui/piscreen.mjs";
import { scriptTurn } from "../src/core.mjs";
import { Container, TuiAltScreen, stripTerminalSequences } from "@earendil-works/pi-tui";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";

const ROOT = process.cwd();
const checks = [];
function record(ok, label, detail = "") {
 checks.push({ ok, label });
 console.log(`  ${ok ? "ok " : "NOT"} ${label}${detail ? `: ${detail}` : ""}`);
}

// pi-tui's public `Terminal` interface (dist/terminal.d.ts), captured rather than sent to a TTY.
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

// Fullscreen painting separates rows with ANSI cursor/erase sequences, not with newlines.
function splitPaintedRows(bytes) {
 return bytes.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "\n").split("\n").map((line) => stripTerminalSequences(line)).filter((line) => line.trim());
}

// What the store says, through the read API's ONE opener - never through a second one.
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

/**
 * The committed pty driver: scripts/ptydrive.mjs. Helper flags go BEFORE `--`, the child argv AFTER (measured
 * gotcha: a flag after `--` belongs to the child). Keystrokes travel as `--feed-hex` so the exact bytes (ENTER is
 * \r, pi's up arrow is ESC[A) reach the pty without any shell's interpretation. The helper writes ONE keystroke per
 * pty write and hands back `PREFIX.screen` (raw painted bytes, where pi's own cursor control is still visible)
 * plus `PREFIX.plain`, unescaped with pi-tui's OWN `stripTerminalSequences` - so "what the child painted" is read
 * the same way every other paint claim in this repo reads it.
 */
async function driveTerminal(argv, feeds, capture) {
 const args = [join(ROOT, "scripts", "ptydrive.mjs"), "--capture", capture, "--timeout", "40", "--after", "1.5", "--gap", "0.6", "--quiet", "--json"];
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

async function runCli(argv) {
 const child = spawn("node", [join(ROOT, "cli.mjs"), ...argv], { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
 let out = "";
 child.stdout.on("data", (chunk) => { out += chunk.toString(); });
 await new Promise((done) => child.once("exit", done));
 return { exit: child.exitCode, out };
}

async function main() {
 const dir = mkdtempSync(join(tmpdir(), "dh-pieditor-"));
 const store = join(dir, "s.sqlite");
 const marker = "the settled marker row under the dock";
 const draft = "type a draft";

 // 1) The process claims the store, so the dock is drawing the conversation THIS process owns.
 const claim = claimWriter(store);
 record(claim.mode === "writer" && readOwner(store).owned && readOwner(store).lock.pid === process.pid,
  "this process claimed the store before the dock opened (one writer, one mutation line)",
  `pid=${process.pid} lock=${claim.path}`);

 // 2) The real composition: pi's settings, providers, packages and theme, the same plane every surface uses.
 const parts = await harnessInvocation({ store, cwd: dir, faux: marker, messages: [] }, { context: BACKGROUND_CONTEXT });
 record((parts.resources?.packages ?? []).length > 0,
  "the dock run composed pi's package plane before the dock opened",
  `packages=${(parts.resources?.packages ?? []).length} themes=${(parts.resources?.themes ?? []).length} skills=${(parts.resources?.skills ?? []).length}`);

 // A settled turn FIRST, so "the view under the dock" has committed rows to be remembered under it.
 // pi-ai's faux plane is scripted here so the offline run has an answer to commit, and the string it
 // answers with is the marker this file then looks for in pi's own paint.
 scriptTurn(parts.faux, [marker]);
 const settledSubmission = await parts.conversation.submit({ type: "input", content: "the settled question", requestId: "pieditor-settled-1" }, BACKGROUND_CONTEXT);
 parts.settlements.push(settledSubmission.id);
 const settledAck = await settledSubmission.status(BACKGROUND_CONTEXT);
 await settleInvocation(parts);
 record((await storeUserTexts(store)).includes("the settled question"),
  "a settled turn is committed on the store this process owns before the dock is drawn",
  `ack=${JSON.stringify(settledAck)}`);

 // 3) The headless dock: pi-tui's alt screen over a captured terminal, one keystroke per chunk.
 const WIDTH = 72;
 const TALL = 24;
 const keys = [...Array.from(draft), "\r", ...Array.from("half typed"), "\u001b", ...Array.from(draft), "\r", ...Array.from("q"), "\r"];
 const sink = [];
 const ui = new TuiAltScreen(captureTerminal(WIDTH, TALL, sink), false, undefined);
 ui.start();
 const tally = await piDockLoop({
  parts,
  ui,
  size: () => ({ columns: WIDTH, rows: TALL }),
  context: BACKGROUND_CONTEXT,
  keystrokes: true,
  reader: () => keys,
  report: (line) => process.stderr.write(`${line}\n`),
 });
 ui.clear();
 ui.requestRender();
 ui.stop();

 const paintedAll = sink.join("");
 const paintedRows = splitPaintedRows(paintedAll);
 const paintedText = stripTerminalSequences(paintedAll);

 // pi's own key table named the actions; this file only fed keystrokes.
 record(tally.keys.submit.includes("enter") && tally.keys.interrupt.includes("escape") && tally.keys.exit.includes("ctrl+d") && tally.keys.clear.includes("ctrl+c"),
  "submit/cancel/exit/clear came from pi's OWN key table, not from a control character this file hard-coded",
  `keys=${JSON.stringify(tally.keys)} fed=${JSON.stringify({ enter: "\r", escape: "\u001b", ctrlD: "\u0004", ctrlC: "\u0003" })}`);
 record(tally.drafts.filter((text) => text === draft).length === 2 && tally.submitted === 2,
  "pi's Editor handed a finished draft to pi-durable's admission exactly twice for two ENTERs",
  `drafts=${JSON.stringify(tally.drafts)} submitted=${tally.submitted}`);

 // 4) pi's OWN submission rule at the dock: ENTER finishes a draft, and EVERY finished draft is a NEW prompt -
 // pi's dist/modes/interactive/interactive-mode.js `setupEditorSubmitHandler` calls `session.prompt(text)` once per
 // ENTER, and pi's `Editor.addToHistory` doc says it is "Called after successful submission", so the SAME words sent
 // twice are TWO admissions, TWO pi-durable submissionIds and TWO committed pi.user rows. pi-durable's exactly-once
 // admission still answers where a caller hands over its OWN requestId (src/rpc.mjs' `msg.requestId ?? msg.id`,
 // src/attach.mjs' client round-trip, counted in demo/tui.test.mjs and demo/cli.test.mjs); what the TUI's fallback
 // names is the SUBMISSION EVENT (src/tui/writer.mjs), not the words. pi's OWN history still holds the draft ONCE,
 // because pi's addToHistory body skips a CONSECUTIVE duplicate - asserted as `piHistory` further below.
 const requestIds = (tally.acks ?? []).map((ack) => ack?.requestId);
 const userTexts = await storeUserTexts(store);
 record(new Set(requestIds).size === 2 && new Set((tally.acks ?? []).map((ack) => ack?.submissionId)).size === 2 && userTexts.filter((text) => text === draft).length === 2,
  "two ENTERs finished the same draft twice, and pi's rule makes that TWO admissions with TWO submissionIds and TWO committed pi.user rows (a recalled resubmission is a new prompt, not a no-op)",
  `requestIds=${JSON.stringify(requestIds)} rows=${userTexts.filter((text) => text === draft).length} piHistory=${JSON.stringify(tally.piHistory.filter((text) => text === draft).length)}`);
 record(!userTexts.some((text) => text.includes("half typed")) && tally.cancelled === 1,
  "ESC cancelled through pi's own onEscape, and nothing carrying the half-typed draft was committed",
  `cancelled=${tally.cancelled} users=${JSON.stringify(userTexts)}`);
 record(!userTexts.includes("q") && tally.quit === "q",
  "a whole submitted line of `q` left the session instead of becoming agent input (q/quit/exit semantics unchanged)",
  `quit=${tally.quit} users=${JSON.stringify(userTexts)}`);

 // 5) the view UNDER the dock survived the cancel: pi repaints the committed transcript whole.
 record(paintedText.includes(marker) && paintedText.includes("the settled question"),
  "pi's transcript still paints the committed answer and question after the cancel (remember-the-view-under survives)",
  `marker=${paintedText.includes(marker)} question=${paintedText.includes("the settled question")}`);
 record(tally.paints >= keys.length,
  "pi repainted for every keystroke (plus the first empty dock, less the quitting one), so a mid-draft frame is pi's own paint",
  `paints=${tally.paints} keystrokes=${keys.length} layoutRows=${(ui.currentLayout?.lines?.length ?? 0)}`);

 // The footer words, from the SAME paint: the settled turn above committed entries carrying pi-durable's
 // `usage`, so pi's footer (one word per NON-ZERO committed total) draws pi-durable's numbers rather
 // than pi's AgentSession totals. The context window comes from pi's ModelRecord, never a size typed here.
 const footerRows = paintedRows.filter((row) => /[↑↓][0-9]/.test(row) && /[0-9.]+\s*%\s*\/\s*[0-9.]+k/.test(row));
 record(footerRows.length > 0 && footerRows.every((row) => /[RW][0-9]/.test(row) && /CH[0-9]/.test(row)),
  "the headless paint carries pi's footer words over pi-durable's COMMITTED usage (↓/↑ tokens, R/W cache, CH rate, x%/window)",
  `footer=${JSON.stringify(footerRows.slice(0, 2))}`);

 // 6) what the paint says about the dock itself.
 const boxRule = "\u2500".repeat(8);
 const caretMarker = "_pi:fc";
 record(paintedText.includes(boxRule),
  "pi drew its OWN bordered editor box in the paint (pi's box rules, not a harness frame)",
  `rule=${boxRule} rows=${paintedRows.length}`);
 const caretStripped = stripTerminalSequences(String(tally.caret.row ?? "")).replace(/[]/g, "").trim();
 record(tally.caret.marker && caretStripped.length > 0 && draft.startsWith(caretStripped) && caretStripped !== draft,
  "pi's Editor drew its OWN fake-caret marker (`_pi:fc`) into the MIDDLE of a partial draft (hence the split row)",
  `caret=${JSON.stringify(tally.caret)} sampled=${JSON.stringify(caretStripped)}`);
 const chars = [...Array.from(draft)];
 const prefixes = chars.map((_, index) => chars.slice(0, index + 1).join(""));
 const grown = prefixes.filter((prefix) => paintedRows.some((row) => row.trim() === prefix));
 record(grown.length >= 3 && paintedRows.some((row) => row.trim() === draft),
  "pi's own frames show the draft growing one character per keystroke, so the keystrokes went to pi's component",
  `grown=${JSON.stringify(grown.slice(0, 6))} of=${prefixes.length}`);
 record((sink.join("").match(/\[\?25l/g) ?? []).length > 0,
  "pi's fullscreen composite keeps the hardware cursor hidden per frame (pi's own cursor control, not an escape this file writes)",
  `hidden=${(sink.join("").match(/\[\?25l/g) ?? []).length}`);
 record(paintedRows.some((row) => row.includes(draft)),
  "the typed draft is IN pi's painted frames (pi's Editor echoed the keystrokes into the dock)",
  `draftRows=${JSON.stringify(paintedRows.filter((row) => row.includes(draft)).slice(0, 2))}`);
 record(paintedRows.every((row) => !row.trimStart().startsWith("> ")),
  "no row carries the old row-view's INPUT_MARK: the dock is pi's component, not the harness's own line",
  `rows=${paintedRows.length}`);

 // 7) pi's Editor history is seeded from pi-durable's committed user entries, and pi's OWN `history` array
 // (reached only through pi's PUBLIC addToHistory) is what up-arrow reads - see demo/recall.test.mjs for the
 // recall itself, and see pi's `EditorOptions`/`CustomEditorOptions`, which carry NO history option at this
 // pin, for why the seed travels through pi's method rather than through a constructor argument.
 record(tally.history.includes("the settled question") && tally.piHistory[0] === draft && tally.piHistory.filter((text) => text === draft).length === 1 && tally.piHistory.includes("the settled question"),
  "pi's OWN `Editor.history` is newest-first (the draft typed twice is ONE entry) above pi-durable's committed seed, and pi's seed is the store's rows, not a remembered list",
  `piHistory=${JSON.stringify(tally.piHistory)} seed=${JSON.stringify(tally.history)}`);

 // 7b) the startup header says WHICH session this is, and names the store it reads/writes. Both lines
 // are derived inside pidockloop.mjs from what THIS invocation opened (parts.intent.store + parts.backend),
 // so the check below compares the paint against the same store path the run claimed - the test typed no
 // header string of its own, and an in-memory run gets an honest line rather than a made-up path.
 const session = piSessionLines(parts);
 const storeUrl = String(pathToFileURL(resolve(store)));
 record(paintedText.includes("pi-durable session") && paintedRows.some((row) => row.includes("not a pi session")),
  "the pi-style startup screen marks this as a pi-durable session, distinct from pi's own startup header",
  `marker=${JSON.stringify(session.session)} rows=${paintedRows.filter((row) => row.includes("pi-durable session")).length}`);
 record(paintedRows.some((row) => row.includes(storeUrl)),
  "the startup screen names the database this session reads/writes: a file:// URL over the store THIS process claimed",
  `storeUrl=${storeUrl} claimed=${resolve(store)}`);
 const memoryParts = await harnessInvocation({ noSession: true, cwd: dir, faux: marker, messages: [] }, { context: BACKGROUND_CONTEXT });
 const memory = piSessionLines(memoryParts);
 record(memoryParts.backend === "memory" && memory.store === null && memory.session.includes("in memory"),
  "a --no-session run says its session is in memory instead of naming a store file it never wrote",
  `backend=${memoryParts.backend} storeLine=${JSON.stringify(memory.store)} session=${JSON.stringify(memory.session)}`);

 // 8) the exit keys run the ORDINARY cleanup, which releases ownership.
 const ctrlDRun = await piDockLoop({ parts, ui, size: () => ({ columns: WIDTH, rows: TALL }), context: BACKGROUND_CONTEXT, keystrokes: true, reader: () => ["\u0004"], report: (line) => process.stderr.write(`${line}\n`) });
 const ctrlCRun = await piDockLoop({ parts, ui, size: () => ({ columns: WIDTH, rows: TALL }), context: BACKGROUND_CONTEXT, keystrokes: true, reader: () => ["\u0003", "\u0003"], report: (line) => process.stderr.write(`${line}\n`) });
 record(ctrlDRun.quit === "ctrl+d" && ctrlCRun.quit === "ctrl+c" && ctrlCRun.clears.length === 1 && ctrlDRun.submitted === 0 && ctrlCRun.submitted === 0,
  "pi's OWN double-tap rule (handleCtrlC, interactive-mode.js:3594): the FIRST Ctrl+C (app.clear) clears the draft through pi's clearEditor and keeps typing alive, only the SECOND inside 500 ms leaves; Ctrl+D on an empty draft leaves, and neither commits input",
  `quits=${JSON.stringify([ctrlDRun.quit, ctrlCRun.quit])} clears=${JSON.stringify(ctrlCRun.clears)} submitted=${JSON.stringify([ctrlDRun.submitted, ctrlCRun.submitted])}`);
 await settleInvocation(parts);
 await parts.harness.close(BACKGROUND_CONTEXT);
 const released = releaseWriter(store);
 const owner = readOwner(store);
 record(released && !owner.owned,
  "the dock's exit path ran the ordinary cleanup: the Harness closed and this process released its claim",
  `released=${released} owner=${JSON.stringify(owner)}`);
 record((await storeUserTexts(store)).join("|") === userTexts.join("|"),
  "the store read back the same rows after the cleanup - leaving wrote nothing",
  `rows=${JSON.stringify(await storeUserTexts(store))}`);

 // 9) the same dock under an ALLOCATED terminal, driven by demo/pieditor-interactive.mjs.
 const ptyStore = join(dir, "pty.sqlite");
 // One SETTLED turn through the ordinary print path first, so the dock's FIRST paint under the
 // allocated terminal already has committed entries carrying pi-durable's `usage`: pi's footer prints
 // one word per non-zero committed total, so an empty conversation would legitimately paint none.
 const seed = await runCli(["--store", ptyStore, "--cwd", dir, "-p", "seed the pty footer", "--faux", "a seeded answer"]);
 record(seed.exit === 0 && seed.out.includes("a seeded answer"),
  "the pty run's store carries a settled turn committed through the ordinary print path before the terminal opens",
  `seedExit=${seed.exit} seedAnswer=${seed.out.trim().slice(0, 60)}`);
 const typedTerminal = "typed in the terminal";
 const ptyCapture = join(dir, "pty-run");
 const ptyRun = await driveTerminal(["node", join(ROOT, "demo", "pieditor-interactive.mjs"), "--store", ptyStore, "--cwd", dir, "--faux", marker, "--width", "72", "--height", "20"],
  [Buffer.from(`${typedTerminal}\r`).toString("hex"), Buffer.from("quit\r").toString("hex")], ptyCapture);
 record(ptyRun.error === null && ptyRun.exit === 0 && ptyRun.sent === 2,
  "the pi dock driver started, took terminal keystrokes, and exited cleanly under an allocated pty",
  `exit=${ptyRun.exit} keystrokesWritten=${ptyRun.sent} paintedBytes=${ptyRun.screen.length} error=${ptyRun.error ?? "-"}`);
 // scripts/ptydrive.mjs already unescaped its capture with pi-tui's OWN stripTerminalSequences (`plain`), and
 // keeps the raw bytes in `screen` so pi's per-frame cursor control is still countable there.
 const ptyText = ptyRun.plain;

 const ptyHidden = (ptyRun.screen.match(/\[\?25l/g) ?? []).length;
 record(ptyText.includes(boxRule) && ptyText.includes(typedTerminal) && ptyHidden > 0,
  "under a real pty pi's dock drew its borders, echoed the typed keystrokes, and kept pi's own cursor control",
  `rule=${ptyText.includes(boxRule)} typed=${ptyText.includes(typedTerminal)} hiddenCursorFrames=${ptyHidden}`);
 record(/[0-9.]+\s*%\s*\/\s*[0-9.]+k/.test(ptyText) && /[↑↓][0-9]/.test(ptyText) && /[RW][0-9]/.test(ptyText),
  "under an allocated terminal pi's footer prints committed-token and cache words plus its context%/contextWindow pair",
  `words=${JSON.stringify(ptyText.match(/[0-9.]+\s*%\s*\/\s*[0-9.]+k/g)?.slice(0, 2))} arrows=${/[↑↓][0-9]/.test(ptyText)}`);
 // pi's alt screen overpaints the FRONT of the driver's stderr lines as it repaints, so these claims match pi-durable's
 // own words anywhere in the paint (the identity triple, and the summary tail) rather than a line prefix.
 const ptyAcks = [...ptyText.matchAll(/requestId=(\S+) submissionId=(\d+) status=(\w+)/g)];
 record(ptyAcks.length === 1 && ptyAcks[0]?.[3] === "placed",
  "one terminal keystroke line became exactly ONE submission acknowledged by the dock (the bare `quit` line admitted nothing)",
  `acks=${JSON.stringify(ptyAcks.map((m) => m[0]))}`);
 const ptyLeave = /[^\r\n]*cancelled=\d+[^\r\n]*/.exec(ptyText) ?? [""];
 record(/cancelled=\d+ quit=quit/.test(ptyText),
  "the driver named WHY it left, so the quit path is visible rather than inferred",
  `leave=${JSON.stringify(ptyLeave[0].slice(-160))}`);
 record(!readOwner(ptyStore).owned,
  "the pty driver's ordinary cleanup released the store it owned (no lock left behind)",
  `owner=${JSON.stringify(readOwner(ptyStore))}`);
 const ptyTexts = await storeUserTexts(ptyStore);
 record(ptyTexts.filter((text) => text === typedTerminal).length === 1 && !ptyTexts.includes("quit"),
  "the pty-typed line is committed exactly once, and the quit line never became agent input",
  `users=${JSON.stringify(ptyTexts)}`);

 // 8) pi's OWN expansion boundary at the dock: a `/template args` draft and a `/skill:name args` draft
// enter the agent as pi's EXPANDED text (docs/prompt-templates.md: "Pi expands the template before the
// resulting text enters the agent"; dist/core/agent-session.js does `_expandSkillCommand` then
// `expandPromptTemplate` and returns `prompt: expandedText`), while pi's HISTORY keeps the typed draft
// (pi calls `this.editor.addToHistory?.(text)` with the TYPED text before `session.prompt(text)`). What
// this demo caught BEFORE: the expansion was computed only to look for a refusal and the expanded text was
// thrown away, so `/review concurrency` reached the agent as the literal name.
 const cwd = mkdtempSync(join(tmpdir(), "dh-pieditor-cwd-"));
 mkdirSync(join(cwd, ".pi", "prompts"), { recursive: true });
 writeFileSync(join(cwd, ".pi", "prompts", "review.md"), "---\ndescription: Review staged git changes\nargument-hint: \"[focus]\"\n---\nReview the staged changes. Focus on ${1:-correctness, security, and error handling}. All args: $@\n");
 mkdirSync(join(cwd, ".pi", "skills", "note-skill"), { recursive: true });
 writeFileSync(join(cwd, ".pi", "skills", "note-skill", "SKILL.md"), "---\nname: note-skill\ndescription: Take notes on demand\n---\n# Note skill\nSay NOTES when asked.\n");
 const expStore = join(cwd, "exp.sqlite");
 const expClaim = claimWriter(expStore);
 const expParts = await harnessInvocation({ store: expStore, cwd, faux: marker, messages: [] }, { context: BACKGROUND_CONTEXT });
 const expLines = [];
 const expUi = new TuiAltScreen(captureTerminal(WIDTH, TALL, []), false, undefined);
 expUi.start();
 const expTally = await piDockLoop({
  parts: expParts,
  ui: expUi,
  size: () => ({ columns: WIDTH, rows: TALL }),
  context: BACKGROUND_CONTEXT,
  keystrokes: true,
  reader: () => [...Array.from("/review concurrency"), "\r", ...Array.from("/skill:note-skill do the thing"), "\r", ...Array.from("/quit"), "\r"],
  report: (line) => expLines.push(line),
 });
 expUi.clear();
 expUi.requestRender();
 expUi.stop();
 await settleInvocation(expParts);
 const expTexts = await storeUserTexts(expStore);
 record(expTally.expansions.join(",") === "template,skill",
  "pi's dock expanded pi's template and pi's skill rather than submitting the typed name",
  `kinds=${JSON.stringify(expTally.expansions)} templates=${(expParts.resources?.promptTemplates ?? []).length} skills=${(expParts.resources?.skills ?? []).length}`);
 record(expTexts.some((text) => text.startsWith("Review the staged changes.") && text.includes("Focus on concurrency")) && !expTexts.some((text) => text.startsWith("/review")),
  "the committed row IS pi's expanded template (its `argument-hint` arg filled pi's `${1}`), never the literal `/review concurrency`",
  `users=${JSON.stringify(expTexts.map((text) => text.slice(0, 60)))}`);
 record(expTexts.some((text) => text.startsWith('<skill name="note-skill"') && text.endsWith("do the thing")),
  "the skill draft entered as pi's OWN skill block (pi's `stripFrontmatter` body, the skill named, references relative to its baseDir) with the args appended",
  `users=${JSON.stringify(expTexts.filter((text) => text.startsWith("<skill")).map((text) => `${text.slice(0, 40)}...${text.slice(-16)}`))}`);
 record(expLines.some((line) => line.startsWith("expanded pi's template") && line.includes("into the submitted input")) && expLines.some((line) => line.startsWith("expanded pi's skill")),
  "the dock SAYS it expanded, in the same sentence the print path and the row surface print (pi itself expands silently)",
  `report=${JSON.stringify(expLines.filter((line) => line.startsWith("expanded")))}`);
 record(expTally.piHistory[0] === "/skill:note-skill do the thing" && expTally.piHistory.includes("/review concurrency"),
  "pi's history machine kept the TYPED drafts newest-first, exactly as pi's `addToHistory?.(text)` call site does it before expansion",
  `piHistory=${JSON.stringify(expTally.piHistory)}`);
 record(releaseWriter(expStore) && !readOwner(expStore).owned,
  "the expansion run cleaned up after itself: settled, closed, claim released",
  `claim=${expClaim.mode} owner=${JSON.stringify(readOwner(expStore))}`);

 const failed = checks.filter((check) => !check.ok);
 console.log(`pieditor: ${checks.length - failed.length}/${checks.length} checks passed`);
 if (failed.length) process.exitCode = 1;
}

await main();
