// src/tui/rows.mjs - the row vocabulary: committed durable state -> rows of text.
//
// PROVENANCE: the transcript half of ~/Git/Durian-Pi/src/tui/client.mjs (`renderTui`: transcript
// rows, the streaming row, the status bar) and the loaded-window half of
// ~/Git/Durian-Pi/src/tui/conversation.mjs, read 2026-11-14 at pin v1.5.1.
//
// Dropped outright (this harness is single-agent, README: multi-seat orchestration is dropped,
// not reimplemented): the seat list, per-seat health/queue reads, the seat-selection row, the
// `ctx` line (client.mjs consumed ~/Git/Durian-Pi/src/context.mjs's measure and this harness has
// no such module, so no denominator logic is invented here), and the graph view.
//
// Changed, and why: the row vocabulary follows pi-durable's OWN transcript value instead of
// Durian-Pi's hand-rolled markers. pi-durable exports `TranscriptItem`
// (dist/harness/transcript.d.ts) as `{kind:"entry", entry}` | `{kind:"gap", after, upTo}`
// | `{kind:"earlier"}`, so the "gap" and "load earlier" rows below are rendered from that value
// rather than from Durian-Pi's `conversationExhausted` probe. Entry kinds come from pi-durable's
// own entry tokens (dist/entries.d.ts exports `UserEntry`..`CompactionEntry`, each an
// `Entry<D>` with `readonly kind: string`), so no kind string is spelled here.
// The in-flight partial is read from pi-durable's `LiveState` (dist/harness/live.d.ts:
// `generation.message` is the "committed throttled partial of the in-flight response",
// `tools` are the current tool round's `ToolSlot` presentations), so nothing here re-derives a
// partial from entries - Durian-Pi's `partialView()` helper is gone.
//
// Width is measured in terminal CELLS through pi-tui's own helpers (dist/utils.d.ts:
// `visibleWidth`, `truncateToWidth`, `replaceControlCharacters`), the same rule the row budget
// the other rows use. Pure: no TTY, no timers, no store, so the row shape is testable headlessly.

