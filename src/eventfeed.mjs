// src/eventfeed.mjs - the event feed over one conversation: committed entries plus the in-flight partial, as
// rows in commit order, using pi-durable's own client transcript layer rather than a paging model of ours.
//
// PROVENANCE: the feed idea is extracted from ~/Git/Durian-Pi/src/eventfeed.mjs (an event feed for a read-only
// viewer) and ~/Git/Durian-Pi/src/livewatch.mjs (the partial shown as a streaming row), read 2026-11-14 at
// pin v1.5.1. What changed: Durian-Pi implemented its own seq cursor and its own "what is new since the last
// row" bookkeeping; here that job is pi-durable's `ConversationTranscript`, which the pin documents as exactly
// this layer ("A layer over any `ConversationView`, wherever it comes from... After a drop, a new watch with
// `resume` as its window continues the transcript"), so `--since` is a `ConversationWindow.from` boundary and
// a reconnect is `transcript.resume` rather than an offset we hope matches.
//
// VERIFIED AGAINST PINED 1.5.1 (quoted, not inferred):
//   dist/harness/transcript.d.ts `merge(view: ConversationView): TranscriptView`, `get newest`, and
//   `get resume(): ConversationWindow`, whose doc says "`{ from }` right after `newest`, so a new watch returns
//   only what was missed when it fits its window" - and the doc above it says "Nothing counts entries or
//   computes ranges from entry IDs, which have holes; only exclusive bounds are turned into the inclusive
//   bounds of `EntryQuery`", which is why this file never compares entry IDs.
//   dist/harness/types.d.ts:824 `watch(context, window?: ConversationWindow): Promise<ConversationWatch>` on
//   `Conversation`, and dist/harness/view.d.ts `ConversationView.docs: Readonly<Record<string, JsonObject>>` -
//   "Built-in conversation documents keyed by kind" - with dist/harness/live.js:4 `kind: "pi.live"`.
//   chord/watch.d.ts WatchHandle: `start(listener)` installs the SOLE asynchronous listener, `stop()` is
//   idempotent, and changes made while the listener runs arrive folded into the next call.
import { ConversationTranscript, LiveDoc } from "@earendil-works/pi-durable";
import { entryRow, partialRows } from "./viewmodel.mjs";

// The doc kind comes from the token, not a literal: LiveDoc.definition.kind measured "pi.live" at this pin,
// so a rename of pi-durable's own document cannot make this file read a kind that no longer exists.
const LIVE_DOC = LiveDoc.definition.kind;

/**
 * Feed one conversation's rows to `onRow`, from `since` (an entry ID boundary) forward, and keep going
 * until the caller stops the returned watch.
 *
 * The watch, not a re-read, is what makes the feed a feed: `Conversation.watch()` is a serialized watch over
 * the conversation view, and its doc says commits made while the listener runs "arrive folded", which is
 * exactly the shape a terminal needs - one repaint per revision, not one per commit.
 */
/**
 * What a `--since` value means as a `ConversationWindow`: an entry ID becomes `{ from }`, and a window that
 * already came back from `transcript.resume` (which is what the RPC `watch` reply carries) is passed on
 * unchanged - so a client can feed the reply straight back without knowing which of the two it holds.
 */
function windowFor(since) {
 if (since === null || since === undefined) return undefined;
 if (typeof since === "object") return since;
 return { from: since };
}

export async function follow(harness, conversationId, { since = null, context, onRow, limit = Infinity }) {
 const conversation = await harness.conversation(conversationId, context);
 if (!conversation) throw new Error(`no conversation ${conversationId} in this store`);
 const transcript = new ConversationTranscript((query, pageSize, ctx) => conversation.entries(query, pageSize, undefined, ctx));
 const seen = new Set();
 let emitted = 0;
 let failed = null;
 const watch = await conversation.watch(context, windowFor(since));
 const emit = async (view) => {
 const merged = transcript.merge(view);
 for (const item of merged.items) {
 if (emitted >= limit) return merged;
 if (item.kind === "entry") {
 if (seen.has(item.entry.id)) continue;
 seen.add(item.entry.id);
 emitted += 1;
 await onRow(entryRow(item.entry));
 continue;
 }
 emitted += 1;
 await onRow({ kind: "gap", after: item.after, upTo: item.upTo });
 }
 for (const partial of partialRows(view.docs[LIVE_DOC])) {
 if (emitted >= limit) return merged;
 emitted += 1;
 await onRow(partial);
 }
 return merged;
 };
 await emit(watch.value);
 watch.start(async (call, ctx) => {
 if (call.kind === "failed") {
 failed = call.error;
 return;
 }
 await emit(call.value);
 });
 return {
 transcript,
 watch,
 emitted,
 failed: () => failed,
 resume: () => transcript.resume,
 stop: () => watch.stop(),
 };
}

/**
 * The non-following half: the committed rows as of now, plus the partial as of now, and the boundary that
 * resumes the scan later.
 *
 * This reads one revision of the same watch rather than paging the transcript by hand, which is why a
 * `--since` that lands past a compaction marker still returns the entries after it: the boundary pi-durable
 * uses is a `ConversationWindow.from`, and `ConversationTranscript.resume` says what that boundary is.
 */
export async function readFeed(harness, conversationId, { since = null, limit = 50, context }) {
 const feed = await follow(harness, conversationId, { since, context, onRow: () => {}, limit: Infinity });
 const rows = [];
 const seen = new Set();
 const view = feed.watch.value;
 const merged = feed.transcript.merge(view);
 for (const item of merged.items) {
 if (item.kind === "entry") {
 if (seen.has(item.entry.id)) continue;
 seen.add(item.entry.id);
 rows.push(entryRow(item.entry));
 continue;
 }
 rows.push({ kind: "gap", after: item.after, upTo: item.upTo });
 }
 const partials = partialRows(view.docs[LIVE_DOC]);
 await feed.stop();
 return { rows: rows.slice(0, limit), partials, resume: feed.resume(), newest: feed.transcript.newest };
}

export const liveDocKind = LIVE_DOC;
