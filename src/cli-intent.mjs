// src/cli-intent.mjs - ONE entry seam for every CLI surface: flags -> intent -> ONE harness
// invocation -> surface-shaped output. print, JSON (NDJSON agent events) and RPC all take the SAME
// open, and so do the session verbs (`-p` print, `-c`/`--continue`, `-r`/`--resume`,
// `--session <id>` reopen).
//
// PROVENANCE: the entry seam is ~/Git/Durian-Pi/cli.mjs and ~/Git/Durian-Pi/intent.mjs (the verb
// entrypoint: one verb per process, flags resolved to one intent, one requestId printed so a caller
// can await the result), read 2026-11-15 at pin v1.5.1; src/cli-seam.mjs is that entrypoint's first
// import (the signal seam, whose other half this harness does not need - there is no resident broker
// here for a Ctrl-C to interrupt). What changed and why:
//   - the seat/broker spool half of intent.mjs is dropped outright: this harness has one store per
//     directory and no broker, so a verb that wants the store opens it through the ONE path below.
//     The case where another process ALREADY drives the store is not here either - src/ownership.mjs
//     and src/attach.mjs own it, and cli.mjs reaches them before this file is ever called;
//   - the ONE path lives here instead of inside cli.mjs: cli.mjs resolves its flags to this intent
//     shape and calls harnessInvocation, so no mode can quietly open its own Harness and no reopen
//     can quietly skip pi-durable's recovery. Durian-Pi's cli.mjs kept one openSession() for the
//     same reason;
//   - `--session-dir` is `--store` and pi's reopen-by-id `--session <id>` takes pi-durable's
//     ConversationId, because this harness has one SQLite store per directory instead of one session
//     file per session. The refusal for `--session-dir` is named in docs/package-support.md.
//
// Symbols checked against the pinned dist of @earendil-works 1.5.1, not assumed:
//   - pi flag spellings: dist/cli/args.js of @earendil-works/pi-coding-agent carries `--print`/`-p`,
//     `--mode` with "text" | "json" | "rpc", `--continue`/`-c`, `--resume`/`-r`, `--session`,
//     `--no-session`;
//   - dist/harness/types.d.ts: `resume(): void` on Harness - "Enable task scheduling. Idempotent;
//     throws after close" - and pi-durable's README: "harness.resume(); // continue any run the last
//     process left unfinished";
//   - dist/harness/types.d.ts: `ToolRegistration.replay?: "safe" | "unsafe"` - "Whether an interrupted
//     execution may rerun on recovery. Default `unsafe`.";
//   - dist/harness/tool.d.ts: ToolTaskCheckpoint phase "execute" carries `{ arguments, replay }`
//     ("Durable intent: the final arguments and the replay policy recorded before execution"), and
//     pi-durable's README states the rule this file relies on: "the tool reruns on reopen only when
//     it is declared `replay: \"safe\"`; otherwise the model gets an `interrupted` error result".
// Nothing here is invented: recovery and the replay rule are pi-durable's, and this file only decides
// WHEN a process enables them.

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { openStore, listConversations } from "./readapi.mjs";
import { openHarness, scriptTurn } from "./core.mjs";
import { agentPlane } from "./agentplane.mjs";
import { expandInput } from "./promptplane.mjs";
import { commandNames, handle } from "./rpc.mjs";

/**
 * The ONE intent shape. `flags` is a parse result: cli.mjs's `parseArgs(argv)` result or this file's
 * `parseFlags()`, which spells the flags the same way, so the CLI and every fixture resolve into one
 * record instead of two parsers agreeing by luck. Absent keys read as "not asked for".
 */
