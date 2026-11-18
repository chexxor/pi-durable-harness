#!/usr/bin/env node
// demo/slash.test.mjs - what a typed draft that starts with `/` or `!` MEANS, measured at pi's OWN dock
// (pi's CustomEditor), against pi's OWN data: pi's builtin slash table, pi's EXACT-vs-`/name <args>`
// match rule, pi's built-in extension registrations, and pi's `!`/`!!` bash rule. Every claim below is
// a captured `report:` line, a dock tally, or a store read-back - never a narrator's summary.
//
// PROVENANCE: no Durian-Pi original - Durian-Pi never drove an input component (its
// ~/Git/Durian-Pi/src/tui/client.mjs read whole lines with its own driver and never handed a keystroke
// to a component), so slash dispatch was never pi's there and there is nothing to extract. Symbols
// VERIFIED AGAINST PINED packages, read on this machine at pin v1.5.1:
//   pi's builtin slash table `BUILTIN_SLASH_COMMANDS` (dist/core/slash-commands.js, declared in dist/core/slash-commands.d.ts)
//   pi's built-in extension registrations `pi.registerCommand(name, { description })` (dist/extensions/{llama,mcp}/index.js)
//   pi's dock dispatch `setupEditorSubmitHandler` (dist/modes/interactive/interactive-mode.js), whose
//   EXACT-vs-prefix rule src/slashplane.mjs derives rather than remembering
//   pi's clear-the-draft rule `clearEditor()` (interactive-mode.js: editor setText to "")
//   pi's `!cmd` / `!!cmd` bash rule and pi's RPC `bash` verb (docs/rpc-commands.md: "Included bash
//   output reaches the model on the next prompt, not immediately")
//   pi-durable's ONE command handler `handle()` (./src/rpc.mjs), its EntryRecords (dist/entries.d.ts)
//   and its `get_fork_messages` candidates.
// DROPPED from pi's own interactive layer, on purpose and NAMED in the capability matrix rather than
// silently: pi's `InteractiveMode` and its selector dialogs (/fork, /settings, /model's selector),
// pi's autocomplete dropdown (which is pi's command menu, not /help), pi's session FILES, and every
// built-in this harness has no plane for - each is refused BY NAME with pi's own `description`.
//
// WHY THE FEED IS ONE KEYSTROKE PER CHUNK: measured, not assumed - piDockLoop's scripted feed appends
// "\n", which pi-tui's Editor is NOT (its ENTER is "\r"), so a whole-line chunk draws and submits
// nothing. A real terminal hands one keystroke per chunk, so that is what this demo feeds: characters
// plus "\r" as ENTER, with keystrokes: true.
//
// The store rows are read through src/readapi.mjs' ONE opener, never through a second one, and the
// dock never opens storage or claims a lock - cli.mjs' main try/finally still owns claim/release/close.
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { claimWriter, releaseWriter, readOwner } from "../src/ownership.mjs";
import { harnessInvocation, settleInvocation } from "../src/cli-intent.mjs";
import { openStore, readEntries, listConversations } from "../src/readapi.mjs";
import { handle } from "../src/rpc.mjs";
import { piBuiltinSlashCommands, piBuiltinExtensionCommands, piSlashOf } from "../src/slashplane.mjs";
import { piDockLoop } from "../src/tui/pidockloop.mjs";
import { entryText } from "../src/tui/piscreen.mjs";
import { scriptTurn } from "../src/core.mjs";
import { TuiAltScreen } from "@earendil-works/pi-tui";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";

const checks = [];
function record(ok, label, detail = "") {
 checks.push({ ok, label });
 console.log(`  ${ok ? "ok " : "NOT"} ${label}${detail ? `: ${detail}` : ""}`);
}

