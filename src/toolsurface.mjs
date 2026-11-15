// src/toolsurface.mjs - the tool surface: pi-durable's coding tools, one tool of our own, and the
// call-time guard, as extensions a registry installs.
//
// PROVENANCE: extracted from ~/Git/Durian-Pi/src/seattools.mjs (toolset + the environment it must
// agree with) and ~/Git/Durian-Pi/src/seatguard.mjs (a call-time guard on pi-durable's `hook`), read
// 2026-11-15 at pin v1.5.1. Dropped: seats, verifier/coordinator tool removals, prepareWorkspace and
// per-item worktrees, the read-only command registry, broker spool rules, queue/genlock rules. Kept,
// with the reason quoted from seatguard.mjs's own header: a guard on a command STRING is "unsound by
// nature", it "narrows what is already confined", and a harness needs "Both, not either" - a
// confinement AND a guard. This harness drops src/confine.mjs, so the guard below is a narrowing and
// says so in the message the model receives.

import { createBashTool, createReadTool, createWriteTool, createEditTool } from "@earendil-works/pi-durable/tools";
import { ToolTask, defineExtension, defineTool, hook } from "@earendil-works/pi-durable";
import { obj, str, num, opt } from "@earendil-works/pi-schema";
import { join, resolve } from "node:path";

// CodingTools is one Extension (dist/tools/index.d.ts: "read, write, edit and bash; nothing installs
// it automatically") AND separate factories, so a caller wanting a smaller surface gets it honestly.
// `registry.install` replaces by extension NAME, which is the whole mechanism here: no unregister.
export function toolsetExtension(names = ["read", "write", "edit", "bash"]) {
	const known = { read: createReadTool, write: createWriteTool, edit: createEditTool, bash: createBashTool };
	const unknown = names.filter((name) => !known[name]);
	if (unknown.length) throw new Error(`unknown tool names ${unknown.join(", ")}; pi-durable ships ${Object.keys(known).join(", ")}`);
	return defineExtension({ name: "harness.tools", tools: names.map((name) => known[name]()) });
}

// Our own tool, so the surface is not only pi-durable's. `prepareArguments` is pi-durable's own
// pre-validation repair slot (dist/harness/types.d.ts: "Repair arguments models commonly get wrong
// before validation, such as a JSON string where an array belongs. Must be pure and must not mutate
// args; it runs again when a call is retried before its intent is recorded"). The coercion lives in
// that slot, not inside `execute`, so it stays on the documented side of the commit.
// pi-schema's `opt` is the optional-property wrapper (dist/builders.d.ts); `repeat` is declared a
// number, so a model sending "2" as a string is what the repair slot below fixes before validation.
export const scratchNoteTool = defineTool({
	name: "scratch_note",
	description: "Append a note to harness-scratch.md in the conversation's cwd. repeat: a number, 1 by default.",
	parameters: obj({ text: str(), repeat: opt(num()) }),
	// @temp: verified at this pin: pi-durable's README example is `obj({ text: str(), count: num() })`,
	// @temp: and `defineTool` types `args` from it through pi-schema's `Static`. No min/max here: the
	// @temp: schema decides what was SENT, while the clamp below decides what is DONE - two different
	// @temp: answers, and a schema bound would give the wrong one for "asked for 5000".
	// @temp: code below.
	// @temp: the declaration follows this line.
	// @temp: nothing else is inside this note block.
	// @temp: the rules here are: the schema decides what was SENT, the clamp decides what is DONE.
	// Pure, and does not mutate the object it was handed (the contract quoted above). An absent
	// `repeat` stays absent rather than becoming 0: "no repeat" and "repeat zero times" differ.
	// Anything that is not a plain decimal string is left as it came, so the schema - not this
	// function - produces the `invalid_arguments` answer the model sees.
	prepareArguments: (args) => {
		const raw = args?.repeat;
		const repeat = typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : raw;
		return { text: args?.text, ...(repeat === undefined || repeat === null || repeat === "" ? {} : { repeat }) };
	},
	// @temp: ToolRegistration's `replay` takes "safe" | "unsafe" (dist/harness/types.d.ts). "safe" here
	// @temp: because this tool's only effect is line appends a reader can see, so a rerun after a crash
	// @temp: duplicates visibly. The unsafe case is proved in demo/attach.test.mjs on the built-in bash
	// @temp: tool, where a rerun WOULD re-run the command (README: "The built-in tool tasks keep the
	// @temp: default unsafe replay").
	replay: "safe",
	// @temp: verified at this pin: pi-durable's README shows `execute: async (args, api)` and the tool's
	// @temp: `api.env` is the conversation's ExecutionEnv; seattools.mjs's header is why env is CHECKED
	// @temp: rather than assumed - "a file tool without an environment has `api.env` undefined and every
	// @temp: call fails", and throwing is the documented answer ("Throwing from execute() gives the model
	// @temp: an error result").
	// The clamp is REPORTED: a model that asked for 5000 gets 20 and can read that it got 20. Math.max
	// on the low side keeps a requested 0/negative from meaning "no write", which a model could not
	// tell apart from a refused write. One call stays inside one phase (a phase reruns from its top).
	async execute(args, api, context) {
		// No environment means every file call fails (seattools.mjs's rule), so this answers loudly.
		// @temp: verified at this pin: env methods take (path, content, context) and return a Result
		// @temp: `{ ok, value?, error? }` (chord/result, dist/index.d.ts).
		// @temp: the path is a CONSTANT against the environment's cwd, so this tool takes no path from
		// @temp: the model at all - which is why it needs no path guard, and why the guard below lives
		// @temp: only on the tools that DO take paths.
	 if (!api?.env) throw new Error("scratch_note needs the conversation's execution environment; a tool installed without one has api.env undefined");
	 const requested = typeof args?.repeat === "number" ? args.repeat : 1;
	 const times = Math.min(20, Math.max(1, Math.trunc(requested)));
	 const path = join(api.env.cwd, "harness-scratch.md");
	 let written = 0;
	 for (let i = 0; i < times; i++) {
		// appendFile goes through the environment every other file tool uses: the "tools and their
		// environment have to agree" rule from seattools.mjs's header.
		// Increment BEFORE the check so a throw cannot report a count that never existed; the loop stops
		// at the first failure, so `written` only counts appends that succeeded. The FileError's own
		// message is quoted rather than paraphrased - a paraphrase would be a guess about a cause.
	 const append = await api.env.appendFile(path, `${Date.now()}\t${args?.text ?? ""}\n`, context);
	 written += 1;
		// @temp: end of the increment/check note (see the two sentences above for what it prevents).
	 if (!append?.ok) throw new Error(`scratch_note could not append to ${path}: ${append?.error}`);
	 }
		// The transcript stores only `output` and `details` (README), so both channels are filled. The
		// output line leads with the count so a reader can find it without parsing the model's free
		// text; `details` carries both the ask and the doing. `structuredOutput` is omitted because
		// this tool declares no `structuredOutputSchema`, and "Programs calling a tool without one
		// get its bounded output" (README). The count is the loop's own counter, read once: deriving a
		// second count from the file would be a second opinion about one number.
		// @temp: ToolRegistration's `details` extends JsonValue, so numbers stay numbers.
	 const line = `${written} line(s) appended to ${path}: ${args?.text ?? ""}`;
	 return { content: [{ type: "text", text: line }], output: [{ type: "text", text: line }], details: { requested, written, path } };
	 },
});

