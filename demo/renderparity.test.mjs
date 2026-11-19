#!/usr/bin/env node
// demo/renderparity.test.mjs - the RENDERING plane of the pi-style screen, measured as PAINTED ROWS of a real
// terminal, and measured TWICE: once on THIS tree and once on the tree at the tag `checkpoint-pi-tui-parity`,
// i.e. the screen exactly as it was BEFORE this goal touched it. The SAME predicates are then run against both
// captures, which is what makes "the checks fail on the OLD behaviour" a measured claim instead of a remembered
// one: every predicate in the PARITY table passes on this tree and NONE of them passes on the tagged tree,
// while every predicate in the HOLDS table - the rules that must NOT change - passes on both.
//
// PROVENANCE: no Durian-Pi original - Durian-Pi never ran a terminal (its seats ran the `pi` CLI as a child
// process, so pi's TUI was pi's) and it has no pty helper, so nothing here was extracted; this demo is new work
// in this repo's own words. WHAT CHANGED versus the demos this one reuses (demo/tty.test.mjs, demo/keybindings
// test.mjs): nothing in the driver - the ONE committed scripts/ptydrive.mjs drives both trees - but the capture
// reader is new here, because a scroll/refusal claim needs the SCREEN, not a text log: this file rebuilds the
// painted rows after every pi-tui frame and labels each frame with the keystroke that produced it.
// VERIFIED AGAINST PINED PACKAGES, read on this machine at pin v1.5.1 (sha dd30101cfc5b0609411dd80b6f93adbc14db14cf):
// pi-tui's `stripTerminalSequences` (the escaper used to read the painted bytes) and pi-tui's `ScrollView`/`Box`
// painting this demo only reads the paint of; pi-coding-agent's top-level exports `keyHint`, `keyText`, `initTheme`
// (NOT pi-tui - `import { keyHint } from "@earendil-works/pi-tui"` throws, and src/tui/piscreen.mjs' own import
// line is the proof), so pi's OWN hint words and pi's OWN key word are compared rather than typed here.
// DROPPED on purpose and named rather than reimplemented: no ANSI colour decoding (colours cannot change a ROW's
// width), no mouse-sequence decoding (the wheel is exercised only as pi's unhandled-event path in demo/tty), no
// key REPLAY, no second pty driver, and no rendering of pi's own docs - this demo reads the screen the child
// painted, it never re-implements pi's painting.

// WHY python3 APPEARS NOWHERE HERE: the pty is allocated by the ONE committed helper scripts/ptydrive.mjs, whose
// own header explains the python3 standard-library `pty` module (Node has no pty primitive and no dependency may
// be added for a test). The code under test is a normal Node child of that helper; a pty is a local kernel object,
// not a socket, so both runs stay inside the offline proof (each run spells `--faux`, so pi-ai's faux plane answers
// and no provider endpoint is contacted).

import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { initTheme, keyHint, keyText } from "@earendil-works/pi-coding-agent";
import { openStore, readEntries, listConversations } from "../src/readapi.mjs";
import { entryText } from "../src/tui/piscreen.mjs";

const ROOT = process.cwd();
const W = 52;
const H = 26;
const TAG = "checkpoint-pi-tui-parity";
const checks = [];
function record(ok, label, detail = "") {
 checks.push({ ok, label });
 console.log(`  ${ok ? "ok " : "NOT"} ${label}${detail ? `: ${detail}` : ""}`);
}

// pi's transient-scrollbar thumb and pi's Box border glyph, as pi paints them (the demo only reads them).
const THUMB = "\u2503";
const BORDER = new RegExp("^([\u2500\u2501])\\1{" + String(W - 1) + "}$");
function rowWidth(line) { return [...line].length; }

