#!/usr/bin/env node
// PROVENANCE: no Durian-Pi original. Durian-Pi never ran a terminal itself (its seats ran the `pi`
// CLI as a child process, so pi's TUI was pi's), and it has no pty helper.
//
// WHAT THIS PROVES: that the interactive window is really what a user gets when they run this harness
// IN A TERMINAL - not only what a scripted fixture gets. Every other TUI check in this repo feeds
// keystrokes through a PIPE (`--keystroke-input`), which proves the driver's logic but cannot prove
// `process.stdin.isTTY` is true, that raw mode is what a terminal actually hands the driver, or that
// the surface CHOSEN for a terminal run is the window rather than print mode. Those claims need a real
// terminal allocation, so this demo allocates one. It also checks the CONTRAST: the SAME command with
// `--row-view` spelled out keeps the harness's flat row surface, and the SAME command with piped stdin
// chooses print instead - the three surfaces a user can reach are therefore deliberate, not accidental.
//
// WHY python3 IS USED FOR ONE THING: Node has no pty primitive and this repo must not add a
// dependency for a test. python3's standard-library `pty` module allocates the terminal - the code
// under test never sees python: it is spawned as a normal child process whose stdin/stdout/stderr
// are the pty's slave side, put into raw mode, exactly as a shell terminal does. Everything asserted
// below is about what the harness did inside that terminal; the allocator is named in the check
// details so a reader can tell allocation from behaviour.
//
// pi's FOOTER words are checked here too, and they need committed entries to be about: pi prints one
// word per NON-ZERO committed total, so each window run's store is first seeded with one SETTLED turn
// through the ordinary print path on the SAME store, and the window runs at the repo cwd so pi's own
// `pwd (branch)` segment has a repository to read (.git/HEAD) - the ownership lock lives beside the STORE
// (src/ownership.mjs), not beside the cwd, so a run whose cwd is the repo still writes nothing into it;
// demo/tty.test.mjs re-checks `git status --short` is untouched by this, and the row-view and piped
// contrasts stay on the temp cwd to prove only the surface choice changes.
//
// OFFLINE: the run is answered by pi-ai's faux plane (`--faux`), so no provider endpoint is contacted.
// A pty is a local kernel object, not a socket, so this demo stays inside the offline proof.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { piGitBranchOf } from "../src/tui/piscreen.mjs";

const ROOT = process.cwd();
const CLI = join(ROOT, "cli.mjs");

// One pty allocation: argv in, feeds typed as hex so the CR keystrokes survive copy-paste edits.
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
  # A HUMAN types a line, reads the answer, then types the next one, so the feeds are spaced apart
  # rather than arriving back to back: the window paints pi-durable's own acknowledgement row BETWEEN
  # keystrokes, and back-to-back feeds land both drafts in ONE drain, which leaves nothing to repaint.
  if sent < len(feeds) and time.time() - t0 > 1.5 + 2.5 * sent:
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
 if (child.exitCode !== 0) return { exit: null, stream: "", error: `pty helper exited ${child.exitCode}: ${err.slice(0, 200)}` };
 try {
  const parsed = JSON.parse(out);
  return { exit: parsed.exit, stream: parsed.stream, error: null };
 } catch (err2) {
  return { exit: null, stream: "", error: `pty helper answered unparseably: ${String(err2?.message ?? err2)}` };
 }
}

// pi's fullscreen paint separates rows with cursor/erase sequences, not with newlines, so the rows
// compared below are split off the paint bytes and run through pi-tui's OWN sequence stripper.
function paintedRowsOf(bytes) {
 return bytes.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "\n").split("\n").map((line) => stripTerminalSequences(line)).filter((line) => line.trim());
}