// The call-time guard, on pi-durable's `hook` of the built-in tool task: the shape is seatguard.mjs's
// (`defineExtension({ name, hooks: [hook(ToolTask, { beforeTool })] })`), and `beforeTool` returns
// `{ block: reason }`, where "the first `block` wins" and the model sees a `blocked` diagnostic.
// A deny rule here is a NARROWING, not a wall: the message the model receives says so, because
// seatguard.mjs's header says a guard on a command STRING is "unsound by nature" and this harness
// dropped confine.mjs, so its only confinement is a cwd and the process uid.
export function guardExtension(policy = {}) {
	const shellPatterns = (policy.shell ?? []).map((pattern) => new RegExp(pattern, "i"));
	const pathPatterns = (policy.paths ?? []).map((pattern) => new RegExp(pattern, "i"));
	// The cwd the caller configured: the harness knows it (core.mjs builds the environment from the same
	// value), and a hook cannot ask for it - see the note inside the write branch below.
	const root = policy.cwd ?? null;
	// @temp: verified at this pin: ToolHookCall carries {intent, tool, name, arguments} (dist/harness/
	// @temp: tool.d.ts), and Hook.beforeTool is "Before intent; the first `block` wins" (types.d.ts).
	// @temp: a non-string command is left to the schema: refusing would answer "blocked" for something
	// @temp: the tool would have answered `invalid_arguments` for, and those two answers differ.
	// @temp: `arguments` is the model's object as sent: pi-durable runs `prepareArguments` BEFORE the
	// @temp: intent is validated and recorded (README: "runs once after arguments are validated"), so
	// @temp: a guard reading `arguments` reads the model's own text, never a repaired value.
	// @temp: a hook that returns nothing means allow; one that returned { arguments } would REWRITE the
	// @temp: call, which this harness does not do (an argument repair belongs in `prepareArguments`,
	// @temp: because that slot runs again before the intent is recorded).
 const beforeTool = async (call, api, context) => {
	if (call?.name === "bash") {
	 const command = call?.arguments?.command;
	 if (typeof command === "string") {
	 for (const pattern of shellPatterns) {
	 if (pattern.test(command)) return { block: `the command matches a harness deny rule (${pattern.source}); a deny rule narrows what is already confined by the cwd and the process uid, it is not a wall` };
	 }
	 }
	}
	if (call?.name === "write" || call?.name === "edit") {
		// @temp: verified at this pin: HookApi (dist/harness/types.d.ts) declares taskId, conversationId,
		// @temp: models, memo(), entry(), entries() and DocumentReader reads - and NO env. A hook cannot
		// @temp: ask the conversation's environment to resolve a path, so a guard that guessed the PROCESS
		// @temp: cwd would answer for a different directory than the tools run in. The caller therefore
		// @temp: hands the guard the cwd it configured, and a guard with no cwd REFUSES: seatguard.mjs's
		// @temp: rule, "a seat write whose root the guard cannot name is REFUSED".
		if (!root) return { block: "the guard has no cwd for this call, so it cannot name the target path and the write is refused" };
		// node's resolve over the absolute cwd the caller gave - the same resolution the environment
		// applies, since both start from an absolute path.
		const absolute = resolve(root, call?.arguments?.path ?? "");
		for (const pattern of pathPatterns) {
			if (pattern.test(absolute)) return { block: `the target path matches a harness deny rule (${pattern.source})` };
		}
	}
	 };
	// An extension name is an identity in the registry, so two guards of this name replace each other
	// rather than stack.
 return defineExtension({ name: "harness.guard", hooks: [hook(ToolTask, { beforeTool })] });
}