// THE ONE keystroke script, typed the same way at BOTH trees: four prompts, pi's `tui.altScreen.pageUp` byte
// form, a fifth prompt, pi's `tui.altScreen.bottom` form, a sixth prompt, pi's `/model` slash command, another
// prompt (the harness's own ack lines are what its answer paints), pi's Esc, the refused `/goal` command,
// pi's Esc again, and `/quit`. Written hex so no control byte is re-encoded on the way through argv.
const SCRIPT = [
 "first prompt alpha\r", "second prompt beta\r", "third prompt gamma\r", "fourth prompt delta\r",
 "\u001b[5~", "fifth prompt\r", "\u001b[1;5F", "sixth prompt\r",
 "/model faux/faux-1\r", "now the metadata line\r", "\u001b", "/goal keep going\r", "\u001b", "/quit\r",
];

// The helper is THIS repo's committed tool in BOTH runs; only the code under test differs (this tree's cli.mjs
// versus the tagged tree's cli.mjs). The tagged tree's own scripts/ptydrive.mjs is NOT used, because this goal
// grew the helper (`--winsize` sizes the pty so the capture is readable) and the tagged tree predates that.
function drive(child, runDir) {
 const argv = ["--timeout", "60", "--after", "3", "--gap", "0.7", "--winsize", String(W), String(H)];
 for (const keystroke of SCRIPT) argv.push("--feed-hex", Buffer.from(keystroke, "utf8").toString("hex"));
 argv.push("--capture", join(runDir, "cap"), "--", "node", child, "--store", join(runDir, "store.sqlite"), "--cwd", runDir, "--width", String(W), "--height", String(H), "--faux", "probe");
 return execFileSync("node", [join(ROOT, "scripts", "ptydrive.mjs"), ...argv], { cwd: ROOT, encoding: "utf8", timeout: 120000 });
}

// Rebuild the VISIBLE rows after every pi-tui frame end, and label each frame with the keystroke whose paint
// it holds (the helper's own `(N painted bytes)` headers cut the capture into per-keystroke windows; painted
// bytes are BYTES while the walk is CHARACTERS, so a UTF-8 lead-byte map keeps the cut exact).
function screens(capture, log) {
 const cap = readFileSync(capture);
 const raw = cap.toString("utf8");
 const charOfByte = new Int32Array(cap.length + 1);
 let chars = 0;
 for (let b = 0; b < cap.length; b += 1) { charOfByte[b] = chars; if ((cap[b] & 0xc0) !== 0x80) chars += 1; }
 charOfByte[cap.length] = chars;
 const windows = [];
 let at = 0;
 for (const line of log.split("\n")) {
  const head = /^---- (.*) \((\d+) painted bytes\) ----$/.exec(line.replace(/\r+$/, ""));
  if (!head) continue;
  const n = Number(head[2]);
  windows.push({ label: head[1], from: at, to: at + n });
  at += n;
 }
 const complete = at === cap.length;
 const windowOf = (offset) => windows.filter((entry) => offset > charOfByte[entry.from] && offset <= charOfByte[entry.to]).map((entry) => entry.label)[0] ?? null;
 const blank = () => { const s = []; for (let r = 0; r < 80; r += 1) s.push(""); return s; };
 let rows = blank();
 let cur = { row: 0, col: 0 };
 let frames = [];
 let prev = null;
 let i = 0;
 while (i < raw.length) {
  const c = raw[i];
  if (c === "\u001b") {
   if (raw[i + 1] === "]") { const end = raw.indexOf("\u0007", i + 2); i = end >= 0 ? end + 1 : i + 2; continue; }
   if (raw[i + 1] === "[") {
    let j = i + 2;
    let priv = "";
    while (j < raw.length && /[?<>0-9;]/.test(raw[j])) { priv += raw[j]; j += 1; }
    const fin = raw[j] ?? "";
    const nums = (priv.match(/\d+/g) ?? []).map(Number);
    if (fin === "H" || fin === "f") cur = { row: Math.max(0, (nums[0] || 1) - 1), col: Math.max(0, (nums[1] || 1) - 1) };
    else if (fin === "J") rows = blank();
    else if (fin === "K") { const rr = Math.min(cur.row, rows.length - 1); rows[rr] = rows[rr].slice(0, cur.col); }
    else if (fin === "l" && priv === "?2026") {
     const snap = rows.map((line) => line.replace(/\s+$/, ""));
     if (prev === null || snap.join("\n") !== prev.join("\n")) {
      frames.push({ window: windowOf(j + 1), rows: snap.map((line) => stripTerminalSequences(line).replace(/\s+$/, "")) });
      prev = snap;
     }
    }
    i = j + 1;
    continue;
   }
   i += 2;
   continue;
  }
  if (c === "\r" || c === "\n" || c === "\u0007" || c === "\b") { i += 1; continue; }
  const r = Math.min(cur.row, rows.length - 1);
  const line = [...rows[r]];
  while (line.length < cur.col) line.push(" ");
  line[cur.col] = c;
  rows[r] = line.join("");
  cur = { row: r, col: cur.col + 1 };
  i += 1;
 }
 return { frames, complete, windows };
}