export function intent(flags, { cwd = process.cwd() } = {}) {
	const at = flags?.cwd ?? cwd;
	const messages = Array.isArray(flags?.messages) ? flags.messages : [];
	return {
		// pi's own `--mode` values are "text" | "json" | "rpc"; text is print mode answering with only
		// the final answer text, which is why print is the default and not a flag of its own.
		mode: flags?.mode === "json" ? "json" : flags?.mode === "rpc" ? "rpc" : "print",
		print: flags?.print ?? false,
		prompt: messages.join(" ").trim(),
		// pi's reopen verbs: `-c`/`--continue` and `-r`/`--resume` are one verb here, because one store
		// per directory is one root conversation line; `--session <id>` is the reopen-by-id verb.
		verb: flags?.conversation ? "reopen" : flags?.continue || flags?.resume ? "continue" : "open",
		conversationId: flags?.conversation ?? null,
		// `--store` is pi's `--session-dir`, pointed at one file: pi-durable's one storage opener.
		store: flags?.store ?? join(at, "harness.sqlite"),
		noSession: flags?.noSession ?? false,
		model: flags?.model ?? null,
		provider: flags?.provider ?? null,
		instructions: flags?.systemPrompt ?? null,
		tools: flags?.tools ?? null,
		// pi's `--thinking <level>` sets pi-durable's ONE conversation-level thinking choice
		// (Agent.thinkingLevel, dist/harness/types.d.ts AgentState); pi-ai's ModelThinkingLevel is the
		// vocabulary, and pi-durable rejects a level outside it rather than this file guessing one.
		...(flags?.thinking ? { thinking: flags.thinking } : { thinking: null }),
		excludeTools: flags?.excludeTools ?? [],
		// pi's per-resource opt-outs (--no-extensions/--no-skills/--no-themes/
		// --no-prompt-templates/--no-context-files): which kinds of pi package this run will not load.
		kindsOff: flags?.noKinds ?? [],
		faux: flags?.faux ?? null,
		cwd: at,
	};
}

/** The same intent from a plain argv, spelled exactly as pi spells the flags. A caller with its own
 * parser (cli.mjs, which carries more flags than this) hands its parse result to `intent()` instead.
 * An unknown flag is an error, never a guess: a dropped flag is how a user ends up writing into the
 * wrong store. `fixture` names flags a demo adds, and they are RECORDED ONLY - `intent()` ignores
 * them, so a fixture cannot smuggle a harness knob through a flag the real CLI does not have.
 * @temp: a value flag with nothing after it is an error, not `undefined`. */
export function parseFlags(argv, { fixture = [] } = {}) {
	const a = { messages: [], noKinds: [], mode: null, store: null, conversation: null, faux: null, model: null, provider: null, systemPrompt: null, thinking: null, tools: null, excludeTools: [] };
	for (let i = 0; i < argv.length; i++) {
		const t = argv[i];
		if (t === "-p" || t === "--print") a.print = true;
		else if (t === "-c" || t === "--continue") a.continue = true;
		else if (t === "-r" || t === "--resume") a.resume = true;
		else if (t === "--no-session") a.noSession = true;
		else if (t === "--thinking") { a.thinking = argv[i + 1]; i++; }
		else if (t.startsWith("--") && fixture.includes(t.slice(2))) { a[t.slice(2)] = argv[i + 1]; i++; }
		else if (t.startsWith("--")) {
			const name = t.slice(2);
			const value = argv[i + 1];
			if (name === "store") { a.store = value; i++; }
			else if (name === "mode") { a.mode = value; i++; }
			else if (name === "session" || name === "conversation") { a.conversation = value; i++; }
			else if (name === "model") { a.model = value; i++; }
			else if (name === "provider") { a.provider = value; i++; }
			else if (name === "system-prompt") { a.systemPrompt = value; i++; }
			else if (name === "tools") { a.tools = value.split(","); i++; }
			else if (name === "exclude-tools") { a.excludeTools = value.split(","); i++; }
			else if (name === "faux") { a.faux = value; i++; }
			// pi's per-resource opt-outs are booleans: which kind of pi package this run will not load.
			else if (name === "no-extensions") a.noKinds.push("extensions");
			else if (name === "no-skills") a.noKinds.push("skills");
			else if (name === "no-themes") a.noKinds.push("themes");
			else if (name === "no-prompt-templates") a.noKinds.push("prompts");
			else if (name === "no-context-files") a.noKinds.push("context");
			// `--cwd` is fixture-only: the real CLI answers in the directory it is run in, and a fixture
			// has to run in a directory of its own.
			else if (name === "cwd") { a.cwd = value; i++; }
			else throw new Error(`unknown flag ${t}; the flags are --store, --mode <text|json|rpc>, -p/--print, -c/--continue, -r/--resume, --session <id>, --no-session, --model, --provider, --system-prompt, --thinking <level>, --tools, --exclude-tools, --faux, --no-extensions/--no-skills/--no-themes/--no-prompt-templates/--no-context-files`);
		} else a.messages.push(t);
	}
	if (a.mode && !["text", "json", "rpc"].includes(a.mode)) throw new Error(`--mode must be text, json, or rpc; got ${a.mode}`);
	return a;
}

