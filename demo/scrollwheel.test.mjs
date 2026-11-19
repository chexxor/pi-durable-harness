#!/usr/bin/env node
// demo/scrollwheel.test.mjs - the WHEEL and PAGE plane of the pi-style screen: what an unhandled mouse-wheel
// gesture does to pi's transcript view, and what pi's OWN ScrollView API does with it. Measured TWICE and
// SIDE BY SIDE: once as the PAINTED ROWS of a real terminal (pi's alt screen answering pi's wheel byte forms
// at the committed cli), and once IN-PROCESS against pi-tui's exported `ScrollView` (pi's own view state:
// scrollTop, isFollowingEnd, viewportHeight, isScrollbarVisible). Every number below is pi's answer at THIS
// pin read on this machine - not a remembered behaviour, and never a scroll rule typed here.
//
// PROVENANCE: no Durian-Pi original - Durian-Pi never ran a terminal (its seats ran the `pi` CLI as a child
// process, so pi's TUI was pi's) and it has no pty helper and no scroll plane, so nothing here was extracted.
// WHAT CHANGED versus the demos this one reuses (demo/renderparity.test.mjs, demo/keybindings.test.mjs): the
// pty is the ONE committed scripts/ptydrive.mjs and the frame reader is the same shape as demo/renderparity's
// (that file's own committed pattern) - what is new here is that the reader compares the TRANSCRIPT REGION
// ROWS of consecutive frames, which is what makes "ONE line per wheel gesture" a measured claim.
// VERIFIED AGAINST PINED PACKAGES, read on this machine at pin v1.5.1 (sha dd30101cfc5b0609411dd80b6f93adbc14db14cf):
// pi-tui's runtime export `ScrollView` (dist/index.d.ts:13, and `import { ScrollView } from
// "@earendil-works/pi-tui"` answers a function), with getters `scrollTop`/`isFollowingEnd`/`viewportHeight`/
// `isScrollbarVisible` and methods `updateLayout`/`scrollBy`/`scrollTo`/`scrollToStart`/`scrollToEnd`; pi-tui's
// `Text` and `TuiAltScreen`; pi's `KeybindingsManager` reached through src/tui/piscreen.mjs' `piDockOf`; and pi's
// OWN wheel path read as TEXT off pi-tui's dist, since it is NOT a runtime export of the package at this pin:
// dist/tui-alt-screen.js carries `parseWheelEvent` and `routeWheel` and imports `WheelScrollAccelerator` from
// pi-tui's own dist/wheel-scroll.js (`export class WheelScrollAccelerator`), which pi's alt screen constructs as
// `new WheelScrollAccelerator(options.wheelScrollLines ?? 1)`. `import { WheelScrollAccelerator } from
// "@earendil-works/pi-tui"` THROWS at this pin, so its name is read off pi's file rather than imported here.
// DROPPED on purpose and named in the capability matrix rather than reimplemented: pi's mouse MOVE/HOVER region
// and its drag selection, pi's transcript search, pi's `<agent-dir>/keybindings.json` user bindings (a wheel
// byte carries no id to re-bind), pi's own terminal mouse-mode enable query (pi-tui's dist sends none here, so
// the wheel bytes only arrive because a real terminal answers them), and no scroll behaviour of our own - the
// harness composes pi's ScrollView and lets pi's component move the view.
//
// WHY python3 APPEARS: Node has no pty primitive and no dependency may be added for a test, so scripts/ptydrive.mjs
// allocates the terminal with python3's standard-library `pty` module; the code under test is a normal Node child
// whose stdio is the pty's slave side. A pty is a local kernel object, not a socket, and the run spells `--faux`,
// so pi-ai's faux plane answers and no provider endpoint is contacted - the whole demo stays inside the offline proof.

import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ScrollView, Text, TuiAltScreen, stripTerminalSequences, getKeybindings } from "@earendil-works/pi-tui";
import { piDockOf } from "../src/tui/piscreen.mjs";

const ROOT = process.cwd();
const CLI = join(ROOT, "cli.mjs");
const W = 48;
const H = 16;
const checks = [];
function record(ok, label, detail = "") {
 checks.push({ ok, label });
 console.log(`  ${ok ? "ok " : "NOT"} ${label}${detail ? `: ${detail}` : ""}`);
}

