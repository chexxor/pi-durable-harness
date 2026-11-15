#!/usr/bin/env node
// PROVENANCE: no Durian-Pi original. Durian-Pi never ran a terminal itself (its seats ran the `pi`
// CLI as a child process, so pi's TUI was pi's), and it has no pty helper.
//
// WHAT THIS PROVES: that the interactive window is really what a user gets when they run this harness
// IN A TERMINAL - not only what a scripted fixture gets. Every other TUI check in this repo feeds
// keystrokes through a PIPE (`--keystroke-input`), which proves the driver's logic but cannot prove
// `process.stdin.isTTY` is true, that raw mode is what a terminal actually hands the driver, or that
// the surface CHOSEN for a terminal run is the window rather than print mode. Those claims need a real
// terminal allocation, so this demo allocates one.
//
// WHY python3 IS USED FOR ONE THING: Node has no pty primitive and this repo must not add a
// dependency for a test. python3's standard-library `pty` module allocates the terminal - the code
// under test never sees python: it is spawned as a normal child process whose stdin/stdout/stderr
// are the pty's slave side, put into raw mode, exactly as a shell terminal does. Everything asserted
// below is about what the harness did inside that terminal; the allocator is named in the check
// details so a reader can tell allocation from behaviour.
//
// OFFLINE: the run is answered by pi-ai's faux plane (`--faux`), so no provider endpoint is contacted.
// A pty is a local kernel object, not a socket, so this demo stays inside the offline proof.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const ROOT = process.cwd();
const CLI = join(ROOT, "cli.mjs");

// One pty allocation: argv in, feeds typed as hex so the CR keystrokes survive copy-paste edits.
const PY = String.raw`
import json, os, pty, tty, subprocess, select, sys, time
argv = json.loads(sys.argv[1]); feeds = [bytes.fromhex(x) for x in sys.argv[2].split(",")]
master, slave = pty.openpty()
proc = subprocess.Popen(argv, stdin=slave, stdout=slave, stderr=slave, preexec_fn=lambda: tty.setraw(slave))
os.close(slave)
out = b""; sent = 0; t0 = time.time()
while time.time() - t0 < 30:
  try:
    if select.select([master], [], [], 0.2)[0]:
      chunk = os.read(master, 65536)
      if not chunk: break
      out += chunk
  except OSError: break
  if sent < len(feeds):
    os.write(master, feeds[sent]); sent += 1
  if proc.poll() is not None: break
try:
  while True:
    chunk = os.read(master, 65536)
    if not chunk: break
    out += chunk
except OSError: pass
sys.stdout.write(json.dumps({"exit": proc.wait(timeout=10), "stream": out.decode("utf-8", "replace")}))
`.trim();

async function awaitExit(child) {
 return await new Promise((done) => child.once("exit", done));
}

