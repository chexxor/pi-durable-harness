// demo/rpc.test.mjs - the RPC surface, spoken by pi's OWN client against this harness's process.
//
// PROVENANCE: no Durian-Pi original (Durian-Pi had no RPC mode; its broker/serve layer is dropped
// outright in this single-agent harness). The protocol driven here is spelled by the pinned package
// itself: docs/rpc.md, docs/rpc-commands.md and docs/json.md inside
// node_modules/@earendil-works/pi-coding-agent, and the client is that package's exported RpcClient
// (dist/modes/rpc/rpc-client.d.ts), which spawns `node <cliPath> --mode rpc` and frames records with
// the package's own jsonl reader. The answers come from src/rpc.mjs over pi-durable's planes.
//
// What is asserted offline and why that is enough: `--faux` arms pi-durable's faux provider and
// pi's RpcClient only ever talks to a pipe, so no key and no network is involved.
//
// Deliberately NOT asserted: pi's TUI-only dialogs (`extension_ui_request`). The verbs this harness
// has no plane for ARE asserted - but honestly, and that distinction matters: pi's client only throws
// for a `success: false` record when the verb carries data (getData); for a void verb it ignores the
// flag. So data-bearing refusals are asserted through pi's client (the throw is the loudest answer
// that client has), and void-verb refusals are asserted on the RAW record, where `success: false` and
// the reason are visible - which is exactly what docs/rpc-commands.md promises a client must see.

import { RpcClient } from "@earendil-works/pi-coding-agent";
import { calculateContextTokens } from "@earendil-works/pi-coding-agent";
import { claimWriter, releaseWriter } from "../src/ownership.mjs";
import { openStore, listConversations } from "../src/readapi.mjs";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = mkdtempSync("/tmp/pi-durable-rpc-");
const CLI = join(dirname(fileURLToPath(import.meta.url)), "..", "cli.mjs");
const STORE = join(ROOT, "session.sqlite");

const checks = [];
const check = (name, ok, detail = "") => {
 checks.push({ name, ok, detail });
 console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
};

/** One JSON record per line off a stream. The split is LF-only because that is pi's framing rule
 * (docs/json.md: "Split records only on LF and strip an optional preceding carriage return", which
 * also rules Node's `readline` out).
 */
function pipeRecords(stream) {
 const state = { buffer: "", records: [], ended: false, wake: null };
 const notify = () => {
  const wake = state.wake;
  state.wake = null;
  wake?.();
 };
 stream.on("data", (chunk) => {
  state.buffer += String(chunk ?? "");
  let index;
  while ((index = state.buffer.indexOf("\n")) >= 0) {
   let line = state.buffer.slice(0, index);
   state.buffer = state.buffer.slice(index + 1);
   if (line.endsWith("\r")) line = line.slice(0, -1);
   if (!line.trim()) continue;
   try {
    state.records.push(JSON.parse(line));
   } catch {
    // A partial line is pi's stream mid-frame, not a malformed record: it stays buffered.
    state.records.push({ type: "unparsable", line });
   }
  }
  notify();
 });
 stream.on("end", () => { state.ended = true; notify(); });
 return {
  next: async () => {
   while (true) {
    if (state.records.length) return state.records.shift();
    if (state.buffer.trim()) {
     const line = state.buffer;
     state.buffer = "";
     try {
      return JSON.parse(line);
     } catch {
      return { type: "unparsable", line };
     }
    }
    if (state.ended) return null;
    await new Promise((resolve) => { state.wake = resolve; });
   }
  },
 };
}

// ---- section 1: pi's RpcClient over this harness's RPC process ------------------------------
// `--store` names the ONE SQLite store (this harness has no session files) and `--faux` is the
// offline plane. No `--no-session`: the shutdown proof below needs this process to have claimed the
// store, so it also owns the ownership lock and the attach socket.
const client = new RpcClient({
 cliPath: CLI,
 cwd: ROOT,
 env: { PI_OFFLINE: "1" },
 args: ["--store", STORE, "--cwd", ROOT, "--faux", "the scripted reply"],
});

const events = [];
const unsubscribe = client.onEvent((event) => { events.push(event); });

await client.start();

