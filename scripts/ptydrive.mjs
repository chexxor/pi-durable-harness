#!/usr/bin/env node
// scripts/ptydrive.mjs - drive a child process the way a HUMAN drives a terminal: allocate a real pty,
// write ONE keystroke per write, ENTER as \r, arrows as ESC[A/ESC[B, and hand back what the child painted.
//
// PROVENANCE: no Durian-Pi original - Durian-Pi never ran a terminal (its seats ran the `pi` CLI as a
// child process, so pi's TUI was pi's), and it has no pty helper; the same "no original" claim is made
// there for the demo that grew out of this helper (demo/tty.test.mjs). `--verified against pinned packages`:
// the stripped dump comes from pi-tui's OWN `stripTerminalSequences` (node_modules/@earendil-works/pi-tui,
// pin v1.5.1), so "what the child painted" is unescaped with pi's own escaper rather than a regex typed
// here. WHAT CHANGED versus that demo's inline allocator: nothing in behaviour - the python shape is the
// same (stdlib `pty.openpty`, `tty.setraw`, `select`-bounded reads, SIGTERM then bounded drain) - but it is
// now ONE committed, reusable, SEGMENT-BY-KEYSTROKE tool instead of a String.raw block copied per demo.
// DROPPED on purpose, named rather than reimplemented: no winsize/ioctl sizing (this harness's CLI takes
// --width/--height itself), no mouse-sequence decoding, no key REPLAY (a human run types once).
//
// WHY python3 AGAIN: Node has no pty primitive and this repo must not add a dependency for a test, so
// python3's standard-library `pty` module allocates the terminal. The code under test never sees python:
// it is spawned as a normal child whose stdin/stdout/stderr are the pty's slave side, put into raw mode
// exactly as a shell terminal does. A pty is a local kernel object, not a socket, so driving a run through
// this helper stays inside an offline proof when the child itself is offline (e.g. spelled `--faux`).
//
// WHAT THIS HELPER DOES NOT DECIDE: what a keystroke MEANS. It types bytes; pi's components decide meaning.
// It never interrupts a child that is still typing: the settling signal is sent only after EVERY keystroke
// has been written and the child is still alive, so a run that is asked to stop still runs its own cleanup.

import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
// The allocator. argv[1] is JSON { argv, feeds: [hex...], timeout, after, gap }; stdout is JSON
// { exit, sent, segments: [[label, hexBytes]...] }. Segments are split per keystroke so a reader can tell
// WHICH keystroke produced WHICH paint, which one concatenated dump cannot show. Painted bytes are carried
// as hex so no control byte survives or dies through JSON.
const PY = String.raw`
import json, os, pty, tty, subprocess, select, sys, time, signal
opt = json.loads(sys.argv[1]); feeds = [bytes.fromhex(x) for x in opt["feeds"]]
timeout = float(opt["timeout"]); after = float(opt["after"]); gap = float(opt["gap"])
master, slave = pty.openpty()
proc = subprocess.Popen(opt["argv"], stdin=slave, stdout=slave, stderr=slave, preexec_fn=lambda: tty.setraw(slave))
os.close(slave)
out_ref = [b""]
segments = []
def drain(seconds, limit=0.15):
  t0 = time.time()
  while time.time() - t0 < seconds:
    try:
      if select.select([master], [], [], limit)[0]:
        chunk = os.read(master, 65536)
        if not chunk: return False
        out_ref[0] += chunk
    except OSError: return False
  return True
def close(label):
  painted, out_ref[0] = out_ref[0], b""
  segments.append([label, painted])
# pi-tui's start() negotiates the keyboard protocol and raw mode before any keystroke is taken; a human's
# first keystroke always arrives after that, so the first feed waits for the first paint.
sent = 0
t0 = time.time()
while time.time() - t0 < timeout:
  if proc.poll() is not None: break
  need = after if sent == 0 else gap
  if sent < len(feeds) and time.time() - t0 >= need:
    os.write(master, feeds[sent]); sent += 1
    close("keystroke%d %r" % (sent, feeds[sent - 1]))
    t0 = time.time()
  else:
    drain(gap if sent >= len(feeds) else 0.05)
close("painted since the last keystroke" if sent else "before the first keystroke")
if proc.poll() is None:
  proc.send_signal(signal.SIGTERM)
  drain(6)
drain(3)
if out_ref[0]: close("settling")
try:
  proc.wait(timeout=10)
except Exception: pass
sys.stdout.write(json.dumps({"exit": proc.returncode, "sent": sent, "segments": [[l, b.hex()] for l, b in segments]}))
`.trim();

// One escape decoder so a feed survives copy-paste edits: \r is ENTER, \e is ESC (so \e[A is pi's up-arrow
// byte sequence), \t TAB, \n LF, \xHH any byte. Nothing here interprets the bytes - they are written as typed.
function decodeKeystroke(text) {
 let out = "";
 for (let i = 0; i < text.length; i++) {
  const c = text[i];
  if (c !== "\\") { out += c; continue; }
  const n = text[i + 1];
  if (n === undefined) { out += "\\"; break; }
  if (n === "n") { out += "\n"; i += 1; continue; }
  if (n === "r") { out += "\r"; i += 1; continue; }
  if (n === "t") { out += "\t"; i += 1; continue; }
  if (n === "e") { out += "\x1b"; i += 1; continue; }
  if (n === "\\") { out += "\\"; i += 1; continue; }
  if (n === "x" && /^[0-9a-fA-F]{2}$/.test(text.slice(i + 2, i + 4))) { out += String.fromCharCode(parseInt(text.slice(i + 2, i + 4), 16)); i += 3; continue; }
  out += c + n; i += 1;
 }
 return Buffer.from(out, "utf8").toString("hex");
}

