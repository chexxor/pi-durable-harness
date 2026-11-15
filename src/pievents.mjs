// src/pievents.mjs - pi's JSON event records (json.md), built from pi-durable's committed entries.
//
// PROVENANCE: no Durian-Pi original - Durian-Pi had no JSON event layer (its JSON mode was a seat
// broker's spool, which is dropped). What this file follows is the pinned package's own reference:
// node_modules/@earendil-works/pi-coding-agent/docs/json.md at pin v1.5.1, "the canonical reference
// for events shared by JSON and RPC mode", plus the message/event shapes in docs/message-types.md.
// scripts/audit-pi-docs.mjs re-reads both, so this mapping is checked against the docs the pinned
// package ships rather than against a memory of them.
//
// WHY THE RECORDS ARE BUILT AND NOT GUessed: json.md says a `message_end` is "the authoritative
// final message", and pi-durable's EntryRecord carries `model`, the exact pi-ai message list it put
// in the provider's context (measured at this pin: `{"role":"assistant","content":[...],"usage":...,
// "stopReason":...,"timestamp":...}` and `{"role":"toolResult","toolCallId":...,"toolName":...,"isError":...,"durationMs":...}`).
// So the message objects below are pi-durable's own messages, passed through - this file only decides
// which pi record wraps which entry, and never reports a message that was not committed.
//
// THE ONE GAP, NAMED: pi streams `message_update` text_delta records while a provider streams.
// pi-durable commits an assistant entry when its turn finishes, and its running progress arrives
// separately (src/eventfeed.mjs' partials). This file therefore emits `message_update` records in
// the documented AUTHORITATIVE forms (`text_end`, `thinking_end`, `toolcall_end`), which json.md says
// "replace reconstructed data with the completed content", rather than inventing deltas that never
// streamed. A delta-by-delta replay would be a claim about in-flight state this harness cannot see.
import { CURRENT_SESSION_VERSION } from "@earendil-works/pi-coding-agent";

/** pi's session header (json.md's first JSON-mode record), on pi-durable's identifiers instead of
 * pi's session file: `id` is the ConversationId, and `store` names the one SQLite store this store
 * keeps. `version` is pi's own CURRENT_SESSION_VERSION, read from the pinned package. */
export function sessionHeader({ conversationId, cwd, store = null, sessionId = String(conversationId), timestamp = null }) {
	return {
		"type": "session",
		"version": CURRENT_SESSION_VERSION,
		"id": sessionId,
		"timestamp": timestamp ?? new Date().toISOString(),
		"cwd": cwd,
		...(store ? { store } : {}),
	};
}

/** pi's session-event records for pi-durable entries, oldest first.
 * `entries` must already be in append order (src/cli-intent.mjs reverses the newest-first page). */
export function piEventsOf(entries, { conversationId = null, settled = false } = {}) {
	const records = [];
	// pi's agent_start opens one low-level run; pi-durable's entries do not say which run made them,
	// so the record opens at the first message-bearing entry rather than pretending to know.
	let runStarted = false;
	const assistantMessages = [];
	let lastAssistant = null;

	const blockEvents = (message) => {
		const content = Array.isArray(message?.content) ? message.content : [];
		const updates = [];
		for (let index = 0; index < content.length; index++) {
			const block = content[index];
			if (block?.type === "text") updates.push({ type: "text_end", contentIndex: index, content: String(block.text ?? "") });
			if (block?.type === "thinking") updates.push({ type: "thinking_end", contentIndex: index, content: String(block.thinking ?? "") });
			// pi's toolcall_end carries the complete ToolCall, which is what `block` is here.
			if (block?.type === "toolCall") updates.push({ type: "toolcall_end", contentIndex: index, toolCall: block });
		}
		// usage is "the latest cumulative provider-reported usage", i.e. pi-ai's own usage object.
		return updates.map((event) => ({ type: "message_update", usage: message?.usage ?? null, assistantMessageEvent: event }));
	};

	for (const entry of entries) {
		// A pi-system entry is the system prompt/tools block, which pi's event stream does not
		// announce as a message; naming it here would invent a record pi's docs do not have.
		if (entry.kind === "pi.system") continue;
		for (const message of entry.model ?? []) {
			switch (message?.role) {
				case "user": {
					if (!runStarted) { records.push({ type: "agent_start" }); runStarted = true; }
					// pi's message_start for a user message carries the same content it ends with;
					// the message object is pi-durable's own, timestamps included.
					records.push({ type: "message_start", message: { role: "user", content: message.content, timestamp: message.timestamp ?? null } });
					records.push({ type: "message_end", message });
				 break;
			 }
			 case "assistant": {
				 if (!runStarted) { records.push({ type: "agent_start" }); runStarted = true; }
				 records.push({ type: "turn_start" });
				 // pi's opening record is the placeholder whose content is still empty.
				 records.push({ type: "message_start", message: { role: "assistant", content: [], stopReason: "pending", timestamp: message.timestamp ?? null } });
				 records.push(...blockEvents(message));
				 records.push({ type: "message_end", message });
				 assistantMessages.push(message);
				 lastAssistant = message;
				 break;
			 }
			 case "toolResult": {
				 // pi correlates the lifecycle by toolCallId, which is the field pi-ai's toolResult
				 // message already carries; `args` is what the call asked for, and the committed
				 // record does not repeat it, so it is reported as null rather than guessed.
				 records.push({ type: "tool_execution_start", toolCallId: message.toolCallId, toolName: message.toolName, args: entry?.data?.arguments ?? null });
				 records.push({
					 type: "tool_execution_end",
					 toolCallId: message.toolCallId,
					 toolName: message.toolName,
					 args: entry?.data?.arguments ?? null,
					 result: { content: message.content, details: entry?.data?.details ?? {} },
					 isError: message.isError ?? false,
					 ...(message.durationMs === undefined ? {} : { durationMs: message.durationMs }),
				 });
				 // pi closes a turn with the assistant response AND its tool results.
				 if (lastAssistant) records.push({ type: "turn_end", message: lastAssistant, toolResults: [message] });
				 break;
			 }
			 default: break;
			}
		}
	}
	if (runStarted) records.push({ type: "agent_end", messages: assistantMessages, willRetry: false });
	// pi's agent_settled means "no remaining automatic work", which is what a settled run is once
	// the caller has waited for it (pi-durable's waitForIdle). Only then is the claim true.
	if (settled) records.push({ type: "agent_settled", aborted: false });
	return records;
}

/** pi's `queue_update` record, from pi-durable's own inbox queue (both fields the complete queue). */
export function queueUpdate(steering, followUp) {
	return { type: "queue_update", steering, followUp };
}
