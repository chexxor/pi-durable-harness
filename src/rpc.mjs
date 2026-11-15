// src/rpc.mjs - one command handler, spoken by both the RPC stdin mode and the attach socket.
//
// PROVENANCE: the verb set follows pi 1.5.2's RPC surface (docs/rpc-commands.md) and Durian-Pi's
// src/cli-seam.mjs / src/intent.mjs entry seam, read 2026-11-14 at pin v1.5.1. Seats, broker,
// cross-seat queue, genlock, worktrees, metrics, check, constitution and selfdev are dropped.
// Commands answer with COMMITTED durable state only: pi-durable's spec says only committed state is
// observable, so no reply invents an in-flight guess.
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { readFeed } from "./eventfeed.mjs";

export function commandNames() {
	return ["status", "config", "read", "prompt", "watch", "abort", "compact"];
}

export async function handle(parts, msg) {
	const { harness, conversation, context } = parts;
	switch (msg.command) {
		case "status": {
			// newestEntry uses the fork-aware history read, one row, newest first.
			const page = await conversation.entries({}, 1, undefined, context);
			return { pid: process.pid, conversationId: conversation.id, newestEntry: page.items[0]?.id ?? null, usage: await harness.usage(context) };
		}
		case "config": {
			// Agent + settings are harness-owned: read them, never rebuild them.
			return { agent: await conversation.agent(context), settings: await conversation.context(context), inspect: await harness.inspect(context) };
		}
	 case "read": {
		 const page = await conversation.entries({}, Math.min(msg.limit ?? 50, 200), msg.cursor, context);
		 // Page is {items, next?}: `next` is the round-trip cursor for the next page.
		// @temp: items keep `model` so a viewer can print messages without re-deriving them.
	 return { items: page.items.map((e) => ({ id: e.id, kind: e.kind, model: e.model, data: e.data })), cursor: page.next };
	 }
	 case "prompt": {
		// @temp: requestId is what makes a resend land exactly once (admitSubmission returns the
		// @temp: existing submission), so a client may retry without duplicating input.
		// @temp: whenBusy "steer" queues onto the running turn instead of starting a second run.
	 if (!msg.text) throw new Error("prompt needs text");
	 const requestId = msg.requestId ?? `rpc:${process.pid}:${Date.now()}`;
	 const submission = await conversation.submit({ type: "input", content: msg.text, requestId, ...(msg.whenBusy ? { whenBusy: msg.whenBusy } : {}) }, context);
	 return { requestId, submissionId: submission.id, status: submission.status };
	 }
	 case "watch": {
	 // The feed, not a re-read: pi-durable's own client transcript layer decides what `since` means
	 // (`ConversationWindow.from`), and `resume` is the boundary that continues it (`transcript.resume`),
	 // so an RPC client that keeps re-issuing `watch` with the returned boundary advances without
	 // re-delivering an entry and without an offset of ours. Partials come as their own rows because a
	 // progress commit may be deferred, and therefore may never be stored.
	 const feed = await readFeed(harness, conversation.id, { since: msg.since, limit: msg.limit ?? 50, context });
	 return { rows: feed.rows, partials: feed.partials, since: feed.resume, newest: feed.newest };
	 }
	 case "abort": {
	 await conversation.abort(context);
	 return { aborted: true };
	 }
	 case "compact": {
	 return { taskId: await conversation.compact(msg.instructions, context) };
	 }
	 default:
	 throw new Error(`unknown command ${JSON.stringify(msg.command)}; the commands are ${commandNames().join(", ")}`);
	}
}