// Which frames a keystroke answered, and what the screen looked like AFTER it: a keystroke with no changed
// frame left the screen UNCHANGED, so its state is the previous frame carried forward. That is itself a
// measurement - pi's `tui.altScreen.bottom` form answering no repaint at all is the OLD tree's answer.
const keystrokeOf = (window) => { const m = window?.match(/keystroke(\d+)/); return m ? Number(m[1]) : null; };
function state(tree, keystroke) {
 let last = null;
 for (let n = 1; n <= keystroke; n += 1) {
  const own = tree.frames.filter((entry) => keystrokeOf(entry.window) === n);
  if (own.length) last = own[own.length - 1];
 }
 return last;
}
function repaints(tree, keystroke) { return tree.frames.filter((entry) => keystrokeOf(entry.window) === keystroke).length; }
function rowsOf(frame) { return frame?.rows ?? []; }
function dockRows(frame) {
 const marks = rowsOf(frame).map((line) => BORDER.test(line)).flatMap((ok, index) => ok ? [index] : []);
 if (marks.length < 2) return [];
 const inside = [];
 for (let r = marks[0] + 1; r < marks[marks.length - 1]; r += 1) inside.push(rowsOf(frame)[r]);
 return inside;
}
function insideDock(frame, needle) { return dockRows(frame).some((line) => line.includes(needle)); }
function hasRow(frame, needle) { return rowsOf(frame).some((line) => line.includes(needle)); }
function exactRow(frame, text) { return rowsOf(frame).some((line) => line === text); }
function thumbRows(frame) { return rowsOf(frame).filter((line) => line.endsWith(THUMB)).length; }
// pi-durable's own refusal closes with `refused by name`, so the block is the rows from pi-durable's `refused:`
// opener to that closer - which lets the demo count HOW MANY ROWS one refusal needed.
function refusalBlock(frame) {
 const rows = rowsOf(frame);
 const start = rows.findIndex((line) => line.startsWith("refused:"));
 const end = rows.findIndex((line) => line.endsWith("refused by name"));
 if (start < 0 || end < start) return [];
 return rows.slice(start, end + 1);
}
function ackRow(line) { return /submitted: requestId=|set_model:|status=placed/.test(line); }

async function userTexts(store) {
 const viewer = await openStore(store);
 const texts = [];
 for (const row of await listConversations(viewer)) {
  const page = await readEntries(viewer, row.id, { limit: 200 });
  texts.push(...page.items.filter((entry) => entry?.kind === "pi.user").map((entry) => entryText(entry)).filter((text) => text));
 }
 return texts;
}

const base = mkdtempSync(join(tmpdir(), "dh-renderparity-"));
const newDir = join(base, "this-tree");
mkdirSync(newDir, { recursive: true });
const taggedDir = join(base, "tagged");
mkdirSync(taggedDir, { recursive: true });
const oldRun = join(base, "tagged-run");
mkdirSync(oldRun, { recursive: true });

