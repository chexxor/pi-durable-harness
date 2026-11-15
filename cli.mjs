// cli.mjs - print, JSON, and RPC modes over the one harness core.
//
// PROVENANCE: the entry seam (one entry point, mode chosen by flags, JSON out) is Durian-Pi's
// src/cli-seam.mjs and Durian-Pi's flag parser src/tui/durable/cliargs.mjs (the rule that an UNKNOWN FLAG
// IS REJECTED, NOT IGNORED), both read 2026-11-14 at pin v1.5.1. Flag names follow the CLI docs INSIDE the
// pinned package - node_modules/@earendil-works/pi-coding-agent/docs/cli.md at v1.5.1, the same file
// scripts/audit-pi-docs.mjs reads - so the verbs a user already knows keep working; the `pi` binary on this
// machine is one tag ahead (1.5.2) and is NOT what this harness follows. pi's verbs that this harness does
// not take are named in docs/package-support.md rather than silently dropped.
// Two pi verbs cannot be matched and are named in docs/package-support.md: pi keeps one session FILE
// per session (here one SQLite store per directory, so --session-dir becomes --store) and pi's `--fork`
// is Conversation.fork(), not a file copy. Seats, broker, cross-seat queue, genlock, per-item worktrees,
// metrics, check, constitution, selfdev: dropped outright - this harness is single-agent.
import { readFileSync } from "node:fs";
// pi-ai's OWN thinking vocabulary - `--thinking` is checked against it rather than a list typed here.
import { MODEL_THINKING_LEVELS } from "@earendil-works/pi-ai/providers/model-schema";
import { join } from "node:path";
import { claimWriter, releaseWriter, readOwner } from "./src/ownership.mjs";
import { serveOwner, request } from "./src/attach.mjs";
import { handle, commandNames } from "./src/rpc.mjs";
import { scriptTurn, transcript } from "./src/core.mjs";
import { harnessInvocation, intent, agentEvent, finalAnswerText, rpcLine, settleInvocation } from "./src/cli-intent.mjs";
import { readFeed } from "./src/eventfeed.mjs";

const HELP = `pi-durable-harness [options] [--] [prompt words...]
  --cwd <dir>             work in <dir> (default: the directory this ran in)
  --store <path>          durable store (default <cwd>/harness.sqlite)
  --mode <text|json|rpc>  output mode (default text)
  -p, --print             run the prompt and exit
  -c, --continue          continue this directory's root conversation
  -r, --resume            same as --continue (one store per directory = one root line)
  --conversation <id>     open a specific conversation id
  --no-session            run in memory; no store file is written
  --model <ref>           provider/model, e.g. deepinfra/llama-3.1-8b or faux/faux-1
  --provider <name>       provider for a bare --model
  --system-prompt <text>  base system prompt
  --append-system-prompt <text>   extra system section
  --tools <list>          comma list of tool names
  --exclude-tools <list>  comma list of tool names to drop
  --no-tools              no tools
  --thinking <level>      thinking level for the conversation (pi-durable's Agent.thinkingLevel)
  --faux <text>           offline scripted reply (demo/CI; no keys, no network)
  --attach                force attach to a running owner as a reader
  --hold <ms>             stay open after a print turn (so others can attach)
  --version               the pinned release this harness resolves, and exit
  --help                  this text`;

