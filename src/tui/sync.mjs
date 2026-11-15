// src/tui/sync.mjs - the store -> view sync: advance pi-durable's OWN page Cursor and merge
// pi-durable's OWN watch frames into one view state.
//
// PROVENANCE: the tick/state concern of ~/Git/Durian-Pi/src/tui/sync.mjs, the store-read closure
// of ~/Git/Durian-Pi/src/tui/readstate.mjs and the id-keyed merge of ~/Git/Durian-Pi/src/tui/conversation.mjs,
// read 2026-11-14 at pin v1.5.1. Dropped outright: seats, the cross-seat queue, broker/serve,
// genlock, worktrees, metrics, check, constitution, selfdev (single-agent harness).
//
// What changed, and why:
//   - Durian-Pi's sync.mjs was the DECSET 2026 (synchronized output) wrapper. That concern now
//     belongs to pi-tui's renderer, which already brackets every frame with it (verified in the
//     pinned dist: dist/tui-main-screen.js writes "\x1b[?2026h" ... "\x1b[?2026l" around a frame,
//     dist/tui-alt-screen.js uses BEGIN_SYNCHRONIZED_OUTPUT/END_SYNCHRONIZED_OUTPUT the same way),
//     so this name carries the store sync and NO second wrapper is emitted;
//   - Durian-Pi re-implemented its own paging (`SCAN_LIMIT`, `readOlderEntries`, `conversationExhausted`,
//     a `seq` of its own). Here the continuation state is pi-durable's own `Cursor`
//     (dist/types.d.ts: "Backend-owned JSON continuation state that callers only round-trip to the
//     same scan"), which `src/readapi.mjs` hands over as `Page.next`, and the transcript assembly is
//     pi-durable's own `ConversationTranscript` (dist/harness/transcript.d.ts: "A layer over any
//     ConversationView... What a client has of one conversation"). Nothing here counts entries,
//     computes ranges from entry IDs, or invents an offset.
//   - `conversation.mjs`'s merge rule is kept as the merge of the SYNC plane (entries never change
//     once committed, so the transcript only grows - pi-durable's own words for that).
//
// MEASURED on this pin (and asserted in demo/tui.test.mjs): a fresh readOnly Session opened over
// a store another Session drives receives NO watch frames - a Session owns one line, and "Open
// recovers nothing" (pi-durable HarnessOptions.readOnly, quoted in src/readapi.mjs). What a viewer
// CAN do across Sessions is re-read: the cursor read returns entries committed after the viewer
// opened. So the sync plane is the cross-process plane and the watch plane is the same-Session
// plane, and the TUI shows both.
//
// Pure of terminal work: no TTY, no rendering, no timers of our own (the driver owns the poll).

import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { ConversationTranscript } from "@earendil-works/pi-durable";
import { readEntries } from "../readapi.mjs";

/** The one page size the sync read takes, until the caller overrides it per call. */
const SYNC_LIMIT = 50;

/**
 * The view state both planes update: committed entries held, pi-durable's `Cursor` round-tripped
 * to the sync scan, and the newest `LiveState` a watch frame carried.
 *
 * `exhausted` is pi-durable's answer, never a guess: null while the scan has not returned a final
 * page, true once `Page.next` is absent.
 */
export function createSyncState(conversationId, { limit = SYNC_LIMIT } = {}) {
	return {
		conversationId,
		entries: [],
		ids: new Set(),
		// `cursor` stays undefined-able: pi-durable rejects an explicit null cursor as a storage
		// request error (see src/readapi.mjs), so "no cursor yet" is null here and omitted below.
		cursor: null,
		exhausted: null,
		live: null,
		// The last merged `TranscriptView` (its `items` are the client's whole transcript, gaps and
		// all) - preferred over `entries` once a watch has been merged.
		latest: null,
		// `resume` is pi-durable's own window that continues this transcript after a drop
		// (`ConversationTranscript.resume`); null before the first merge.
		resume: null,
	};
}

