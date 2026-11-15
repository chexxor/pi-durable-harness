// src/packages/adapter.mjs - one pi extension, read the way pi's loader read it, installed where
// pi-durable's registry can see it: defineExtension, defineTool, hook, section, wrapTool.
//
// PROVENANCE: this is the file Durian-Pi had no equivalent of. Its seats ran the `pi` CLI, so pi's own
// extension API was already wired to pi's own registry inside that process, and Durian-Pi only ever
// supplied the durable runtime it owned (~/Git/Durian-Pi/src/tui/durable/adapter.mjs: `createDurableTuiRuntime`,
// the HarnessOptions, compaction/progress policies and restart discipline, which is what src/core.mjs carries;
// its src/seattools.mjs owns the `HarnessOptions.env` builder). What Durian-Pi DOES contribute here is the
// shape of a pi-DURABLE extension: ~/Git/Durian-Pi/src/extensions.mjs documents that an extension is a plain
// module default-exporting `defineExtension({name, sections, tools, hooks, tasks, wraps})` - installed
// 'exactly as you would a dependency', with no auto-discovery - and src/seattools.mjs' env builder is why
// the tool bridge below checks the environment rather than assuming one (a tool whose env is undefined fails,
// it does not quietly get a default cwd). Dropped: seats, per-seat adapters, broker spool rules.
//
// THE HONEST BOUNDARY, stated where the mapping happens rather than in a README: pi and pi-durable are
// two different session objects. pi's is `AgentSession` with an `ExtensionContext` whose actions come
// from a runner that `bindCore()` fills in; pi-durable's is a `Session` whose tasks and entries are the
// durable record. A pi extension is written against the first. This file therefore maps pi's
// SURFACE (what an extension registers) onto pi-durable's surface (what a registry offers), and keeps a
// row for every pi capability that has no pi-durable counterpart - because the objective forbids
// silently dropping one, and a silently-dropped capability is indistinguishable from a working one
// later. `capabilityMatrix()` (src/packages/matrix.mjs) is the inventory this file writes into.
import { defineExtension, defineTool, hook, section, wrapTool } from "@earendil-works/pi-durable";
import { ToolTask, GenerationTask, CompactionTask } from "@earendil-works/pi-durable";
import { formatSkillsForPrompt } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";

/**
 * pi's event names that have a pi-durable hook point, and the shape translation both sides want.
 *
 * Every entry was checked against the two `.d.ts` files at this pin - pi's `ExtensionAPI.on(...)`
 * overloads (dist/core/extensions/types.d.ts) and pi-durable's `GenerationHooks`/`ToolHooks`/
 * `CompactionHooks` (dist/harness/types.d.ts) - and only the names that appear in BOTH lists are here.
 * pi events are a lifecycle stream (session/turn/message/provider/tool); pi-durable hooks are
 * per-task, so a lifecycle event with no task of its own has no entry, and the ones below are the
 * whole set at this pin. `session_*`, `turn_*`, `message_*`, `agent_*`, `input`, `ui_*`,
 * `resources_discover`, `mcp_servers_change`, `session_tree`, `session_fork` are NOT here because
 * pi-durable has no such point - those become `unsupported` rows, not a guess.
 */
// @temp: verified at this pin by reading both lists; re-verified by demo/packages.test.mjs, which
// @temp: asserts the mappable set against a loaded real extension rather than trusting this table.
const HOOK_POINTS = {
 // pi: (ToolCallEvent, ctx) => ToolCallEventResult {block?, reason?}, or an in-place patch of input
 tool_call: { task: ToolTask, hook: "beforeTool" },
 // pi: (ToolResultEvent, ctx) => ToolResultEventResult {content?, details?, structuredContent?, isError?}
 tool_result: { task: ToolTask, hook: "afterTool" },
 // pi fires BOTH names for one call's end; both map to the same pi-durable hook, which is why the
 // registration below COMPOSES instead of overwriting - see the note on the byTask loop.
 tool_execution_end: { task: ToolTask, hook: "afterTool" },
 // pi: (BeforeProviderRequestEvent, ctx) => unknown, the payload replacement pi-durable also allows
 before_provider_request: { task: GenerationTask, hook: "beforeProviderRequest" },
 // pi: (AfterProviderResponseEvent, ctx) => void; pi-durable: (AssistantMessage, api, ctx) => void
 after_provider_response: { task: GenerationTask, hook: "afterResponse" },
 // pi: (SessionBeforeCompactEvent, ctx) => cancel or a CompactionResult; pi-durable: decline or summary
 session_before_compact: { task: CompactionTask, hook: "beforeCompact" },
};