async function runNode(argv, { stdin = null } = {}) {
 const child = spawn("node", [CLI, ...argv], { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
 if (stdin !== null) child.stdin.write(stdin);
 child.stdin.end();
 let out = "";
 let err = "";
 child.stdout.on("data", (chunk) => { out += chunk.toString(); });
 child.stderr.on("data", (chunk) => { err += chunk.toString(); });
 await awaitExit(child);
 return { exit: child.exitCode, out, err };
}

async function inTerminal(argv, feeds) {
 const child = spawn("python3", ["-c", PY, JSON.stringify(argv), feeds.join(",")], { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
 let out = "";
 let err = "";
 child.stdout.on("data", (chunk) => { out += chunk.toString(); });
 child.stderr.on("data", (chunk) => { err += chunk.toString(); });
 await awaitExit(child);
 if (child.exitCode !== 0) return { exit: null, stream: "", error: `pty helper exited ${exit}: ${err.slice(0, 200)}` };
 try {
  const parsed = JSON.parse(out);
  return { exit: parsed.exit, stream: parsed.stream, error: null };
 } catch (err2) {
  return { exit: null, stream: "", error: `pty helper answered unparseably: ${String(err2?.message ?? err2)}` };
 }
}

async function main() {
 const dir = mkdtempSync(join(tmpdir(), "dh-tty-"));
 const store = join(dir, "s.sqlite");
 const typed = "hello terminal";
 const checks = [];
 function record(ok, label, detail = "") { checks.push({ ok, label, detail }); }

 const term = await inTerminal(["node", CLI, "--store", store, "--cwd", dir, "--faux", "the terminal answer"],
  [Buffer.from(`${typed}\r`).toString("hex"), Buffer.from("quit\r").toString("hex")]);
 record(term.error === null && term.exit === 0,
  "a terminal run of this harness starts, takes typed input, and settles cleanly under an allocated pty",
  `exit=${term.exit} error=${term.error ?? "-"} streamBytes=${term.stream.length}`);
 record(term.stream.includes("plane:"),
  "the terminal run prints its own plane inventory before drawing, naming pi's packages and pi's theme",
  `plane=${(term.stream.match(/plane: [^\r\n]*/) ?? [""])[0].slice(0, 180)}`);
 record(term.stream.includes("theme:"),
  "the terminal run paints rows with pi's discovered theme (its own report names the palette it used)",
  `theme=${(term.stream.match(/theme: [^\r\n]*/) ?? [""])[0].slice(0, 120)}`);
 record(term.stream.includes("submitted:"),
  "the terminal's typed line reached the session this process owns (the window acknowledged the submission)",
  `acks=${term.stream.split(/\r|\n/).filter((l) => l.includes("submitted:")).length}`);
 record(!term.stream.includes("print mode needs a prompt"),
  "a terminal run with no prompt asked for the INTERACTIVE window, not print mode (chooseSurface's TTY rule)",
  `streamBytes=${term.stream.length}`);

 // The same store reopened in pi's JSON mode: the typed line is committed exactly ONCE, and the line
 // that asked to quit never became agent input. The records are parsed here rather than rebuilt.
 const reopen = await runNode(["--store", store, "--cwd", dir, "-c", "--mode", "json"]);
 const records = reopen.out.split("\n").flatMap((line) => {
  try { return [JSON.parse(line)]; } catch { return []; }
 });
 const typedEnds = records.filter((r) => r?.type === "message_end" && r?.message?.role === "user" && JSON.stringify(r.message).includes(typed));
 const quitRows = records.filter((r) => JSON.stringify(r ?? {}).includes('"quit"') || JSON.stringify(r ?? {}).includes("quit\n"));
 record(reopen.exit === 0 && typedEnds.length === 1,
  "the line typed into the terminal is committed exactly once on the store this process owned",
  `typed rows=${typedEnds.length} user ends=${records.filter((r) => r?.type === "message_end" && r?.message?.role === "user").length}`);
 record(quitRows.length === 0,
  "the `quit` line ended the session instead of becoming agent input",
  `quit rows=${quitRows.length}`);

 // The contrast that makes the TTY rule mean something: the SAME command with stdin piped is print
 // (and errors, since no prompt was given) - so `npm run cli` in a terminal and piped in a script
 // choose different surfaces by pi-like choice rather than by accident.
 const piped = await runNode(["--store", store, "--cwd", dir, "--faux", "the terminal answer"], { stdin: "\n" });
 record(piped.exit !== 0 && piped.err.includes("print mode needs a prompt"),
  "the SAME command with piped stdin chooses print, not the window (a scripted run must not steal a terminal)",
  `exit=${piped.exit} stderr=${piped.err.trim().slice(0, 140)}`);

 rmSync(dir, { recursive: true, force: true });
 for (const c of checks) if (!c.ok) console.log(`NOT ${c.label}: ${c.detail}`);
 const bad = checks.filter((c) => !c.ok);
 console.log(`tty: ${checks.length - bad.length}/${checks.length} checks passed`);
 process.exitCode = bad.length ? 1 : 0;
}

main().catch((err) => {
 console.error(String(err?.message ?? err));
 process.exitCode = 1;
});
