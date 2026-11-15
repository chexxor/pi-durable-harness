// src/rpc.mjs - one command handler, spoken by both the RPC stdin mode and the attach socket.
//
// PROVENANCE: the verb set and the RECORD SHAPE follow the RPC reference INSIDE the pinned package -
// node_modules/@earendil-works/pi-coding-agent/docs/rpc.md and docs/rpc-commands.md at pin v1.5.1,
// the same files scripts/audit-pi-docs.mjs re-reads. pi's protocol is:
//   - in:  one JSON record per line, `{"id": "...", "type": "<command>", ...params}`;
//   - out: `{"id": "...", "type": "response", "command": "...", "success": true, "data": {...}}`,
//     with session-event records streamed around it (docs/json.md is the canonical event reference);
//   - pi's exported `RpcClient` (dist/modes/rpc/rpc-client.d.ts) sends exactly `{...command, id}` and
//     reads `response.data`, so demo/rpc.test.mjs drives THIS handler through pi's own client.
// pi commands whose verb pi-durable has no plane for are answered with `success: false` and the reason
// they have none - never a silent no-op - and every one of them is a row in docs/package-support.md
// rather than a dropped name.
// Durian-Pi's seam kept here is the one-command-handler rule of src/cli-seam.mjs and its flag parser
// src/tui/durable/cliargs.mjs (read 2026-11-14/15 at pin v1.5.1): the attach socket and the RPC stdin
// mode call THIS handler, so a client and an in-process caller cannot drift apart.
// Seats, broker, cross-seat queue, genlock, per-item worktrees, metrics, check, constitution and
// selfdev are dropped outright - this harness is single-agent.
//
// Commands answer with COMMITTED durable state only: pi-durable's spec says only committed state is
// observable, so no reply guesses at work in flight. Every pi-durable verb used below was checked
// against the pinned dist (dist/harness/types.d.ts, dist/harness/{inbox,usage,submissions,compaction}.d.ts,
// dist/env/node.d.ts) rather than remembered.
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { InboxDoc } from "@earendil-works/pi-durable";
import { MODEL_THINKING_LEVELS } from "@earendil-works/pi-ai/providers/model-schema";
// pi's own token arithmetic, so this harness does not re-derive what a context token is
import { calculateContextTokens } from "@earendil-works/pi-coding-agent";
import { piEventsOf, queueUpdate } from "./pievents.mjs";
import { expandInput } from "./promptplane.mjs";
import { makeEnv } from "./executionenv.mjs";
import { readFeed } from "./eventfeed.mjs";

// pi's stdin commands, spelled as rpc-commands.md spells them, in the doc's own section order.
const PI_COMMANDS = [
	"prompt", "steer", "follow_up", "abort", "clear_queue", "new_session",
	"get_state", "get_messages",
	"set_model", "cycle_model", "get_available_models",
	"set_thinking_level", "cycle_thinking_level", "get_available_thinking_levels",
	"set_steering_mode", "set_follow_up_mode",
	"compact", "set_auto_compaction",
	"set_auto_retry", "abort_retry",
	"bash", "abort_bash",
	"get_session_stats", "export_html", "switch_session", "fork", "clone", "get_fork_messages",
	"get_entries", "get_tree", "get_last_assistant_text", "set_session_name", "get_commands",
];
// Verbs this harness adds on the same protocol; each is a row in docs/package-support.md.
const EXTRA_COMMANDS = ["status", "config", "read", "watch"];
// pi verbs pi-durable has no plane to answer, and the reason it has none. Answered as a refusal.
const UNSUPPORTED = {
	"cycle_model": "pi cycles among models scoped to a session; this harness has one agent model per conversation, changed by set_model - there is no scoped cycle to advance",
	"cycle_thinking_level": "pi-durable stores one Agent.thinkingLevel per conversation; set_thinking_level sets it, and pi's cycle is a UI convenience over that same field",
	"set_steering_mode": "pi-durable reads Settings.steeringMode once at Harness.open, so changing it mid-session would be a second settings plane; the harness takes it as settings instead",
	"set_follow_up_mode": "same as steeringMode: Settings.followUpMode is read at Harness.open, not per conversation",
	"set_auto_retry": "pi-durable's retry policy is Settings.retry (Harness-wide, read at open); only the settings this process opens change it, so there is no per-session switch to flip",
	"abort_retry": "the retry delay is pi-durable's GenerationTask state, not a submission a host can withdraw; abort withdraws the run instead",
	"abort_bash": "a bash command run here is one finished env.exec, not an in-flight bash task the harness can signal",
	"export_html": "this store is a pi-durable SQLite transcript, not a session file pi's SessionManager can render to HTML",
	"set_session_name": "pi-durable has no session display-name plane; a name would be a harness-owned doc nothing else reads",
	// new_session, switch_session, fork, clone and bash ARE answered - see the cases below, on
	// pi-durable's own conversation planes.
};