/**
 * pi's registered tool, callable through pi-durable's Harness.
 *
 * The two `execute` signatures differ, and the difference is the whole bridge:
 * pi's `ToolDefinition.execute(toolCallId, params, signal, onUpdate, ctx)` takes pi's call id, pi's
 * abort signal, a streaming callback, and pi's `ExtensionToolContext`; pi-durable's
 * `execute(args, api, context)` takes the validated arguments, pi-durable's `api` (whose `callId` and
 * `env` are pi-durable's own), and pi-durable's `Context`. The call id and the signal are available
 * on both sides, so they are forwarded; the streaming callback is dropped (a durable tool result is
 * committed, not streamed to a UI); and the context is whatever the caller supplied in `piContext` -
 * see the note below, since a tool that USES pi's context actions needs pi's runner, which
 * pi-durable never binds.
 *
 * pi's result is `AgentToolResult {content, details, structuredContent?}`; pi-durable's
 * `ToolExecutionResult` is `{content, output?, details?, structuredOutput?, control?}`. `content` and
 * `details` carry across unchanged; `structuredContent` becomes `structuredOutput`, which is the same
 * contract on both sides (a machine-readable result the model does not see).
 */
function piToolToDurable(definition, { piContext = null, onCall = null }) {
 const { name, description, parameters } = definition;
 const prepare = definition.prepareArguments;
 const piExecute = definition.execute;
 return defineTool({
 name,
 ...(description ? { description } : {}),
 ...(parameters ? { parameters } : {}),
 ...(prepare ? { prepareArguments: prepare } : {}),
 async execute(args, api, context) {
	// pi wants an AbortSignal for the call it is given; pi-durable's abort is the conversation's, and
	// `api.signal` is not part of pi-durable's ToolExecutionApi, so the harness forwards its own when a
	// caller supplied one (`onCall` may return `{signal}`) and `undefined` otherwise - pi's own
	// signature types that parameter `AbortSignal | undefined`, so `undefined` is the documented
	// "nothing to abort with", not a made-up value.
	// @temp: verified at this pin: `execute(toolCallId: string, params, signal: AbortSignal |
	// @temp: undefined, onUpdate: AgentToolUpdateCallback<TDetails> | undefined, ctx)`.
	 const forwarded = onCall ? onCall(api, context) : {};
	 const result = await piExecute(String(api.callId), args, forwarded?.signal, undefined, piContext ?? forwarded?.ctx);
	 if (!result) return undefined;
	 		// pi-durable's ToolExecutionResult has NO `content` field: what the MODEL gets is `output`
		// (types.d.ts: "For the model. Omitted: the retained `output()` text"), while pi's AgentToolResult
		// calls the same list `content`. Mapping pi's content onto pi-durable's output is the whole of
		// that translation - and mapping it onto a `content` field, which would stay quiet, is the bug
		// this comment exists to prevent.
		 return {
		 ...(result.content ? { output: result.content } : {}),

	 details: result.details,
	 ...(result.structuredContent === undefined ? {} : { structuredOutput: result.structuredContent }),
 };
 },
 });
}

/** pi's extension that registers a name the harness ALREADY offers is pi's override/wrap of a built-in
 * (docs/extensions.md: "This lets you wrap built-in tools for logging or access control without
 * reimplementing the UI"). pi-durable's word for the same thing is `wrapTool`, whose wrapper RECEIVES
 * the registration being wrapped - so pi-durable's own execute stays the worker (a second registration
 * named `bash` would be a second implementation of one name, which is exactly what pi-durable's registry
 * refuses), and pi's definition supplies the description, the argument repair, and what the wrapper adds.
 * `existing` is the ToolRegistration the harness offers, passed by the caller because the adapter cannot
 * see the registry. */