/** One page of the sync read, from `state.cursor`, merged into the state. */
export async function advanceSync(store, state, { context = BACKGROUND_CONTEXT, limit = SYNC_LIMIT } = {}) {
	// The cursor is round-tripped to the SAME scan (pi-durable's words), so the order stays the
	// scan's order: ascending, oldest first, which is what a transcript row list needs.
	const page = await readEntries(store, state.conversationId, { limit, ...(state.cursor ? { cursor: state.cursor } : {}), order: "ascending", context });
	let added = 0;
	for (const entry of page.items) {
		// Entries never change once committed, so an id already held is skipped, never replaced:
		// a re-read of the same page is idempotent and no duplicate ever renders.
		if (entry?.id === undefined || state.ids.has(entry.id)) continue;
		// @temp: a page that arrives out of order (another session's line, a fork) is re-sorted
		// @temp: once by entry id instead of trusting the arrival order.
		if (state.entries.length && entry.id < state.entries[state.entries.length - 1].id) state.entries.sort((a, b) => a.id - b.id);
		state.entries.push(entry);
		state.ids.add(entry.id);
		added += 1;
	}
	// `Page.next` absent is the scan's own end: pi-durable says the page ended, we record that.
	state.exhausted = page.next === undefined ? true : false;
	if (page.next !== undefined) state.cursor = page.next;
	return { added, next: page.next, newest: state.entries.length ? state.entries[state.entries.length - 1].id : null, exhausted: state.exhausted };
}

/**
 * Merge one `ConversationView` (the acquisition value or a watch frame) through pi-durable's
 * `ConversationTranscript`, and take its `LiveState`.
 *
 * The live partial is taken from `view.docs["pi.live"]`: `LiveDoc` is pi-durable's built-in
 * conversation document of `LiveState` (dist/harness/live.d.ts declares `LiveDoc:
 * ConversationDocToken<LiveState>`, and dist/harness/live.js gives it the kind "pi.live"), and
 * `ConversationView.docs` (dist/harness/view.d.ts) is "Built-in conversation documents keyed by
 * kind". An absent document means no live state, which is how a finished run clears the streaming
 * row: `endRun` removes `run`, `generation`, `tools` and `nestedTools` (live.d.ts).
 */
export function mergeView(transcript, state, view, { context = BACKGROUND_CONTEXT } = {}) {
	// `merge` returns the view with the client's whole transcript as `items` instead of the window,
	// so a window that dropped its oldest entries keeps them here (pi-durable's words).
	const merged = transcript.merge(view);
	state.latest = merged;
	state.resume = transcript.resume;
	// A frame with no live document means "nothing is in flight now", which clears the streaming
	// row; a frame that failed (see below) never overwrites what was last seen.
	state.live = view?.docs?.["pi.live"] ?? null;
	// The sync plane keeps its own copy too, so a viewer that watches nothing still renders.
	let added = 0;
	for (const entry of view?.entries ?? []) {
		// Entries stay sorted newest-first inside pi-durable's view, but this state keeps one
		// ascending line, so the merge inserts by id and re-sorts only when order broke.
		if (entry?.id === undefined || state.ids.has(entry.id)) continue;
		if (state.entries.length && entry.id < state.entries[state.entries.length - 1].id) state.entries.sort((a, b) => a.id - b.id);
		entriesPush(state, entry);
		added += 1;
	}
	return { added, items: merged.items };
}

function entriesPush(state, entry) {
	// @temp: same helper as advanceSync, so both planes keep ONE ascending entry line.
	// @temp: kept separate from the merge so a caller can count what each plane contributed.
	state.entries.push(entry);
	// @temp: the id set is shared by both planes, which is what makes a re-read idempotent.
	state.ids.add(entry.id);
}

