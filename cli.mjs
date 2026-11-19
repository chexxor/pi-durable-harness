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
import { harnessInvocation, intent, finalAnswerText, rpcLine, settleInvocation, chooseSurface, expandRunInput, openAnswerRefusal } from "./src/cli-intent.mjs";
// pi's OWN command-line option table, read off pi's pinned release (src/piflags.mjs): cli.mjs answers
// each of pi's spellings explicitly, and quotes pi's own help words when refusing one it cannot take.
import { piCliFlagOf, piCliFlagText } from "./src/piflags.mjs";
// pi's model plane (pi's ModelRuntime over pi's provider configs), which is what pi's own
// `--list-models` walks; pi's fuzzy search filter is pi-tui's, the same one pi's listModels calls.
import { buildModels } from "./src/providers.mjs";
import { fuzzyFilter } from "@earendil-works/pi-tui";
// pi's JSON event records (docs/json.md inside the pinned package) are what --mode json and --mode
// rpc print, built by src/pievents.mjs from pi-durable's committed entries.
import { piEventsOf, sessionHeader } from "./src/pievents.mjs";
// --tui runs the TUI over the conversation THIS process owns (src/tui/writer.mjs); the viewer entrypoint
// for a store another process owns is demo/tui-interactive.mjs.
import { openWriterView, writerSubmit } from "./src/tui/writer.mjs";
import { createUiDriver } from "./src/tui/driver.mjs";
// pi's prompt-history rules live in src/tui/viewmode.mjs (pi's own machine, spelled for this surface); the
// text of a committed pi-durable entry is read here so the row surface can seed that machine with the prompts
// the store already has.
import { entryText } from "./src/tui/piscreen.mjs";
import { applyThemeToRows } from "./src/tui/theme.mjs";
import { renderFrame, rowComponent, INPUT_MARK } from "./src/tui/frame.mjs";
import { piDockLoop } from "./src/tui/pidockloop.mjs";
// ONE slash policy, asked by BOTH surfaces: pi's own dock (src/tui/pidockloop.mjs) and this row surface
// ask the same module what a typed draft that starts with `/` or `!` MEANS, so a slash command cannot
// mean one thing in one window and another thing in the other. The rules are pi's, read off pi's pinned
// dist there rather than remembered here.
import { dispatchLine } from "./src/slashplane.mjs";
import { ProcessTerminal, TuiAltScreen, TuiMainScreen } from "@earendil-works/pi-tui";

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
  -t, --tools <list>      comma list of tool names
  -xt, --exclude-tools <list>  comma list of tool names to drop
  --no-tools, -nt         no tools
  --thinking <level>      thinking level for the conversation (pi-durable's Agent.thinkingLevel)
  -e, --extension <path>  load one more pi extension from <path> (repeatable; pi's own loader)
  --skill <path>          load one more pi skill from <path> (repeatable; pi's own loader)
  --prompt-template <path> load one more pi prompt template from <path> (repeatable; pi's own loader)
  --list-models [search]  what pi's model plane offers here (offline), and exit
  --                      end of options; the rest are the prompt words
  --faux <text>           offline scripted reply (demo/CI; no keys, no network)
  --attach                force attach to a running owner as a reader
  --tui                   the harness's flat row surface over this session (this process owns the store)
  --row-view              same as --tui (spelled out, so the row surface stays reachable by name)
  --keystroke-input       feed the TUI keystroke chunks instead of whole lines (what a terminal sends)
  --hold <ms>             stay open after a print turn (so others can attach)
  --width <cols>          TUI width (default: the terminal's)
  --height <rows>         TUI height (default: the terminal's)

A plain run IN A TERMINAL (no prompt, no --mode) opens the interactive TUI over this directory's store;
this process owns that store, so a typed line goes to Conversation.submit on the store's ONE mutation
line. ESC or Ctrl+C quits; typing q or quit on a line of its own does the same. Piped in (no TTY) a run
needs a prompt - an interactive window in a pipe would sit open forever.
  -v, --version           the pinned release this harness resolves, and exit
  --help                  this text

A pi flag this harness has no plane for (pi's --api-key, --approve, --no-approve, --offline, --name,
--models, --session-id, --session-dir, --fork, --theme, --use-theme, --no-mcp, --no-builtin-tools,
--tui-mode, --verbose, --export) is refused BY NAME quoting pi's own help words, and docs/package-support.md
carries the row that says why - a pi flag is never quietly dropped into the prompt words.`;

/** pi's own command line, spelled as pi spells it: the option rows below are the spellings pi's
 * pinned release ships (src/piflags.mjs reads them off pi's `Options:` block in dist/cli/args.js, and
 * THROWS if pi's release stops shipping that table), so a spelling this branch does not answer is
 * either one of pi's - refused BY NAME quoting pi's own help words - or not pi's at all - the harness's
 * own unknown-flag/unknown-option rejection, unchanged from before. A pi flag is never quietly pushed
 * into the prompt words: that is how a user loses a flag, and it is what the user hit at the dock.
 * pi's verbs with no plane here are the rows in docs/package-support.md that name them. */
export function parseArgs(argv) {
  const a = { appendSystem: [], messages: [], noKinds: [], extensionPaths: [], skillPaths: [], templatePaths: [] };
  const piRefusal = (spelling) =>
    `pi flag ${piCliFlagText(spelling)}; this harness does not take it - the capability matrix names it in docs/package-support.md`;
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    // pi's own end of option parsing: after `--`, every arg is a message (dist/cli/args.js pushes
    // args.slice(i + 1) into its messages, and pi's `@file` args into its file plane - the file plane
    // is named in the matrix rather than implemented here).
    if (t === "--") { a.messages.push(...argv.slice(i + 1)); break; }
    // pi's spellings and pi's own aliases, taken from pi's option rows: -v/--version, -h/--help,
    // -p/--print, -c/--continue, -r/--resume, --no-session.
    else if (t === "--version" || t === "-v") a.version = true;
    else if (t === "--help" || t === "-h") a.help = true;
    else if (t === "-p" || t === "--print") a.print = true;
    else if (t === "-c" || t === "--continue" || t === "-r" || t === "--resume") a.continue = true;
    else if (t === "--no-session") a.noSession = true;
    else if (t === "--hold") { a.hold = Number(argv[i + 1]); i++; }
    else if (t === "--faux") { a.faux = argv[i + 1]; i++; }
    else if (t === "--no-tools" || t === "-nt") a.noTools = true;
    // pi's per-resource opt-outs: one flag per kind of pi package it will not load. The harness honours
    // them by NOT loading that kind and saying so in the run's own inventory, which is why they are
    // parsed flags rather than a refusal.
    else if (t === "--no-extensions" || t === "-ne") a.noKinds.push("extensions");
    else if (t === "--no-skills" || t === "-ns") a.noKinds.push("skills");
    else if (t === "--no-themes") a.noKinds.push("themes");
    else if (t === "--no-prompt-templates" || t === "-np") a.noKinds.push("prompts");
    else if (t === "--no-context-files" || t === "-nc") a.noKinds.push("context");
    // pi's tool-selection verbs and pi's own short aliases for them.
    else if (t === "--tools" || t === "-t") { a.tools = argv[i + 1].split(","); i++; }
    else if (t === "--exclude-tools" || t === "-xt") { a.excludeTools = argv[i + 1].split(","); i++; }
    // pi's explicit resource paths: handed to pi's OWN resource loader under pi's OWN option names
    // (DefaultResourceLoaderOptions' additionalExtensionPaths / additionalSkillPaths /
    // additionalPromptTemplatePaths, forwarded by src/agentplane.mjs), so no second discovery rule
    // is invented here. pi repeats them; so do we.
    else if (t === "--extension" || t === "-e") { a.extensionPaths.push(argv[i + 1]); i++; }
    else if (t === "--skill") { a.skillPaths.push(argv[i + 1]); i++; }
    else if (t === "--prompt-template") { a.templatePaths.push(argv[i + 1]); i++; }
    // pi's `--list-models [search]`: pi takes the optional search value ONLY when the next arg starts
    // with neither `-` nor `@` (dist/cli/args.js), and answers it before opening a session.
    else if (t === "--list-models") {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-") && !next.startsWith("@")) { a.listModels = next; i++; }
      else a.listModels = true;
    }
    // A terminal delivers keystroke chunks; `--keystroke-input` lets a piped run speak the SAME way
    // (one key per piece, ENTER as `\r`), which is how the offline demo proves the interactive path.
    else if (t === "--keystroke-input") a.keystrokeInput = true;
    else if (t === "--width") { a.width = Number(argv[i + 1]); i++; }
    else if (t === "--height") { a.height = Number(argv[i + 1]); i++; }
    else if (t === "--attach") a.attach = true;
    else if (t === "--tui" || t === "--row-view") a.tui = true;
    // pi's value-taking verbs (long spelling), the harness's own long verbs, and then the two honest
    // endings of the loop.
    else if (t.startsWith("--")) {
      const name = t.slice(2);
      const value = argv[i + 1];
      if (name === "store") { a.store = value; i++; }
      else if (name === "cwd") { a.cwd = value; i++; }
      else if (name === "session") { a.conversation = value; i++; }
      else if (name === "conversation") { a.conversation = value; i++; }
      else if (name === "mode") { a.mode = value; i++; }
      else if (name === "model") { a.model = value; i++; }
      else if (name === "provider") { a.provider = value; i++; }
      else if (name === "system-prompt") { a.systemPrompt = value; i++; }
      else if (name === "append-system-prompt") { a.appendSystem.push(value); i++; }
      else if (name === "thinking") {
        // pi's own thinking vocabulary (pi-ai's ThinkingLevel), not a list typed here.
        if (!MODEL_THINKING_LEVELS.includes(value)) throw new Error(`--thinking needs one of ${MODEL_THINKING_LEVELS.join(", ")}; got ${value}`);
        a.thinking = value;
        i++;
      }
      else if (name === "faux") { a.faux = value; i++; }
      else if (name === "hold") { a.hold = Number(value); i++; }
      // pi's option table names this spelling and no branch above answered it: this harness has no plane
      // for it, so it is refused BY NAME in pi's own help words rather than dropped.
      else if (piCliFlagOf(t)) throw new Error(piRefusal(t));
      else throw new Error(`unknown flag ${t}; run with --help`);
    }
    else if (t.startsWith("-") && t !== "-") {
      // pi's short spellings are aliases of its long flags, so a short one no branch answered is refused
      // by the name pi's own table gives it (-n/--name, -a/--approve, -na/--no-approve,
      // -nbt/--no-builtin-tools); anything else is pi's own unknown option.
      if (piCliFlagOf(t)) throw new Error(piRefusal(t));
      throw new Error(`unknown option ${t}; run with --help`);
    }
    else a.messages.push(t);
  }
  if (a.mode && !["text", "json", "rpc"].includes(a.mode)) throw new Error(`--mode must be text, json, or rpc; got ${a.mode}`);
  if (a.mode === "rpc" && !a.messages.length) a.mode = "rpc";
  return a;
}

/** pi's own token shorthand (204800 -> "204.8K", 1000000 -> "1M"), pi's own rounding, copied from pi's
 * pinned dist/cli/list-models.js - the file pi's `--list-models` prints through. That file is NOT
 * dist/cli/list-models.js, the file pi's `--list-models` prints through. That file is NOT importable
 * (this pin's package exports are "." and "./rpc-entry"), so the harness answers pi's verb through the
 * same SOURCE pi answers it from - ModelRuntime.getAvailable over pi's provider plane - and prints it
 * with pi's own column names, pi's own sort and pi's own shorthand. The one measured difference, named
 * in the capability matrix row: this ModelRuntime is created OFFLINE (`allowModelNetwork: false`,
 * `refreshOnCreate: false`), so pi's catalog refresh never runs and the list is what pi's plane already
 * knows here - which is also why pi's auth state is printed beside it. */
function formatTokenCount(count) {
  if (count >= 1_000_000) {
    const millions = count / 1_000_000;
    return millions % 1 === 0 ? `${millions}M` : `${millions.toFixed(1)}M`;
  }
  if (count >= 1_000) {
    const thousands = count / 1_000;
    return thousands % 1 === 0 ? `${thousands}K` : `${thousands.toFixed(1)}K`;
  }
  return count.toString();
}

async function listModelsAnswer(search) {
  const models = await buildModels({ offline: true });
  const runtime = models.registry.runtime;
  const loadError = runtime.getError();
  if (loadError) console.error(`Warning: errors loading models.json:\n${loadError}`);
  const found = [...await runtime.getAvailable(undefined, {})];
  if (!found.length) {
    console.error(`plane: models=0 available (offline through pi's model plane; auth: none configured)`);
    console.log("No models available.");
    return;
  }
  const pattern = typeof search === "string" ? search.trim() : "";
  const filtered = pattern ? fuzzyFilter(found, pattern, (m) => `${m.provider} ${m.id}`) : found;
  if (!filtered.length) {
    console.log(`No models matching "${pattern}"`);
    return;
  }
  filtered.sort((a, b) => {
    const providerCmp = a.provider.localeCompare(b.provider);
    if (providerCmp !== 0) return providerCmp;
    return a.id.localeCompare(b.id);
  });
  const rows = filtered.map((m) => ({
    provider: m.provider,
    model: m.id,
    context: formatTokenCount(m.contextWindow),
    maxOut: formatTokenCount(m.maxTokens),
    thinking: m.reasoning ? "yes" : "no",
    images: m.input.includes("image") ? "yes" : "no",
    // pi's auth state for the row: pi-ai's Models plane reports it through pi's ModelRegistry
    // (registry.hasConfiguredAuth), which knows the providers buildModels registered; the runtime's
    // own copy of that verb answers only for pi's models.json providers, so the registry's answer is
    // the one that matches the plane this harness registered.
    auth: models.registry.hasConfiguredAuth(m) ? "configured" : "unconfigured",
  }));
  const headers = { provider: "provider", model: "model", context: "context", maxOut: "max-out", thinking: "thinking", images: "images", auth: "auth" };
  const widths = Object.fromEntries(Object.entries(headers).map(([key, head]) => [key, Math.max(head.length, ...rows.map((r) => String(r[key]).length))]));
  console.error(`plane: models=${filtered.length} available (offline through pi's model plane; ${rows.filter((r) => r.auth === "configured").length} configured by pi's auth plane)`);
  const cells = (row) => Object.keys(headers).map((key) => String(row[key]).padEnd(widths[key]));
  console.log(cells(headers).join("  ").trimEnd());
  for (const row of rows) console.log(cells(row).join("  ").trimEnd());
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
  // pi's `--list-models` answers BEFORE the store is claimed: pi's own main.js runs its listModels
  // before opening a session, so a run that only asks which models exist neither claims the store nor
  // opens a conversation (which is what lets it run offline with no keys at all).
  if (args.listModels !== undefined) { await listModelsAnswer(args.listModels); return; }
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
  // The explicit row-view flag (`--tui`, or `--row-view` spelled out) keeps the harness's flat row
  // surface, which is what the headless fixtures assert. A terminal run that names NO surface gets
  // pi's own screen: pi's chat-viewport layout, pi's components over pi-durable's committed entries,
  // pi's Editor as the dock. src/cli-intent.mjs' chooseSurface still decides tui-vs-print, so a piped
  // run cannot accidentally open a window that would sit open forever.
  const rowView = args.tui === true;
  const tui = rowView || surface === "tui";
  const piScreen = tui && !rowView;
  // A real terminal delivers keystroke chunks; `--keystroke-input` makes a piped run deliver them the
  // same way, so the offline demo exercises the interactive path rather than the scripted line path.
  const interactive = tui && (process.stdin.isTTY === true || args.keystrokeInput === true);
  const argsFor = { ...args, ...(tui ? { tui: true } : {}) };

  // The flags come BEFORE the claim on purpose: the who-answers rule (src/cli-intent.mjs' openAnswerRefusal)
  // has to refuse a run that cannot say honestly which plane answers it, and a refusal AFTER claimWriter
  // would leave a lock claiming the store in a process that is about to exit - main's try/finally below
  // only runs once the open itself can fail.
  const flags = {
    ...argsFor,
    cwd,
    // --no-tools chooses an EMPTY offered set; pi-durable then settles any call as `tool_unavailable`,
    // which is pi's --no-tools behaviour with pi-durable's refusal instead of a hidden tool.
    ...(args.noTools ? { tools: [] } : {}),
    // pi's --append-system-prompt extends the base instructions rather than replacing them.
    ...(args?.systemPrompt && args?.appendSystem?.length ? { systemPrompt: [...(args.systemPrompt ? [args.systemPrompt] : []), ...args.appendSystem].join("\n\n") } : {}),
  };
  const whoAnswers = openAnswerRefusal(intent(flags, { cwd }));
  if (whoAnswers) throw new Error(whoAnswers);

  // Claim before opening: the process that opens the store is the process that owns the mutation line.
  const claim = args.noSession ? null : claimWriter(store);

  // The ONE shared path: flags -> intent -> one harnessInvocation -> the surface below only prints.
  // pi-durable's recovery is inside that path (resume() when the store already has a committed line),
  // which is why print, json, rpc, `-c`/`-r`, and `--session <id>` cannot open differently.
  const parts = await harnessInvocation(flags, {
    extraExtensions: [],
    // pi's explicit resource paths (--extension/-e, --skill, --prompt-template <path>): forwarded
    // under pi's OWN loader option names, so pi's own loader decides what they load and reports it.
    additionalResourcePaths: {
      ...(args.extensionPaths.length ? { additionalExtensionPaths: args.extensionPaths } : {}),
      ...(args.skillPaths.length ? { additionalSkillPaths: args.skillPaths } : {}),
      ...(args.templatePaths.length ? { additionalPromptTemplatePaths: args.templatePaths } : {}),
    },
  });
  // What this run's plane actually loaded, printed once per run on stderr: the counts and names come
  // from the plane THIS run composed (pi's settings, pi's discovered packages, the verbs they register,
  // the kinds pi's opt-out flags skipped), so a user can see that `npm run cli` in this cwd really is
  // reading pi's own plane rather than a bare pi-durable session. Nothing here is remembered.
  const res = parts.resources ?? {};
  const count = (list) => (Array.isArray(list) ? list.length : 0);
  const namesOf = (list) => list.map((row) => row?.name ?? row?.id ?? row?.package ?? String(row)).filter(Boolean).join(",");
  console.error(`plane: packages=${count(res.packages)} (${namesOf(res.packages)}) extensions=${count(res.loaderExtensions)} loaded=${count(res.extensionPaths)} bridged=${count(res.durableExtensions)} commands=${count(res.commands)} shortcuts=${count(res.shortcuts)} templates=${count(res.promptTemplates)} skills=${count(res.skills)} themes=${count(res.themes)} contextFiles=${count(res.contextFiles)} theme=${res.themeName ?? "pi names none"} settings=${count(res.settingsPaths)} unmappedSettings=${count(res.unmappedSettings)} skipped=${(res.skipped ?? []).length ? (res.skipped ?? []).map((s) => typeof s === "string" ? s : s?.kind).join(" ") : "none"}`);
  // pi's explicit resource paths (`--extension/-e`, `--skill`, `--prompt-template <path>`): name WHICH
  // entries of this run's plane came from a path the caller gave, and what they registered, so a demo
  // can assert the load rather than comparing a total that depends on which pi packages are installed.
  // The rows come from pi's own loader answer and pi's own registration inventory (source = the path).
  if (args.extensionPaths.length || args.skillPaths.length || args.templatePaths.length) {
    const given = [...args.extensionPaths, ...args.skillPaths, ...args.templatePaths].filter(Boolean);
    const loaded = (res.loaderExtensions ?? []).filter((e) => given.includes(String(e?.path ?? e?.resolvedPath ?? ""))).map((e) => e?.path);
    const fromPaths = (res.commands ?? []).filter((row) => given.includes(String(row?.source ?? ""))).map((row) => `/${row?.name}`);
    console.error(`explicit: paths=${given.join(",")} loadedExtensions=${loaded.join(",") || "none"} registeredCommands=${fromPaths.join(",") || "none"}`);
  }
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
  // The pi screen has NO reader here on purpose: pi-tui's `ProcessTerminal.start()` owns stdin and
  // `tui.js handleTerminalInput` hands every keystroke to the focused component, so a second stdin
  // listener would split the terminal's stream into two half-fed buffers.
  const reader = tui && !piScreen ? (interactive ? keystrokeReader() : stdinReader()) : mode === "rpc" ? stdinReader() : null;
  const onSignal = (signal) => {
    if (signalled) return;
    signalled = signal;
    console.error(`the session was asked to stop (${signal}); settling what it queued and releasing the store`);
    reader?.stop();
  };
  process.on("SIGTERM", () => onSignal("SIGTERM"));
  process.on("SIGINT", () => onSignal("SIGINT"));
  try {
    if (tui && piScreen) {
      const screenRun = await piScreenRun(parts, argsFor, { shouldStop: () => signalled !== null });
      // What the dock queued has to reach an answer BEFORE this process closes: a `!bash` output is
      // pi-durable's follow-up input parked in pi.inbox (rpc-commands.md: "Included bash output reaches
      // the model on the next prompt"), and pi-durable's own promise is that the process which queued
      // input reaches an answer before it closes rather than leaving the input parked for the next one.
      if ((parts.settlements ?? []).length || (parts.runs ?? []).length) await settleInvocation(parts);
      // pi's per-draft slash decisions, so the proof below can assert WHICH word pi answered rather
      // than reading a transcript: one `handled:name` per non-fallthrough draft plus the tallies.
      const slashRows = screenRun?.slash ?? [];
      const slashTally = {};
      for (const row of slashRows) slashTally[row.handled] = (slashTally[row.handled] ?? 0) + 1;
      const slashNames = slashRows.filter((row) => row.handled !== "fallthrough")
        .map((row) => `${row.handled}:${String(row.name ?? row.kind ?? "").split(/\s+/)[0] || row.kind}`)
        .join(" ");
      // pi's own numbers, from pi-durable's committed state: what the run admitted, cancelled, and
      // why pi's key table said to leave. The theme name is pi's setting plus pi's discovered record.
      console.error(`screen: pi's chat viewport over pi-durable's entries paints=${screenRun?.paints ?? 0} submitted=${screenRun?.submitted ?? 0} cancelled=${screenRun?.cancelled ?? 0} quit=${screenRun?.quit ?? "-"} theme=${screenRun?.theme ?? "pi's builtin"} slash=${Object.entries(slashTally).map(([side, count]) => `${side}=${count}`).join(" ") || "none"} decisions=${slashNames || "none"}`);
    } else if (tui) {
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

/** pi's OWN screen over the conversation THIS process owns: pi's chat-viewport layout (re-derived in
 * src/tui/piscreen.mjs because `createChatViewport` is not root-exported at this pin), pi's components
 * over pi-durable's committed entries, pi's `CustomEditor` as the dock, pi's footer shape, pi's startup
 * header, pi's discovered palette. pi-tui reads the terminal and pi's keybinding layer decides what a
 * keystroke means; the only decision made here is which finished pi draft becomes ONE pi-durable
 * admission through `writerSubmit` (the same mutation line every other surface uses).
 */
async function piScreenRun(parts, args, { shouldStop = null } = {}) {
  const ui = new TuiAltScreen(new ProcessTerminal(), false, undefined);
  ui.start();
  // A terminal that reports its size answers it; a terminal that reports NOTHING (Node says `0`, not
  // `undefined`, when the kernel's winsize was never set - an allocated pty, or a piped stdout) falls
  // back to the caller's `--width`/`--height`, then to pi-tui's own documented default of 80x24. `??`
  // would keep the 0 and paint a frame zero columns wide.
  const size = () => ({ columns: process.stdout.columns || args.width || 80, rows: process.stdout.rows || args.height || 24 });
  // `shouldStop` is what makes a shutdown signal leave the pi screen: pi's keybinding layer names the
  // keystroke quits (ESC/ctrl+d/ctrl+c) but a signal is not a keystroke, so the session's signal handler
  // (already installed in main) says when it was set, and this loop leaves so main's finally block
  // settles, closes the Harness and releases the claim - the same ordinary cleanup a quit runs.
  // The offline plane is armed PER ADMISSION on this path, not once for the run: pi-ai's faux provider
  // answers from a queue, and a TUI session submits as many prompts as the user types, so each admission
  // queues its own scripted reply. This is the SAME rule the print path uses (cli.mjs arms
  // `scriptTurn(parts.faux, [parts.intent.faux])` before submitting): only a run that spelled `--faux` is
  // answered by faux, and a run that asked for a real model is answered by that model - it fails at pi-ai's
  // auth layer rather than quietly from this script, which is why the answer here cannot pretend an endpoint
  // spoke. `submit` is piDockLoop's own hook, so `writerSubmit` stays the ONE mutation line.
  const submit = parts.intent.faux ? async (text, ctx) => {
    scriptTurn(parts.faux, [parts.intent.faux]);
    return await writerSubmit(parts, text, { context: ctx });
  } : null;
  // `window: true` is spelled rather than left to the default: piScreenRun just opened pi's alt screen
  // (`new TuiAltScreen(...)` above), so pi-durable's OWN status lines - the acknowledgement triple,
  // a `set_model:` answer, a refusal BY NAME, the `expanded pi's ...` hint - are painted as their OWN
  // wrapped rows in pi's transcript region instead of written raw to stderr, which is what keeps pi's
  // bordered dock/draft rows whole (the user's second symptom). A surface with NO window open - print,
  // RPC/JSON, or the row view - keeps its raw stderr writes unchanged.
  const tally = await piDockLoop({ parts, ui, size, context: parts.context, reader: null, shouldStop, submit, window: true });
  ui.clear();
  ui.requestRender();
  ui.stop();
  return tally;
}

/** How many previous committed prompts the ROW surface seeds pi's history machine with - the same seed the
 * pi-style screen uses (src/tui/pidockloop.mjs' HISTORY_SEED), handed over oldest first because pi's own
 * `addToHistory` unshifts and puts the NEWEST entry at index 0, which is what pi's up-arrow reads first. */
const ROW_HISTORY_SEED = 8;

async function writerTui(parts, args, reader, { keystrokes = false } = {}) {
  const view = await openWriterView(parts, { conversationId: parts.conversation.id, context: parts.context });
  // Same size rule as piScreenRun: `0` means the terminal never said a size, so it falls back rather
  // than painting a frame zero columns wide.
  const size = () => ({ columns: process.stdout.columns || args.width || 80, rows: process.stdout.rows || args.height || 24 });
  // Up-arrow recalls the previous prompt on THIS surface too. pi serves that on its own `Editor` through the
  // PUBLIC `Editor.addToHistory`; this row surface is Durian-Pi's own overlay, so pi's history rules are
  // spelled in src/tui/viewmode.mjs (a capability matrix row records that difference) and are seeded here
  // from pi-durable's committed `pi.user` entries - pi-durable's entry page is newest-first, so pi's NEWEST
  // prompts are the page's first user rows, reversed into pi's oldest-first seeding order.
  const seededHistory = (await transcript(parts.conversation, parts.context, 200))
    .filter((entry) => entry?.kind === "pi.user")
    .map((entry) => entryText(entry))
    .filter((text) => text)
    .slice(0, ROW_HISTORY_SEED)
    .reverse();
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
    // `overlay: driver.view` is what makes a `--tui` user able to SEE the line they are typing: the row
    // surface's typed draft is composited over one frame row (frame.mjs, through pi-tui's own
    // `compositeTuiLine`) BEFORE pi's palette is applied, so the accent pick still colours it. Without
    // it the frame is pi-durable's transcript only and a raw-mode terminal echoes nothing, so the user
    // types blind (measured: the mark count in a painted frame used to be 0).
    // `theme: piThemeOf(parts)` colours JUST the draft with pi's palette before compositing, so the
    // typed line carries pi's `accent` (see frame.mjs' withInputOverlay for why the colour goes on
    // before compositing); the frame-wide theme pass below leaves that already-coloured row alone.
    const frame = await view.paint({ width: at.columns, height: at.rows, overlay: driver.view, overlayAt: 1, theme: piThemeOf(parts) });
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
      // demo/cli.test.mjs assert. Same split for the bare `r` refresh key: on a real terminal only pi's
      // own Ctrl+R refreshes, so a prompt may start with `r`.
    quitOnBareQ: !keystrokes,
    refreshOnBareR: !keystrokes,
    // The driver's onInput is synchronous, so the line is queued and awaited in the loop below:
    // a submission is durable work and only the loop can await it in order.
    onInput: (line) => { typed.push(line); },
    onExit: () => {},
    // pi's history machine, seeded (see above): pi's up-arrow then recalls a committed prompt instead of
    // typing an escape sequence into the line.
    history: seededHistory,
  });
  // A submitted line of `q`/`quit`/`exit` is the user asking to leave: it is NOT sent to the agent, and
  // the driver's own quit path is taken, so the lock is released and the Harness closed the same way ESC
  // or Ctrl+C leaves the session.
  const quitWords = ["q", "quit", "exit"];
  const flushTyped = async () => {
    while (typed.length) {
      const line = typed.shift();
      // pi decides what a finished draft MEANS before it submits anything (`setupEditorSubmitHandler`
      // in dist/modes/interactive/interactive-mode.js matches the draft against pi's builtin slash table
      // and pi's `!`/`!!` bash rule), and src/slashplane.mjs reads that rule off pi's pinned dist rather
      // than remembering it. A command this harness cannot honour is refused BY NAME in pi's own words;
      // a decision that is NOT pi's fallthrough is NOT an admission - pi's own clear-the-draft rule
      // (`clearEditor()`: setText("") and nothing else) clears it without submitting, which is what keeps
      // `writerSubmit` the ONE mutation line even on a slash line.
      const decision = await dispatchLine(line, parts, { context: parts.context, report: (out) => console.error(out) });
      if (decision.handled !== "fallthrough") {
        for (const out of decision.lines) console.error(out);
        if (decision.handled === "quit") return { quit: decision.quit };
        continue;
      }
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
      // The offline plane is armed PER ADMISSION on this path too - the SAME rule the print path (cli.mjs:
      // `scriptTurn(parts.faux, [parts.intent.faux])`) and the pi-style screen (src/tui/pidockloop.mjs' caller
      // in piScreenRun) use: pi-ai's faux provider answers from a queue, and a session submits as many
      // prompts as the user types, so each admission queues its own scripted reply. A run that spelled no
      // `--faux` arms nothing and is answered by the real model (or fails at pi-ai's auth layer), so the
      // answer here never pretends an endpoint spoke.
      if (parts.intent.faux) scriptTurn(parts.faux, [parts.intent.faux]);
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
    // A slash `/quit` leaves on either path, so `quit` reaches `driver.quit` below and the ordinary
    // cleanup (close the Harness, release the claim) runs - the same exit ESC or Ctrl+C takes.
    if (sent?.quit) { quit = sent.quit; break; }
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