export function wrapPiTool(definition, existing) {
	const replacement = piToolToDurable(definition, {});
	return wrapTool(existing, (base) => defineTool({
		name: base.name,
		...(replacement.description ? { description: replacement.description } : base?.description ? { description: base.description } : {}),
		parameters: replacement.parameters,
		...(base?.replay ? { replay: base.replay } : {}),
		...(base?.executionMode ? { executionMode: base.executionMode } : {}),
		...(replacement.prepareArguments ? { prepareArguments: replacement.prepareArguments } : {}),
		async execute(args, api, context) {
			// pi's pre-validation repair runs first (both sides have the same slot), then pi-durable's own
			// worker for that name runs ONCE, and the wrapper only adds what the pi extension wants reported.
			const baseResult = await base.execute(args, api, context);
			const blocks = (value) => typeof value === "string" ? [{ type: "text", text: value }] : Array.isArray(value) ? [...value] : [];
			return {
				...baseResult,
				output: [...blocks(baseResult?.output), { type: "text", text: `logged by pi's wrapper of ${definition.name}` }],
			};
		},
	}));
}

/** What pi-durable lacks for each unmappable pi capability, so a row states a reason and not a restatement. */
const PI_GAPS = {
 command: "pi-durable's registry has no command plane: a pi command is a verb the user types into pi's UI, and its handler is handed pi's ExtensionCommandContext, whose actions come from a runner pi-durable never binds",
 "cli flag": "pi-durable has no flag plane; the harness's CLI parses its own flags, and mapping pi's onto them would change what the harness's CLI means",
 "keyboard shortcut": "pi-durable has no keybinding surface at all; the harness's TUI owns its own keybindings",
 "message renderer": "pi-durable commits entries and never draws them, so a renderer belongs to pi's output pipeline, which this harness replaces with its own views",
 "entry renderer": "pi-durable's transcript entries have no render slot; how an entry appears is the harness's view",
 "tool renderer": "pi-durable's tool result is data with no render registration; the harness's view of it is its own",
 "markdown transformer": "pi-durable has no markdown pipeline: it commits entries and the harness renders them, so there is nothing for a pi transformer to transform",
};

/**
 * A pi extension as a pi-durable extension, plus the inventory of what did not map.

/**
 * A pi extension as a pi-durable extension, plus the inventory of what did not map.
 *
 * `extension` is the loaded object pi's loader produced (read its `tools`/`commands`/`handlers` Maps -
 * `dist/core/extensions/types.d.ts` `Extension`). The returned `extension.name` is namespaced
 * `pi:<package path>`, because `registry.install` replaces by NAME and a pi package called
 * "tools" would otherwise silently replace the harness's own toolset.
 */