/**
 * The ONE input seam: text a user typed, through pi's expansion, to what the agent receives.
 *
 * print, JSON, TUI and RPC all answer through here (RPC's own path calls src/promptplane.mjs inside
 * src/rpc.mjs, which owns that path's queueing), so a `/template` and a `/skill:name` mean the same
 * thing wherever the user typed them. The plane is pi's own discovery: the templates and skills
 * src/packages/loader.mjs found for this cwd, and the commands the loaded pi packages register.
 */
export function expandRunInput(parts, text) {
	return expandInput(text, {
		templates: parts?.resources?.promptTemplates ?? [],
		skills: parts?.resources?.skills ?? [],
		commands: parts?.resources?.commands ?? [],
	});
}

/**
 * Which SURFACE a bare invocation opens, decided once so the CLI cannot both print and sit idle.
 *
 * pi's rule (docs/cli.md inside the pinned package) is the shape this follows: `-p`/a prompt prints and
 * exits, `--mode rpc` is the pipe protocol, and a plain run in a terminal is the interactive session.
 * The same words here: a TTY that was handed no prompt, no explicit mode and no `-p` gets the
 * interactive TUI (this process owns the store, so the typed line goes to Conversation.submit on that
 * one mutation line); anything else keeps print mode, because a scripted run that gets no prompt has
 * nothing to do and an interactive window in a pipe would hang there.
 */
export function chooseSurface(flags = {}, { isTty = false } = {}) {
	if (flags.mode === "rpc") return "rpc";
	// A prompt, -p, or an explicit --mode names work for this run: it prints and exits. `--faux` does NOT
	// force print: it names WHICH provider answers (pi-ai's scripted faux plane, so an offline run in a
	// terminal still gets an answer), not which surface the user asked for.
	const asked = (flags.messages?.length ?? 0) > 0 || flags.print || flags.mode;
	if (asked) return "print";
	return isTty ? "tui" : "print";
}

/**
 * What this store's file already holds, measured BEFORE the open: pi-durable's opener writes the store
 * file when it first commits, so the file's presence is the opener's own claim that a committed line
 * exists. The ids come from src/readapi.mjs, which opens pi-durable's `readOnly` Harness - a reopen
 * probe that structurally cannot start a second mutation line.
 */
export async function priorLines(storePath, context = BACKGROUND_CONTEXT) {
	if (!storePath || !existsSync(resolve(storePath))) return [];
	const store = await openStore(storePath);
	const rows = await listConversations(store);
	// Closed here, not left open: this process opens its mutation line through core.mjs's storage
	// opener below, and holding two connections to one SQLite file across a reopen is a question for
	// pi-durable's Storage close, not one to leave to the garbage collector.
	// @temp: close takes the context (dist/storage/*.d.ts closes take a Context).
	await store.harness.close(context);
	await store.storage.close(context);
	return rows.map((row) => row.id);
}