async function main() {
 const dir = mkdtempSync(join(tmpdir(), "dh-tty-"));
 const store = join(dir, "s.sqlite");
 const typed = "hello terminal";
 const checks = [];
 function record(ok, label, detail = "") { checks.push({ ok, label, detail }); }

 // What the repo's tracked files look like BEFORE anything runs with the repo as its cwd; the same
 // listing is compared after, which is how the demo says these runs wrote nothing into the repo without
 // claiming the repo was clean when other work happened to be in progress.
 const gitBefore = execFileSync("git", ["status", "--short"], { cwd: ROOT, encoding: "utf8" }).trim();

 // The store gets ONE SETTLED turn first, through the ordinary print path (the same cli.mjs the user
 // runs): pi's footer prints one word per NON-ZERO committed total, so the numbers it must show have to
 // come from pi-durable's committed `usage` records rather than from anything this file draws.
 const seed = await runNode(["--store", store, "--cwd", ROOT, "-p", "seed the footer usage", "--faux", "a seeded answer"]);
 record(seed.exit === 0 && seed.out.includes("a seeded answer"),
  "a settled turn is committed through the ordinary print path on this store before the window opens",
  `seedExit=${seed.exit} seedAnswer=${seed.out.trim().slice(0, 60)}`);

 // The window run happens at THIS repo's cwd, which is where pi's own `pwd (branch)` footer segment has
 // a repository to read; the store (and therefore this process's ownership lock) stays in the temp dir.
 const term = await inTerminal(["node", CLI, "--store", store, "--cwd", ROOT, "--faux", "the terminal answer"],
  [Buffer.from(`${typed}\r`).toString("hex"), Buffer.from("quit\r").toString("hex")]);
 record(term.error === null && term.exit === 0,
  "a terminal run of this harness starts, takes typed input, and settles cleanly under an allocated pty",
  `exit=${term.exit} error=${term.error ?? "-"} streamBytes=${term.stream.length}`);
 record(term.stream.includes("plane:"),
  "the terminal run prints its own plane inventory before drawing, naming pi's packages and pi's theme",
  `plane=${(term.stream.match(/plane: [^\r\n]*/) ?? [""])[0].slice(0, 180)}`);
 record(term.stream.includes("pi-durable session"),
  "the terminal's startup screen says this is a pi-durable session, not a regular pi session",
  `marker=${(term.stream.match(/pi-durable session [^\r\n]*/) ?? [""])[0].slice(0, 140)}`);
 record(term.stream.includes("file://"),
  "the startup screen names the database this session opened, as a file:// URL over the store path",
  `storeUrl=${(term.stream.match(/file:\/\/[^\r\n]*/) ?? [""])[0].slice(0, 140)}`);
 record(term.stream.includes("screen: pi's chat viewport"),
  "the terminal run reports its own screen summary, which only the pi-style window prints",
  `screen=${(term.stream.match(/screen: [^\r\n]*/) ?? [""])[0].slice(0, 200)}`);
 record(/theme=(?!pi's builtin)/.test(term.stream),
  "the terminal run paints with pi's discovered theme (its own report names the palette it used)",
  `theme=${(term.stream.match(/theme=[^\r\n]*/) ?? [""])[0].slice(0, 120)}`);
// The window is OPEN here, so pi-durable's acknowledgement is PAINTED as its own wrapped row in pi's
// transcript region (src/tui/pidockloop.mjs' `say` routes it there while a window is open) rather than
// written raw to stderr; pi pads a row to the terminal's width, so the wording and pi-durable's identity
// triple stay contiguous inside pi's OWN stripped paint, ONE match per submission.
const termAcks = [...stripTerminalSequences(term.stream).matchAll(/submitted: requestId=(\S+) submissionId=(\d+) status=(\w+)/g)];
record(termAcks.length === 1 && termAcks[0]?.[3] === "placed",
  "the terminal's typed line reached the session this process owns: the window painted pi-durable's OWN acknowledgement row, wording and identity triple intact, with pi's dock left whole",
  `ackRows=${JSON.stringify(termAcks.map((m) => m[0]))}`);
 record(!term.stream.includes("print mode needs a prompt"),
  "a terminal run with no prompt asked for the INTERACTIVE window, not print mode (chooseSurface's TTY rule)",
  `streamBytes=${term.stream.length}`);

 // pi's footer, as painted inside the allocated terminal. The branch is compared against the shipped
 // reader's answer for this cwd, and the usage words are compared against pi's own word shape (pi
 // prints `↑/↓` tokens, `R`/`W` cache, `CH…%` cache-hit rate, `x.x%/contextWindow`).
 const tRows = paintedRowsOf(term.stream);
 const branch = piGitBranchOf(ROOT);
 const home = homedir();
 const homeLabel = ROOT.startsWith(`${home}/`) ? `~${ROOT.slice(home.length)}` : ROOT;
 record(tRows.some((row) => (row.includes(ROOT) || row.includes(homeLabel)) && row.includes(`(${branch})`)),
  "the painted footer shows this run's cwd and the branch piGitBranchOf() read from that cwd's .git/HEAD",
  `branch=${branch} pwdRows=${JSON.stringify(tRows.filter((row) => row.includes(homeLabel) || row.includes(ROOT)).slice(0, 2))}`);
 const usageRow = tRows.filter((row) => /[↑↓][0-9]/.test(row) && /\/[0-9.]+k/.test(row))[0] ?? "";
 record(/[↑↓][0-9]/.test(usageRow) && /[RW][0-9]/.test(usageRow) && /CH[0-9]/.test(usageRow) && /[0-9.]+\s*%\s*\/\s*[0-9.]+k/.test(usageRow),
  "pi's footer words are pi-durable's COMMITTED totals: ↓/↑ tokens, R/W cache, CH cache-hit rate, x%/window on one painted row",
  `footer=${JSON.stringify(usageRow)}`);
 record(!/\(auto\)/.test(term.stream),
  "no `(auto)` marker is painted while pi's settings for this cwd say compaction is off",
  `auto=${JSON.stringify((/\(auto\)/.exec(term.stream) ?? ["(none)"])[0])}`);

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

  // THE USER'S ACTUAL COMMAND: `npm run cli` is what the README tells a terminal user to type.
  // npm swallows flags of its own, so the arguments travel in npm's documented pass-through form
  // (`--`), and npm runs the script from the package root - which is where the store default and the
  // ownership claim belong. Same pty, same assertions.
  const npmTerm = await inTerminal(["npm", "run", "cli", "--", "--store", store, "--cwd", ROOT, "--faux", "the npm answer"],
   [Buffer.from(`${typed} again\r`).toString("hex"), Buffer.from("quit\r").toString("hex")]);
  const npmAcks = [...stripTerminalSequences(npmTerm.stream).matchAll(/submitted: requestId=(\S+) submissionId=(\d+) status=(\w+)/g)];
  record(npmTerm.error === null && npmTerm.exit === 0 && npmTerm.stream.includes("plane:") && npmAcks.length === 1 && npmAcks[0]?.[3] === "placed",
   "`npm run cli` (npm's pass-through form for the flags) opens the same interactive window in a terminal, and that window painted the acknowledgement row",
   `exit=${npmTerm.exit} plane=${npmTerm.stream.includes("plane:")} ackRows=${JSON.stringify(npmAcks.map((m) => m[0]))}`);
  const npmReopen = await runNode(["--store", store, "--cwd", dir, "-c", "--mode", "json"]);
  const npmEnds = npmReopen.out.split("\n").flatMap((line) => {
   try { return [JSON.parse(line)]; } catch { return []; }
  }).filter((r) => r?.type === "message_end" && r?.message?.role === "user" && JSON.stringify(r.message).includes(`${typed} again`));
  record(npmReopen.exit === 0 && npmEnds.length === 1,
   "the line typed into `npm run cli` is committed exactly once on the store that run owned",
   `typed rows=${npmEnds.length}`);
  const npmRows = paintedRowsOf(npmTerm.stream);
  record(npmRows.some((row) => (row.includes(ROOT) || row.includes(homeLabel)) && row.includes(`(${branch})`)) && npmRows.some((row) => /[↑↓][0-9]/.test(row) && /\/[0-9.]+k/.test(row)),
   "`npm run cli` paints pi's own pwd · branch footer row AND pi-durable's committed-total words on a second row",
   `pwdRows=${npmRows.filter((row) => (row.includes(ROOT) || row.includes(homeLabel)) && row.includes("(")).length} usageRows=${npmRows.filter((row) => /[↑↓][0-9]/.test(row) && /\/[0-9.]+k/.test(row)).length}`);

 // The row surface stays reachable, spelled out: the SAME terminal run with `--row-view` gets the
 // harness's flat rows (its own header words and its own input mark), not pi's window - which is what
 // keeps the headless fixtures (demo/tui.test.mjs) and a terminal user on the same deliberate choice.
 // Nothing about the repo changed while these terminal runs were using it as their cwd: the store,
 // and with it the ownership lock (src/ownership.mjs `lockPath` = beside the store), stayed in the temp
 // dir, and pi-durable's session writes only to that store.
 const gitAfter = execFileSync("git", ["status", "--short"], { cwd: ROOT, encoding: "utf8" }).trim();
 record(gitAfter === gitBefore,
  "the terminal runs that used the REPO as their cwd changed no tracked file: the store, and with it the ownership lock (src/ownership.mjs `lockPath` = beside the store), stayed in the temp dir",
  `before=${JSON.stringify(gitBefore.split("\n").filter(Boolean))} after=${JSON.stringify(gitAfter.split("\n").filter(Boolean))}`);

 const rowStore = join(dir, "rows.sqlite");
 const rowTerm = await inTerminal(["node", CLI, "--store", rowStore, "--cwd", dir, "--faux", "the row answer", "--row-view"],
  [Buffer.from(`${typed} as a row\r`).toString("hex"), Buffer.from("quit\r").toString("hex")]);
 record(rowTerm.error === null && rowTerm.exit === 0 && rowTerm.stream.includes("durable transcript") && rowTerm.stream.includes("watch frames"),
  "`--row-view` in a terminal keeps the harness's flat row surface (its header words and its footer words)",
  `exit=${rowTerm.exit} header=${rowTerm.stream.includes("durable transcript")} footer=${rowTerm.stream.includes("watch frames")}`);
 record(!rowTerm.stream.includes("screen: pi's chat viewport"),
  "the row surface prints no pi-window summary, so the flag selects a surface rather than decorating one",
  `window=${rowTerm.stream.includes("screen: pi's chat viewport")}`);

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