export function commandNames() {
	return [...PI_COMMANDS, ...EXTRA_COMMANDS].filter((name) => !UNSUPPORTED[name]);
}

/** pi's AgentMessage-ish records out of pi-durable entries: `entry.model` IS the message list
 * pi-durable put in the provider's context, so this reads it rather than rebuilding it. */
function messagesOf(entries) {
	return entries.flatMap((entry) => entry.model ?? []);
}

/** The text of a pi-ai message, only from its `text` blocks (thinking blocks are not the prose). */
function textOf(message) {
	// pi-durable stores a user message's content as a plain string or as pi-ai's content blocks.
	const content = message?.content;
	if (typeof content === "string") return content;
	// A toolResult's content blocks are tool output; joining them is what a viewer shows.
	if (!Array.isArray(content)) return "";
	return content.filter((c) => c?.type === "text").map((c) => String(c.text ?? "")).join("\n");
}

/** pi-durable's queued inputs, as pi's clear_queue/get_state see them.
 * Read from pi-durable's own InboxDoc (dist/harness/inbox.d.ts: InboxItem `{id, mode:
 * "steer"|"followUp", content}`), which IS the queue a boundary will select. */
async function queuedInputs(parts, conversationId = parts.conversation.id, context = BACKGROUND_CONTEXT) {
	// Session.snapshot on a ConversationDocToken is pi-durable's read of that conversation's doc.
	// @temp: a conversation that never queued anything has an inbox of {items: []} (measured).
	const inbox = await parts.harness.snapshot(InboxDoc, conversationId, context);
	const items = inbox?.items ?? [];
	const out = { steering: [], followUp: [] };
	for (const item of items) {
		// content is pi-ai's UserMessage content: a string, or content blocks.
		const text = typeof item.content === "string" ? item.content : textOf({ content: item.content });
		if (item.mode === "steer") out.steering.push(text);
		if (item.mode === "followUp") out.followUp.push(text);
	}
	 return { ...out, items };
}

/** pi's contextUsage = {tokens, contextWindow, percent}: pi-ai reports the usage of the newest
 * assistant response, and pi-ai's model metadata carries the window it belongs to. Nothing here is
 * re-estimated: a conversation with no assistant usage reports null, which is what pi does before
 * the first response too.
 */
async function contextUsageOf(parts, conversation, context) {
	const page = await conversation.entries({}, 40, undefined, context);
	const message = page.items.filter((e) => e.kind === "pi.assistant")[0]?.model?.[0];
	const usage = message?.usage;
	if (!usage || !message?.model) return null;
	const model = parts.models?.getModel?.(message.provider, message.model) ?? null;
	const window = model?.contextWindow ?? null;
	const tokens = Number(usage.totalTokens ?? 0);
	return {
		tokens,
		contextWindow: window,
		percent: window ? Math.round((tokens / window) * 100) : null,
	};
}

/** pi's SessionStats token totals, summed out of pi-durable's pi.usage buckets
 * (UsageState = {models: {provider/modelId: Usage}, tools: {name: Usage}}). Summing pi-durable's
 * own counters is arithmetic over its state, not a second ledger. */
/** pi's SessionStats.tokens = {input, output, cacheRead, cacheWrite, total}, added over every bucket
 * pi-durable's usage plane recorded for this Session. `total` is pi's OWN context-token arithmetic
 * (calculateContextTokens, exported by the pinned package from core/compaction): it prefers a bucket's
 * native totalTokens and falls back to the components, so this file never re-derives what a context
 * token is - and pi-durable's own addUsageState is not reachable at this pin, so the addition over
 * buckets is spelled here over pi-ai's Usage fields.
 */