/**
 * The ONE harness invocation: every surface and every verb goes through here, once per process.
 * It opens through src/core.mjs (storage -> registry -> tools -> env -> Harness.open -> root
 * conversation), then applies the session VERB to that same open:
 *
 *   - `resume()` is what lets a reopened process continue the run the previous process left
 *     unfinished ("Enable task scheduling. Idempotent"). It is called for the continue/resume verb,
 *     for the reopen-by-id verb, and for any open of a store that already has committed lines -
 *     leaving recovery parked there would mean a run that answers nothing, forever.
 *   - the replay rule itself is pi-durable's, not ours: a tool task commits its intent (phase "execute"
 *     carries `{ arguments, replay }`) BEFORE `execute()` runs, and recovery reruns only when the
 *     stored policy and the currently registered tool both say `safe`. A call whose policy is unsafe
 *     settles as an `interrupted` error result, so the side effect a dead process already performed
 *     is never performed a second time by this open. `demo/cli.test.mjs` proves both halves.
 *   - `--session <id>` opens THAT conversation (`Harness.conversation(id, context)`), which is pi's
 *     reopen-by-id verb with pi-durable's ConversationId in place of a session file name.
 */
export async function harnessInvocation(flags, { extraExtensions = [], additionalResourcePaths = {}, context = BACKGROUND_CONTEXT } = {}) {
	const opened = intent(flags, { cwd: flags?.cwd ?? process.cwd() });
	const prior = await priorLines(opened.store, context);
	// Reopen is measured, not remembered: a second invocation in one directory reopens the store the
	// first one committed, and that is what `-c`/`--resume` are for.
	const reopened = prior.length > 0;
	// pi's WHOLE package plane is composed here, once, before the open: pi's settings.json (global +
	// project), pi's provider plane (pi's machine configs + pi-ai's faux provider for offline turns),
	// and pi's packages (extensions, skills, prompt templates, themes, AGENTS.md context files) mapped
	// onto pi-durable extensions by src/packages/adapter.mjs. Every surface - print, JSON, RPC, TUI -
	// therefore runs on the SAME plane, and no mode can quietly open a harness that never saw pi's
	// packages. An explicit --model always names the model; pi's settings default applies only when the
	// caller says a real model may answer (opts.realModel), and this file sets that key from ONE
	// rule: pi-ai's faux plane answers ONLY a run that spelled `--faux`.
	// WHO answers this run, in pi's own terms: an explicit `--model` names the model; `--faux` names
	// pi-ai's scripted offline plane; anything else is a normal pi run, which answers with pi's
	// settings default model through pi's provider plane. The rule lives in ONE place, so print,
	// JSON, RPC and the TUI window cannot pick different models for the same flags.
	const realModel = !opened.faux;
	const plane = await agentPlane({
		cwd: opened.cwd,
		...(opened.model ? { modelRef: opened.model } : {}),
		// ONE key decides who answers: `--faux` says pi-ai's scripted plane, every other run says
		// pi's settings default may answer through pi's provider plane. `--model` names the model
		// either way; with `--faux` it names which id the script answers for.
		realModel,
		...(opened.provider ? { defaultProvider: opened.provider } : {}),
		kindsOff: opened.kindsOff,
		// pi's explicit resource paths (pi's `--extension/-e`, `--skill`, `--prompt-template <path>` at
		// invocation): handed to pi's OWN resource loader under pi's OWN option names
		// (DefaultResourceLoaderOptions' additionalExtensionPaths / additionalSkillPaths /
		// additionalPromptTemplatePaths, read off dist/core/resource-loader.d.ts at this pin), so pi's
		// loader decides what they load - no second discovery rule is written here. pi's `--theme <path>`
		// has no plane here and is refused by name (see docs/package-support.md).
		...(Object.keys(additionalResourcePaths).length ? { additionalResourcePaths } : {}),
	});
	const parts = await openHarness({
		cwd: opened.cwd,
		// `--no-session` is pi's own verb: no store file, so there is nothing to reopen and no line to
		// resume. pi-durable's in-memory Session is core.mjs's other opener.
		storePath: opened.noSession ? null : opened.store,
		// pi's settings.json (global + project), mapped onto pi-durable's names by src/settings.mjs -
		// including THIS project's compaction.enabled: false, which is what keeps pi's auto-compaction
		// out of a run here instead of leaving it to pi's defaults.
		settings: plane.settings,
		// pi's provider plane with pi-ai's faux provider armed beside it, so an offline run resolves
		// real refs but answers from the script rather than from a billed endpoint.
		models: plane.models,
			// the faux provider this plane armed beside pi's providers, so the surface below
			// scripts an offline turn against the SAME provider the plane holds.
			faux: plane.modelFaux,
		agent: {
			// The offline plane is core.mjs's: pi-ai's faux provider, no credentials, no network.
			// An explicit --model resolves through pi's provider plane by the prefix rule (src/providers.mjs);
			// otherwise the plane already decided the model (pi's settings default, or pi-ai's faux plane).
			model: opened.model
				? plane.modelRef ?? { provider: opened.provider ?? "faux", modelId: opened.model }
				: plane.agent?.model ?? { provider: "faux", modelId: "faux-1" },
			...(opened.instructions ? { instructions: opened.instructions } : {}),
		// pi-durable's Agent.thinkingLevel: pi's --thinking verb, no re-implementation of pi-ai's
		// ThinkingLevel schema here.
		...(opened.thinking ? { thinkingLevel: opened.thinking } : {}),
		},
		...(opened.tools ? { toolNames: opened.tools } : {}),
		...(opened.excludeTools.length ? { excludeTools: opened.excludeTools } : {}),
		// pi's package extensions install into the SAME registry as the harness's tools and the
		// tool surface's extras, in that order: pi-durable's registry replaces by extension name, so the
		// pi packages come last and land in pi-durable's wrap slot for a name the harness already offers.
		extraExtensions: [
			...extraExtensions,
			...(plane.durableExtensions ?? []),
		],
	});
	// The VERB, applied to the open the ONE path just made.
	// @temp: resume() before any submit, so recovery of a run a dead process left is decided before
	// @temp: new input can queue behind it.
	if (reopened || opened.verb === "continue" || opened.verb === "reopen") parts.harness.resume();
	if (opened.verb === "reopen") {
		const id = Number(opened.conversationId);
		// pi-durable's ConversationId is a number in this store (ids.d.ts mints them); a non-number
		// cannot name one, so the caller's spelling is reported rather than coerced.
	 if (!Number.isFinite(id)) throw new Error(`--session needs a conversation id, got ${JSON.stringify(opened.conversationId)}`);
		const openedConversation = await parts.harness.conversation(id, context);
		// A miss is reported with the ids that DO exist, which is what makes a wrong id debuggable
		// instead of a silent answer on the root conversation.
	 if (!openedConversation) throw new Error(`no conversation ${id} in ${opened.store}; the ids this store holds are ${prior.join(", ") || "none"}`);
		// Replaced, not wrapped: the reopened conversation IS the conversation this invocation answers
		// on, and every surface below reads `parts.conversation`.
		// @temp: harness.conversation(id) returns the store's handle for that id, so this is not a
		// @temp: second line of state.
		parts.conversation = openedConversation;
	}
	return {
		...parts,
		intent: opened,
		// WHICH model answers this run, as the plane that decided it named it: pi's `--model`, else pi's
		// settings default through pi's provider plane (a normal run), else pi-ai's faux plane (`--faux`
		// only). The interactive screen reads this to label its header and footer, so a real run says pi's
		// settings default there instead of falling back to faux/faux-1 - and a `--faux` run, whose
		// plane.modelRef stays null, still says pi-ai's faux plane. No model is guessed here.
		modelRef: plane.modelRef,
		// What this run's plane actually loaded: which pi packages answered, which pi verbs (commands/
		// shortcuts/flags) they register, and which kinds pi's own opt-out flags skipped. RPC's get_commands
		// and the TUI read this, so an inventory a user sees is measured from this run, not remembered.
		resources: {
			commands: plane.registrations?.commands ?? [],
			shortcuts: plane.registrations?.shortcuts ?? [],
			flags: plane.registrations?.flags ?? [],
			// pi's resource loader answers the extension kind as a RECORD ({extensions, diagnostics}), so
			// the list is read through that record rather than assumed to be a bare array.
			loaderExtensions: plane.resources?.extensions?.extensions ?? [],
			// the extension MODULES pi's loader named, loaded by pi's module loader, and the count the
			// adapter mapped onto pi-durable's registry - three different numbers a user can compare.
			extensionPaths: plane.extensionPaths ?? [],
			durableExtensions: plane.durableExtensions ?? [],
			skills: plane.resources?.skills ?? [],
			themes: plane.resources?.themes ?? [],
			promptTemplates: plane.resources?.prompts ?? [],
			contextFiles: plane.contextFiles ?? [],
			packages: plane.packages?.found ?? [],
			themeName: plane.themeName,
			// pi's settings this cwd answered with, and the settings keys pi-durable could not map: the run
			// names what crossed and what did not, rather than pretending pi's file was understood whole.
			settings: plane.settings ?? {},
			settingsPaths: plane.settingsPaths ?? [],
			unmappedSettings: plane.settingsUnmapped ?? [],
			skipped: plane.skipped,
		},
		planeWarnings: plane.warnings,
	 reopened,
	 priorLines: prior,
	 commands: commandNames(),
	 // What this invocation queued that has to reach an answer before the process closes.
	 // @temp: set by rpcLine for every `prompt` command.
	 // The submissions this invocation queued, in the order it queued them; `settleInvocation` waits on
	 // each, which is how "the process that queued this input reached an answer before it closed" is
	 // decided by pi-durable rather than guessed here.
	 settlements: [],
	};
}

