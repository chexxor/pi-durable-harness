// src/viewmodel.mjs - how a committed entry and an in-flight partial become display rows, and the ONE rule
// that separates them: a partial is a row of kind "partial" and never counts as an entry.
//
// PROVENANCE: the row-shape idea is extracted from ~/Git/Durian-Pi/src/viewmodel.mjs (transcript rows for a
// read-only viewer) and ~/Git/Durian-Pi/src/livewatch.mjs (a partial rendered as a streaming row), read
// 2026-11-14 at pin v1.5.1. What changed: those files reconstructed both rows from Durian-Pi's own store
// reads; here a committed entry comes from pi-durable's EntryRecord and a partial comes from the `pi.live`
// conversation document, so there is nothing to reconstruct and the two kinds cannot be confused by a flag
// a caller has to thread along.
//
// VERIFIED AGAINST PINED 1.5.1 (quoted, not inferred):
//   dist/harness/live.d.ts:140 `/** Committed throttled partial of the in-flight response. */` over
//   `message?: JsonRepresentation<AssistantMessage>` inside `LiveState.generation`, and dist/harness/live.js:4
//   `kind: "pi.live"` - which is why the partial is read as `view.docs["pi.live"]`.
//   dist/harness/types.d.ts (CommitPersistence): "the Session adopts it in memory, shows it to watches and
//   views, and resolves, but stores it later" - a partial can be OBSERVED before it is STORED, and a crash
//   loses it, so treating a partial as an entry would let a viewer count a turn that may never exist.
//   dist/harness/types.d.ts EntryRecord: `{ id, conversationId, kind, model?: readonly Message[], data?, head?, ... }`
//   and pi-ai's TextContent is `{ type: "text", text }`, while a tool call part is `{ type: "toolCall", name }`
//   (dist/api/anthropic-messages.d.ts and the committed transcripts of demo/core.test.mjs agree).

/** Text of one message, over pi-ai's own content-part shape: `content` is a string or a list of parts. */
function textOf(message) {
 if (!message) return "";
 const content = message.content ?? "";
 if (typeof content === "string") return content;
 return content.filter((part) => part.type === "text").map((part) => part.text).join("");
}

/**
 * One committed entry as a display row.
 *
 * `entry.kind` is pi-durable's own discriminator, so the row keeps it verbatim: a compaction summary and a
 * reset marker are head markers, and pi-durable says so with `head` - "First entry in the active context
 * selected by this entry" - which the row carries rather than re-deriving.
 */
export function entryRow(entry) {
 const messages = entry.model ?? [];
 return {
 kind: entry.kind,
 id: entry.id,
 head: entry.head ?? null,
 text: textOf(messages[messages.length - 1]).replace(/\s+/g, " ").slice(0, 200),
 toolCalls: messages.flatMap((message) => (Array.isArray(message.content) ? message.content : []).filter((part) => part.type === "toolCall").map((part) => part.name)),
 };
}

/**
 * The in-flight partial as a STREAMING row - never an entry row.
 *
 * The reason this cannot share entryRow's shape is quoted in the header: the progress commits that write
 * `pi.live` are DEFERRED, so a watch can show a partial the store has not stored, and a crash loses it. A
 * viewer that counted it as an entry would report a turn that may never exist; `kind: "partial"` is what
 * keeps the callers from counting it.
 */
export function partialRows(live) {
 if (!live) return [];
 const rows = [];
 const generation = live.generation;
 if (generation?.message) {
 rows.push({
 kind: "partial",
 id: null,
 head: null,
 text: textOf(generation.message).replace(/\s+/g, " ").slice(0, 200),
 toolCalls: [],
 attempt: generation.attempt,
 retry: generation.retry ? `retry at ${generation.retry.at}: ${generation.retry.error}` : null,
 });
 }
 for (const slot of live.tools ?? []) {
 if (slot.status === "done") continue;
 rows.push({
 kind: "partial",
 id: null,
 head: null,
 text: String(slot.output ?? "").replace(/\s+/g, " ").slice(0, 200),
 toolCalls: [slot.name],
 attempt: generation?.attempt ?? 1,
 retry: null,
 status: slot.status,
 unoffered: slot.unoffered === true,
 });
 }
 if (live.runFailure) {
 rows.push({ kind: "partial", id: null, head: null, text: `run ended without an answer: ${live.runFailure.reason}`, toolCalls: [], attempt: generation?.attempt ?? 1, retry: null });
 }
 return rows;
}

/** One row as one line, with the partial's `~` prefix so a terminal shows which kind a line is. */
export function formatRow(row) {
 const calls = row.toolCalls.length ? ` -> ${row.toolCalls.join(", ")}` : "";
 const suffix = row.attempt && row.attempt > 1 ? ` attempt ${row.attempt}` : "";
 return `${row.kind === "partial" ? "~" : row.kind}${row.id ? ` #${row.id}` : ""}${row.head ? ` head=${row.head}` : ""} ${row.text}${calls}${suffix}`;
}