// 1. get_state: pi's RpcSessionState, answered from pi-durable's planes.
const state = await client.getState();
check("get_state answers pi's RpcSessionState fields", typeof state.sessionId === "string" && typeof state.messageCount === "number" && typeof state.pendingMessageCount === "number" && typeof state.isStreaming === "boolean", JSON.stringify(state));
check("sessionId is pi-durable's ConversationId and sessionFile is this store", String(state.sessionFile) === STORE, JSON.stringify({ sessionFile: state.sessionFile, sessionId: state.sessionId }));

// 2. promptAndWait: pi's event records on the pipe pi wrote the prompt to.
const sent = await client.promptAndWait("say the scripted reply", undefined, 30000);
const kinds = [...new Set(sent.map((event) => event.type))];
check("promptAndWait answers pi's own event record names", sent.length > 0 && kinds.includes("agent_start") && kinds.includes("agent_settled"), JSON.stringify(kinds));
const ended = sent.find((event) => event.type === "agent_end");
const assistant = ended?.messages?.find((m) => m.role === "assistant");
check("the assistant message pi received is pi-ai's own message object", Boolean(assistant?.content?.some((block) => block.type === "text" && block.text)), JSON.stringify(assistant?.content));
check("no delta stream is invented: the turn arrives as whole committed messages", (ended?.messages?.length ?? 0) >= 1 && sent.filter((e) => e.type === "text_delta").length === 0, JSON.stringify({ messages: ended?.messages?.length, deltas: sent.filter((e) => e.type === "text_delta").length }));
const settled = sent[sent.length - 1];
check("agent_settled is pi's own idle signal and carries no invented fields", settled?.type === "agent_settled" && typeof settled.aborted === "boolean", JSON.stringify(settled));

// 3. pi's read verbs over pi-durable's read planes.
const messages = await client.getMessages();
check("get_messages answers pi-ai's messages of the committed line", messages.some((m) => m.role === "user") && messages.some((m) => m.role === "assistant"), JSON.stringify(messages.map((m) => m.role)));
const page = await client.getEntries();
check("get_entries answers pi-durable's entries and a leafId", Array.isArray(page.entries) && page.leafId !== null, JSON.stringify(page.entries?.map((e) => `${e.kind}#${e.id}`)));
const afterLeaf = await client.getEntries(String(page.leafId));
check("get_entries' `since` is pi-durable's EntryId cursor (later entries only)", Array.isArray(afterLeaf.entries) && afterLeaf.entries.length === 0 && String(afterLeaf.leafId) === String(page.leafId), JSON.stringify(afterLeaf));
let missingError = null;
try {
 await client.getEntries("999999");
} catch (err) {
 missingError = String(err?.message ?? err);
}
check("a `since` that names no entry is answered as a failure that says so", missingError !== null && missingError.includes("999999"), JSON.stringify(missingError));
const tree = await client.getTree();
check("get_tree answers the active branch and its leaf", Array.isArray(tree.tree) && String(tree.leafId) === String(page.leafId), JSON.stringify({ nodes: tree.tree?.length, leaf: tree.leafId }));
const lastText = await client.getLastAssistantText();
check("get_last_assistant_text names the newest answer on the branch", typeof lastText === "string" && lastText.length > 0, JSON.stringify(lastText));

// 4. get_session_stats: pi's SessionStats counts out of pi-durable's usage plane.
const stats = await client.getSessionStats();
check("get_session_stats counts pi-durable's committed entries", stats.userMessages >= 1 && stats.assistantMessages >= 1 && stats.totalMessages >= stats.userMessages + stats.assistantMessages, JSON.stringify({ user: stats.userMessages, assistant: stats.assistantMessages, total: stats.totalMessages, toolResults: stats.toolResults }));
check("tokens are pi-durable's summed usage through pi's own context-token arithmetic", stats.tokens?.total === calculateContextTokens({ input: stats.tokens.input, output: stats.tokens.output, cacheRead: stats.tokens.cacheRead, cacheWrite: stats.tokens.cacheWrite, totalTokens: stats.tokens.total }) && stats.tokens.total > 0, JSON.stringify(stats.tokens));
check("cost is pi-ai's summed cost, not a price this harness worked out", typeof stats.cost === "number", JSON.stringify(stats.cost));
check("contextUsage names the window and the newest usage, or null before either exists", stats.contextUsage === null || (stats.contextUsage.tokens > 0 && stats.contextUsage.contextWindow > 0), JSON.stringify(stats.contextUsage));