// A no-op terminal: pi's components only need pi's public `Terminal` calls.
function mkui() {
 return new TuiAltScreen({
  start: () => {}, stop: () => {}, write: () => {}, moveBy: () => {}, hideCursor: () => {}, showCursor: () => {},
  clearLine: () => {}, clearFromCursor: () => {}, clearScreen: () => {}, setTitle: () => {}, setProgress: () => {},
  drainInput: async () => [],
 }, false, undefined);
}

// pi's transient scrollbar thumb and pi's own Box border glyph, only ever READ here.
const THUMB = new RegExp("[\u2502\u2503]$");
const thumbRows = (rows) => rows.filter((line) => THUMB.test(line)).length;
// pi-durable's status row (`idle` with no run) closes the transcript document, and pi's footer rows live BELOW
// the ScrollView, so the region compared across frames is everything above that status row.
function regionRows(rows) {
 const end = rows.findIndex((line) => line.trim() === "idle");
 return rows.slice(0, end < 0 ? rows.length : end).map((line) => line.replace(/[\u2502\u2503]+$/, "").replace(/\s+$/, ""));
}

// 1) pi's OWN ScrollView, in process: pi's view state, not a model of it.
const CONTENT = 21;
const VIEW = 8;
const doc = new Text(Array.from({ length: CONTENT }, (_, i) => `line ${i + 1}`).join("\n"), 0, 0);
const view = new ScrollView(doc, { follow: "end", primary: true, overscroll: "chain", scrollbar: "auto" });
let paints = 0;
const requestRender = () => { paints += 1; };
view.updateLayout(CONTENT, VIEW, requestRender);
const snap = () => ({
 scrollTop: view.scrollTop, followingEnd: view.isFollowingEnd, viewportHeight: view.viewportHeight,
 thumb: view.isScrollbarVisible, active: view.isScrollbarActive,
});
const atLayout = snap();
const by1 = view.scrollBy(-1);
const afterBy1 = snap();
const byBig = view.scrollBy(-99);
const afterByBig = snap();
view.scrollTo(5);
const afterTo = snap();
view.scrollToStart();
const afterStart = snap();
view.scrollToEnd();
const afterEnd = snap();
const byDown = view.scrollBy(1);
const afterByDown = snap();
record(atLayout.scrollTop === CONTENT - VIEW && atLayout.followingEnd === true && atLayout.viewportHeight === VIEW && atLayout.thumb === false,
 "pi's ScrollView with pi's own `{follow: end, primary: true, overscroll: chain, scrollbar: auto}` answers pi's CONTENT-END scrollTop and pi's own viewport height, and pi's scrollbar is NOT visible while the view sits at that end",
 `scrollTop=${atLayout.scrollTop} followingEnd=${atLayout.followingEnd} viewportHeight=${atLayout.viewportHeight} thumb=${atLayout.thumb} paints=${paints}`);
record(afterBy1.scrollTop === CONTENT - VIEW - 1 && afterBy1.followingEnd === false && afterBy1.thumb === true,
 "pi's own scrollBy(-1) takes the view OFF the content end: pi stops following the end and pi's scrollbar becomes VISIBLE (one wheel line = one row)",
 `scrollBy(-1)=${by1} scrollTop=${afterBy1.scrollTop} followingEnd=${afterBy1.followingEnd} thumb=${afterBy1.thumb}`);
record(afterByBig.scrollTop === 0 && byBig === -99 + afterBy1.scrollTop && afterByBig.followingEnd === false,
 "pi clamps an oversized gesture to the document TOP: pi's answer names what pi did not move, and scrollTop lands at 0 (no invented clamp here)",
 `scrollBy(-99)=${byBig} scrollTop=${afterByBig.scrollTop}`);
record(afterTo.scrollTop === 5 && afterStart.scrollTop === 0 && afterEnd.scrollTop === CONTENT - VIEW && afterEnd.followingEnd === true,
 "pi's scrollTo / scrollToStart / scrollToEnd answer pi's own positions, and pi's follow-end ENGAGES ONLY once the view sits at that end",
 `scrollTo(5)=${afterTo.scrollTop} start=${afterStart.scrollTop} end=${afterEnd.scrollTop} followingEnd=${afterEnd.followingEnd}`);