function captureTerminal(columns, rows, sink) {
 const terminal = {
  start: (onInput, onResize) => {},
  stop: () => {},
  write: (data) => { sink.push(data); },
  moveBy: () => {},
  hideCursor: () => {},
  showCursor: () => {},
  clearLine: () => {},
  clearFromCursor: () => {},
  clearScreen: () => {},
  setTitle: () => {},
  setProgress: () => {},
  drainInput: async () => [],
 };
 Object.defineProperty(terminal, "columns", { get: () => columns });
 Object.defineProperty(terminal, "rows", { get: () => rows });
 Object.defineProperty(terminal, "kittyProtocolActive", { get: () => false });
 return terminal;
}

async function main() {
 const dir = mkdtempSync(join(tmpdir(), "dh-slash-"));
 const store = join(dir, "s.sqlite");
 const marker = "the settled marker row under the dock";

 // 1) One writer claims the store, so the dock is drawing the conversation THIS process owns.
 const claim = claimWriter(store);
 record(claim.mode === "writer" && readOwner(store).owned && readOwner(store).lock.pid === process.pid,
  "this process claimed the store before the dock opened",
  `pid=${process.pid} lock=${claim.path}`);

 // 2) The real composition - pi's settings, providers, packages, theme - the same plane every surface uses.
 const parts = await harnessInvocation({ store, cwd: dir, faux: marker, messages: [] }, { context: BACKGROUND_CONTEXT });
 record((parts.resources?.packages ?? []).length > 0,
  "the slash run composed pi's package plane before the dock opened",
  `packages=${(parts.resources?.packages ?? []).length} themes=${(parts.resources?.themes ?? []).length}`);

 // A settled turn FIRST: /copy, /session and /tree are reads over committed rows, and pi's dock seeds
 // its Editor history from them, so the conversation has to have content before any command runs.
 scriptTurn(parts.faux, ["seed-answer"]);
 const seed = await parts.conversation.submit({ type: "input", content: "the settled question", requestId: "slash-seed-1" }, BACKGROUND_CONTEXT);
 parts.settlements.push(seed.id);
 await settleInvocation(parts);
 record((await transcriptTexts(store)).some((row) => row.text === "seed-answer"),
  "a settled turn is committed on the store this process owns before the dock is drawn");

 const WIDTH = 72;
 const TALL = 24;
 const sink = [];
 const ui = new TuiAltScreen(captureTerminal(WIDTH, TALL, sink), false, undefined);
 ui.start();

 // piDockLoop's `report` is where the decision lines go; capturing them into an ARRAY is what lets the
 // checks below compare pi's own words instead of grepping a screen.
 async function feed(text) {
  const lines = [];
  const before = (parts.settlements ?? []).length;
  const keys = [...Array.from(`${text}\r`)];
  const tally = await piDockLoop({
   parts,
   ui,
   size: () => ({ columns: WIDTH, rows: TALL }),
   context: BACKGROUND_CONTEXT,
   keystrokes: true,
   reader: () => keys,
   report: (line) => lines.push(line),
  });
  await settleInvocation(parts);
  return { tally, lines, grew: (parts.settlements ?? []).length - before, decision: tally.slash[0] };
 }

 // pi's OWN tables, read here so the checks compare pi's data against pi's data, never a string typed
 // into this file.
 const builtins = piBuiltinSlashCommands();
 const extension = piBuiltinExtensionCommands();
 const builtinOf = Object.fromEntries(builtins.map((entry) => [entry.name, entry]));

 // 3) pi's built-in EXTENSION commands are refused BY NAME, BEFORE the draft is submitted - pi's own
// dock order (docs/extensions.md: a `/` draft is checked for extension commands first), measured at
// this pin: without the refusal `/llama` and `/mcp` fell through and became agent admissions.
 scriptTurn(parts.faux, ["a1", "a2", "a3", "a4", "a5", "a6"]);
 for (const name of extension) {
  const ran = await feed(`/${name.name}`);
  const expected = `refused: /${name.name} - ${name.description}; pi registers it in ${name.module}, a built-in extension this harness does not load`;
  record(ran.decision?.handled === "refused" && ran.tally.submitted === 0
   && ran.lines.includes(expected),
   `pi's built-in extension command /${name.name} is refused BY NAME with pi's description and the module that registers it`,
   `lines=${JSON.stringify(ran.lines)} submitted=${ran.tally.submitted} module=${name.module}`);
 }

 // 4) pi's built-ins this harness has no plane for: pi's OWN `description` string, read off pi's builtin
// table, is what gets printed - the check compares it to that same entry, so no wording is invented.
 for (const name of ["settings", "export"]) {
  const ran = await feed(`/${name}`);
  const printed = ran.lines[0] ?? "";
  const described = printed.startsWith(`refused: /${name} - ${builtinOf[name].description};`);
  record(ran.decision?.handled === "refused" && ran.tally.submitted === 0 && described,
   `pi's built-in /${name} is refused by name using pi's own description, unchanged`,
   `pi's description=${JSON.stringify(builtinOf[name].description)} printed=${JSON.stringify(printed)}`);
 }

 // 5) /fork is a BY-NAME refusal naming pi-durable's candidates: pi matches `/fork` EXACTLY only and
// opens its OWN message selector, which this harness does not compose.
 const candidates = (await handle(parts, { type: "get_fork_messages" }, null))?.data?.messages ?? [];
 const forked = await feed("/fork");
 const forkLine = forked.lines[0] ?? "";
 record(forked.decision?.handled === "refused" && forked.tally.submitted === 0
  && forkLine.startsWith(`refused: /fork - ${builtinOf.fork.description};`)
  && candidates.length > 0 && candidates.every((row) => forkLine.includes(String(row.entryId))),
  "/fork is refused by name with pi's description and pi-durable's candidate EntryIds from get_fork_messages",
  `candidates=${JSON.stringify(candidates.map((row) => row.entryId))} printed=${JSON.stringify(forkLine)}`);
 const forkArgs = await feed("/fork 2");
 record(forkArgs.decision?.handled === "fallthrough" && forkArgs.tally.submitted === 1,
  "pi's dock matches /fork EXACTLY only, so /fork 2 is pi's Normal message submission (one admission)",
  `submitted=${forkArgs.tally.submitted}`);

 // 6) an unknown name keeps pi's Normal message submission, and keeps pi's /skill:name expansion alive.
 const bogus = await feed("/bogus-xyz");
 record(bogus.decision?.handled === "fallthrough" && bogus.tally.submitted === 1
  && (await transcriptTexts(store)).some((row) => row.text === "/bogus-xyz"),
  "/bogus-xyz is not a pi command, so it falls through to exactly ONE admission",
  `submitted=${bogus.tally.submitted} lines=${JSON.stringify(bogus.lines)}`);

 // 7) pi's `!cmd` is HONOURED through rpc.mjs' existing bash verb; pi's `!!cmd` is the same verb with
// the excludeFromContext flag, and pi's documented rule says the output reaches the model on the NEXT
// prompt, so only the `!` form queues follow-up input (measured: settlement growth 1 vs 0).
 const included = await feed("!printf hi");
 const excluded = await feed("!!printf secret");
 record(included.decision?.handled === "ran" && included.decision?.kind === "bash"
  && included.lines.some((line) => /^bash: exitCode=\d+ truncated=/.test(line))
  && included.lines.some((line) => line.startsWith("printf hi output: ")) && included.grew === 1,
  "`!printf hi` is honoured: the bash verb's answer reports pi-durable's exitCode/truncated fields and its output line, and its queued follow-up lands on parts.settlements",
  `lines=${JSON.stringify(included.lines)} grew=${included.grew}`);
 record(excluded.decision?.handled === "ran" && excluded.grew === 0
  && excluded.lines.some((line) => /^bash: exitCode=\d+ truncated=/.test(line)),
  "`!!printf secret` is honoured through the same verb with excludeFromContext, and queues no follow-up input (pi's rule)",
  `lines=${JSON.stringify(excluded.lines)} grew=${excluded.grew}`);
 const afterBash = await transcriptTexts(store);
 record(afterBash.some((row) => row.kind === "pi.user" && row.text.startsWith("Ran `printf hi`"))
  && afterBash.some((row) => row.kind === "pi.assistant"),
  "settling the queued follow-up committed pi's documented `Ran \`cmd\`` input row and an answer, so the queueing process reached a turn rather than parking input in pi.inbox",
  `users=${JSON.stringify(afterBash.filter((row) => row.kind === "pi.user").map((row) => row.text))}`);

 // 8) the honoured reads print pi-durable's OWN field names and numbers (the JSON is pi-durable's record,
// not prose written here).
 const session = await feed("/session");
 const statsLine = session.lines.filter((line) => line.startsWith("get_session_stats:"))[0] ?? "";
 const stateLine = session.lines.filter((line) => line.startsWith("get_state:"))[0] ?? "";
 record(session.decision?.handled === "ran" && statsLine.includes("sessionFile=") && statsLine.includes("userMessages=")
  && statsLine.includes('tokens={"') && stateLine.includes('model={"provider":"faux"') && stateLine.includes("messageCount="),
  "/session answers with pi-durable's get_session_stats + get_state fields, including its token record (no [object Object])",
  `stats=${JSON.stringify(statsLine)} state=${JSON.stringify(stateLine)}`);
 const copy = await feed("/copy");
 const lastText = (await handle(parts, { type: "get_last_assistant_text" }, null))?.data?.text;
 record(copy.decision?.handled === "ran" && copy.lines.some((line) => line === `copy: ${JSON.stringify(lastText)}`),
  "/copy prints pi-durable's get_last_assistant_text answer verbatim",
  `lines=${JSON.stringify(copy.lines)} pi-durable=${JSON.stringify(lastText)}`);
 const tree = await feed("/tree");
 record(tree.decision?.handled === "ran" && tree.lines.some((line) => /^get_tree: leafId=\d+/.test(line))
  && tree.lines.some((line) => line.startsWith("get_tree branch: ")),
  "/tree prints pi-durable's get_tree leafId and its branch entries",
  `lines=${JSON.stringify(tree.lines)}`);
 const clone = await feed("/clone");
 record(clone.decision?.handled === "ran" && clone.lines.some((line) => /^clone: conversationId=\d+ at=\d+/.test(line)),
  "/clone runs pi-durable's clone verb and reports its {conversationId, at}",
  `lines=${JSON.stringify(clone.lines)}`);
 const fresh = await feed("/new");
 record(fresh.decision?.handled === "ran" && fresh.lines.some((line) => /^new_session: conversationId=\d+/.test(line)),
  "/new runs pi-durable's new_session verb and reports the new conversationId",
  `lines=${JSON.stringify(fresh.lines)}`);
 const compact = await feed("/compact");
 record(compact.decision?.handled === "ran" && compact.lines.some((line) => /^compact: taskId=\d+ settled=terminal/.test(line)),
  "/compact runs pi-durable's compaction task and reports its task id and settlement",
  `lines=${JSON.stringify(compact.lines)}`);
 const conversations = (await listConversations(await openStore(store))).length;
 record(conversations >= 3,
  "pi-durable's conversations grew as /clone and /new ran (the commands really changed durable state)",
  `conversations=${conversations}`);

 // 9) an honoured verb that needs an argument refuses rather than guessing, and prints pi-durable's
// candidates so the refusal is actionable.
 // 9) bare /model HONOURS pi-durable's OWN listing verb (pi's model plane's candidates, no names typed
//    here), `/model <ref>` writes the conversation's own Agent model, and an unknown ref is refused
//    before it can be written - MEASURED: a ref pi's plane does not know leaves the NEXT prompt with no
//    answer at all, so the gate answers before configure() runs.
 const modelless = await feed("/model");
 const listed = (await handle(parts, { type: "get_available_models" }, null))?.data?.models ?? [];
 record(modelless.decision?.handled === "ran" && modelless.tally.submitted === 0
  && listed.length > 0 && listed.every((model) => modelless.lines.includes(`model: provider=${model.provider} id=${model.id}`))
  && modelless.lines.some((line) => line.startsWith("get_available_models: models="))
  && modelless.lines.some((line) => line.startsWith(`model: /model ${builtinOf.model.argumentHint}`)),
  "bare /model lists pi-durable's get_available_models candidates and pi's own argumentHint, and admits nothing",
  `printed=${JSON.stringify(modelless.lines)}`);
 const agentBefore = await parts.conversation.agent(BACKGROUND_CONTEXT);
// pi's OWN ENTER rule, measured in pi-tui's dist/components/editor.js: while an autocomplete list is
// showing, ENTER is `tui.select.confirm` - it applies the selected item and only falls through to submit
// when pi's `autocompletePrefix` starts with `/` (a COMMAND completion). For an ARGUMENT completion (pi's
// `model` row's getArgumentCompletions) pi applies the completion and RETURNS, so the ref needs pi's
// second ENTER to run. The two ENTERs below are that rule, not a harness shortcut.
 const switched = await feed("/model faux/faux-1\r");
 const agentAfter = await parts.conversation.agent(BACKGROUND_CONTEXT);
 record(switched.decision?.handled === "ran" && switched.tally.submitted === 0
  && switched.lines.some((line) => /^set_model: provider=faux id=faux-1$/.test(line))
  && agentAfter?.model?.modelId === "faux-1",
  "the dock's /model <ref> (with pi's second ENTER, since pi's ENTER first accepts pi's argument completion) writes the conversation's own Agent.model through configure(), which is what piModelOf names in the header and footer",
  `agentBefore=${JSON.stringify(agentBefore?.model)} agentAfter=${JSON.stringify(agentAfter?.model)} printed=${JSON.stringify(switched.lines)}`);
 const badref = await feed("/model not/a-model");
 const agentStill = await parts.conversation.agent(BACKGROUND_CONTEXT);
 record(badref.tally.submitted === 0 && badref.lines.some((line) => line.startsWith("set_model: set_model must name"))
  && agentStill?.model?.modelId === agentAfter?.model?.modelId,
  "an unknown /model ref is refused with pi-durable's own error and leaves the answering model unchanged (no silent no-answer run)",
  `printed=${JSON.stringify(badref.lines)} agent=${JSON.stringify(agentStill?.model)}`);
 const thinking = await feed("/thinking");
 const levels = (await handle(parts, { type: "get_available_thinking_levels" }, null))?.data?.levels ?? [];
 record(thinking.decision?.handled === "refused" && levels.length > 0
  && levels.every((level) => (thinking.lines[0] ?? "").includes(level)),
  "/thinking lists pi-durable's available thinking levels in its refusal (pi-durable's MODEL_THINKING_LEVELS, not a list typed here)",
  `levels=${JSON.stringify(levels)} printed=${JSON.stringify(thinking.lines)}`);

 // 10) /help is a HARNESS ADDITION (pi ships no /help at this pin) and prints pi's own data.
 const help = await feed("/help");
 const helpMenu = help.lines;
 const builtinsNamed = builtins.filter((entry) => helpMenu.some((line) => line.startsWith(`/${entry.name}`)));
 record(!builtins.some((entry) => entry.name === "help") && help.decision?.handled === "ran"
  && builtinsNamed.length === builtins.length
  && extension.every((row) => helpMenu.some((line) => line.startsWith(`/${row.name}`) && line.includes(row.module))),
  "/help is NOT in pi's builtin table at this pin, and the menu it prints covers every pi builtin and every built-in extension command, each labelled with what THIS harness does with it",
  `builtins=${builtins.length} named=${builtinsNamed.length} menuLines=${helpMenu.length}`);
 record(helpMenu.some((line) => line.includes("honoured: pi-durable's verbs"))
  && helpMenu.some((line) => line.includes("refused by name: pi's own InteractiveMode"))
  && helpMenu.some((line) => line.includes("refused by name: pi asks for") && line.includes("/fork"))
  && helpMenu.some((line) => line.startsWith("/quit - ") && line.includes("honoured: leave through the ordinary cleanup")),
  "the menu labels honoured, refused-by-name, /fork's selector refusal and /quit, so the addition states the same policy the dock uses",
  `lines=${JSON.stringify(helpMenu.filter((line) => line.startsWith("/fork") || line.startsWith("/quit")))}`);

 // 11) /quit leaves through the ORDINARY cleanup and is never an admission.
 const quitRun = await feed("/quit");
 record(quitRun.tally.quit === "quit" && quitRun.tally.submitted === 0
  && quitRun.decision?.handled === "quit" && quitRun.lines.length === 0,
  "typing /quit leaves: the dock records why, submits nothing, and prints nothing of its own",
  `quit=${JSON.stringify(quitRun.tally.quit)} submitted=${quitRun.tally.submitted} slash=${JSON.stringify((quitRun.tally.slash ?? []).map((d) => d.handled))}`);

 // pi-durable's own quit-word rule is unchanged: a whole line of `quit` still leaves.
 const wordRun = await feed("quit");
 record(wordRun.tally.quit === "quit" && wordRun.tally.submitted === 0
  && wordRun.decision?.handled === "fallthrough",
  "a whole typed line of `quit` still leaves through pi-durable's quit-word rule (pi sees no command there)",
  `quit=${JSON.stringify(wordRun.tally.quit)} slash=${JSON.stringify((wordRun.tally.slash ?? []).map((d) => d.handled))}`);

 // 12) nothing typed as a slash command ever reached the ONE mutation line.
 const submittedTexts = [];
 const viewer = await openStore(store);
 const rows = [];
 for (const conversation of await listConversations(viewer)) {
  const page = await readEntries(viewer, conversation.id, { limit: 200 });
  rows.push(...page.items.map((entry) => ({ id: entry.id, kind: entry.kind, text: entryText(entry) })));
 }
 const slashTyped = ["/llama", "/mcp", "/settings", "/export", "/fork", "/model", "/thinking",
  "/session", "/copy", "/tree", "/clone", "/new", "/compact", "/help"];
 record(rows.filter((row) => row.kind === "pi.user").every((row) =>
   !slashTyped.some((name) => row.text === name || row.text === `${name} `)),
  "no slash command became a committed user row: writerSubmit stayed the ONE admission and never saw one",
  `users=${rows.filter((row) => row.kind === "pi.user").length}`);

 // 13) the ordinary cleanup runs and releases ownership, which is what leaving on /quit promises.
 await settleInvocation(parts);
 await parts.harness.close(BACKGROUND_CONTEXT);
 const released = releaseWriter(store);
 const owner = readOwner(store);
 record(released && !owner.owned,
  "leaving ran the ordinary cleanup: the Harness closed and this process released its claim",
  `released=${released} owner=${JSON.stringify(owner)}`);

 ui.clear();
 ui.requestRender();
 ui.stop();

 const failed = checks.filter((check) => !check.ok);
 console.log(`slash: ${checks.length - failed.length}/${checks.length} checks passed`);
 if (failed.length) process.exitCode = 1;
}

async function transcriptTexts(storePath) {
 const viewer = await openStore(storePath);
 const out = [];
 for (const conversation of await listConversations(viewer)) {
  const page = await readEntries(viewer, conversation.id, { limit: 200 });
  out.push(...page.items.map((entry) => ({ kind: entry.kind, text: entryText(entry) })).filter((row) => row.text));
 }
 return out;
}

await main();
