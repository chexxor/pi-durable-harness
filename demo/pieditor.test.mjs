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
// WHY python3 APPEARS BELOW: Node has no pty primitive, so python3's standard-library `pty` module
// allocates the terminal for the ONE pty check; the code under test stays a normal Node child process
// whose stdio is the pty's slave side. A pty is a local kernel object, not a socket, so this demo stays
// inside the offline proof (pi-ai's faux plane answers; no provider endpoint is contacted).
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
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

const PY = String.raw`
import json, os, pty, tty, subprocess, select, sys, time, signal
argv = json.loads(sys.argv[1]); feeds = [bytes.fromhex(x) for x in sys.argv[2].split(",")]
master, slave = pty.openpty()
proc = subprocess.Popen(argv, stdin=slave, stdout=slave, stderr=slave, preexec_fn=lambda: tty.setraw(slave))
os.close(slave)
out = b""; sent = 0; t0 = time.time()
# Feed the keystrokes, reading whatever the child paints, and stop as soon as the child leaves.
while time.time() - t0 < 20:
  try:
    if select.select([master], [], [], 0.2)[0]:
      chunk = os.read(master, 65536)
      if not chunk: break
      out += chunk
  except OSError: break
  # pi-tui's start() negotiates the keyboard protocol and raw mode before any keystroke is taken;
  # a human's first keystroke always arrives after that, so the feeds wait for the first paint.
  if sent < len(feeds) and time.time() - t0 > 1.5:
    os.write(master, feeds[sent]); sent += 1
  if proc.poll() is not None: break
# Still alive after the feeds: send the ordinary interrupt, which the child handles by running its
# normal cleanup (release the claim, close the Harness) - never a kill-9 that skips cleanup.
if proc.poll() is None:
  proc.send_signal(signal.SIGTERM)
  t0 = time.time()
  while time.time() - t0 < 6 and proc.poll() is None:
    try:
      if select.select([master], [], [], 0.1)[0]:
        chunk = os.read(master, 65536)
        if not chunk: break
        out += chunk
    except OSError: break
# Bounded drain only: an unbounded os.read here waits forever when the child already left.
t0 = time.time()
while time.time() - t0 < 3:
  try:
    if select.select([master], [], [], 0.1)[0]:
      chunk = os.read(master, 65536)
      if not chunk: break
      out += chunk
  except OSError: break
sys.stdout.write(json.dumps({"exit": proc.wait(timeout=5), "stream": out.decode("utf-8", "replace")}))
`.trim();

async function inTerminal(argv, feeds) {
 const child = spawn("python3", ["-c", PY, JSON.stringify(argv), feeds.join(",")], { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
 let out = "";
 let err = "";
 child.stdout.on("data", (chunk) => { out += chunk.toString(); });
 child.stderr.on("data", (chunk) => { err += chunk.toString(); });
 await new Promise((done) => child.once("exit", done));
 if (child.exitCode !== 0) return { exit: null, stream: "", error: `pty helper exited ${child.exitCode}: ${err.slice(0, 200)}` };
 try {
  const parsed = JSON.parse(out);
  return { exit: parsed.exit, stream: parsed.stream, error: null };
 } catch (err2) {
  return { exit: null, stream: "", error: `pty helper answered unparseably: ${String(err2?.message ?? err2)}` };
 }
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

 // 4) exactly-once, by pi-durable's admission: the same draft typed twice is ONE committed row.
 const requestIds = (tally.acks ?? []).map((ack) => ack?.requestId);
 const userTexts = await storeUserTexts(store);
 record(new Set(requestIds).size === 1 && userTexts.filter((text) => text === draft).length === 1,
  "the same draft typed twice landed as ONE user row on the store (pi-durable admits by requestId)",
  `requestIds=${JSON.stringify(requestIds)} rows=${userTexts.filter((text) => text === draft).length}`);
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

 // 7) pi's Editor history is seeded from pi-durable's committed user entries.
 record(tally.history.includes("the settled question"),
  "pi's Editor history seed is pi-durable's committed user entries, not a remembered list",
  `history=${JSON.stringify(tally.history)}`);

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
 const ctrlCRun = await piDockLoop({ parts, ui, size: () => ({ columns: WIDTH, rows: TALL }), context: BACKGROUND_CONTEXT, keystrokes: true, reader: () => ["\u0003"], report: (line) => process.stderr.write(`${line}\n`) });
 record(ctrlDRun.quit === "ctrl+d" && ctrlCRun.quit === "ctrl+c" && ctrlDRun.submitted === 0 && ctrlCRun.submitted === 0,
  "Ctrl+D on an empty draft and Ctrl+C both leave through pi's own key, and neither commits input",
  `quits=${JSON.stringify([ctrlDRun.quit, ctrlCRun.quit])} submitted=${JSON.stringify([ctrlDRun.submitted, ctrlCRun.submitted])}`);
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
 const typedTerminal = "typed in the terminal";
 const ptyRun = await inTerminal(["node", join(ROOT, "demo", "pieditor-interactive.mjs"), "--store", ptyStore, "--cwd", dir, "--faux", marker, "--width", "72", "--height", "20"],
  [Buffer.from(`${typedTerminal}\r`).toString("hex"), Buffer.from("quit\r").toString("hex")]);
 record(ptyRun.error === null && ptyRun.exit === 0,
  "the pi dock driver started, took terminal keystrokes, and exited cleanly under an allocated pty",
  `exit=${ptyRun.exit} bytes=${ptyRun.stream.length} error=${ptyRun.error ?? "-"}`);
 const ptyText = stripTerminalSequences(ptyRun.stream);

 const ptyHidden = (ptyRun.stream.match(/\[\?25l/g) ?? []).length;
 record(ptyText.includes(boxRule) && ptyText.includes(typedTerminal) && ptyHidden > 0,
  "under a real pty pi's dock drew its borders, echoed the typed keystrokes, and kept pi's own cursor control",
  `rule=${ptyText.includes(boxRule)} typed=${ptyText.includes(typedTerminal)} hiddenCursorFrames=${ptyHidden}`);
 record(ptyRun.stream.split(/\r|\n/).filter((line) => line.includes("submitted:")).length === 1,
  "one terminal keystroke line became exactly one submission acknowledged by the dock",
  `acks=${ptyRun.stream.split(/\r|\n/).filter((line) => line.includes("submitted:")).length}`);
 record(/session: [^\r\n]*quit=quit/.test(ptyRun.stream) || /session: [^\r\n]*word=quit/.test(ptyRun.stream),
  "the driver named WHY it left, so the quit path is visible rather than inferred",
  `leave=${(/session: [^\r\n]*/.exec(ptyRun.stream) ?? [""])[0].slice(0, 160)}`);
 record(!readOwner(ptyStore).owned,
  "the pty driver's ordinary cleanup released the store it owned (no lock left behind)",
  `owner=${JSON.stringify(readOwner(ptyStore))}`);
 const ptyTexts = await storeUserTexts(ptyStore);
 record(ptyTexts.filter((text) => text === typedTerminal).length === 1 && !ptyTexts.includes("quit"),
  "the pty-typed line is committed exactly once, and the quit line never became agent input",
  `users=${JSON.stringify(ptyTexts)}`);

 const failed = checks.filter((check) => !check.ok);
 console.log(`pieditor: ${checks.length - failed.length}/${checks.length} checks passed`);
 if (failed.length) process.exitCode = 1;
}

await main();