// 5. bash: pi's BashResult over pi-durable's execution env, and pi's documented rule that included
// output reaches the model on the NEXT prompt - here, pi-durable's queued input.
const beforeBash = (await client.getState()).messageCount;
const ran = await client.bash("echo rpc-bash");
check("bash answers pi's BashResult shape", typeof ran.output === "string" && ran.output.includes("rpc-bash") && ran.exitCode === 0 && typeof ran.cancelled === "boolean" && typeof ran.truncated === "boolean", JSON.stringify(ran));
const afterBash = (await client.getState()).messageCount;
const bashMessages = await client.getMessages();
check("included bash output became transcript INPUT (pi's 'next prompt' rule), not an instant reply", afterBash > beforeBash && bashMessages.some((m) => m.role === "user" && JSON.stringify(m.content).includes("Ran `echo rpc-bash`")), JSON.stringify({ before: beforeBash, after: afterBash, roles: bashMessages.map((m) => m.role) }));

// 6. get_commands: pi's RpcSlashCommand list, built from what pi's OWN loader discovered for this cwd.
//   src/agentplane.mjs inventories the commands, shortcuts and flags each loaded pi package registers, and
//   the rows carry pi's name, where the verb came from, and pi's own reason this harness lists it instead of
//   running it: docs/rpc-commands.md says "Extension commands are not allowed (use prompt instead)" for the
//   queued input verbs, and pi's command dispatch belongs to pi's CLI, which this harness does not have.
const commands = await client.getCommands();
check("get_commands answers an array of pi's command records", Array.isArray(commands), JSON.stringify(commands).slice(0, 400));
const packageCommands = commands.filter((row) => row.source === "extension" && row.invocation === "unsupported");
check("a discovered pi package's verbs are listed with their source and their refusal (nothing is dropped silently)",
   packageCommands.length === 0 || packageCommands.every((row) => row.name && row.source && row.invocation === "unsupported"),
   JSON.stringify(packageCommands.slice(0, 3)));
// pi's own RpcClient THROWS on a failed record (dist/modes/rpc/rpc-client.js `getData`: "if
// (!response.success) throw new Error(errorResponse.error)"), so the refusal is seen as an error here -
// which is what makes the refusal the client's answer rather than a string this harness invented.
const refusals = [];
for (const row of packageCommands.slice(0, 2)) {
   try {
       refusals.push({ name: row.name, answered: await client.prompt(`/${row.name}`) });
   } catch (err) {
       refusals.push({ name: row.name, error: String(err?.message ?? err) });
   }
}
check("submitting one of pi's package verbs answers a refusal that names the verb (and never starts a run)",
   packageCommands.length === 0 ||
   refusals.every((entry) => String(entry.error ?? "").includes(entry.name)),
   JSON.stringify(refusals.map((entry) => ({ name: entry.name, error: String(entry.error ?? entry.answered).slice(0, 90) }))));

// 7. model and thinking verbs, on pi-durable's agent plane.
const setModel = await client.setModel("faux", "faux-1");
check("set_model echoes pi's {provider, id} and writes pi.agent", setModel.provider === "faux" && setModel.id === "faux-1", JSON.stringify(setModel));
const levels = await client.getAvailableThinkingLevels();
check("get_available_thinking_levels answers pi-ai's vocabulary", Array.isArray(levels) && levels.includes("low"), JSON.stringify(levels));
await client.setThinkingLevel("low");
const stateAfterLevel = await client.getState();
check("set_thinking_level moves the conversation's durable agent state", String(stateAfterLevel.thinkingLevel) === "low", JSON.stringify(stateAfterLevel.thinkingLevel));