const argv = process.argv.slice(2);
const feeds = [];
const opts = { timeout: 25, after: 1.5, gap: 0.6, capture: null, quiet: false, json: false };
const child = [];
let mode = "opts";
for (let i = 0; i < argv.length; i++) {
 const t = argv[i];
 if (t === "--") { mode = "child"; continue; }
 if (mode === "child") { child.push(t); continue; }
 if (t === "--keystroke") { feeds.push(decodeKeystroke(argv[++i])); continue; }
 if (t === "--feed-hex") { feeds.push(String(argv[++i]).toLowerCase()); continue; }
 if (t === "--up") { feeds.push(decodeKeystroke("\\e[A")); continue; }
 if (t === "--down") { feeds.push(decodeKeystroke("\\e[B")); continue; }
 if (t === "--enter") { feeds.push(decodeKeystroke("\\r")); continue; }
 if (t === "--tab") { feeds.push(decodeKeystroke("\\t")); continue; }
 if (t === "--capture") { opts.capture = argv[++i]; continue; }
 if (t === "--timeout") { opts.timeout = Number(argv[++i]); continue; }
 if (t === "--after") { opts.after = Number(argv[++i]); continue; }
 if (t === "--gap") { opts.gap = Number(argv[++i]); continue; }
 if (t === "--quiet") { opts.quiet = true; continue; }
 if (t === "--json") { opts.json = true; continue; }
 if (t === "--help" || t === "-h") {
  console.log("usage: node scripts/ptydrive.mjs [--keystroke TEXT ...] [--feed-hex HEX ...] [--up|--down|--enter|--tab]");
  console.log("                [--capture PREFIX] [--timeout S] [--after S] [--gap S] [--quiet] [--json] -- <child argv>");
  console.log("  keystroke escapes: \\r ENTER, \\e ESC (so \\e[A is pi's up arrow), \\t TAB, \\n LF, \\xHH any byte.");
  console.log("  every keystroke is ONE write to a real pty slave, so the child sees a terminal, not a pipe.");
  console.log("  --capture PREFIX writes PREFIX.screen (raw painted bytes) and PREFIX.plain (pi-tui's own stripped text).");
  process.exit(0);
 }
 console.error(`ptydrive: not a helper flag: ${t}`);
 process.exit(2);
}
if (!child.length) { console.error("ptydrive: no child argv after --"); process.exit(2); }

async function awaitExit(proc) { return await new Promise((done) => proc.once("exit", done)); }

async function run(childArgv) {
 const helper = spawn("python3", ["-c", PY, JSON.stringify({ argv: childArgv, feeds, timeout: opts.timeout, after: opts.after, gap: opts.gap })], { stdio: ["pipe", "pipe", "pipe"] });
 let out = "";
 let err = "";
 helper.stdout.on("data", (chunk) => { out += chunk.toString(); });
 helper.stderr.on("data", (chunk) => { err += chunk.toString(); });
 await awaitExit(helper);
 if (helper.exitCode !== 0) return { exit: null, segments: [], error: `pty allocator exited ${helper.exitCode}: ${err.slice(0, 300)}` };
 try {
  const parsed = JSON.parse(out);
  const segments = (parsed.segments ?? []).map(([label, hex]) => ({ label, bytes: Buffer.from(String(hex), "hex") }));
  return { exit: parsed.exit, segments, sent: parsed.sent, error: null };
 } catch (err2) {
  return { exit: null, segments: [], error: `pty allocator answered unparseably: ${String(err2?.message ?? err2)}: ${out.slice(0, 200)}` };
 }
}

async function main() {
 const result = await run(child);
 if (result.error) { console.log(`ptydrive: ${result.error}`); return 2; }
 const total = result.segments.reduce((sum, s) => sum + s.bytes.length, 0);
 for (const seg of result.segments) seg.plain = stripTerminalSequences(seg.bytes.toString("utf8"));
 const plainAll = result.segments.map((s) => s.plain).join("");
 if (opts.capture) {
  const parent = dirname(opts.capture);
  if (parent) mkdirSync(parent, { recursive: true });
  writeFileSync(`${opts.capture}.screen`, Buffer.concat(result.segments.map((s) => s.bytes)));
  writeFileSync(`${opts.capture}.plain`, plainAll);
 }
 if (!opts.quiet) {
  for (const seg of result.segments) {
   console.log(`---- ${seg.label} (${seg.bytes.length} painted bytes) ----`);
   if (seg.plain.trim()) console.log(seg.plain);
  }
 }
 if (opts.json) console.log(JSON.stringify({ exit: result.exit, sent: result.sent, bytes: total, segments: result.segments.map((s) => s.label) }));
 console.log(`ptydrive: child exit=${result.exit ?? "unknown"} keystrokes written=${result.sent ?? "?"} painted bytes=${total} capture=${opts.capture ?? "not written"}`);
 return result.exit === 0 ? 0 : 0; // the child's verdict is what a caller greps for; the helper's own failure exits 2 above
}

process.exit(await main());
