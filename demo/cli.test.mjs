// demo/cli.test.mjs - the CLI surfaces, run as PROCESSES rather than as imports: every mode here is a real
// `cli.mjs` invocation, and one shared harness-invocation path has to answer for all of them.
//
// WHY CHILD PROCESSES AND NOT IMPORTS: the contract says print, JSON and RPC are each exercised "against one
// shared harness invocation path", and the only way to know the path is shared - rather than three near-copies
// that happen to agree - is to run the surface a user runs, in a process of its own, and read what comes out.
// The shared path is src/cli-intent.mjs's `harnessInvocation`, and this demo also calls it directly for the
// recovery half, because a recovery is a SECOND PROCESS on the same store and the parent has to be the one
// that kills the first.
//
// PROVENANCE: the seam is ~/Git/Durian-Pi/cli.mjs and ~/Git/Durian-Pi/intent.mjs (one verb per process, flags
// resolved to one intent, one requestId printed so a caller can await the result), read 2026-11-15 at pin
// v1.5.1. What changed: the seat/broker spool half of intent.mjs is dropped (one store per directory, and
// another process driving that store is src/ownership.mjs + src/attach.mjs' story, proved in
// demo/attach.test.mjs); pi's per-session-file verbs (`--continue`, `--resume`, `--session <file>`) become
// pi-durable's verbs on one store (`-c`/`-r` reopen the store's root line, `--session <id>` names a
// ConversationId), and pi's `--session-dir` becomes `--store` - both refusals are rows in
// docs/package-support.md, not silence.
//
// The replay rule, read from the pinned dist rather than remembered:
//   node_modules/@earendil-works/pi-durable/dist/harness/types.d.ts, inside ToolRegistration:
//     /** Whether an interrupted execution may rerun on recovery. Default `unsafe`. */
//     readonly replay?: "safe" | "unsafe";
//   dist/harness/tool.d.ts: "Durable intent: the final arguments and the replay policy recorded before
//   execution." (ToolTaskCheckpoint phase "execute" carries { arguments, replay }) and
//     "the tool reruns on reopen only when it is declared `replay: \"safe\"`; otherwise the model gets an
//      `interrupted` error result with the output committed so far."
//   pi-durable's README: "There is no sleep in the middle of a phase: a phase reruns from its top after a
//   restart." - which is why the demo's marker counts EXECUTIONS, not checkpoints.
//
// Offline: every model turn is core.mjs's faux plane (pi-ai's faux provider) - no key read, no network.
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const ROOT = process.cwd();
const CLI = join(ROOT, "cli.mjs");
const OPEN = join(ROOT, "demo", "cli-open.mjs");
const checks = [];
const notes = [];

function record(condition, claim, evidence = "") {
 checks.push({ condition, claim, evidence });
 const line = `  ${condition ? "ok " : "NOT"} ${claim}${evidence ? `: ${evidence}` : ""}`;
 console.log(line);
}

/** Run one script as its own process, optionally killing it partway through.
 *
 * `killAfterMs` is how the replay half of the contract gets a process that died IN THE MIDDLE of a tool
 * call: the fixture's tool writes its marker first and then sits inside its phase, so the marker proves
 * the effect happened and the kill proves the process never reached the end of the phase. The exit event
 * is awaited explicitly - Node's ChildProcess at this version has `once`/`kill`, not `wait()` - and the
 * stdout/stderr listeners are attached before the pipe is written, so the last reply line is in the
 * buffer before the verdict reads it.
 */
async function awaitExit(child) {
 return await new Promise((done) => child.once("exit", done));
}

