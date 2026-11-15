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
import { harnessInvocation, intent, finalAnswerText, rpcLine, settleInvocation } from "./src/cli-intent.mjs";
// pi's JSON event records (docs/json.md inside the pinned package) are what --mode json and --mode
// rpc print, built by src/pievents.mjs from pi-durable's committed entries.
import { piEventsOf, sessionHeader } from "./src/pievents.mjs";
// --tui runs the TUI over the conversation THIS process owns (src/tui/writer.mjs); the viewer entrypoint
// for a store another process owns is demo/tui-interactive.mjs.
import { openWriterView, writerSubmit } from "./src/tui/writer.mjs";
import { createUiDriver } from "./src/tui/driver.mjs";
import { renderFrame, rowComponent } from "./src/tui/frame.mjs";
import { ProcessTerminal, TuiMainScreen } from "@earendil-works/pi-tui";

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
  --tui                   the interactive TUI over this session (this process owns the store)
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
    else if (t === "--tui") a.tui = true;
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
  // A session that stays open (rpc, tui, --hold) answers pi's own shutdown signals by CLEANING UP
  // rather than dying: the ownership lock is released and the store is left reclaimable, which is the
  // difference between "the owner quit" and "the owner crashed and its lock still claims the store".
  let signalled = null;
  // The session's line reader is made before the surface below, so the signal handler can end the
  // session rather than kill the process - Node's default SIGTERM handling skips the finally block,
  // which would leave this process' lock claiming the store forever.
  const reader = (mode === "rpc" || args.tui) ? stdinReader() : null;
  const onSignal = (signal) => {
    if (signalled) return;
    signalled = signal;
    console.error(`the session was asked to stop (${signal}); settling what it queued and releasing the store`);
    reader?.stop();
  };
  process.on("SIGTERM", () => onSignal("SIGTERM"));
  process.on("SIGINT", () => onSignal("SIGINT"));
  try {
    if (args.tui) {
      await writerTui(parts, args, reader);
    } else if (mode === "rpc") {
      // pi's RPC mode is a bidirectional pipe protocol: no session header, one record per line in,
      // a response record (plus the run's session-event records) out. The `ready` record is this
      // harness's addition, naming the verbs it answers; pi's own client treats any non-response
      // line as an event, so an extra record cannot desync it.
      console.log(JSON.stringify({ type: "ready", conversationId: parts.conversation.id, commands: commandNames() }));
      while (true) {
        const item = await reader.next();
        if (item.done) break;
        const sink = (event) => console.log(JSON.stringify(event));
        const answer = await rpcLine(parts, item.value, sink);
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
        // pi's JSON mode is one session header followed by session events (docs/json.md inside the
        // pinned package), so that is what is printed: the header names pi-durable's ConversationId
        // and this store rather than a session FILE, and every event record is built by
        // src/pievents.mjs from the committed entries - pi-ai's own message objects, unchanged.
        console.log(JSON.stringify(sessionHeader({ conversationId: parts.conversation.id, cwd, store })));
        for (const event of piEventsOf(entries.slice().reverse(), { conversationId: parts.conversation.id, settled: true })) console.log(JSON.stringify(event));
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

/** A bidirectional line reader: one record per line, answered AS IT ARRIVES, and a `stop()` that
 * ends the session on demand (a shutdown signal, a TUI quit). pi's json.md framing rules are what
 * this splits on: "Split records only on LF and strip an optional preceding carriage return", and
 * "Node.js `readline` is not suitable for this stream because it also recognizes those Unicode
 * separators" - so the split is spelled here rather than taken from a line reader.
 *
 * WHY NOT readFileSync(0): the RPC session is bidirectional - a client that sends one command and
 * waits for its response must GET the response, and draining stdin to EOF first would deadlock
 * exactly the client pi's own RpcClient is.
 */
function stdinReader() {
  const state = { buffer: "", lines: [], ended: process.stdin.isTTY ? true : false, wake: null };
  if (process.stdin.isTTY) {
    console.log('rpc mode reads JSONL on stdin, for example: {"type":"prompt","message":"hello"}; a TUI session uses --tui instead');
  }
  const notify = () => {
    const wake = state.wake;
    state.wake = null;
    wake?.();
  };
  // pi's framing: split only on LF, strip an optional preceding CR, ignore blank lines (json.md).
  const drain = () => {
    let index;
    while ((index = state.buffer.indexOf("\n")) >= 0) {
      let line = state.buffer.slice(0, index);
      state.buffer = state.buffer.slice(index + 1);
      // pi's framing strips an optional CR before the LF (json.md); a blank line is not a command.
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.trim()) state.lines.push(line);
    }
  };
  process.stdin.on("data", (chunk) => { state.buffer += String(chunk ?? ""); drain(); notify(); });
  process.stdin.on("end", () => { state.ended = true; notify(); });
  return {
    next: async () => {
      while (true) {
        if (state.lines.length) return { done: false, value: state.lines.shift() };
        if (state.ended) return { done: true };
        await new Promise((resolve) => { state.wake = resolve; });
      }
    },
    // Ending the session is how a shutdown signal or a TUI quit leaves this process: the caller's loop
    // returns through its ordinary path, so the lock is released and the Harness closed.
    stop: () => { state.ended = true; notify(); },
  };
}

/** The interactive TUI over the conversation THIS process owns: pi-tui's own screens, this harness's
 * view planes, and a typed line that goes to Conversation.submit on the store's ONE mutation line
 * (src/tui/writer.mjs' rule: the writer is the owner, so there is no socket hand-off here).
 */
async function writerTui(parts, args, reader) {
  const view = await openWriterView(parts, { conversationId: parts.conversation.id, context: parts.context });
  const size = () => ({ columns: process.stdout.columns ?? args.width ?? 80, rows: process.stdout.rows ?? args.height ?? 24 });
  // The wiring order is pi's own, read from the pinned dist: dist/cli/startup-ui.js builds
  // `new TuiMainScreen(new ProcessTerminal(), ..., getAgentDir())` and the screens answer `clear()`,
  // `addChild`, `invalidate()`, `requestRender()`, `stop()`. No escape sequence and no alt-screen
  // pair is written in this file, which is what makes pi-tui's teardown the exit path.
  const screen = new TuiMainScreen(new ProcessTerminal(), false, undefined);
  const typed = [];
  const painted = [];
  const paintFrame = async () => {
    const at = size();
    const frame = await view.paint({ width: at.columns, height: at.rows });
    screen.clear();
    for (const row of frame.rows) screen.addChild(rowComponent(row, { width: at.columns }).component);
    screen.invalidate();
    screen.requestRender();
    painted.push(frame);
    return frame;
  };
  const driver = createUiDriver({
    getSize: size,
    readState: async () => await view.read(),
    paint: async (state, { width, height }) => await paintFrame(),
    pollMs: 700,
    // The driver's onInput is synchronous, so the line is queued and awaited in the loop below:
    // a submission is durable work and only the loop can await it in order.
    onInput: (line) => { typed.push(line); },
    onExit: () => {},
  });
  const flushTyped = async () => {
    while (typed.length) {
      const line = typed.shift();
      const ack = await writerSubmit(parts, line, { context: parts.context });
      // The acknowledgement goes to stderr so a scripted session reading stdout records stays parseable.
      console.error(`submitted: requestId=${ack.requestId} submissionId=${ack.submissionId} status=${ack.status}`);
    }
  };
  await paintFrame();
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  let quit = null;
  while (true) {
    const item = await reader.next();
    if (item.done) break;
    // a scripted session (no TTY) sends whole lines; pi-tui's overlay takes one keystroke at a time and
    // submits on the ENTER key, so the line is split into characters and its terminator becomes ENTER.
    let answer = { quit: null };
    for (const ch of `${item.value}${item.value.endsWith("\n") ? "" : "\n"}`) {
      answer = driver.noteData(ch);
      if (answer.quit) break;
    }
    await flushTyped();
    if (answer.quit) { quit = answer.quit; break; }
    await driver.poll(Date.now());
  }
  await flushTyped();
  if (quit) await driver.quit(quit);
  screen.clear();
  screen.requestRender();
  screen.stop();
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  return { painted: painted.length, quit };
}

main().catch((err) => {
  console.error(String(err?.message ?? err));
  process.exitCode = 1;
});