export function parseArgs(argv) {
  const a = { appendSystem: [], messages: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--version") a.version = true;
    else if (t === "--help" || t === "-h") a.help = true;
    else if (t === "-p" || t === "--print") a.print = true;
    else if (t === "-c" || t === "--continue" || t === "-r" || t === "--resume") a.continue = true;
    else if (t === "--no-session") a.noSession = true;
    else if (t === "--hold") { a.hold = Number(argv[i + 1]); i++; }
    else if (t === "--faux") { a.faux = argv[i + 1]; i++; }
    else if (t === "--no-tools") a.noTools = true;
    else if (t === "--attach") a.attach = true;
    else if (t.startsWith("--")) {
      const name = t.slice(2);
      const value = argv[i + 1];
      // An unknown flag fails loudly instead of guessing: a silently dropped flag is how a user ends
      // up writing into the wrong store.
      if (name === "store") { a.store = value; i++; }
      else if (name === "cwd") { a.cwd = value; i++; }
      else if (name === "session") { a.conversation = value; i++; }
      else if (name === "mode") { a.mode = value; i++; }
      else if (name === "conversation") { a.conversation = value; i++; }
      else if (name === "model") { a.model = value; i++; }
      else if (name === "provider") { a.provider = value; i++; }
      else if (name === "system-prompt") { a.systemPrompt = value; i++; }
      else if (name === "append-system-prompt") { a.appendSystem.push(value); i++; }
      else if (name === "thinking") {
        if (!MODEL_THINKING_LEVELS.includes(value)) throw new Error(`--thinking needs one of ${MODEL_THINKING_LEVELS.join(", ")}; got ${value}`);
        a.thinking = value;
        i++;
      }
      else if (name === "tools") { a.tools = value.split(","); i++; }
      else if (name === "exclude-tools") { a.excludeTools = value.split(","); i++; }
      else if (name === "faux") { a.faux = value; i++; }
      else if (name === "hold") { a.hold = Number(value); i++; }
      else throw new Error(`unknown flag ${t}; run with --help`);
    }
    else a.messages.push(t);
  }
  if (a.mode && !["text", "json", "rpc"].includes(a.mode)) throw new Error(`--mode must be text, json, or rpc; got ${a.mode}`);
  if (a.mode === "rpc" && !a.messages.length) a.mode = "rpc";
  return a;
}

/** What release is this harness running on? The pin file and package.json, both on disk: pi's `--version`
 * verb, answered from the pinned plane rather than from the network. */
function releaseLine() {
 const pin = JSON.parse(readFileSync(join(process.cwd(), "pi-main.pin.json"), "utf8"));
 const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
 const deps = Object.entries(pkg.dependencies ?? {}).filter(([name]) => name.startsWith("@earendil-works/"));
 return `pin ${pin.ref} (${String(pin.sha).slice(0, 12)}) - ${deps.length} @earendil-works packages declared, ${deps.map(([, spec]) => spec.split("@").pop()).join("/")}`;
}

function answerText(entries) {
  // The newest assistant row is the answer; the harness owns the turns, so this only reads them.
  // @temp: thinking blocks are skipped because they are not the prose a user asked for.
  const last = entries.filter((e) => e.kind === "pi.assistant").pop();
  const content = last?.model?.[0]?.content;
  const list = Array.isArray(content) ? content : typeof content === "string" ? [{ type: "text", text: content }] : [];
  return list.filter((c) => c?.type === "text").map((c) => c.text).join("\n").trim();
}