record(afterByDown.scrollTop === CONTENT - VIEW,
 "pi's follow-end does not fight a scroll past the end: pi clamps at pi's scrollTop for a content end, and pi's own answer is what is reported",
 `scrollBy(1)=${byDown} scrollTop=${afterByDown.scrollTop}`);
record(paints >= 1,
 "pi asks the LAYOUT to repaint when its ScrollView moves (the callback pi's own updateLayout receives is what pi calls)",
 `paints=${paints}`);

// 2) pi's own wheel PATH names, read off pi-tui's dist (they are not a runtime export at this pin).
const altSource = readFileSync(new URL("./tui-alt-screen.js", import.meta.resolve("@earendil-works/pi-tui")), "utf8");
const wheelSource = readFileSync(new URL("./wheel-scroll.js", import.meta.resolve("@earendil-works/pi-tui")), "utf8");
record(altSource.includes("parseWheelEvent") && altSource.includes("routeWheel") && altSource.includes("WheelScrollAccelerator") && wheelSource.includes("export class WheelScrollAccelerator"),
 "pi-tui's OWN alt-screen component carries the wheel path (`parseWheelEvent`, `routeWheel`) and pi-tui's OWN wheel-scroll file exports `WheelScrollAccelerator`, which pi's alt screen constructs",
 `alt=${["parseWheelEvent", "routeWheel", "WheelScrollAccelerator"].filter((n) => altSource.includes(n)).length}/3 exported=${wheelSource.includes("export class WheelScrollAccelerator")}`);
const dock = piDockOf(mkui(), {});
const resolved = Object.keys(dock.keybindings.getResolvedBindings());
const attributed = (raw) => resolved.filter((id) => dock.keybindings.matches(raw, id));
const WHEEL_UP = "\u001b[<64;20;10M";
const WHEEL_DOWN = "\u001b[<65;20;10M";
record(attributed(WHEEL_UP).length === 0 && attributed(WHEEL_DOWN).length === 0,
 "pi's keybinding matcher attributes NO id to a wheel gesture: the wheel is not a keybinding, pi's alt screen routes it before pi's keybindings are asked",
 `up=${JSON.stringify(attributed(WHEEL_UP))} down=${JSON.stringify(attributed(WHEEL_DOWN))} ids=${resolved.length} registry=${Object.keys(getKeybindings().getResolvedBindings()).length}`);

// 3) the wheel AT A REAL TERMINAL: five prompts make the transcript taller than pi's viewport, then pi's
// wheel byte forms are typed at pi's own dock - ONE feed per gesture, because the committed driver spaces
// writes 0.9s apart and pi's own accelerator treats every such write as a NEW gesture.
const SCRIPT = [
 "first prompt alpha\r", "second prompt beta\r", "third prompt gamma\r", "fourth prompt delta\r", "fifth prompt epsilon\r",
 WHEEL_UP, WHEEL_UP, WHEEL_DOWN, "\u001b[5~", "\u001b[6~", "/quit\r",
];
const base = mkdtempSync(join(tmpdir(), "dh-scrollwheel-"));
const runDir = join(base, "run");
mkdirSync(runDir, { recursive: true });
const drive = ["--timeout", "90", "--after", "3", "--gap", "0.9", "--winsize", String(W), String(H)];
for (const keystroke of SCRIPT) drive.push("--feed-hex", Buffer.from(keystroke, "utf8").toString("hex"));
drive.push("--capture", join(runDir, "cap"), "--", "node", CLI, "--store", join(runDir, "store.sqlite"), "--cwd", runDir, "--width", String(W), "--height", String(H), "--faux", "probe");
let log = "";
try {
 log = execFileSync("node", [join(ROOT, "scripts", "ptydrive.mjs"), ...drive], { cwd: ROOT, encoding: "utf8", timeout: 150000 });
} catch (err) {
 console.log(`  NOT the pty run failed: ${String(err?.stderr ?? err?.message ?? err)}`.slice(0, 300));
}