let newLog = "";
let oldLog = "";
try {
 newLog = drive(join(ROOT, "cli.mjs"), newDir);
 // The tagged tree, from git itself: `git archive` writes the ref's tracked files, and node_modules is NOT
 // tracked in this repo (`git ls-files node_modules` prints nothing), so the extracted tree gets a symlink to
 // the real installed packages - the pinned pi, unchanged, in both runs.
 const tar = join(base, "tagged.tar");
 execFileSync("git", ["archive", "--format=tar", "--output", tar, TAG], { cwd: ROOT, encoding: "utf8" });
 execFileSync("tar", ["-xf", tar, "-C", taggedDir], { encoding: "utf8" });
 symlinkSync(join(ROOT, "node_modules"), join(taggedDir, "node_modules"));
 oldLog = drive(join(taggedDir, "cli.mjs"), oldRun);
} catch (err) {
 console.log(`  NOT the pty run failed: ${String(err?.stderr ?? err?.message ?? err)}`.slice(0, 300));
}

function readCapture(dir, log) {
 try {
  return { ...screens(join(dir, "cap.screen"), log), plain: readFileSync(join(dir, "cap.plain"), "utf8") };
 } catch (err) {
  console.log(`  NOT the capture is unreadable: ${String(err?.message ?? err)}`.slice(0, 200));
  return { frames: [], complete: false, windows: [], plain: "" };
 }
}
const newTree = readCapture(newDir, newLog);
const oldTree = readCapture(oldRun, oldLog);

record(newTree.complete && oldTree.complete,
 "both captures were cut into per-keystroke windows EXACTLY (the helper's painted-byte counts sum to the capture bytes), so every frame below is attributed to a keystroke",
 `new windows=${newTree.windows.length} old windows=${oldTree.windows.length}`);
record(newTree.frames.length > 20 && oldTree.frames.length > 20,
 "both runs painted a whole screen per keystroke rather than one dump",
 `newFrames=${newTree.frames.length} oldFrames=${oldTree.frames.length}`);

// THE PI PLANE: pi's OWN exported words, compared against the paint rather than typed into it.
initTheme();
const piKey = keyText("tui.editor.deleteToLineEnd");
const piHint = stripTerminalSequences(keyHint("tui.editor.deleteToLineEnd", "to delete to end"));
record(piKey === "ctrl+k" && piHint === "ctrl+k to delete to end",
 "pi's OWN exports answer the hint: `keyText` gives pi's key word ctrl+k for `tui.editor.deleteToLineEnd`, pi's `keyHint` joins pi's words - the demo compares pi's output, it types no key label",
 `key=${JSON.stringify(piKey)} hint=${JSON.stringify(piHint)}`);