/**
 * JSON mode: one agent event per NDJSON line. The record is pi-durable's committed entry - `kind` is
 * the entry kind pi-durable wrote, `id` its EntryId, `model` the message the provider saw or answered
 * - so a viewer counts events instead of reconstructing turns. A tool call that recovery settled
 * carries its diagnostics in `data`, which is what makes the unsafe-replay property readable straight
 * off this line (README: a result's diagnostics are kept in `data`).
 */
export function agentEvent(entry) {
	return {
		type: "entry",
	 kind: entry.kind,
	 id: entry.id,
	 ...(entry.model === undefined ? {} : { model: entry.model }),
	 ...(entry.data === undefined ? {} : { data: entry.data }),
	};
}

/**
 * print mode: only the final answer's text. The newest `pi.assistant` entry is the answer and only its
 * `text` blocks are returned, because thinking blocks, tool calls and tool results are not what a
 * print-mode user asked for. pi-durable owns the turns; this only reads them.
 */
export function finalAnswerText(entries) {
	// pi-durable's own order: dist/harness/types.d.ts declares `entries(...)` as "Fork-aware history of
	// this conversation, newest first unless `query.order` is `ascending`", and core.mjs's `transcript`
	// hands that page over unchanged. So the FIRST assistant row is the newest answer; picking the last
	// one would print the first answer of a resumed conversation instead of the one just made.
	 const answer = entries.filter((e) => e.kind === "pi.assistant")[0];
	const content = answer?.model?.[0]?.content;
	const list = Array.isArray(content) ? content : typeof content === "string" ? [{ type: "text", text: content }] : [];
	return list.filter((c) => c?.type === "text").map((c) => c.text).join("\n").trim();
}