async function attachAsReader(owner) {
  // Attaching never opens the store: every verb is a request to the owner, so the owner's single
  // mutation line stays the only mutation line in this directory.
  const status = await request(owner.lock.socket, "status", {}, 8000);
  if (!status.ok) throw new Error(`the owner at ${owner.lock.socket} did not answer: ${status.error}`);
  return status;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(HELP); return; }
  if (args.version) { console.log(releaseLine()); return; }
  const cwd = args.cwd ?? process.cwd();
  const store = args.store ?? join(cwd, "harness.sqlite");

  const owned = readOwner(store);
  if (owned.owned && !args.noSession) {
    const status = await attachAsReader(owned);
    const page = await request(owned.lock.socket, "read", { limit: 30 });
    const text = args.messages.join(" ").trim();
    if (args.mode === "json") {
      console.log(JSON.stringify({ type: "attached", ownerPid: status.pid, conversationId: status.conversationId, commands: commandNames() }));
      for (const item of page.items) console.log(JSON.stringify({ type: "entry", kind: item.kind, id: item.id, model: item.model }));
    } else {
      console.log(`attached as reader to pid ${status.pid} (root conversation ${status.conversationId})`);
      for (const item of page.items) {
        const body = item.model?.[0]?.content;
        console.log(`${item.kind}: ${typeof body === "string" ? body : JSON.stringify(body).slice(0, 200)}`);
      }
    }
    if (text) {
      const reply = await request(owned.lock.socket, "prompt", { text });
      console.log(`queued onto the owner: submission ${reply.submissionId} (requestId ${reply.requestId})`);
    }
    return;
  }
  if (args.attach) throw new Error(`--attach needs a live owner; ${owned.reason ?? "the store is not claimed"}`);

  // Claim before opening: the process that opens the store is the process that owns the mutation line.
  const claim = args.noSession ? null : claimWriter(store);

  // The ONE shared path: flags -> intent -> one harnessInvocation -> the surface below only prints.
  // pi-durable's recovery is inside that path (resume() when the store already has a committed line),
  // which is why print, json, rpc, `-c`/`-r`, and `--session <id>` cannot open differently.
  const flags = {
    ...args,
    cwd,
    // --no-tools chooses an EMPTY offered set; pi-durable then settles any call as `tool_unavailable`,
    // which is pi's --no-tools behaviour with pi-durable's refusal instead of a hidden tool.
    ...(args.noTools ? { tools: [] } : {}),
    // pi's --append-system-prompt extends the base instructions rather than replacing them.
    ...(args?.systemPrompt && args?.appendSystem?.length ? { systemPrompt: [...(args.systemPrompt ? [args.systemPrompt] : []), ...args.appendSystem].join("\n\n") } : {}),
  };
  const parts = await harnessInvocation(flags, { extraExtensions: [] });
  const server = claim ? serveOwner(parts, claim.lock.socket) : null;
  const mode = parts.intent.mode;
  try {
    if (mode === "rpc") {
      console.log(JSON.stringify({ ok: true, command: "ready", conversationId: parts.conversation.id, commands: commandNames() }));
      for (const line of readStdinLines()) {
        const answer = await rpcLine(parts, line);
        console.log(JSON.stringify(answer));
      }
    } else {
      const text = parts.intent.prompt;
      if (!text && !args.continue && !args.resume && !args.conversation) throw new Error("print mode needs a prompt; run with --help");
      if (text) {
        // The offline plane is armed here because the print/json surfaces queue their own input; RPC
        // arming lives in src/cli-intent.mjs' rpcLine, which owns that path's prompts.
        if (parts.intent.faux) scriptTurn(parts.faux, [parts.intent.faux]);
        // The queued input is recorded on the shared path's settlement list, so `settleInvocation` waits
        // for an answer rather than leaving the input parked in pi.inbox for the next process to replay.
        const queued = await parts.conversation.submit({ type: "input", content: text, requestId: `cli-${process.pid}` }, parts.context);
        parts.settlements.push(queued.id);
      }
      await settleInvocation(parts);
      const entries = await transcript(parts.conversation, parts.context, 200);
      if (mode === "json") {
        // NDJSON of pi-durable's committed entries, oldest first: the record IS the entry (kind, EntryId,
        // the message the provider saw), so a viewer counts events instead of reconstructing turns.
        for (const entry of entries.slice().reverse()) console.log(JSON.stringify(agentEvent(entry)));
      } else {
        const answer = finalAnswerText(entries);
        if (!answer) throw new Error("the run committed no assistant text");
        console.log(answer);
        if (args.hold) await new Promise((r) => setTimeout(r, args.hold));
      }
    }
  } finally {
    server?.close();
    if (claim) releaseWriter(store);
  }
  await parts.harness.close(parts.context);
}

function readStdinLines() {
  // RPC is a pipe protocol: one JSON command per line in, one reply per line out. From a terminal
  // there is nothing to read, so say what the shape is instead of hanging on a TTY.
  if (process.stdin.isTTY) {
    console.log('rpc mode reads JSONL on stdin, for example: {"command":"prompt","text":"hello"}');
    return [];
  }
  // @temp: readFileSync(0) drains a piped stdin in one go, which keeps replies in command order.
  return readFileSync(0, "utf8").split("\n").filter((line) => line.trim());
}

main().catch((err) => {
  console.error(String(err?.message ?? err));
  process.exitCode = 1;
});