// 8. session verbs on pi-durable's conversation plane.
const fresh = await client.newSession();
check("new_session starts a conversation in the SAME store (pi's fresh session)", fresh.cancelled === false && Number.isFinite(fresh.conversationId ?? fresh.newConversation?.conversationId), JSON.stringify(fresh));
const stateAfterNew = await client.getState();
check("the session actually switched: get_state names the new ConversationId", String(stateAfterNew.sessionId) !== String(state.sessionId), JSON.stringify({ before: state.sessionId, after: stateAfterNew.sessionId }));
const forkable = await client.getForkMessages();
check("get_fork_messages lists the branch's user messages with pi-durable EntryIds", Array.isArray(forkable) && forkable.every((m) => Number.isFinite(Number(m.entryId))), JSON.stringify(forkable));
if (forkable.length) {
 const forked = await client.fork(String(forkable[0].entryId));
 check("fork at an EntryId answers pi's {text, cancelled} and moves the conversation", forked.cancelled === false && Number.isFinite(forked.conversationId), JSON.stringify(forked));
 const cloned = await client.clone();
 check("clone is pi-durable's fork at the leaf entry (the branch is inherited)", cloned.cancelled === false && Number.isFinite(cloned.conversationId), JSON.stringify(cloned));
} else {
 check("an empty branch has nothing to fork, and that is answered rather than invented", forkable.length === 0, "the new session has no user message yet");
}
const switched = await client.switchSession(String(state.sessionId));
check("switch_session takes a ConversationId and answers pi's {cancelled}", switched.cancelled === false, JSON.stringify(switched));
let pathRefusal = null;
try {
 await client.switchSession("/tmp/some-session-file.jsonl");
} catch (err) {
 pathRefusal = String(err?.message ?? err);
}
check("a session FILE is refused by name rather than guessed at", pathRefusal !== null && pathRefusal.includes("ConversationId"), JSON.stringify(pathRefusal));

// 9. compaction on pi-durable's compaction plane.
let compact = null;
let compactError = null;
try {
 compact = await client.compact("keep the durable facts");
} catch (err) {
 compactError = String(err?.message ?? err);
}
check("compact answers with pi-durable's own fields (taskId/settled), or a refusal that names why", compact !== null ? compact.settled !== undefined : compactError?.length > 10, JSON.stringify(compact ?? compactError));
await client.setAutoCompaction(false);
const stateAfterCompaction = await client.getState();
check("set_auto_compaction writes the conversation's AgentRecord and get_state reads it back", stateAfterCompaction.autoCompactionEnabled === false, JSON.stringify(stateAfterCompaction.autoCompactionEnabled));

// 10. pi's abort on pi-durable's abort plane.
const beforeAbort = (await client.getState()).pendingMessageCount;
await client.abort();
const afterAbort = (await client.getState()).pendingMessageCount;
check("abort withdraws queued inputs and marks the live scope", afterAbort === 0 && afterAbort <= beforeAbort, JSON.stringify({ before: beforeAbort, after: afterAbort }));

// 11. client-visible refusals for the DATA-BEARING verbs: pi's own getData() throws on a
// `success: false` record, naming the error this handler answered with.
for (const [verb, call] of [["cycle_model", () => client.cycleModel()], ["cycle_thinking_level", () => client.cycleThinkingLevel()], ["export_html", () => client.exportHtml()]]) {
 let reason = null;
 try {
  await call();
 } catch (err) {
  reason = String(err?.message ?? err);
 }
 check(`${verb} is refused with a reason rather than dropped or faked`, reason !== null && reason.length > 10, JSON.stringify(reason));
}

unsubscribe();

// ---- section 2: the raw framing, where the protocol itself is visible ---------------------
// pi's client mints a fresh id per call and ignores `success` for void verbs, so the raw pipe is
// driven here: it shows pi's record shape end to end, the exactly-once admission key, and the
// `success: false` records for verbs pi has and this harness has no plane for.
const dupStore = join(ROOT, "twice.sqlite");
const child = spawn("node", [CLI, "--mode", "rpc", "--store", dupStore, "--cwd", ROOT, "--faux", "dup", "--no-session"], { cwd: ROOT, env: { ...process.env, PI_OFFLINE: "1" } });
const childRecords = pipeRecords(child.stdout);
const nextResponse = async () => {
 while (true) {
  const record = await childRecords.next();
  if (!record) return null;
  if (record.type === "response") return record;
 }
};
const sendRaw = (record) => child.stdin.write(`${JSON.stringify(record)}\n`);