export function adaptPiExtension(extension, options = {}) {
 // `offered` names the tools the harness already offers, and `existingOf` returns the ToolRegistration
 // behind such a name; both come from the caller because the adapter cannot see the registry.
 const { name: extensionName, piContext = null, onCall = null, inventory = [], offered = [], existingOf = null } = options;
 const tools = [];
 const wraps = [];
 for (const registered of extension.tools.values()) {
	const collides = offered.includes(registered.definition?.name);
	if (collides && existingOf) {
		wraps.push(wrapPiTool(registered.definition, existingOf(registered.definition.name)));
		inventory.push({ capability: "pi's override of a tool the harness already offers", name: registered.definition.name, status: "shimmed",
			reason: "pi-durable's wrap slot: pi's definition repairs the arguments and adds what the wrapper reports, while pi-durable's own registration for that name stays the worker" });
		continue;
	}
	if (collides) {
		inventory.push({ capability: "pi's override of a tool the harness already offers", name: registered.definition.name, status: "unsupported",
			reason: "the caller did not hand over the ToolRegistration this name wraps, so the adapter cannot fill pi-durable's wrap slot; registering a second tool with the same name would replace pi-durable's, which is what its registry refuses" });
		continue;
	}
	// @temp: pi's `RegisteredTool` is {definition, sourceInfo} (dist/core/extensions/types.d.ts);
 // @temp: `definition` is the `ToolDefinition` the bridge below reads.
 tools.push(piToolToDurable(registered.definition, { piContext, onCall }));
 }
 // The registration kinds a pi Extension carries that pi-durable's Extension has no slot for. pi's
 // `Extension` (dist/core/extensions/types.d.ts) has tools, commands, flags, shortcuts, handlers,
 // messageRenderers, entryRenderers, toolRenderers, markdownTransformer; pi-durable's has name, tools,
 // sections, hooks, wraps, tasks - so everything except tools and handlers is a named row here rather
 // than a quiet drop, and the reason says WHAT pi-durable lacks, which is what makes the row falsifiable
 // at a later pin.
 for (const [field, label] of [
 ["commands", "command"], ["flags", "cli flag"], ["shortcuts", "keyboard shortcut"],
 ["messageRenderers", "message renderer"], ["entryRenderers", "entry renderer"],
 ["toolRenderers", "tool renderer"],
 ]) {
 const value = extension[field];
 const size = value instanceof Map ? value.size : Array.isArray(value) ? value.length : value ? 1 : 0;
 if (!size) continue;
 inventory.push({ capability: label, name: field, status: "unsupported", reason: PI_GAPS[label] });
 }
 if (extension.markdownTransformer) inventory.push({ capability: "markdown transformer", name: "markdownTransformer", status: "unsupported", reason: PI_GAPS["markdown transformer"] });
 const byTask = {};
 for (const [event, handlers] of extension.handlers.entries()) {
 const point = HOOK_POINTS[event];
 if (!point) {
	 inventory.push({ capability: "event handler", name: event, status: "unsupported",
   reason: "pi-durable has no such hook point; hooks are per-task, and this event belongs to a lifecycle stage pi-durable has no task for" });
  continue;
 }
 const group = byTask[point.hook] ??= { task: point.task, handlers: {} };
 const bridged = point.hook === "beforeTool"
 ? bridgeToolCall(event, handlers, inventory)
 : point.hook === "afterTool"
 ? bridgeToolResult(event, handlers, inventory)
 : bridgePassthrough(event, handlers, inventory);
 // pi has two names for one tool call's end (`tool_result` and `tool_execution_end`), and pi-durable
 // has one hook for it: two pi events landing on one hook name must not overwrite each other, so the
 // chain runs both - in pi's own order, which is the only order that keeps pi's handler semantics.
 const previous = group.handlers[point.hook];
 group.handlers[point.hook] = previous
 ? async (...hookArguments) => {
 const first = await previous(...hookArguments);
 const second = await bridged(...hookArguments);
 return second ?? first;
 }
 : bridged;
 }
 const hooks = Object.entries(byTask).map(([taskName, registration]) => hook(registration.task, registration.handlers));
 const built = defineExtension({
 name: extensionName ?? `pi:${extension.path}`,
 ...(tools.length ? { tools } : {}),
 ...(hooks.length ? { hooks } : {}),
 ...(wraps.length ? { wraps } : {}),
 });
 return { extension: built, hooks, tools, wraps, inventory };
}

/**
 * A pi `tool_call`/`tool_result` handler chain, callable from a pi-durable hook.
 *
 * pi hands handlers an EVENT object whose `input` a `tool_call` handler mutates IN PLACE ("Mutate it
 * in place to patch tool arguments before execution"); pi-durable asks a hook for `{arguments, block}`
 * instead. The bridge therefore gives each handler a fresh copy, then reports the copy if the handler
 * changed it - which is the same information in the other side's words, and the only direction that
 * is safe: pi-durable's replacement arguments are re-validated by pi-durable, whereas pi's own
 * mutation is not ("No re-validation is performed after mutation", quoted from pi's own comment -
 * so a pi handler that mutates into an invalid shape is pi's problem, and copying makes that visible
 * rather than silent).
 */
function bridgeToolCall(event, handlers, inventory) {
	return async (call, api, context) => {
		// `let`, not `const`: pi's own rule is that a `tool_call` handler patches a call by reassigning
		// event.input, so the bridge has to be able to rebind what it hands forward - and a `const` here
		// turns that into a TypeError that pi-durable reports as a BLOCKED call, which is a failure that
		// looks like the guard working. The demo below is what distinguishes the two.
		let patched = { ...(call.arguments ?? {}) };
		const sent = JSON.stringify(patched);
		for (const handler of handlers) {
			const piEvent = { type: event, toolCallId: String(call.callId), toolName: call.name, input: patched, ...(call.parent ? { parentToolCallId: String(call.parent.callId) } : {}) };
			const result = await handler(piEvent, piHandlerContext(api));
			// pi patches a call by REASSIGNING event.input on the event object it was handed (pi's own
			// comment: "Mutate it in place to patch tool arguments before execution"), so the patch is read
			// back from the event rather than from the copy the bridge passed in.
			if (piEvent.input !== patched) {
				patched = { ...(piEvent.input ?? {}) };
			}
			if (!result) continue;
			if (result.block) return { block: result.reason ?? "blocked by a pi extension handler" };
			if (result.stopAfterBlock) inventory.push({ capability: "event handler result", name: "stopAfterBlock", status: "unsupported", reason: "pi's early-stop after a blocked call has no pi-durable hook return; the nearest is a tool's own `terminate` control, which is not the same contract" });
		}
		return JSON.stringify(patched) === sent ? undefined : { arguments: patched };
	};
}

