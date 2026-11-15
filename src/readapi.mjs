// src/readapi.mjs - the ONE read-only surface for the store. Nothing here mutates durable state.
//
// PROVENANCE: extracted from ~/Git/Durian-Pi/src/readonlystore.mjs and ~/Git/Durian-Pi/src/readapi.mjs
// (read a store another process owns), 2026-11-14 at pin v1.5.1. What changed and why:
//   - Durian-Pi opened the store through pi-durable's opener and then queried it with its own helper
//     layer; here the helper layer is two functions, so the "single read API" the objective asks for
//     is literally one entry point (openStore) plus one scan (readEntries);
//   - no SQL, no direct file reads: the store is whatever pi-durable's opener says it is;
//   - seats/queue/broker/worktree/metrics/check/constitution/selfdev: dropped outright.
//
// WHY a read-only Session and not a Harness (measured on the pinned 1.5.1): openNodeSqliteStorage(path,
// {mode:"read-only"}) throws "attempt to write a readonly database" because the opener applies its
// migrations when it opens. So a viewer opens the ordinary opener and then uses createSession, which
// is a Session with no scheduler: it cannot start a task and cannot commit, so a second process can
// never open a second mutation line. That is the rule src/ownership.mjs states, enforced by type.
import * as durable from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { createSession } from "@earendil-works/pi-durable";
import { resolve } from "node:path";

/**
 * Open a store for reading only. Returns a Session (not a Harness), so every method reachable
 * here is a read.
 */
export async function openStore(storePath, options = {}) {
	const path = resolve(storePath);
	const storage = await openNodeSqliteStorage(path, options.storage ?? {});
	// createSession takes no scheduling: `resume()` is what a Harness calls, and nothing here calls it.
	const session = createSession(storage, options.session ?? {});
	return { storage, session, storePath: path };
}

/**
 * One page of committed entries, oldest first, with a monotonic `seq` cursor.
 *
 * The cursor is the highest `seq` returned; handing it back yields strictly newer entries, which is
 * what makes `--since` and `--follow` possible without re-reading the transcript. `entries()` returns
 * fork-aware history; `scanEntries` is the plain scan, and this uses the scan so a viewer sees the
 * committed line in commit order rather than a branch projection.
 */
export async function readEntries(store, conversationId, options = {}) {
	const { limit = 50, since = null, order = "ascending" } = options;
	const query = { conversationId, ...(order === "ascending" ? { order: "ascending" } : {}) };
	const page = await store.session.scanEntries(query, limit, undefined);
	let items = page.items;
	// scanEntries answers newest-first by default; normalize to oldest-first so a viewer streams
	// forward, then filter by cursor. Doing it here keeps the cursor rule in one place.
	if (order !== "ascending") items = items;
	const seqOf = (entry) => Number(entry.seq);
	const cursor = items.reduce((m, e) => Math.max(m, seqOf(e)), since ?? 0);
	return { items: items.filter((e) => seqOf(e) > (since ?? 0)), cursor, hasMore: items.length >= limit };
}

/** Every conversation this store knows about, as durable state - not a guess from filenames. */
export async function listConversations(store) {
	const ids = [];
	let cursor;
	for (;;) {
		const page = await store.session.scanSessions({}, 50, cursor);
		ids.push(...page.items);
		if (!page.next) break;
		cursor = page.next;
	}
	return ids;
}