const PARITY = [
 ["pi's pageUp leaves the view PUT: the screen after pi's pageUp byte form shows pi's document-top row",
  (tree) => hasRow(state(tree, 5), "first prompt alpha") && !hasRow(state(tree, 5), "fourth prompt delta"),
  (tree) => `top=${hasRow(state(tree, 5), "first prompt alpha")} newestBefore=${hasRow(state(tree, 5), "fourth prompt delta")} repaints=${repaints(tree, 5)}`],
 ["pi's pageUp keeps the view PUT through the NEXT prompt: the screen after a fifth prompt still shows the document top and NOT the prompt just typed",
  (tree) => hasRow(state(tree, 6), "first prompt alpha") && !hasRow(state(tree, 6), "fifth prompt"),
  (tree) => `top=${hasRow(state(tree, 6), "first prompt alpha")} typed=${hasRow(state(tree, 6), "fifth prompt")} repaints=${repaints(tree, 6)}`],
 ["pi's follow-end rule engages ONLY at the bottom: the view is still NOT at the content end after a fifth prompt, so the newest prompt is off screen",
  (tree) => !hasRow(state(tree, 6), "fifth prompt") && hasRow(state(tree, 8), "sixth prompt"),
  (tree) => `afterPrompt6=${hasRow(state(tree, 6), "fifth prompt")} afterPrompt8=${hasRow(state(tree, 8), "sixth prompt")}`],
 ["pi's ctrl+end (tui.altScreen.bottom) REPAINTS and jumps to the content end, with pi's transient scrollbar thumb on the rows it scrolled past",
  (tree) => repaints(tree, 7) >= 1 && hasRow(state(tree, 7), "fifth prompt") && thumbRows(state(tree, 7)) >= 3,
  (tree) => `repaints=${repaints(tree, 7)} end=${hasRow(state(tree, 7), "fifth prompt")} thumbRows=${thumbRows(state(tree, 7))}`],
 ["harness ack lines never land in the dock: no frame paints a `submitted:`/`set_model:` row between pi's two dock borders",
  (tree) => tree.frames.every((frame) => !insideDock(frame, "submitted: requestId=") && !insideDock(frame, "set_model:")),
  (tree) => `framesInsideDock=${tree.frames.filter((frame) => insideDock(frame, "submitted: requestId=") || insideDock(frame, "set_model:")).length}/${tree.frames.length}`],
 ["an ack line becomes pi's OWN wrapped rows: at least one frame carries `status=placed` as a row of its own under its `submitted:` row",
  (tree) => tree.frames.some((frame) => rowsOf(frame).some((line, index) => line.includes("submitted: requestId=") && rowsOf(frame)[index + 1] === "status=placed")),
  (tree) => `wrappedFrames=${tree.frames.filter((frame) => rowsOf(frame).some((line, index) => line.includes("submitted: requestId=") && rowsOf(frame)[index + 1] === "status=placed")).length}`],
 ["no harness line is painted WIDER than the terminal: every row carrying an ack line fits pi's width",
  (tree) => tree.frames.every((frame) => rowsOf(frame).every((line) => !ackRow(line) || rowWidth(line) <= W)),
  (tree) => `widestAckRow=${Math.max(0, ...tree.frames.map((frame) => Math.max(0, ...rowsOf(frame).filter(ackRow).map(rowWidth))))}`],
 ["the dock's hint row is pi's OWN words: some frame paints a row equal to pi's `keyHint` output for pi's own action id",
  (tree) => tree.frames.some((frame) => exactRow(frame, piHint)),
  (tree) => `hintRows=${tree.frames.filter((frame) => exactRow(frame, piHint)).length}`],
 ["pi-durable's stale label appears NOWHERE: no line of the whole capture (pi-tui's own stripped text) says `to clear the draft`",
  (tree) => !tree.plain.includes("to clear the draft"),
  (tree) => `staleLines=${tree.plain.split("\n").filter((line) => line.includes("to clear the draft")).length}`],
 ["a refused command keeps its typed text IN THE DOCK: the screen after pi's ENTER on `/goal keep going` paints that text between pi's two dock borders",
  (tree) => insideDock(state(tree, 12), "/goal keep going"),
  (tree) => `draftRows=${dockRows(state(tree, 12)).filter((line) => line.includes("/goal keep going")).length} dockRows=${dockRows(state(tree, 12)).length}`],
 ["one refusal becomes as many rows as pi's width handling needs: the `refused:` block spans at least TWO rows and every one of them fits the terminal",
  (tree) => { const block = refusalBlock(state(tree, 12)); return block.length >= 2 && block.every((line) => rowWidth(line) <= W); },
  (tree) => `refusalRows=${refusalBlock(state(tree, 12)).length} widest=${Math.max(0, ...refusalBlock(state(tree, 12)).map(rowWidth))}`],
];
for (const [label, predicate, detail] of PARITY) {
 const okNew = predicate(newTree);
 const okOld = predicate(oldTree);
 record(okNew, `${label} - THIS tree's screen`, detail(newTree));
 record(!okOld, `the tagged tree (${TAG}) FAILS the SAME predicate: ${label}`, `taggedTree=${okOld ? "PASSES, so this check no longer discriminates" : "FAILS"} taggedShape=${detail(oldTree)}`);
}