async function runScript(script, args, { stdin = null, killAfterMs = null } = {}) {
 const child = spawn("node", [script, ...args], { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
 let stdout = "";
 let stderr = "";
 child.stdout.on("data", (chunk) => { stdout += String(chunk); });
 child.stderr.on("data", (chunk) => { stderr += String(chunk); });
 if (stdin !== null) child.stdin.write(stdin);
 child.stdin.end();
 let killed = false;
 if (killAfterMs !== null) {
  const timer = setTimeout(() => {
   killed = true;
   child.kill("SIGKILL");
  }, killAfterMs);
  await awaitExit(child);
  clearTimeout(timer);
 } else {
  await awaitExit(child);
 }
 return { stdout, stderr, exit: child.exitCode, signal: child.signal, killed };
}

async function main() {
 const cwd = mkdtempSync(join(tmpdir(), "dh-cli-"));
 const store = join(cwd, "h.sqlite");
 const marker = join(cwd, "marker.txt");
 const fauxReply = "the answer this CLI run commits";

 // 1) print mode: the answer's TEXT only, from a reopened-capable invocation.
 const printRun = await runScript(CLI, ["--store", store, "--cwd", cwd, "--faux", fauxReply, "-p", "say the line"]);
 const printOut = printRun.stdout.trim();
 record(printRun.exit === 0 && !printRun.killed,
  "print mode exits 0", `stdout=${JSON.stringify(printOut)}`);
 record(printOut === fauxReply,
  "print mode answers with only the final answer text",
  `stdout is exactly the scripted reply (${printOut.slice(0, 60)})`);
 record(!printOut.includes("{"), "print mode leaks no entry records", `no brace in ${JSON.stringify(printOut)}`);

 // 2) json mode on the SAME store: the reopened run sees the print run's line AND its own turn as NDJSON.
 const jsonRun = await runScript(CLI, ["--store", store, "--cwd", cwd, "--faux", fauxReply, "--mode", "json", "-c", "and again"]);
 const jsonLines = jsonRun.stdout.split("\n").filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } });
 const parsed = jsonLines.filter(Boolean);
 record(jsonRun.exit === 0 && parsed.length === jsonLines.length,
  "json mode emits one parseable record per line", `${parsed.length} of ${jsonLines.length} lines parsed (exit ${jsonRun.exit})`);
 record(parsed[0]?.type === "session" && parsed.every((e) => e.type !== undefined),
  "json mode emits pi's JSON records: a session header then event records (docs/json.md)",
  `types=${[...new Set(parsed.map((e) => e.type))].join(",")}`);
 const assistantEnds = parsed.filter((e) => e.type === "message_end" && e.message?.role === "assistant");
 record(assistantEnds.length >= 1 && assistantEnds.every((e) => Array.isArray(e.message?.content) && e.message.content.length > 0),
  "json mode carries the assistant message the provider answered with (pi's message_end record)",
  `assistant content blocks=${assistantEnds.map((e) => e.message.content.length).join(",")}`);
 const userEnds = parsed.filter((e) => e.type === "message_end" && e.message?.role === "user");
 record(userEnds.length >= 2,
  "json mode on a reopened store shows BOTH the first run's input and this run's",
  `pi user message_end records=${userEnds.length}`);

 // 3) RPC mode: a JSONL command sequence in, one answer per command out, over the shared rpc handler.
 const rpcRun = await runScript(CLI, ["--store", store, "--cwd", cwd, "--faux", fauxReply, "--mode", "rpc"], {
  stdin: JSON.stringify({ command: "status" }) + "\n"
   + JSON.stringify({ command: "prompt", text: "rpc says hello", requestId: "cli-rpc-dedupe" }) + "\n"
   + JSON.stringify({ command: "prompt", text: "rpc says hello", requestId: "cli-rpc-dedupe" }) + "\n"
   + JSON.stringify({ command: "read", limit: 30 }) + "\n"
   + JSON.stringify({ command: "notacommand" }) + "\n",
 });
 const rpcRecords = rpcRun.stdout.split("\n").filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } });
 const ready = rpcRecords[0];
 const rest = rpcRecords.slice(1);
 // pi's protocol: a command answers {type:"response", command, success, data}; the run's events
 // (docs/json.md) stream beside those responses.
 const responses = rest.filter((r) => r.type === "response");
 const events = rest.filter((r) => r.type !== "response");
 record(rpcRun.exit === 0 && ready?.type === "ready" && ready.conversationId !== undefined && Array.isArray(ready.commands) && ready.commands.length > 0,
  "rpc mode announces itself once, with the command set", `ready commands=${(ready?.commands ?? []).join(",")}`);
 record(responses.length === 5,
  "rpc answers every command line, including a bad one", `5 commands sent (status, two prompts, read, one non-command) -> responses=${responses.length}, events=${events.length}, exit=${rpcRun.exit}`);
 record(responses.every((r) => r.type === "response" && typeof r.success === "boolean" && r.command && (r.success ? r.data !== undefined : typeof r.error === "string")),
  "every answer is a pi response record (type, command, success, data or error)",
  `responses=${responses.length} commands=${responses.map((r) => r.command).join(",")}`);
 const statusAnswer = responses[0];
 record(statusAnswer.command === "status" && statusAnswer.success && statusAnswer.data?.newestEntry !== undefined,
  "status answers with the store's state",
  `newestEntry=${statusAnswer.data?.newestEntry} conversation=${statusAnswer.data?.conversation}`);
 const prompts = responses.filter((a) => a.command === "prompt");
 record(prompts.length === 2 && prompts.every((p) => p.success && p.data?.requestId && p.data?.submissionId !== undefined),
  "rpc queues both prompt commands onto the ONE mutation line",
  `submissionIds=${prompts.map((p) => p.data?.submissionId).join(",")} requestIds=${prompts.map((p) => p.data?.requestId).join(",")}`);
 record(new Set(prompts.map((p) => p.data?.submissionId)).size === 1,
  "the repeated requestId names ONE queued input (requestId is pi-durable's exactly-once admission key)",
  `submissionIds=${[...new Set(prompts.map((p) => p.data?.submissionId))].join(",")} requestIds=${[...new Set(prompts.map((p) => p.data?.requestId))].join(",")}`);
 const readAnswer = responses.find((a) => a.command === "read");
 record(readAnswer?.success && Array.isArray(readAnswer?.data?.items),
  "rpc read answers with committed entries, not a reconstruction", `items=${(readAnswer?.data?.items ?? []).length}`);
 const bad = responses.find((a) => a.command === "notacommand");
 record(bad?.success === false && String(bad?.error ?? "").includes("notacommand"),
  "an unknown command is a refusal, not a silent stall", JSON.stringify(bad?.error ?? bad));
 const readIds = (readAnswer?.data?.items ?? []).map((item) => item.id);
 record(readIds.length > 0 && readIds.every((id) => typeof id === "number"),
  "rpc read rows carry pi-durable EntryIds", `ids=${readIds.join(",")}`);
 const userEntries = (readAnswer?.data?.items ?? []).filter((item) => item.kind === "pi.user");
 record(userEntries.length >= 3,
  "the store's line carries print, json and rpc inputs side by side",
  `pi.user ids=${userEntries.map((e) => e.id).join(",")}`);
 record(events.length > 0 && events.some((e) => e.type === "agent_start") && events.some((e) => e.type === "message_end" && e.message?.role === "assistant") && events.some((e) => e.type === "agent_settled"),
  "rpc streams pi's session-event records for the run (docs/json.md), from committed entries only",
  `events=${events.length} types=${[...new Set(events.map((e) => e.type))].join(",")}`);
 record(!events.some((e) => ["text_delta", "thinking_delta", "toolcall_delta"].includes(e.type)),
  "no invented streaming-delta records are claimed",
  `delta records=${events.filter((e) => ["text_delta", "thinking_delta", "toolcall_delta"].includes(e.type)).length}`);
 record(!rpcRun.stderr.includes("Session is closed"),
  "rpc settled the queued prompts before closing", `stderr=${JSON.stringify(rpcRun.stderr.trim().slice(0, 80))}`);

 // 4) The reopen verbs answer through the shared intent shape, measured rather than remembered: a third
 // print invocation with `-c` must see the store's earlier lines. Importing cli-intent here is the same
 // module cli.mjs calls, so "shared path" is checked against the thing that decides the open.
 const { harnessInvocation, priorLines } = await import("../src/cli-intent.mjs");
 const prior = await priorLines(store);
 record(prior.length >= 1,
  "the store's committed line is measurable BEFORE the open (pi-durable's opener wrote the file)",
  `conversationIds=${prior.join(",")}`);
 const reopened = await harnessInvocation({ store, cwd, continue: true, messages: [], faux: fauxReply });
 record(reopened.reopened === true && reopened.intent.verb === "continue",
  "the continue verb resolves to a reopen of the SAME conversation, not a new line",
  `conversation=${reopened.conversation.id} priorLines=${reopened.priorLines.join(",")}`);
 const { commandNames } = await import("../src/rpc.mjs");
 record(reopened.commands.join(",") === commandNames().join(",") && commandNames().includes("get_state") && commandNames().includes("bash"),
  "the shared path carries the rpc command set to every surface",
  `commands=${reopened.commands.join(",")}`);
 await reopened.harness.close(reopened.context);

 // 5) The replay rule, measured from outside: an unsafe tool killed mid-call does NOT run again on reopen,
 // a safe one does. The fixture declares both policies on the same tool body.
 const killRun = await runScript(OPEN, ["--store", store, "--cwd", cwd, "--marker", marker, "--probe", "unsafe",
  "--faux", "call the probe", "call the probe"], { killAfterMs: 1800 });
 record(killRun.killed && killRun.exit !== 0,
  "the unsafe run was killed inside its tool call", `exit=${killRun.exit} signal=${killRun.stderr.includes("SIGKILL") ? "SIGKILL" : "?"}`);
 const markerAfterKill = () => {
  try { return readFileSync(marker, "utf8").split("\n").filter((l) => l.trim()).length; } catch { return 0; }
 };
 const linesAfterKill = markerAfterKill();
 record(linesAfterKill === 1,
  "the dead process' side effect is on disk exactly once before the reopen",
  `marker lines=${linesAfterKill}`);
 const reopenUnsafe = await runScript(OPEN, ["--store", store, "--cwd", cwd, "--marker", marker, "--probe", "unsafe"]);
 const reopenReport = (() => { try { return JSON.parse(reopenUnsafe.stdout); } catch { return null; } })();
 record(reopenReport !== null && reopenReport.invocation === "unsafe",
  "the reopen reports its own shape", `invocation=${reopenReport?.invocation}`);
 record(reopenReport?.reopened === true,
  "the reopen measured that the store already had a committed line", `priorLines=${(reopenReport?.priorLines ?? []).join(",")}`);
 record(markerAfterKill() === linesAfterKill,
  "an interrupted UNSAFE tool did not run again on reopen (its side effect stayed at one line)",
  `marker lines=${markerAfterKill()}`);
 const interrupted = (reopenReport?.toolResults ?? []).filter((t) => t.codes.length > 0);
 record(interrupted.length >= 1,
  "the interrupted call settled as a tool result WITH diagnostics (the model can see it)",
  `toolResults=${JSON.stringify(reopenReport?.toolResults)}`);
 record(JSON.stringify(reopenReport?.toolResults ?? []).match(/interrupt|abandon/i) !== null,
  "the settlement names pi-durable's own word for the cut-off call",
  `codes=${JSON.stringify((reopenReport?.toolResults ?? []).map((t) => t.codes))}`);
 const safeKill = await runScript(OPEN, ["--store", store, "--cwd", cwd, "--marker", marker, "--probe", "safe",
  "--faux", "call the probe", "call it safely"], { killAfterMs: 1800 });
 record(safeKill.killed, "the safe-policy run was killed inside its call too", `exit=${safeKill.exit}`);
 const linesBeforeSafeReopen = markerAfterKill();
 const reopenSafe = await runScript(OPEN, ["--store", store, "--cwd", cwd, "--marker", marker, "--probe", "safe"]);
 const safeReport = (() => { try { return JSON.parse(reopenSafe.stdout); } catch { return null; } })();
 record(markerAfterKill() > linesBeforeSafeReopen,
  "a replay-SAFE tool DID rerun on reopen (marker gained a line): the FIELD decides, not our code",
  `lines=${linesBeforeSafeReopen} -> ${markerAfterKill()}`);
 record(safeReport?.invocation === "safe",
  "the safe reopen went through the same shared path", `invocation=${safeReport?.invocation}`);

 // 6) The refusals pi's surface has that this harness cannot match are named, not silently accepted.
 const badFlag = await runScript(CLI, ["--session-dir", cwd, "-p", "x"]);
 record(badFlag.exit !== 0 && (badFlag.stderr + badFlag.stdout).includes("unknown flag"),
  "pi's --session-dir is refused loudly rather than guessed",
  `${JSON.stringify((badFlag.stderr + badFlag.stdout).trim().slice(0, 90))}`);

 // 7) The interactive TUI is reachable from the CLI itself, not only from a two-process fixture:
 //    --tui paints the writer view over the conversation THIS process owns, and a typed line becomes
 //    one durable submission on this process\'s own mutation line (src/tui/writer.mjs).
 const tuiRun = await runScript(CLI, ["--store", store, "--cwd", cwd, "--faux", fauxReply, "--tui"], { stdin: "hello tui\nq\n" });
 record(tuiRun.exit === 0 && tuiRun.stderr.includes("submitted: requestId=") && tuiRun.stderr.includes("submissionId="),
  "--tui submits a typed line to the session this process owns (acknowledgements go to stderr)",
  `stderr=${JSON.stringify(tuiRun.stderr.trim().slice(0, 140))}`);
 const tuiProof = await runScript(CLI, ["--store", store, "--cwd", cwd, "-c", "--mode", "json"]);
 const tuiRecords = tuiProof.stdout.split("\n").filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
 const tuiUser = tuiRecords.filter((r) => r.type === "message_end" && r.message?.role === "user" && JSON.stringify(r.message).includes("hello tui"));
 record(tuiUser.length === 1,
  "the typed TUI line is committed on the SAME store line the other modes use",
  `user records naming it=${tuiUser.length} of ${tuiRecords.filter((r) => r.type === "message_end" && r.message?.role === "user").length} user records`);
 record(tuiRecords.some((r) => r.type === "session") && tuiRecords.some((r) => r.type === "message_end" && r.message?.role === "assistant"),
  "the reopen prints pi\'s session header and the assistant answers the TUI turn committed",
  `records=${tuiRecords.length} types=${[...new Set(tuiRecords.map((r) => r.type))].join(",")}`);

 for (const n of notes) console.log(n);
 const failed = checks.filter((c) => !c.condition);
 console.log(`cli: ${checks.length - failed.length}/${checks.length} checks passed`);
 process.exitCode = failed.length ? 1 : 0;
}

main().catch((err) => {
 console.error(String(err?.message ?? err));
 process.exitCode = 1;
});