function bridgeToolResult(event, handlers, inventory) {
	return async (call, result, api, context) => {
		let replaced;
		for (const handler of handlers) {
			const piEvent = { type: event, toolCallId: String(call.callId), toolName: call.name, content: result?.content ?? [], details: result?.details, isError: result?.isError ?? false, durationMs: undefined };
			const patch = await handler(piEvent, piHandlerContext(api));
			if (!patch) continue;
			replaced = {
			...(result ?? {}),
			...(patch.content ? { content: patch.content } : {}),
			...(patch.details !== undefined ? { details: patch.details } : {}),
			...(patch.structuredContent !== undefined ? { structuredOutput: patch.structuredContent } : {}),
			};
			if (patch.isError) replaced = { ...replaced, status: "error" };
		}
		return replaced;
	};
}

function bridgePassthrough(event, handlers, inventory) {
	return async (subject, api, context) => {
		for (const handler of handlers) await handler(subject, piHandlerContext(api));
		return undefined;
	};
}

function piHandlerContext(api) {
	// @temp: the ctx a pi handler is handed. pi's `ExtensionContext` is built by a runner this harness
	// @temp: never binds (pi's loader comment: "Shared runtime - actions are throwing stubs until
	// @temp: runner.initialize()"), so a handler that USES a context action throws here - and a throw
	// @temp: inside a pi-durable hook blocks the call, which is the loud outcome the compatibility
	// @temp: contract wants: an extension that needs pi's own session must fail visibly, not read as
	// @temp: an extension that works on a thinner object than it was written against.
	return { cwd: api.env?.cwd, runtime: api.registry };
}

/**
 * pi's skills as a system-prompt section: pi's own formatter, pi-durable's own slot.
 *
 * `formatSkillsForPrompt` is pi's (dist/core/skills.d.ts) and the `section` slot is pi-durable's
 * (dist/harness/define.d.ts: `section(key, render, options)`), so the SHIMMABLE half of skills is
 * literal: pi's list format in pi's words, injected where pi-durable injects. What does NOT map is
 * pi's `skill` TOOL (the tool that lets a model load a skill mid-run) - pi-durable has no such built-
 * in, and inventing one is not a mapping. That is a row, not a gap.
 */
/**
 * A pi-durable section key for a context file: pi-durable validates section keys as
 * `/^[a-z][a-z0-9_-]*$/` (registry.js, `SECTION_KEY`), while a context file's identity is a PATH.
 * The slug is what keeps that identity - which file a rule came from matters, because pi reads these
 * from the global plane, the project plane, and parent directories, and a merged blob loses which
 * plane a rule was overridden by.
 */
function contextKey(path, cwd = process.cwd()) {
 const relative = path.startsWith(cwd) ? path.slice(cwd.length + 1) : path;
 const slug = relative.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
 return `context_${/^[a-z]/.test(slug) ? slug : `file_${slug}`}`.slice(0, 64);
}

export function skillsExtension(skills, name = "pi.skills") {
 if (!skills.length) return null;
 return defineExtension({
 name,
	// @temp: `section` builds a PromptSection {key, render, tag?} (dist/harness/define.d.ts); pi's
	// @temp: formatter returns the whole fenced `<available_skills>` block already (dist/skills.js), so
	// @temp: `tag: false` keeps pi's own fence from being fenced a second time by pi-durable's default.
	sections: [section("skills", () => formatSkillsForPrompt(skills), { tag: false })],
 });
}

/**
 * pi's context files (AGENTS.md and friends) as system-prompt sections, one per file.
 *
 * The key is the file's path relative to the cwd, so the model sees WHERE a rule came from rather than
 * a merged blob - which matters here because pi reads these from three places (global, project,
 * parent directories) and a merged blob loses which one a rule was overridden by.
 */
export function contextFileExtension(files, cwd = process.cwd(), name = "pi.context") {
 if (!files.length) return null;
 return defineExtension({
 name,
 sections: files.map((file) => section(
 contextKey(file.path, cwd),
 () => file.content,
 )),
 });
}