function sumUsage(usage) {
 const buckets = [...Object.values(usage?.models ?? {}), ...Object.values(usage?.tools ?? {})];
 const total = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
 for (const field of ["input", "output", "cacheRead", "cacheWrite"]) {
  for (const bucket of buckets) total[field] += Number(bucket?.[field] ?? 0);
 }
 for (const bucket of buckets) total.total += calculateContextTokens(bucket);
 return total;
}

/** pi's SessionStats.cost, added over the same buckets - pi-ai reports cost per Usage, so the sum is
 * over pi-ai's own numbers rather than a price this harness computed.
 */
function sumCost(usage) {
 let cost = 0;
 for (const bucket of [...Object.values(usage?.models ?? {}), ...Object.values(usage?.tools ?? {})]) cost += Number(bucket?.cost?.total ?? 0);
 return cost;
}

/** pi's `queue_update` record (json.md: "both fields contain the complete current queue"), announced
 * once the caller has written the response - the same ordering pi's own client expects, which is why
 * one await on pi-durable's inspect() comes first rather than writing the record at once. */
async function announceQueue(parts, inbox, record, context = BACKGROUND_CONTEXT) {
	await parts.harness.inspect(context);
	record({ ...queueUpdate(inbox.steering, inbox.followUp) });
}

/** `emit` is the RPC session's event sink (stdout records); the attach socket passes nothing, so an
 * attached client gets its reply without filtering events. */