import { replaceControlCharacters, stripTerminalSequences, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { AssistantEntry, CompactionEntry, ResetEntry, SystemEntry, ToolResultEntry, UserEntry } from "@earendil-works/pi-durable";

/** The gutter every transcript row carries, so a frame reads as one list. */
const GUTTER = "  ";
/** The marker that makes the streaming row visibly NOT an entry row. */
const STREAM_MARK = "  ~ ";
/** The markers pi-durable's own `TranscriptItem` vocabulary turns into rows. */
const EARLIER_ROW = `${GUTTER}.. earlier (load earlier)`;
const GAP_ROW = `${GUTTER}.. gap (load more)`;

/** pi-durable's entry kinds, read from its own tokens - never typed out here. */
const ENTRY_KINDS = [UserEntry, SystemEntry, AssistantEntry, ToolResultEntry, ResetEntry, CompactionEntry];

/** Text of one pi-ai `Message` (dist/types.d.ts: `Message = SystemMessage | UserMessage | AssistantMessage | ToolResultMessage`). */
function messageText(message) {
	const content = message?.content;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	const parts = [];
	for (const block of content) {
		// The four content block shapes are spelled out in pi-ai's dist/types.d.ts:
		// TextContent {type:"text", text}, ThinkingContent {type:"thinking"}, ToolCall {type:"toolCall", name, arguments}.
		if (block?.type === "text") parts.push(block.text);
		else if (block?.type === "thinking") parts.push(`thinking: ${block.thinking}`);
		else if (block?.type === "toolCall") parts.push(`calls ${block.name} ${JSON.stringify(block.arguments ?? {})}`);
		else if (block?.type === "image") parts.push("[image]");
	}
	return parts.join(" ");
}

/** The visible text one committed entry contributes, from its `model` messages (EntryRecord.model). */
export function entryText(entry) {
	const messages = entry?.model;
	if (!Array.isArray(messages)) return String(entry?.data ?? "");
	return messages.map((message) => messageText(message)).join(" ");
}

/** One committed entry as one row: id, pi-durable's own kind string, and its text. */
export function entryRow(entry, { width = Infinity } = {}) {
	const kind = entry?.kind ?? "?";
	const text = entryText(entry);
	return line(`${GUTTER}#${entry?.id ?? "?"} ${kind} ${text ? ` ${text}` : ""}`, width);
}

/** One `TranscriptItem` of pi-durable's `TranscriptView` as one row. */
function transcriptItemRow(item, { width = Infinity } = {}) {
	if (item?.kind === "entry") return entryRow(item.entry, { width });
	// A gap and an earlier-window row are pi-durable's own words: the renderer says what to do
	// (load more / load earlier) and never invents the entries that are missing.
	// @temp: the bounds are reported so a reader can tell WHICH stretch is missing, and they are
	// @temp: pi-durable's own `after`/`upTo` (dist/harness/transcript.d.ts), not computed here.
	if (item?.kind === "gap") return line(`${GAP_ROW} after ${item.after} up to ${item.upTo}`, width);
	if (item?.kind === "earlier") return line(EARLIER_ROW, width);
	return line(`${GUTTER}? unknown transcript item ${String(item?.kind ?? item)}`, width);
}

/** The whole `TranscriptView.items` line, oldest first. */
export function transcriptRows(items, { width = Infinity } = {}) {
	// The rows go through pi-tui's own cell helpers, so a wide row degrades by truncation and
	// never by wrapping mid-cell (the same rule Durian-Pi's client applied per row).
	return (items ?? []).map((item) => transcriptItemRow(item, { width }));
}

/** Truncate to CELLS and sanitise control bytes, so a row is one row. */
function line(text, width) {
	const clean = replaceControlCharacters(text);
	// An infinite width means "no budget": the row is returned whole, because truncating at
	// Infinity is not the same as not truncating (pi-tui's helper pads/ellipsises otherwise).
	return Number.isFinite(width) ? truncateToWidth(clean, Math.max(0, Math.floor(width))) : clean;
}

/** The in-flight partial's text, from `LiveState.generation.message` - never from an entry. */
export function partialText(live) {
	return messageTextOf(live?.generation?.message);
}

function messageTextOf(message) {
	// A throttled partial is a JsonRepresentation<AssistantMessage>: same shape, content blocks
	// already settled as far as they were committed.
	if (!message) return "";
	const content = message.content ?? [];
	return Array.isArray(content) ? content.map((block) => messageText({ role: "assistant", content: [block] })).join(" ") : "";
}

/** The streaming rows: the in-flight generation and the tool round it is waiting on. */
export function streamingRows(live, { width = Infinity } = {}) {
	const rows = [];
	const run = live?.run;
	const generation = live?.generation;
	const tools = live?.tools;
	// No run means nothing is in flight: pi-durable's `LiveState.run` is "present exactly while
	// busy" (dist/harness/live.d.ts), so the streaming row disappears instead of going stale.
	if (!run && !generation && !tools) return rows;
	const attempt = generation?.attempt;
	const partial = partialText(live);
	const label = run ? "run" : "generation";
	const detail = partial || `attempt ${attempt ?? "?"}`;
	// Tool rounds: `ToolSlot.status` is "pending" | "running" | "done" (dist/harness/live.d.ts),
	// and `output` is the retained running output. Reported as part of the same streaming row so
	// a reader sees the in-flight state as ONE thing, never as transcript entries.
	const toolNote = Array.isArray(tools) ? tools.map((slot) => `${slot?.name ?? "tool"} ${slot?.status ?? "?"}`).join("; ") : "";
	rows.push(line(`${STREAM_MARK}${label} ${detail}`, width));
	if (toolNote) rows.push(line(`${STREAM_MARK}tools ${toolNote}`, width));
	// A compaction in flight is live state too (LiveState.compactions), and a run that ended
	// without an answer leaves `runFailure` there so a client can show it after the run.
	if (Array.isArray(live?.compactions) && live.compactions.length) {
		rows.push(line(`${STREAM_MARK}compacting ${live.compactions.map((c) => `${c?.taskId ?? "?"} ${c?.trigger ?? "?"}`).join("; ")}`, width));
	}
	if (live?.runFailure) rows.push(line(`${STREAM_MARK}run ended unanswered: ${live.runFailure.reason}`, width));
	return rows;
}

/** The header row: which conversation the frame is a view of, as durable state says. */
export function headerRow(conversationId, { width = Infinity } = {}) {
	return line(`${GUTTER}conversation ${conversationId} - durable transcript`, width);
}

/** The footer row: what the frame read, and how far the cursor got. */
export function footerRow({ entries, newest, cursor, exhausted, frames }, { width = Infinity } = {}) {
	// `cursor` is pi-durable's own `Cursor` (dist/types.d.ts: "Backend-owned JSON continuation
	// state that callers only round-trip"), so the footer only reports it, never rebuilds it.
	const end = exhausted ? "end of transcript" : cursor ? "more entries" : "cursor at start";
	return line(`${GUTTER}entries ${entries ?? 0} newest #${newest ?? "-"} ${end} watch frames ${frames ?? 0}`, width);
}

/** The whole frame: header, transcript rows, streaming rows, footer. */
export function frameRows({ items, live, conversationId, cursor, exhausted, frames, width = Infinity, limit = null }) {
	const rows = [headerRow(conversationId, { width })];
	const body = transcriptRows(items, { width });
	// A frame taller than the terminal is not scrolled here: the view window owns that, and
	// rows.mjs only turns state into rows (the driver decides HOW MANY of them fit).
	const kept = Number.isFinite(limit) && limit >= 0 && body.length > limit ? body.slice(body.length - limit) : body;
	rows.push(...kept);
	rows.push(...streamingRows(live, { width }));
	rows.push(footerRow({ items: (items ?? []).length, newest: newestOf(items), cursor, exhausted, frames }, { width }));
	return rows;
}

/** The newest entry id of a `TranscriptView.items` line, or null when it holds nothing. */
function newestOf(items) {
	// TranscriptView.items are in entry-ID order, so the last entry item is the newest held.
	for (let i = (items?.length ?? 0) - 1; i >= 0; i--) {
		const item = items[i];
		if (item?.kind === "entry") return item.entry?.id ?? null;
	}
	return null;
}

/** The entry kinds pi-durable itself names, so a caller can compare kinds without typing them. */
export function knownEntryKinds() {
	return ENTRY_KINDS.map((entry) => entry.kind);
}

/** The visible width of a row, in CELLS, through pi-tui's own measure. */
export function rowWidth(row) {
	const visible = stripTerminalSequences(row);
	return visibleWidth(visible);
}