newTree.log = newLog;
oldTree.log = oldLog;
newTree.texts = await userTexts(join(newDir, "store.sqlite"));
oldTree.texts = await userTexts(join(oldRun, "store.sqlite"));
const HOLDS = [
 ["pi's follow-end rule still re-engages AT the bottom: the screen after pi's sixth prompt shows it",
  (tree) => hasRow(state(tree, 8), "sixth prompt"), (tree) => `row=${rowsOf(state(tree, 8)).findIndex((line) => line.includes("sixth prompt"))}`],
 ["pi's dock borders stay WHOLE in every frame: exactly two rows of pi's Box border, each exactly the terminal width",
  (tree) => tree.frames.every((frame) => rowsOf(frame).filter((line) => BORDER.test(line)).length === 2),
  (tree) => `badFrames=${tree.frames.filter((frame) => rowsOf(frame).filter((line) => BORDER.test(line)).length !== 2).length}`],
 ["pi's Esc still clears a kept draft: the screen after pi's Esc paints no `/goal keep going` between the borders",
  (tree) => !insideDock(state(tree, 13), "/goal keep going"), (tree) => `kept=${insideDock(state(tree, 13), "/goal keep going")}`],
 ["the refusal is still refused BY NAME: its rows close with `refused by name` and name the verb",
  (tree) => { const block = refusalBlock(state(tree, 12)); return block.length >= 1 && block.join(" ").includes("/goal") && block.join(" ").includes("refused by name"); },
  (tree) => `rows=${refusalBlock(state(tree, 12)).length}`],
 ["the ack identity triple keeps its wording: every `submitted:` row still spells `requestId=` and `submissionId=`",
  (tree) => tree.frames.every((frame) => rowsOf(frame).every((line) => !line.includes("submitted:") || (line.includes("requestId=") && line.includes("submissionId=")))),
  (tree) => `ackRows=${tree.frames.reduce((sum, frame) => sum + rowsOf(frame).filter((line) => line.includes("submitted:")).length, 0)}`],
 ["both runs stayed offline and answered every keystroke: pi's faux plane, exit 0, 14 writes",
  (tree) => /child exit=0 keystrokes written=14/.test(tree.log), (tree) => `last=${tree.log.trim().split("\n").slice(-1)[0]}`],
 ["both trees admit pi's typed prompts to the store, and NEITHER admits the refused `/goal` draft",
  (tree) => tree.texts.length === 7 && tree.texts[0] === "first prompt alpha" && tree.texts.every((text) => !text.includes("/goal")),
  (tree) => `store=${tree.texts.join("|")}`],
];

for (const [label, predicate, detail] of HOLDS) {
 const okNew = predicate(newTree);
 const okOld = predicate(oldTree);
 record(okNew && okOld, `${label} - on BOTH trees`, `${detail(newTree)} ${detail(oldTree)}`);
}

// The wording did not change, only the ROWING: pi-durable's refusal words, spaces stripped, are identical
// between the two screens. That is what keeps this goal from quietly re-wording a refusal.
const joinedNew = refusalBlock(state(newTree, 12)).join("").replace(/\s/g, "");
const joinedOld = refusalBlock(state(oldTree, 12)).join("").replace(/\s/g, "");
record(joinedNew.length > 100 && joinedNew === joinedOld,
 "the refusal WORDING is byte-identical between the two screens (spaces stripped): what changed is how many ROWS pi's width handling needed, never what pi-durable says",
 `newChars=${joinedNew.length} oldChars=${joinedOld.length} rowsNew=${refusalBlock(state(newTree, 12)).length} rowsOld=${refusalBlock(state(oldTree, 12)).length} widestNewRow=${Math.max(0, ...refusalBlock(state(newTree, 12)).map(rowWidth))} widestOldRow=${Math.max(0, ...refusalBlock(state(oldTree, 12)).map(rowWidth))}`);

const failed = checks.filter((check) => !check.ok);
console.log(`renderparity: ${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) {
 for (const check of failed) console.log(`  FAILED ${check.label}`);
 process.exitCode = 1;
}