/**
 * Attach the watch plane to one conversation and feed every frame into the state.
 *
 * The window is pi-durable's own `ConversationWindow` (dist/harness/view.d.ts), and passing
 * `state.resume` continues the transcript a previous watch already held (`ConversationTranscript.resume`:
 * "The window that resumes this transcript after a drop").
 */
export async function openWatch(store, conversationId, { state = createSyncState(conversationId), context = BACKGROUND_CONTEXT, window = null, pageSize = null, onFrame = null } = {}) {
	// The conversation handle is pi-durable's own: the same fork-aware line a writer answers on.
	const conversation = await store.harness.conversation(conversationId, context);
	// @temp: a store that does not hold this conversation is a caller error, not an empty view.
	// @temp: the name says which store was read, so a demo cannot silently watch the wrong one.
	if (!conversation) throw new Error(`no conversation ${conversationId} in this store`);
	// `ConversationTranscript` takes an `EntryLoader`, which is exactly what `Conversation.entries()`
	// already is (dist/harness/transcript.d.ts: EntryLoader = (query, limit, context) => Page),
	// so the loader hands over pi-durable's read and no second scan is written here.
	// @temp: the cursor stays undefined: the loader's job is the earlier/gap fills, and those carry
	// @temp: bounds in the query, not a cursor.
	const load = (query, limit, ctx) => conversation.entries({ ...query, conversationId }, limit, undefined, ctx);
	const transcript = pageSize === null ? new ConversationTranscript(load) : new ConversationTranscript(load, { pageSize });
	// `window` may be undefined (the default newest-50 window) but never null (a storage request
	// error shape), so a caller that passed nothing gets an omitted argument.
	// @temp: `conversation.watch` returns `WatchHandle<ConversationView>` (dist/harness/view.d.ts),
	// @temp: whose `value` is the acquisition value and whose `start` installs the sole listener.
	// @temp: aborting the acquisition context ends the watch `aborted` (dist/watch.d.ts).
	const handle = await conversation.watch(context, window ?? undefined);
	const taken = { acquisition: mergeView(transcript, state, handle.value, { context }), frames: 0 };
	onFrame?.({ state, view: handle.value, kind: "acquisition", added: taken.acquisition.added });
	// The listener is async and never invoked inline (chord's WatchHandle contract), so a slow
	// repaint cannot block the Session's commits: changes made while it runs arrive folded.
	handle.start(async (call, ctx) => {
		if (call?.kind !== "value") return;
		const merged = mergeView(transcript, state, call.value, { context: ctx ?? context });
		taken.frames += 1;
		// A failed call (`WatchCall.kind === "failed"`) is filtered out above: the watch stays
		// open and `handle.value` keeps the last value, so nothing is reported as a missing frame.
		onFrame?.({ state, view: call.value, kind: "frame", added: merged.added });
	});
	return {
		handle,
		transcript,
		state,
		// `stop()` returns the watch's terminal `WatchEnd` (dist/watch.d.ts: stopped/aborted/ended/
		// listener_error/failed), which is how a caller proves the watch actually ended.
		// @temp: stop is idempotent, so a double quit is not a double report.
		stop: async () => await handle.stop(),
	};
}

/**
 * The frame data one paint takes: pi-durable's `TranscriptView.items` when a watch has merged
 * (the client's whole transcript, so a gap or an "earlier" row renders honestly), otherwise the
 * sync read's entries wrapped in the same `{kind:"entry", entry}` vocabulary.
 */
export function snapshotSync(state, { conversationId = state.conversationId } = {}) {
	const items = state.latest?.items ?? state.entries.map((entry) => ({ kind: "entry", entry }));
	return {
		conversationId,
		// @temp: an empty transcript still snapshots: an empty view is a real answer, and the
		// @temp: footer says so rather than the caller deciding the store read failed.
		items,
		live: state.live,
		newest: state.latest?.newest ?? (state.entries.length ? state.entries[state.entries.length - 1].id : null),
		cursor: state.cursor,
		exhausted: state.exhausted,
	};
}
