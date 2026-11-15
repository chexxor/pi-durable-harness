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
import { harnessInvocation, intent, finalAnswerText, rpcLine, settleInvocation, chooseSurface, expandRunInput } from "./src/cli-intent.mjs";
// pi's JSON event records (docs/json.md inside the pinned package) are what --mode json and --mode
// rpc print, built by src/pievents.mjs from pi-durable's committed entries.
import { piEventsOf, sessionHeader } from "./src/pievents.mjs";
// --tui runs the TUI over the conversation THIS process owns (src/tui/writer.mjs); the viewer entrypoint
// for a store another process owns is demo/tui-interactive.mjs.
import { openWriterView, writerSubmit } from "./src/tui/writer.mjs";
import { createUiDriver } from "./src/tui/driver.mjs";
import { applyThemeToRows } from "./src/tui/theme.mjs";
import { renderFrame, rowComponent, INPUT_MARK } from "./src/tui/frame.mjs";
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
  --keystroke-input       feed the TUI keystroke chunks instead of whole lines (what a terminal sends)
  --hold <ms>             stay open after a print turn (so others can attach)
  --width <cols>          TUI width (default: the terminal's)
  --height <rows>         TUI height (default: the terminal's)

A plain run IN A TERMINAL (no prompt, no --mode) opens the interactive TUI over this directory's store;
this process owns that store, so a typed line goes to Conversation.submit on the store's ONE mutation
line. ESC or Ctrl+C quits; typing q or quit on a line of its own does the same. Piped in (no TTY) a run
needs a prompt - an interactive window in a pipe would sit open forever.
  --version               the pinned release this harness resolves, and exit
  --help                  this text`;

export function parseArgs(argv) {
  const a = { appendSystem: [], messages: [], noKinds: [] };
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
    // pi's per-resource opt-outs: one flag per kind of pi package it will not load. The harness honours
    // them by NOT loading that kind and saying so in the run's own inventory, which is why they are
    // parsed flags rather than a refusal.
    else if (t === "--no-extensions") a.noKinds.push("extensions");
    else if (t === "--no-skills") a.noKinds.push("skills");
    else if (t === "--no-themes") a.noKinds.push("themes");
    else if (t === "--no-prompt-templates") a.noKinds.push("prompts");
    else if (t === "--no-context-files") a.noKinds.push("context");
    // A terminal delivers keystroke chunks; `--keystroke-input` lets a piped run speak the SAME way
    // (one key per piece, ENTER as `\r`), which is how the offline demo proves the interactive path.
    else if (t === "--keystroke-input") a.keystrokeInput = true;
    else if (t === "--width") { a.width = Number(argv[i + 1]); i++; }
    else if (t === "--height") { a.height = Number(argv[i + 1]); i++; }
    else if (t === "--attach") a.attach = true;
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

  // Which surface this run is: a plain run in a terminal is the interactive window, a piped run or an
  // explicit prompt/mode is print/JSON, `--mode rpc` is the pipe protocol (src/cli-intent.mjs' rule, so
  // `npm run cli` in a terminal and `npm run cli -p "..."` in a script cannot drift apart).
  const surface = chooseSurface(args, { isTty: process.stdin.isTTY === true });
  const tui = args.tui || surface === "tui";
  // A real terminal delivers keystroke chunks; `--keystroke-input` makes a piped run deliver them the
  // same way, so the offline demo exercises the interactive path rather than the scripted line path.
  const interactive = tui && (process.stdin.isTTY === true || args.keystrokeInput === true);
  const argsFor = { ...args, ...(tui ? { tui: true } : {}) };

  // Claim before opening: the process that opens the store is the process that owns the mutation line.
  const claim = args.noSession ? null : claimWriter(store);

  // The ONE shared path: flags -> intent -> one harnessInvocation -> the surface below only prints.
  // pi-durable's recovery is inside that path (resume() when the store already has a committed line),
  // which is why print, json, rpc, `-c`/`-r`, and `--session <id>` cannot open differently.
  const flags = {
    ...argsFor,
    cwd,
    // --no-tools chooses an EMPTY offered set; pi-durable then settles any call as `tool_unavailable`,
    // which is pi's --no-tools behaviour with pi-durable's refusal instead of a hidden tool.
    ...(args.noTools ? { tools: [] } : {}),
    // pi's --append-system-prompt extends the base instructions rather than replacing them.
    ...(args?.systemPrompt && args?.appendSystem?.length ? { systemPrompt: [...(args.systemPrompt ? [args.systemPrompt] : []), ...args.appendSystem].join("\n\n") } : {}),
  };
  const parts = await harnessInvocation(flags, { extraExtensions: [] });
  // What this run's plane actually loaded, printed once per run on stderr: the counts and names come
  // from the plane THIS run composed (pi's settings, pi's discovered packages, the verbs they register,
  // the kinds pi's opt-out flags skipped), so a user can see that `npm run cli` in this cwd really is
  // reading pi's own plane rather than a bare pi-durable session. Nothing here is remembered.
  const res = parts.resources ?? {};
  const count = (list) => (Array.isArray(list) ? list.length : 0);
  const namesOf = (list) => list.map((row) => row?.name ?? row?.id ?? row?.package ?? String(row)).filter(Boolean).join(",");
  console.error(`plane: packages=${count(res.packages)} (${namesOf(res.packages)}) extensions=${count(res.loaderExtensions)} loaded=${count(res.extensionPaths)} bridged=${count(res.durableExtensions)} commands=${count(res.commands)} shortcuts=${count(res.shortcuts)} templates=${count(res.promptTemplates)} skills=${count(res.skills)} themes=${count(res.themes)} contextFiles=${count(res.contextFiles)} theme=${res.themeName ?? "pi names none"} settings=${count(res.settingsPaths)} unmappedSettings=${count(res.unmappedSettings)} skipped=${(res.skipped ?? []).length ? (res.skipped ?? []).map((s) => typeof s === "string" ? s : s?.kind).join(" ") : "none"}`);
  for (const w of parts.planeWarnings ?? []) console.error(`warning [${w.scope}]: ${w.message}`);
  const server = claim ? serveOwner(parts, claim.lock.socket) : null;
  const mode = parts.intent.mode;
  // A session that stays open (rpc, tui, --hold) answers pi's own shutdown signals by CLEANING UP
  // rather than dying: the ownership lock is released and the store is left reclaimable, which is the
  // difference between "the owner quit" and "the owner crashed and its lock still claims the store".
  let signalled = null;
  // The session's line reader is made before the surface below, so the signal handler can end the
  // session rather than kill the process - Node's default SIGTERM handling skips the finally block,
  // which would leave this process' lock claiming the store forever.
  // ONE reader per process, chosen by the surface: a TUI in a terminal gets keystrokes, a scripted
  // TUI gets whole lines, and RPC gets pi's JSONL records. Registering two stdin listeners would
  // split one stream into two half-fed buffers, which is why the choice happens here.
  const reader = tui ? (interactive ? keystrokeReader() : stdinReader()) : mode === "rpc" ? stdinReader() : null;
  const onSignal = (signal) => {
    if (signalled) return;
    signalled = signal;
    console.error(`the session was asked to stop (${signal}); settling what it queued and releasing the store`);
    reader?.stop();
  };
  process.on("SIGTERM", () => onSignal("SIGTERM"));
  process.on("SIGINT", () => onSignal("SIGINT"));
  try {
    if (tui) {
      const tuiRun = await writerTui(parts, argsFor, reader, { keystrokes: interactive });
      // Naming the palette pi supplied, so a demo can assert pi's colours reached the rows above rather
      // than trusting the frame look right: the token NAMES (accent, borderMuted) are pi's theme file's.
      const tokenText = (tuiRun?.theme?.tokens ? Object.entries(tuiRun.theme.tokens).map(([side, token]) => `${side}=${token}`).join(" ") : "none");
      const codeText = (tuiRun?.theme?.codes ?? []).join(" ");
      console.error(`theme: ${tuiRun?.theme?.name ?? (parts.resources?.themeName ? `pi names ${parts.resources.themeName}, which pi did not discover for this cwd` : "pi's settings name no theme")} rows coloured=${tuiRun?.theme?.coloured ?? 0} tokens=${tokenText} palette=${codeText}`);
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
        // pi expands a prompt template and a skill command BEFORE the input enters the agent
        // (docs/prompt-templates.md: "Pi expands the template before the resulting text enters the
        // agent"; docs/rpc-commands.md names the same boundary for the queued verbs), through the ONE
        // seam src/cli-intent.mjs exposes - the same expansion print, JSON, TUI and RPC share, over the
        // templates and skills pi discovered for this cwd.
        const expanded = expandRunInput(parts, text);
        if (expanded.expansion?.refused) throw new Error(expanded.expansion.refused);
        if (expanded.expansion === "template" || expanded.expansion === "skill")
          console.error(`expanded pi's ${expanded.expansion} (${text.split(/\s+/)[0].slice(1)}) into the submitted input`);
        const inputText = expanded.text;
        // The offline plane is armed here because the print/json surfaces queue their own input; RPC
        // arming lives in src/cli-intent.mjs' rpcLine, which owns that path's prompts.
        if (parts.intent.faux) scriptTurn(parts.faux, [parts.intent.faux]);
        // The queued input is recorded on the shared path's settlement list, so `settleInvocation` waits
        // for an answer rather than leaving the input parked in pi.inbox for the next process to replay.
        const queued = await parts.conversation.submit({ type: "input", content: inputText, requestId: `cli-${process.pid}` }, parts.context);
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
/** One keystroke chunk at a time from a real terminal, for the interactive TUI.
 *
 * WHY NOT the line reader: a real terminal in raw mode hands over single keystrokes and whole escape
 * sequences (`\r` for ENTER, `\x1b[A` for an arrow), none of which end in the LF the line reader splits
 * on. pi-tui's parseKey decides the key from the chunk, so this reader only moves chunks.
 */
function keystrokeReader() {
  const state = { queue: [], ended: false, wake: null };
  const notify = () => {
    const wake = state.wake;
    state.wake = null;
    wake?.();
  };
  process.stdin.on("data", (chunk) => {
    const text = String(chunk ?? "");
    if (!text) return;
    state.queue.push(text);
    notify();
  });
  process.stdin.on("end", () => { state.ended = true; notify(); });
  process.stdin.on("close", () => { state.ended = true; notify(); });
  return {
    next: async () => {
      while (true) {
        if (state.queue.length) return { done: false, value: state.queue.shift() };
        if (state.ended) return { done: true };
        await new Promise((resolve) => { state.wake = resolve; });
      }
    },
    // Leaving on a signal or a quit: the loop returns through its ordinary path, so the caller releases
    // the store and closes the Harness.
    stop: () => { state.ended = true; notify(); },
  };
}


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
/** Which pi theme this run should colour its rows with: pi's `theme` setting names it, and pi's loader
 * discovered the record for this cwd. A name pi's settings carry but pi did not discover (or a kind
 * --no-themes switched off) is reported rather than guessed at, which is why the answer says so.
 */
function piThemeOf(parts) {
  const name = parts.resources?.themeName;
  if (!name) return null;
  return (parts.resources?.themes ?? []).find((theme) => theme?.name === name) ?? null;
}

async function writerTui(parts, args, reader, { keystrokes = false } = {}) {
  const view = await openWriterView(parts, { conversationId: parts.conversation.id, context: parts.context });
  const size = () => ({ columns: process.stdout.columns ?? args.width ?? 80, rows: process.stdout.rows ?? args.height ?? 24 });
  // The wiring order is pi's own, read from the pinned dist: dist/cli/startup-ui.js builds
  // `new TuiMainScreen(new ProcessTerminal(), ..., getAgentDir())` and the screens answer `clear()`,
  // `addChild`, `invalidate()`, `requestRender()`, `stop()`. No escape sequence and no alt-screen
  // pair is written in this file, which is what makes pi-tui's teardown the exit path.
  const screen = new TuiMainScreen(new ProcessTerminal(), false, undefined);
  const typed = [];
  const painted = [];
  let themedReport = null;
  const paintFrame = async () => {
    const at = size();
    const frame = await view.paint({ width: at.columns, height: at.rows });
    screen.clear();
    // pi's palette on the rows this TUI draws: docs/themes.md says a theme "control[s] the colors Pi uses
    // in interactive mode", pi's settings name the selected theme, and pi's own loader discovered its record
    // for this cwd, so the colours come from pi's theme file and not from a palette typed here.
    const themed = applyThemeToRows(frame.rows, piThemeOf(parts), { inputMark: INPUT_MARK });
		themedReport = { name: themed.theme, coloured: themed.coloured, tokens: themed.tokens, codes: themed.codes };
    for (const row of themed.lines) screen.addChild(rowComponent(row, { width: at.columns }).component);
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
    // quitOnBareQ is off for a real terminal: a chat line has to be able to START with the letter q,
    // so ESC and Ctrl+C are the quits there and `q`/`quit` quit only as a whole submitted line. The
    // scripted (piped) surface keeps Durian-Pi's headless rule, which is what demo/tui.test.mjs and
      // demo/cli.test.mjs assert.
    quitOnBareQ: !keystrokes,
    // The driver's onInput is synchronous, so the line is queued and awaited in the loop below:
    // a submission is durable work and only the loop can await it in order.
    onInput: (line) => { typed.push(line); },
    onExit: () => {},
  });
  // A submitted line of `q`/`quit`/`exit` is the user asking to leave: it is NOT sent to the agent, and
  // the driver's own quit path is taken, so the lock is released and the Harness closed the same way ESC
  // or Ctrl+C leaves the session.
  const quitWords = ["q", "quit", "exit"];
  const flushTyped = async () => {
    while (typed.length) {
      const line = typed.shift();
      if (keystrokes && quitWords.includes(line.trim().toLowerCase())) {
        typed.length = 0;
        return { quit: "quit" };
      }
      // A typed TUI line goes through the SAME expansion seam as print and RPC: pi expands a template and
      // a skill command before the input enters the agent, so `/review concurrency` means one thing no
      // matter where the user typed it.
      const expandedLine = expandRunInput(parts, line);
      if (expandedLine.expansion?.refused) {
        console.error(`refused: ${expandedLine.expansion.refused}`);
        continue;
      }
      const ack = await writerSubmit(parts, expandedLine.text, { context: parts.context });
      // The acknowledgement goes to stderr so a scripted session reading stdout records stays parseable.
      console.error(`submitted: requestId=${ack.requestId} submissionId=${ack.submissionId} status=${ack.status}`);
    }
    return { quit: null };
  };
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  await paintFrame();
  let quit = null;
  while (true) {
    const item = await reader.next();
    if (item.done) break;
    // A real terminal hands pi-tui one keystroke chunk at a time (an escape sequence arrives as ONE
    // chunk, which is why pi-tui's parseKey, not a character loop, decides the key); a scripted session
    // sends whole lines, so the line is split into characters and its terminator becomes ENTER.
    const chunks = keystrokes ? [item.value] : [...`${item.value}${item.value.endsWith("\n") ? "" : "\n"}`];
    let answer = { quit: null };
    for (const chunk of chunks) {
      answer = driver.noteData(chunk);
      if (answer.quit) break;
      // A typed keystroke repaints the overlay: the user sees the word they are typing, and the driver's
      // "poll, not freelock" rule still holds because input is what marks the frame dirty.
      if (keystrokes) await driver.tickIfDirty();
    }
    const sent = await flushTyped();
    if (keystrokes && sent?.quit) { quit = sent.quit; break; }
    if (answer.quit) { quit = answer.quit; break; }
    await driver.poll(Date.now());
  }
  await flushTyped();
  if (quit) await driver.quit(quit);
  screen.clear();
  screen.requestRender();
  screen.stop();
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  return { painted: painted.length, quit, theme: themedReport };
}

main().catch((err) => {
  console.error(String(err?.message ?? err));
  process.exitCode = 1;
});