/**
 * RPC mode: one JSONL command in, one JSON answer out, through src/rpc.mjs' single handler - the SAME
 * handler the attach socket serves, so a client and an in-process caller cannot drift apart. A line
 * that is not one of the commands is answered as a refusal, because a dead RPC server is a silent
 * client.
 * @temp: a line that is not parseable answers too, so one bad line cannot end the session. */
/** One RPC line in, pi's response record out, and (through `emit`) the run's session-event records.
 *
 * The record shape is pi's, spelled in docs/rpc.md and rpc-commands.md inside the pinned package:
 * in is `{id?, type: <command>, ...params}`, out is `{id?, type: "response", command, success, data}`,
 * where `id` only echoes an id the caller sent. The run a prompt started is kept on `parts.runs` so
 * `settleInvocation` awaits it before the process closes - which is what makes an RPC client that
 * sent a prompt and hung up still get pi-durable's answer on the same line, and what leaves the store
 * with an answer rather than a parked run when the next process reopens it.
 */
export async function rpcLine(parts, line, emit = null) {
 const requestedId = (() => {
  try {
   return JSON.parse(line)?.id ?? null;
  } catch {
   return null;
  }
 })();
 let msg;
 try {
  msg = JSON.parse(line);
 } catch (err) {
  // A malformed line is answered in pi's own words for a failed response, not swallowed: the
  // session keeps answering the commands that come after it.
  return {
   ...(requestedId ? { id: requestedId } : {}),
   type: "response",
   command: null,
   success: false,
   error: `invalid command: ${String(err?.message ?? err)}`,
  };
 }
 const verb = msg?.type ?? msg?.command ?? null;
 // The offline plane again: `--faux` scripts the reply a demo RPC turn gets with no key and no
 // network. A real run has none and a real provider answers instead.
 if (parts.intent.faux && verb === "prompt") scriptTurn(parts.faux, [parts.intent.faux]);
 try {
  const answer = await handle(parts, msg, emit);
  // The queued input is recorded on the shared path's settlement list, so an answer exists
  // before this process closes (the same rule print mode feeds).
  parts.settlements = [...(parts.settlements ?? []), ...(answer.settlements ?? [])];
  // The run it started (or joined) is awaited at close, which is pi's promise: a client may write
  // a prompt and hang up straight away, and the process that queued it still reaches an answer.
  if (answer.run) parts.runs = [...(parts.runs ?? []), answer.run];
  return {
   ...(requestedId ? { id: requestedId } : {}),
   type: "response",
   command: answer.command,
   success: answer.success,
   // pi's failed response record carries only `error` (docs/rpc-commands.md); adding a field
   // pi does not declare would make a client's parser diverge, so the reason goes into the message.
   ...(answer.success ? { data: answer.data } : { error: answer.error }),
  };
 } catch (err) {
  return {
   ...(requestedId ? { id: requestedId } : {}),
   type: "response",
   command: verb,
   success: false,
   error: String(err?.message ?? err),
  };
 }
}