export async function handle(parts, msg, emit = null) {
	// `type` is pi's record field; `command` is the attach transport's spelling, so one handler
	// answers both. A record that spells neither is refused below.
	const command = msg?.type ?? msg?.command;
	const context = parts.context ?? BACKGROUND_CONTEXT;
	const record = (payload) => emit?.(payload);
	// The conversation this invocation answers on; session verbs may replace it (see new_session
	// and switch_session), which is why it is read from `parts` every time rather than captured.
	 const conversation = parts.conversation;

	if (UNSUPPORTED[command]) return { command, success: false, error: UNSUPPORTED[command] };

	switch (command) {
		// ---- pi's prompting verbs ----------------------------------------------
	 case "prompt":
	 case "steer":
	 case "follow_up": {
		// pi spells the body `message`; the attach transport's `text` alias is kept so the
		// multiplexer demo keeps its wording.
		// pi spells the body `message`; the attach transport's `text` alias is kept so the
		// multiplexer demo keeps its wording.
		const body = msg.message ?? msg.text;
		// pi expands skill commands and prompt templates BEFORE the input is queued (docs/rpc-commands.md
		// says exactly this for `prompt`/`steer`/`follow_up`: "Skill commands (/skill:name) and prompt
		// templates (/template) are expanded before sending/queueing"). The plane is pi's own discovery -
		// the templates and skills src/packages/loader.mjs found for this cwd - and a command a pi package
		// registers is refused by name, which is the other half of that sentence: "Extension commands are
		// not allowed (use prompt instead)".
		const expanded = expandInput(body, {
			templates: parts.resources?.promptTemplates ?? [],
			skills: parts.resources?.skills ?? [],
			commands: parts.resources?.commands ?? [],
		});
		if (expanded.expansion?.refused) return { command, success: false, error: expanded.expansion.refused };
		const bodyText = expanded.text;
		// pi's `streamingBehavior` and pi-durable's `whenBusy` are the SAME words ("steer"/"followUp"),
		// which is why this is a pass-through rather than a translation table.
		// steer and follow_up force their own behaviour; `prompt` takes whatever pi sent.
		const whenBusy = command === "steer" ? "steer" : command === "follow_up" ? "followUp" : (msg.streamingBehavior ?? msg.whenBusy);
		// pi's images are ImageContent blocks, placed after the text as pi-ai's user content.
		// Text-only input stays a plain string so the transcript shows what a user typed.
		// @temp: pi-ai's UserMessage content is `string | Content[]`; both are accepted here.
			const content = msg.images?.length ? [{ type: "text", text: bodyText }, ...msg.images] : bodyText;
		// pi's record id doubles as pi-durable's exactly-once admission key: a client that resends
		// the same id gets the EXISTING submission back, never a second input (admitSubmission).
		// @temp: a client with no id still needs one stable per attempt, so the process pins one.
	 const requestId = msg.requestId ?? msg.id ?? `rpc:${process.pid}:${command}`;
	 if (!body) return { command, success: false, error: `${command} needs a message` };
	 const submission = await conversation.submit(
	 { type: "input", content, requestId, ...(whenBusy ? { whenBusy } : {}) },
	 context,
	 );
	// pi's disposition answers "was the input accepted, and did it start a run here": pi-durable's
	// Submission status ("queued" | "placed" | "done") answers the same question.
	 const admission = await submission.status(context);
	// The entries this run adds are the ones after what the conversation held when the input was
	// admitted; the newest entry before admitting is pi-durable's own cursor for that.
	const before = await conversation.entries({}, 1, undefined, context);
	// A queued input did not start a run, so what pi's client hears next is pi's queue_update
 // record over pi-durable's inbox, not an agent_start for a run this input joined instead.
 const queueNow = admission.status === "queued" ? await queuedInputs(parts) : null;
// The run this input started (or joined) is streamed as pi's session-event records, but only
	// AFTER the caller has written the response - pi's own client reads the response first.
	// `run` returns a promise the RPC loop starts and awaits at close, so the process that queued
	// this input is also the process that reached an answer before it closed.
	 return {
	 command,
	 success: true,
	 data: {
	 disposition: admission.status === "queued" ? "queued" : "started",
	 submissionId: submission.id,
	 requestId,
	 whenBusy: whenBusy ?? null,
	 },
	 settlements: [submission.id],
	 run: queueNow ? announceQueue(parts, queueNow, record, context) : runEvents(parts, submission.id, (before.items[0]?.id ?? 0) + 1, context, record),
	 };
	}

	 case "abort": {
	// pi-durable's own abort: withdraw queued inputs, mark and signal the live scope, wait idle.
	 await conversation.abort(context);
	 return { command, success: true, data: { aborted: true, queued: (await queuedInputs(parts)).items.length } };
	}

	 case "clear_queue": {
	// pi's clear_queue removes the queued steering/follow-up text and returns it. pi-durable's
	// InboxDoc is that queue; abortSubmission(id) is what withdraws one queued item.
	 const queued = await queuedInputs(parts);
	 const withdrawn = [];
	 for (const item of queued.items) withdrawn.push(await parts.harness.abortSubmission(item.id, context, conversation.id));
	 // pi announces the queue it just emptied with the same queue_update record.
 return { command, success: true, data: { steering: queued.steering, followUp: queued.followUp, withdrawn },
  run: announceQueue(parts, await queuedInputs(parts), record, context) };
	}

	 // ---- state ------------------------------------------------------------
	 case "get_state": {
	 const agent = await conversation.agent(context);
	 const inspect = await parts.harness.inspect(context);
	 const queued = await queuedInputs(parts);
	 const page = await conversation.entries({}, 500, undefined, context);
	 // pi's RpcSessionState fields, answered from pi-durable's state: `sessionFile` is this store
	 // (one store per directory, not one file per session) and `sessionId` is the ConversationId.
	 return {
	 command,
	 success: true,
	 data: {
	 model: agent?.model ?? null,
	 thinkingLevel: agent?.thinkingLevel ?? null,
	 isStreaming: inspect.tasks.some((task) => task.state?.kind === "running"),
	 isCompacting: inspect.tasks.some((task) => String(task.record?.kind ?? "").includes("compact") && task.state?.kind === "running"),
	 // pi's steering/follow-up MODES are settings of its own message queue; this harness queues input
	 // on pi-durable's InboxDoc instead, so these keys are only spelled when a setting spells them:
	 // an absent key is honest where a made-up default would claim a mode nothing set.
	 ...(parts.settings?.steeringMode ? { steeringMode: parts.settings.steeringMode } : {}),
	 ...(parts.settings?.followUpMode ? { followUpMode: parts.settings.followUpMode } : {}),
	 sessionFile: parts.intent?.store ?? null,
	 sessionId: String(conversation.id),
	 // pi-durable keeps the compaction switch on the conversation's AgentRecord, which is where
	 // set_auto_compaction wrote it - so this reads the durable answer, not a remembered flag.
	 autoCompactionEnabled: agent?.compaction?.enabled ?? null,
	 messageCount: page.items.length,
	 pendingMessageCount: queued.items.length,
	 queuedText: { steering: queued.steering, followUp: queued.followUp },
	 },
	 };
	}

	 case "get_messages": {
	 const page = await conversation.entries({}, Math.min(msg.limit ?? 200, 500), undefined, context);
	 return { command, success: true, data: { messages: messagesOf(page.items) } };
	}

	 case "get_entries": {
	// pi's `since` is a durable cursor over an append-only transcript; pi-durable's EntryId IS that
	// cursor, so minEntryId is the same verb on this store.
	// pi's per-entry `parentId` has no counterpart at this pin: EntryRecord carries no parent field
	// (measured: keys are id, kind, conversationId, model?, data?, head?, edits?, byTaskId?), and
	// fork-awareness here is per conversation (ConversationRecord.parent), not per entry.
	 const since = msg.since === undefined || msg.since === null ? undefined : Number(msg.since);
	 if (since !== undefined && !Number.isFinite(since)) return { command, success: false, error: `since needs a pi-durable EntryId, got ${JSON.stringify(msg.since)}` };
	 const page = await conversation.entries({ ...(since === undefined ? {} : { minEntryId: since + 1 }), order: "ascending" }, 500, undefined, context);
	 if (since !== undefined && page.items.length === 0) {
	 const exists = await conversation.entries({ minEntryId: since, maxEntryId: since }, 1, undefined, context);
	 // pi says a `since` that matches no entry id answers success:false; pi-durable can say the
	 // same because its EntryId space is exactly checkable.
	 if (!exists.items.length) return { command, success: false, error: `no entry ${since} in this conversation` };
	 }
	 const newest = await conversation.entries({}, 1, undefined, context);
	 return {
	 command,
	 success: true,
	 data: {
	 entries: page.items.map((entry) => ({
	 type: entry.model?.length ? "message" : "entry",
	 id: entry.id,
	 kind: entry.kind,
	 conversationId: entry.conversationId,
	 ...(entry.model === undefined ? {} : { messages: entry.model }),
	 ...(entry.data === undefined ? {} : { data: entry.data }),
	 ...(entry.head === undefined ? {} : { head: entry.head }),
	 })),
	 leafId: newest.items[0]?.id ?? null,
	 },
	 };
	}

	 case "get_tree": {
	// pi's tree is an entry tree; pi-durable's transcript is fork-aware PER CONVERSATION, so the
	// honest shape here is the active branch as one chain plus this conversation's fork lineage.
	// Inventing per-entry parents would claim a plane pi-durable does not have.
	 const page = await conversation.entries({ order: "ascending" }, 500, undefined, context);
	 const newest = await conversation.entries({}, 1, undefined, context);
	 const chain = page.items.map((entry) => ({ entry: { id: entry.id, kind: entry.kind, conversationId: entry.conversationId }, children: [] }));
	 for (let index = 0; index + 1 < chain.length; index++) chain[index].children.push(chain[index + 1]);
	 return {
	 command,
	 success: true,
	 data: {
	 tree: chain.length ? [chain[0]] : [],
	 leafId: newest.items[0]?.id ?? null,
	 branch: page.items.map((entry) => ({ id: entry.id, kind: entry.kind })),
	 },
	 };
	}

	 case "get_last_assistant_text": {
	// Fork-aware history is newest first, so the FIRST assistant row is the newest answer.
	 const page = await conversation.entries({}, 200, undefined, context);
	 const assistant = page.items.filter((e) => e.kind === "pi.assistant")[0];
	 return { command, success: true, data: { text: assistant ? textOf(assistant.model?.[0]) : null } };
	}

	 case "get_session_stats": {
	// pi's SessionStats fields, from pi-durable's own session usage sum plus entry counts.
	 const usage = await parts.harness.usage(context);
	 const page = await conversation.entries({}, 1000, undefined, context);
	 const count = (kind) => page.items.filter((e) => e.kind === kind).length;
	 // pi counts tool CALLS and tool RESULTS separately; pi-durable records a call inside its
	 // assistant message and the result as its own entry, so calls are counted from the committed
	 // assistant content blocks.
	 const toolCalls = (page.items.flatMap((e) => e.model ?? [])).flatMap((m) => (Array.isArray(m?.content) ? m.content : [])).filter((b) => b?.type === "toolCall").length;
	 return {
	 command,
	 success: true,
	 data: {
	 sessionFile: parts.intent?.store ?? null,
	 sessionId: String(conversation.id),
	 userMessages: count("pi.user"),
	 assistantMessages: count("pi.assistant"),
	 toolCalls,
	 toolResults: count("pi.tool-result"),
	 totalMessages: page.items.length,
	 tokens: sumUsage(usage),
	 cost: sumCost(usage),
	 usageBuckets: usage,
	 contextUsage: await contextUsageOf(parts, conversation, context),
	 },
	 };
	}

	 case "get_commands": {
	// pi lists extension commands, prompt templates and skills; the resources are pi's own loader's
	// (src/packages/loader.mjs over discovered packages), and rpc-commands.md names `source` values
	// "extension" | "prompt" | "skill" (a skill's name is prefixed `skill:`).
	 const resources = parts.resources ?? {};
	 const commands = [];
	 for (const template of resources?.promptTemplates ?? []) commands.push({ name: template.name, description: template.description ?? template.name, source: "prompt" });
	 for (const skill of resources?.skills ?? []) commands.push({ name: `skill:${skill.name}`, description: skill.description ?? skill.name, source: "skill" });
		// pi's own package plane already says which verbs its extensions register (src/agentplane.mjs inventories
		// them from the loaded Extension's commands/flags/shortcuts maps); a pi command is INVOKED only inside
		// pi's CLI, so the row carries pi's name with the reason it is listed here rather than run.
		for (const row of resources?.commands ?? []) commands.push({ name: row.name, description: row.reason, source: "extension", invocation: "unsupported" });
		for (const row of resources?.shortcuts ?? []) commands.push({ name: row.name, description: row.reason, source: "extension", invocation: "unsupported" });
	 return { command, success: true, data: { commands } };
	}

	 // ---- model and thinking --------------------------------------------------
	 case "set_model": {
	// pi's provider+modelId becomes pi-durable's ModelRef; configure() writes pi.agent, so no model
	// registry is rebuilt here.
	 const provider = msg.provider ?? parts.intent?.provider ?? "faux";
	 const modelId = msg.modelId;
	 if (!modelId) return { command, success: false, error: "set_model needs provider and modelId" };
	 await conversation.configure({ model: { provider, modelId } }, context);
	 return { command, success: true, data: { provider, id: modelId } };
	}

	 case "set_thinking_level": {
	// pi-ai's own vocabulary (MODEL_THINKING_LEVELS) is the gate, not a list typed here.
	 if (!MODEL_THINKING_LEVELS.includes(msg.level)) return { command, success: false, error: `thinking level must be one of ${MODEL_THINKING_LEVELS.join(", ")}; got ${JSON.stringify(msg.level)}` };
	 await conversation.configure({ thinkingLevel: msg.level }, context);
	 return { command, success: true, data: { level: msg.level } };
	}

	 case "get_available_thinking_levels": {
	// pi narrows per model from its metadata; this harness has no credentials offline to narrow by,
	// so the honest answer is pi-ai's whole vocabulary rather than a claim about one model.
	 return { command, success: true, data: { levels: [...MODEL_THINKING_LEVELS] } };
	}

	 case "get_available_models": {
	// pi's ModelInfo list, read from pi-ai's own Models rather than a table here.
	 const models = parts.models?.getAllModels?.() ?? [];
	 return {
	 command,
	 success: true,
	 data: {
	 models: models.map((model) => ({ provider: model.provider, id: model.id, contextWindow: model.contextWindow, reasoning: model.reasoning })),
	 },
	 };
	}

	 case "set_auto_compaction": {
	// pi-durable's per-conversation CompactionSettings: configure() writes them, and the
	// conversation's own `enabled: false` beats the harness override (dist compaction.d.ts).
	 if (typeof msg.enabled !== "boolean") return { command, success: false, error: "set_auto_compaction needs a boolean enabled" };
	 await conversation.configure({ compaction: { enabled: msg.enabled } }, context);
	 return { command, success: true, data: { enabled: msg.enabled } };
	}

	 case "compact": {
	// pi's compact returns its CompactionResult; pi-durable's is {entryId, submissionId} (dist
	// harness/compaction.d.ts), and the summary itself is the entry it placed - reported as
	// pi-durable's own fields rather than dressed into pi's summary shape.
	 const taskId = await conversation.compact(msg.customInstructions ?? msg.instructions, context);
	 const settled = await parts.harness.waitForTask(taskId, context);
	 const result = settled?.state?.result ?? settled?.result ?? null;
	 return { command, success: true, data: { taskId, result, settled: settled?.state?.status ?? null } };
	}

	 // ---- session verbs, on pi-durable's planes ---------------------------------
	 case "new_session": {
	// pi starts a fresh session; here that is a fresh ownerless conversation in the SAME store,
	// which is what pi-durable's conversation plane is. No parent-file lineage exists, so pi's
	// `parentSession` is reported rather than guessed at.
	 const created = await parts.harness.createConversation({ ownership: { kind: "ownerless" } }, context);
	 parts.conversation = created;
	 return { command, success: true, data: { cancelled: false, conversationId: created.id, parentSession: msg.parentSession ?? null } };
	}

	 case "switch_session": {
	// pi names a session FILE; this store addresses conversations by ConversationId. A number is
	// taken as that id, a path is refused rather than guessed at.
	 const id = Number(msg.sessionPath);
	 if (!Number.isFinite(id)) return { command, success: false, error: "switch_session names a pi-durable ConversationId; there are no session files in this store" };
	 const target = await parts.harness.conversation(id, context);
	 if (!target) return { command, success: false, error: `no conversation ${id} in this store` };
	 parts.conversation = target;
	 return { command, success: true, data: { cancelled: false, conversationId: target.id } };
	}

	 case "fork": {
	// pi forks "from a previous user message"; pi-durable's verb is fork(at: EntryId) on the
	// active branch - the same thing stated over pi-durable's transcript.
	 const at = Number(msg.entryId);
	 if (!Number.isFinite(at)) return { command, success: false, error: "fork needs an entryId (pi-durable EntryId)" };
	 const source = await conversation.entries({ minEntryId: at, maxEntryId: at }, 1, undefined, context);
	 const forked = await conversation.fork(at, { ownership: { kind: "ownerless" } }, context);
	 parts.conversation = forked;
	 return {
	 command,
	 success: true,
	 data: { text: textOf(source.items[0]?.model?.[0]), cancelled: false, conversationId: forked.id, at },
	 };
	}

	 case "clone": {
	// pi clones the current active branch into a new session; on pi-durable that is fork() at the
	// leaf entry, which inherits the whole active branch as history.
	 const leaf = await conversation.entries({}, 1, undefined, context);
	 if (!leaf.items[0]) return { command, success: false, error: "nothing to clone: the conversation has no entries" };
	 const cloned = await conversation.fork(leaf.items[0].id, { ownership: { kind: "ownerless" } }, context);
	 parts.conversation = cloned;
	 return { command, success: true, data: { cancelled: false, conversationId: cloned.id, at: leaf.items[0].id } };
	}

	 case "get_fork_messages": {
	// pi's fork candidates are the user messages of the active branch; pi-durable's fork-aware read
	// already returns exactly that branch.
	 const page = await conversation.entries({ order: "ascending" }, 500, undefined, context);
	 return {
	 command,
	 success: true,
	 data: {
	 messages: page.items.filter((e) => e.kind === "pi.user").map((entry) => ({ entryId: entry.id, text: textOf(entry.model?.[0]) })),
	 },
	 };
	}

	 // ---- bash ---------------------------------------------------------------
	 case "bash": {
	// pi runs the command and puts the output into context on the NEXT prompt (rpc-commands.md:
	// "Included bash output reaches the model on the next prompt, not immediately"); the queued
	// input below does exactly that, in pi's documented "Ran `cmd`\n```...```" form. The command
	// itself runs through pi-durable's execution env, so confinement is pi-durable's cwd.
	 const env = makeEnv({ cwd: parts.cwd ?? process.cwd() });
	 const chunks = [];
	 // pi's bash streams `bash_execution_update` records while the command runs; onOutput is pi-durable's
	 // own delivery hook, so the records are the chunks pi-durable reported, in arrival order.
	 const exec = await env.exec(String(msg.command ?? ""), { onOutput: (text, ctx, info) => {
	 chunks.push(String(text ?? ""));
	 record({ type: "bash_execution_update", id: msg.id ?? null, command: msg.command, partialResult: chunks.join("") });
	 } }, context);
	 if (!exec.ok) return { command, success: false, error: `bash refused: ${String(exec.error?.code ?? exec.error)}` };
	 await env.cleanup(context);
	 const output = chunks.join("");
	 if (!msg.excludeFromContext) {
	 const queuedInput = await conversation.submit(
	 { type: "input", content: `Ran \`${msg.command}\`\n\`\`\`\n${output}\n\`\`\``, requestId: msg.id ?? `bash:${process.pid}:${msg.command}`, whenBusy: "followUp" },
	 context,
	 );
	 return {
	 command,
	 success: true,
	 data: { output, exitCode: exec.value.exitCode, cancelled: false, truncated: Boolean(exec.value.spillPath), ...(exec.value.spillPath ? { fullOutputPath: exec.value.spillPath } : {}) },
	 settlements: [queuedInput.id],
	 };
	 }
	 return {
	 command,
	 success: true,
	 data: { output, exitCode: exec.value.exitCode, cancelled: false, truncated: Boolean(exec.value.spillPath), excludedFromContext: true, ...(exec.value.spillPath ? { fullOutputPath: exec.value.spillPath } : {}) },
	 };
	}

	 // ---- the harness's own verbs (documented as harness-invented) --------------
	 case "status": {
	 const page = await conversation.entries({}, 1, undefined, context);
	 return { command, success: true, data: { pid: process.pid, conversationId: conversation.id, newestEntry: page.items[0]?.id ?? null, usage: await parts.harness.usage(context) } };
	}

	 case "config": {
	 return {
	 command,
	 success: true,
	 data: {
	 agent: await conversation.agent(context),
	 settings: parts.settings ?? null,
	 inspect: await parts.harness.inspect(context),
	 },
	 };
	}

	 case "read": {
	 const page = await conversation.entries({}, Math.min(msg.limit ?? 50, 200), msg.cursor, context);
	 return { command, success: true, data: { items: page.items.map((e) => ({ id: e.id, kind: e.kind, model: e.model, data: e.data })), cursor: page.next } };
	}

	 case "watch": {
	// pi-durable's own client transcript layer decides what `since` means and what continues it.
	 const feed = await readFeed(parts.harness, conversation.id, { since: msg.since, limit: msg.limit ?? 50, context });
	 return { command, success: true, data: { rows: feed.rows, partials: feed.partials, since: feed.resume, newest: feed.newest } };
	}

	 default:
	 return {
	 command,
	 success: false,
	 error: `unknown command ${JSON.stringify(command)}; this handler answers ${commandNames().join(", ")}`,
	 };
	}
}

/** The run one submission started, streamed as pi's session-event records (src/pievents.mjs), then
 * pi's `agent_settled`. Started by the caller after it wrote the response, awaited at close, so an
 * RPC client that sent a prompt and hung up still gets pi-durable's answer on the same line. */
async function runEvents(parts, submissionId, afterEntry, context, emit) {
	// The submission is waited first: pi-durable's answer is committed work, and a record about it
	// before it exists would be a guess.
	const started = (async () => {
	 try {
	 const submission = await parts.harness.submission(submissionId, context);
	 await submission?.wait(context);
	 await parts.harness.waitForIdle(context);
	 // Only what this run added: `afterEntry` is pi-durable's EntryId cursor from the admit.
	 const page = await parts.conversation.entries({ minEntryId: afterEntry, order: "ascending" }, 500, undefined, context);
	 for (const event of piEventsOf(page.items, { conversationId: parts.conversation.id, settled: true })) emit(event);
	 } catch (err) {
	 // A cancelled or failed stream is reported through pi's own error channel, not a crash: the
	 // RPC session has to keep answering the commands that come after it.
	 emit({ type: "extension_error", error: String(err?.message ?? err) });
	 }
	})();
	 return started;
}
