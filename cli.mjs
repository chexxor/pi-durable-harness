// cli.mjs - print, JSON, and RPC modes over the one harness core.
//
// PROVENANCE: the entry seam (one entry point, mode chosen by flags, JSON out) is Durian-Pi's
// src/cli-seam.mjs and src/intent.mjs, read 2026-11-14 at pin v1.5.1. Flag names follow pi 1.5.2's
// real CLI (verified with `pi --help` and docs/cli.md) so the verbs a user already knows keep working.
// Two pi verbs cannot be matched and are named in docs/package-support.md: pi keeps one session FILE
// per session (here one SQLite store per directory, so --session-dir becomes --store) and pi's `--fork`
// is Conversation.fork(), not a file copy. Seats, broker, cross-seat queue, genlock, per-item worktrees,
// metrics, check, constitution, selfdev: dropped outright - this harness is single-agent.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { claimWriter, releaseWriter, readOwner } from "./src/ownership.mjs";
import { serveOwner, request } from "./src/attach.mjs";
import { handle, commandNames } from "./src/rpc.mjs";
import { openHarness, scriptTurn, transcript } from "./src/core.mjs";

const HELP = `pi-durable-harness [options] [--] [prompt words...]
  --store <path>          durable store (default ./harness.sqlite)
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
  --faux <text>           offline scripted reply (demo/CI; no keys, no network)
  --attach                force attach to a running owner as a reader
  --hold <ms>             stay open after a print turn (so others can attach)
  --help                  this text`;

export function parseArgs(argv) {
  const a = { appendSystem: [], messages: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--help" || t === "-h") a.help = true;
    else if (t === "-p" || t === "--print") a.print = true;
    else if (t === "-c" || t === "--continue" || t === "-r" || t === "--resume") a.continue = true;
    else if (t === "--no-session") a.noSession = true;
    else if (t === "--no-tools") a.noTools = true;
    else if (t === "--attach") a.attach = true;
    else if (t.startsWith("--")) {
      const name = t.slice(2);
      const value = argv[i + 1];
      // An unknown flag fails loudly instead of guessing: a silently dropped flag is how a user ends
      // up writing into the wrong store.
      if (name === "store") { a.store = value; i++; }
      else if (name === "mode") { a.mode = value; i++; }
      else if (name === "conversation") { a.conversation = value; i++; }
      else if (name === "model") { a.model = value; i++; }
      else if (name === "provider") { a.provider = value; i++; }
      else if (name === "system-prompt") { a.systemPrompt = value; i++; }
      else if (name === "append-system-prompt") { a.appendSystem.push(value); i++; }
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
  const store = args.store ?? join(process.cwd(), "harness.sqlite");

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

  // Claim before opening: the process that opens the store is the process that owns the mutation
  // line, so a second invocation cannot double-own it.
  // --tools / --exclude-tools are enforced by a beforeTool hook, not by hiding the tool: the refusal
  // --tools / --exclude-tools choose the OFFERED toolset: pi-durable settles a call to a tool the
  // request did not offer as `tool_unavailable` (node_modules/@earendil-works/pi-durable/dist/harness/
  // tool.d.ts: "A call to a tool its request did not offer: settles `tool_unavailable`"), so the
  // refusal is a committed tool result the model can see, not a guess we make here.
  // @temp: the deny list wins over the allow list, so a typo in an allowed list can never re-open
  // @temp: a tool the caller meant to close.
  const denied = new Set(args.excludeTools ?? []);
  const allowed = args.tools ? args.tools.filter((n) => !denied.has(n)) : null;
  const claim = args.noSession ? null : claimWriter(store);
  const parts = await openHarness({
    cwd: process.cwd(),
    storePath: args.noSession ? null : store,
    tools: !args.noTools,
    ...(allowed ? { toolNames: allowed } : {}),
    ...(denied.size ? { excludeTools: [...denied] } : {}),
    agent: {
      model: args.model ? { provider: args.provider ?? "faux", modelId: args.model } : { provider: "faux", modelId: "faux-1" },
      ...(args.systemPrompt ? { instructions: args.systemPrompt } : {}),
    },
  });
  // --conversation opens a specific conversation of the same store instead of the root one: pi-durable
  // keeps conversations by id, which is what `--session <id>` means here.
  if (args.conversation) {
    const opened = await parts.harness.conversation(Number(args.conversation), parts.context);
    if (!opened) throw new Error(`no conversation ${args.conversation} in this store; the ids are what a previous run printed`);
    parts.conversation = opened;
  }

  // The owner serves its socket for the whole run, so a second invocation in this directory attaches
  // as a reader to the same session instead of opening the store a second time.
  const server = claim ? serveOwner(parts, claim.lock.socket) : null;
  const out = args.mode ?? "text";
  try {
    if (out === "json") {
      // NDJSON of committed entries as they arrive, from the durable watch - not our reconstruction.
      const watch = await parts.conversation.watch(parts.context, { min: 1, max: 200 });
      const seen = new Set();
      const print = (entry) => {
        if (!entry || seen.has(entry.id)) return;
        seen.add(entry.id);
        console.log(JSON.stringify({ type: "entry", kind: entry.kind, id: entry.id, model: entry.model }));
      };
      for (const e of (await transcript(parts.conversation, parts.context, 100)).reverse()) print(e);
      watch.start(async (call) => {
        if (call?.kind !== "value") return;
        for (const e of call.value?.entries ?? []) print(e);
      });
      const text = args.messages.join(" ").trim();
      if (text) {
        if (args.faux) scriptTurn(parts.faux, [args.faux]);
        await parts.conversation.submit({ type: "input", content: text }, parts.context);
        await parts.conversation.waitForIdle(parts.context);
      }
      await parts.harness.waitForIdle(parts.context);
      watch.stop?.();
    } else if (out === "rpc") {
      console.log(JSON.stringify({ ok: true, command: "ready", conversationId: parts.conversation.id, commands: commandNames() }));
      for (const line of readStdinLines()) {
        let msg;
        try { msg = JSON.parse(line); }
        catch (err) { console.log(JSON.stringify({ ok: false, error: `invalid command: ${String(err?.message ?? err)}` })); continue; }
        if (args.faux && msg.command === "prompt") scriptTurn(parts.faux, [args.faux]);
        try {
          const reply = await handle(parts, msg);
          console.log(JSON.stringify({ ok: true, command: msg.command, ...reply }));
        } catch (err) {
          console.log(JSON.stringify({ ok: false, command: msg.command, error: String(err?.message ?? err) }));
        }
      }
    } else {
      const text = args.messages.join(" ").trim();
      if (!text) throw new Error("print mode needs a prompt; run with --help");
      if (args.faux) scriptTurn(parts.faux, [args.faux]);
      await parts.conversation.submit({ type: "input", content: text }, parts.context);
      await parts.conversation.waitForIdle(parts.context);
      const answer = answerText(await transcript(parts.conversation, parts.context, 20));
      if (!answer) throw new Error("the run committed no assistant text");
      console.log(answer);
      if (args.hold) await new Promise((r) => setTimeout(r, args.hold));
    }
  } finally {
    // Release only after the transport is gone, so an attaching client never reaches a socket whose
    // owner already stopped serving.
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