/**
 * The work this invocation queued, resolved to committed state before the process closes. print and
 * JSON wait on their own conversation; RPC answers each line first and then waits, so an RPC client
 * that sent a prompt and hung up still gets pi-durable's answer on the same mutation line - and a
 * process that dies before this point is, by pi-durable's rules, a reopen that resumes instead.
 * @temp: Harness-level rather than conversation-level, because a queued prompt is not the
 * @temp: conversation's own input. */
export async function settleInvocation(parts, context = BACKGROUND_CONTEXT) {
	// Nothing was queued and no prompt came from the CLI: an attach/read invocation has no work to
	// settle, and waiting here would be a wait on an empty scheduler.
 for (const id of parts.settlements ?? []) {
		const submission = await parts.harness.submission(id, context);
		if (!submission) continue;
		await submission.wait(context);
	}
 // The runs an RPC session started are awaited too: pi's client writes a command, reads the
 // response, and may hang up straight away, so "the process that queued this input reached an
 // answer before it closed" is the promise pi's own protocol makes, not a courtesy.
 for (const run of parts.runs ?? []) {
  try {
   await run;
  } catch {
   // A failed stream already reported through pi's error channel (src/pievents.mjs emits
   // `extension_error`); closing the session is not the place to rethrow it.
  }
 }
 await parts.harness.waitForIdle(context);
 return parts;
}
