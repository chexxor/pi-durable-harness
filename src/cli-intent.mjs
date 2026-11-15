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
		excludeTools: flags?.excludeTools ?? [],
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
	const a = { messages: [], mode: null, store: null, conversation: null, faux: null, model: null, provider: null, systemPrompt: null, tools: null, excludeTools: [] };
	for (let i = 0; i < argv.length; i++) {
		const t = argv[i];
		if (t === "-p" || t === "--print") a.print = true;
		else if (t === "-c" || t === "--continue") a.continue = true;
		else if (t === "-r" || t === "--resume") a.resume = true;
		else if (t === "--no-session") a.noSession = true;
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
			// `--cwd` is fixture-only: the real CLI answers in the directory it is run in, and a fixture
			// has to run in a directory of its own.
			else if (name === "cwd") { a.cwd = value; i++; }
			else throw new Error(`unknown flag ${t}; the flags are --store, --mode <text|json|rpc>, -p/--print, -c/--continue, -r/--resume, --session <id>, --no-session, --model, --provider, --system-prompt, --tools, --exclude-tools, --faux`);
		} else a.messages.push(t);
	}
	if (a.mode && !["text", "json", "rpc"].includes(a.mode)) throw new Error(`--mode must be text, json, or rpc; got ${a.mode}`);
	return a;
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
export async function harnessInvocation(flags, { extraExtensions = [], context = BACKGROUND_CONTEXT } = {}) {
	const opened = intent(flags, { cwd: flags?.cwd ?? process.cwd() });
	const prior = await priorLines(opened.store, context);
	// Reopen is measured, not remembered: a second invocation in one directory reopens the store the
	// first one committed, and that is what `-c`/`--resume` are for.
	const reopened = prior.length > 0;
	const parts = await openHarness({
		cwd: opened.cwd,
		// `--no-session` is pi's own verb: no store file, so there is nothing to reopen and no line to
		// resume. pi-durable's in-memory Session is core.mjs's other opener.
		storePath: opened.noSession ? null : opened.store,
		agent: {
			// The offline plane is core.mjs's: pi-ai's faux provider, no credentials, no network.
			model: opened.model ? { provider: opened.provider ?? "faux", modelId: opened.model } : { provider: "faux", modelId: "faux-1" },
			...(opened.instructions ? { instructions: opened.instructions } : {}),
		},
		...(opened.tools ? { toolNames: opened.tools } : {}),
		...(opened.excludeTools.length ? { excludeTools: opened.excludeTools } : {}),
		...(extraExtensions.length ? { extraExtensions } : {}),
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
export async function rpcLine(parts, line, context = BACKGROUND_CONTEXT) {
	let msg;
	try {
	 msg = JSON.parse(line);
	} catch (err) {
	 return { ok: false, error: `invalid command: ${String(err?.message ?? err)}` };
	}
	// A submitted input is work this process should settle before it closes, so the next reopen finds
	// an answer rather than a parked run.
	// A submitted input is work this process should settle before it closes, so the next reopen finds
	// an answer rather than a parked run; the handle is kept below, and `settleInvocation` waits on it.
	if (msg?.command === "prompt") parts.settlements = [...(parts.settlements ?? [])];
	// The offline plane again: `--faux` scripts the reply a demo RPC turn gets with no key and no
	// network. A real run has none and a real provider answers instead.
	// @temp: src/rpc.mjs owns every verb; this file only feeds it the shared parts.
	if (parts.intent.faux && msg?.command === "prompt") scriptTurn(parts.faux, [parts.intent.faux]);
	try {
	 const answer = await handle(parts, msg);
	 if (msg?.command === "prompt" && answer?.submissionId !== undefined) parts.settlements.push(answer.submissionId);
	 return { ok: true, command: msg.command, ...answer };
	} catch (err) {
	 return { ok: false, command: msg.command, error: String(err?.message ?? err) };
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
 await parts.harness.waitForIdle(context);
 return parts;
}