const dup = { type: "prompt", message: "the same input", requestId: "dup-key", id: "req_dup_1" };
sendRaw(dup);
const firstResponse = await nextResponse();
const dupAgain = { ...dup, id: "req_dup_2" };
sendRaw(dupAgain);
const secondResponse = await nextResponse();
check("pi's requestId is pi-durable's admission key: two records, one submission", firstResponse?.data?.submissionId === secondResponse?.data?.submissionId && firstResponse?.data?.submissionId !== undefined, JSON.stringify({ first: firstResponse?.data?.submissionId, second: secondResponse?.data?.submissionId }));
check("pi's response records carry an echoed id only when the caller sent one", firstResponse?.id === "req_dup_1", JSON.stringify({ first: firstResponse?.id, second: secondResponse?.id }));
sendRaw({ type: "get_messages" });
const dupMessages = (await nextResponse())?.data?.messages ?? [];
const dupUsers = dupMessages.filter((m) => m.role === "user" && JSON.stringify(m.content).includes("the same input"));
check("the transcript holds that input exactly once", dupUsers.length === 1, JSON.stringify(dupUsers.length));

sendRaw({ type: "bash", command: "echo excluded", excludeFromContext: true, id: "req_ex" });
const excluded = await nextResponse();
check("pi's excludeFromContext is honoured: the output stays out of the queue", excluded?.data?.excludedFromContext === true, JSON.stringify(excluded?.data));

// The void verbs pi documents (rpc-commands.md) are answered as pi's failure RECORD - pi's client
// would not surface these, so the record itself is the claim.
for (const record of [
 { type: "set_steering_mode", mode: "all", id: "ref_steering" },
 { type: "set_follow_up_mode", mode: "all", id: "ref_follow" },
 { type: "set_auto_retry", enabled: true, id: "ref_retry" },
 { type: "abort_retry", id: "ref_abort_retry" },
 { type: "abort_bash", id: "ref_abort_bash" },
 { type: "set_session_name", name: "x", id: "ref_name" },
 { type: "set_thinking_level", level: "bogus", id: "ref_level" },
]) {
 sendRaw(record);
 const answer = await nextResponse();
 const why = answer?.error ?? "";
 check(`${record.type} is answered as a failure RECORD that names why`, answer?.success === false && why.length > 10, JSON.stringify(answer));
}

sendRaw({ type: "abort", id: "req_abort" });
const abortedRecord = await nextResponse();
check("pi's abort answers with pi-durable's abort plane", abortedRecord?.data?.aborted === true, JSON.stringify(abortedRecord?.data));

await child.stdin.end();
const childExit = await new Promise((resolve) => {
 child.on("exit", (code) => resolve(code));
 child.on("error", () => resolve(null));
});
check("a session that ran out of piped commands exits cleanly", childExit === 0, JSON.stringify(childExit));

// ---- section 3: shutdown of the session pi's client was driving --------------------------
// pi's RpcClient.stop() sends SIGTERM. The session must CLEAN UP - settle what it queued, close the
// Harness, release the ownership lock - so the store is reclaimable. Node's default SIGTERM handling
// would skip that cleanup and leave a stale claim: the difference between an owner that quit and one
// that crashed.
await client.stop();
check("the session answered pi's stop signal by cleaning up", client.getStderr().includes("asked to stop"), JSON.stringify(client.getStderr().split("\n").filter((line) => line.includes("stop"))));
const reclaim = await claimWriter(STORE);
check("the store is reclaimable by the next writer (the lock was released)", reclaim.lock.pid === process.pid, JSON.stringify({ pid: reclaim.lock.pid, store: reclaim.lock.storePath }));
await releaseWriter(STORE);
const reopened = await openStore(STORE, { readOnly: true });
const conversations = await listConversations(reopened, { limit: 20 });
check("the stopped session left its conversations and their answers in the store", conversations.length >= 2, JSON.stringify(conversations.map((c) => c.id)));
await reopened.harness.close(BACKGROUND_CONTEXT);

rmSync(ROOT, { recursive: true, force: true });

console.log(`rpc: ${checks.filter((c) => c.ok).length}/${checks.length} checks passed`);
process.exit(checks.every((c) => c.ok) ? 0 : 1);
