// src/readapi.mjs - the ONE read-only surface for the durable store.
//
// PROVENANCE: extracted from ~/Git/Durian-Pi/src/readonlystore.mjs and ~/Git/Durian-Pi/src/readapi.mjs
// (a helper that read a store some other process owned), read 2026-11-14 at pin v1.5.1. What changed:
//   - Durian-Pi re-implemented its own paging helpers over the store; here the surface is three reads
//     (openStore, readEntries, listConversations) and every page shape is pi-durable's own `Page`;
//   - no SQL, no direct file reads, no second storage opener of our own: the store is whatever
//     pi-durable's one opener says it is;
//   - seats, cross-seat queue, broker/serve, genlock, worktrees, metrics, check, constitution, selfdev:
//     dropped outright.
//
// WHY a `readOnly` Harness and not a plain open (all of this is quoted behaviour, not inference):
//   node_modules/@earendil-works/pi-durable/dist/harness/types.d.ts:694 declares `readOnly?: boolean`
//   inside HarnessOptions, and its doc says: "Open for reading only, as a viewer of a session that
//   another process drives... Open recovers nothing: a `running` task stays as committed. Every commit
//   with writes rejects with `ReadOnlySession` before it reaches Storage, and so does `resume()` and
//   every call that enables scheduling; the Harness stays usable for reads and watches."
//   So the viewer is structurally unable to open a second mutation line on a store another process
//   owns - which is exactly the rule src/ownership.mjs states, enforced by pi-durable rather than by
//   a convention we hope for.
//   Measured on this pin: openNodeSqliteStorage(path, { mode: "read-only" }) throws
//   "attempt to write a readonly database" - the opener applies its migrations when it opens - so a
//   viewer opens the ordinary opener and stays read-only at the Harness, not at the file handle.

import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { Harness, createRegistry } from "@earendil-works/pi-durable";
import { createModels } from "@earendil-works/pi-ai";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { resolve } from "node:path";

/**
 * Open a store the way a viewer does: pi-durable's one opener, then a `readOnly` Harness.
 *
 * Returns the plain storage too, because the storage plane owns the only two reads that go across
 * conversations (`scanConversations`, `scanEntries`); both are reads by signature, so no caller of
 * this file can turn them into writes.
 */
export async function openStore(storePath, options = {}) {
	const storage = await openNodeSqliteStorage(resolve(storePath), options.storage ?? {});
	// A viewer needs a registry to describe the tools it saw, but it installs nothing: pi-durable reads
	// the offered tools of an OPEN run from the committed transcript (`pi.system` entries), so an empty
	// registry here is the viewer's own toolset, not a re-derivation of the writer's.
	// A viewer still needs a registry and a model plane, because Harness.open asks for both; the viewer
	// installs no tools and arms no provider, so nothing it holds can answer a request - it can only
	// read what the writer committed. (Measured: Harness.open rejects without `registry` and `models`.)
	const harness = await Harness.open(storage, {
		readOnly: true,
		models: options.models ?? createModels(),
		registry: options.registry ?? createRegistry(),
		...(options.harness ?? {}),
	}, BACKGROUND_CONTEXT);
	return { storage, harness, storePath: resolve(storePath) };
}

/**
 * One page of a conversation's committed entries, with pi-durable's own cursor.
 *
 * `entries(query, limit, cursor, context)` is the fork-aware history read the Harness itself uses, so
 * a viewer sees the same active line the writer is answering on - not a reconstruction. The cursor
 * that comes back (`page.next`) is what resumes the scan; this file does not invent an offset, a
 * timestamp, or a `seq` of its own.
 */
export async function readEntries(store, conversationId, options = {}) {
	// `cursor` is pi-durable's own Page.next from the previous call (dist/storage/scan.d.ts: a cursor is
	// `{after, order}`, and "a cursor continues in the order it was created with"). Passing `null`
	// instead of omitting it is a storage request error, so the default must stay `undefined`.
	const { limit = 50, cursor, context = BACKGROUND_CONTEXT, order = "ascending", minEntryId = null } = options;
	const conversation = await store.harness.conversation(conversationId, context);
	if (!conversation) throw new Error(`no conversation ${conversationId} in this store`);
	const page = await conversation.entries({ order, ...(minEntryId ? { minEntryId } : {}) }, limit, cursor, context);
	return { items: page.items, next: page.next, conversationId };
}

/**
 * Every conversation the store knows about, as durable state.
 *
 * `scanConversations` is the storage plane's scan (dist/types.d.ts: "Scan conversations in `query.order`
 * (default ascending) by ID"), and `Page.next` is its cursor: a store with more conversations than
 * `limit` pages instead of being truncated at a made-up cap. ConversationRecord carries `id`, an
 * optional fork `parent`, and an optional creator `owner` - nothing else is reported, because the
 * store does not keep titles or timestamps for a conversation.
 */
export async function listConversations(store, options = {}) {
	const { limit = 50, context = BACKGROUND_CONTEXT } = options;
	const rows = [];
	let cursor;
	for (;;) {
		const page = await store.storage.scanConversations({}, limit, cursor, context);
		for (const row of page.items) rows.push({ id: row.id, parent: row.parent ?? null, owner: row.owner ?? null });
		if (!page.next) break;
		cursor = page.next;
	}
	// A scan that returns no rows on the first page is an empty store, not a failed read; the caller
	// decides whether that is an error, so this stays a plain array.
	return rows;
}

/**
 * One proof-shaped usage read, so a viewer can report what a run spent without re-deriving it.
 *
 * @temp: the point of this helper is that the viewer never rebuilds usage from entries; pi-durable
 * @temp: keeps the numbers, and this file only hands them over.
 */
export async function usage(store, options = {}) {
	const { context = BACKGROUND_CONTEXT } = options;
	// pi-durable's usage read is Harness-level: dist/harness/harness.d.ts `usage(context): Promise<UsageState>`,
	// documented as "Session total: every conversation's `pi.usage` summed". There is no conversation-scoped
	// usage method at this pin (dist's Conversation surface has no `usage`), so the store's ledger is the read,
	// and a caller that wants one conversation's numbers filters the buckets it cares about.
	return await store.harness.usage(context);
}