// Rebuild the visible rows after every pi-tui frame end (the committed pattern from demo/renderparity.test.mjs):
// a frame is credited to the keystroke whose paint holds it, so a reader knows WHICH feed produced WHICH screen.
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
     const snapRows = rows.map((line) => line.replace(/\s+$/, ""));
     if (prev === null || snapRows.join("\n") !== prev.join("\n")) {
      frames.push({ window: windowOf(j + 1), rows: snapRows.map((line) => stripTerminalSequences(line).replace(/\s+$/, "")) });
      prev = snapRows;
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

const capture = screens(join(runDir, "cap.screen"), log);
const keystrokeOf = (window) => { const m = window?.match(/keystroke(\d+)/); return m ? Number(m[1]) : null; };
function state(n) {
 let last = null;
 for (let k = 1; k <= n; k += 1) {
  const own = capture.frames.filter((entry) => keystrokeOf(entry.window) === n);
  if (own.length) last = own[own.length - 1];
 }
 return last;
}
const at = (n) => regionRows(state(n)?.rows ?? []);
const endView = at(5);
const up1 = at(6);
const up2 = at(7);
const back = at(8);
const pageUp = at(9);
const pageDown = at(10);
const repaints = (n) => capture.frames.filter((entry) => keystrokeOf(entry.window) === n).length;

record(capture.complete && capture.frames.length >= 8,
 "the capture is a complete frame walk (every painted byte falls inside one labelled window), so the row comparison below is about whole screens",
 `frames=${capture.frames.length} windows=${capture.windows.length} complete=${capture.complete}`);
record(endView.length > 0 && thumbRows(state(5)?.rows ?? []) === 0,
 "AT THE CONTENT END (the newest prompt typed, no scroll feed yet) pi paints NO scrollbar thumb and the transcript region carries rows",
 `regionRows=${endView.length} thumbs=${thumbRows(state(5)?.rows ?? [])}`);
record(up1.length === endView.length && up1.slice(1).join("\n") === endView.slice(0, -1).join("\n") && !up1.includes(endView[endView.length - 1]),
 "ONE wheel-up gesture moves pi's transcript by EXACTLY ONE row: the row pi had at the top edge is now pi's second row, and the region's last row left the screen",
 `region=${up1.length} top=${JSON.stringify(up1[0])} dropped=${JSON.stringify(endView[endView.length - 1])}`);
record(up2.length === up1.length && up2.slice(1).join("\n") === up1.slice(0, -1).join("\n"),
 "the NEXT wheel-up gesture moves by ONE more row (pi's accelerator answers one line per NEW gesture, and every feed is one write 0.9s later)",
 `region=${up2.length} top=${JSON.stringify(up2[0])}`);
record(thumbRows(state(6)?.rows ?? []) > 0 && thumbRows(state(7)?.rows ?? []) > 0,
 "pi paints its scrollbar thumb while the view is off the content end (pi's transient thumb, not a harness scrollbar)",
 `thumbs=${[6, 7].map((n) => thumbRows(state(n)?.rows ?? [])).join(",")}`);
record(back.join("\n") === up1.join("\n"),
 "ONE wheel-down gesture puts pi's view back EXACTLY where the first wheel-up left it (one row back, no snap to the bottom)",
 `rows=${back.length} top=${JSON.stringify(back[0])}`);
const shared = back.filter((row) => row.trim() && pageUp.includes(row));
const shift = (row) => pageUp.indexOf(row) - back.indexOf(row);
record(shared.length > 0 && shared.every((row) => shift(row) >= 2),
 "pi's pageUp JUMPS further than one wheel line: every row still on screen sits LOWER on the screen by the same amount (a page, not a wheel tick)",
 `shared=${shared.length} shift=${[...new Set(shared.map(shift))].join(",")} pageTop=${JSON.stringify(pageUp[0] ?? "blank")}`);
record(pageDown.join("\n") === back.join("\n"),
 "pi's pageDown pages pi's view BACK to exactly where pi's pageUp left off (the same rows in the same places)",
 `rows=${pageDown.length} top=${JSON.stringify(pageDown[0])} backTop=${JSON.stringify(back[0])}`);
record(repaints(6) >= 1 && repaints(7) >= 1 && repaints(8) >= 1 && repaints(9) >= 1 && repaints(10) >= 1,
 "every wheel and page feed made pi repaint a changed frame (the byte did something inside pi's ScrollView, it did not sit unanswered)",
 `repaints=${[6, 7, 8, 9, 10].map((n) => repaints(n)).join(",")} frames=${capture.frames.length}`);

const failed = checks.filter((check) => !check.ok);
console.log(`scrollwheel: ${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) {
 for (const check of failed) console.log(`  FAILED ${check.label}`);
 process.exitCode = 1;
}
