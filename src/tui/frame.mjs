// src/tui/frame.mjs - a frame of rows -> pi-tui's component tree -> the painted lines.
//
// PROVENANCE: the frame concern of ~/Git/Durian-Pi/src/tui/client.mjs (`renderTui` and `frameToLines`,
// read 2026-11-15 at pin v1.5.1) plus the height clip of ~/Git/Durian-Pi/src/tui/paint.mjs
// (`composeFrame`, read the same day). Dropped outright (this harness is single-agent): the seat list,
// the per-seat health/queue rows, the seat-selection row, the `ctx` line, the graph view.
//
// What changed, and why:
//   - Durian-Pi composed its OWN bytes (`composeFrame`: home+clear, rows clipped to terminal height,
//     wrapped in DECSET 2026 through its own src/tui/sync.mjs wrapper). This harness renders through
//     pi-tui instead: every component here answers pi-tui's OWN `Component` interface
//     (dist/tui.d.ts: `render(width: number): string[]`), and pi-tui's renderer already brackets a
//     frame with the synchronized-output pair (dist/tui-main-screen.js writes `\x1b[?2026h` ...
//     `\x1b[?2026l`; dist/tui-alt-screen.js uses the same pair) - so NO second wrapper is emitted here,
//     and the frame's bytes are pi-tui's, not our escape codes.
//   - Durian-Pi's alt-screen/cursor restore (src/tui/restore.mjs's enter/restore pair, hand-written
//     ENTER_ALT/LEAVE_ALT/HIDE_CURSOR/SHOW_CURSOR constants) belongs to pi-tui's screens
//     (dist/tui-alt-screen.d.ts exports `TuiAltScreen`, dist/tui-main-screen.d.ts exports
//     `TuiMainScreen`), so this module does not write those sequences.
//   - the rows themselves come from ./rows.mjs (pi-durable's transcript values and LiveState), and the
//     paging/watch state comes from ./sync.mjs - this file only decides what RENDERS and how, so the
//     demo can capture frames headlessly by calling `paint()` without any terminal.
//   - width is one number threaded through every component (pi-tui measures in CELLS, dist/utils.d.ts
//     `visibleWidth`/`truncateToWidth`), which is why a wide row degrades by truncation, never by
//     wrapping mid-cell - Durian-Pi's per-cell rule, kept, applied by pi-tui's own helper.
//
// The input overlay keeps Durian-Pi's rule (src/tui/viewmode.mjs: "Input is an OVERLAY, not a view:
// entering it REMEMBERS the view underneath, and closing it RESTORES that view"), composed here with
// pi-tui's own line compositing (dist/tui.d.ts `compositeTuiLine`) rather than Durian-Pi's string splice.

import { Container, compositeTuiLine, Text, TruncatedText, visibleWidth } from "@earendil-works/pi-tui";
import { frameRows, headerRow, entryRow, streamingRows, footerRow, rowWidth } from "./rows.mjs";
import { applyThemeToRows } from "./theme.mjs";

/** One text row as a pi-tui component that truncates to the terminal width instead of wrapping. */
export function rowComponent(row, { width = Infinity } = {}) {
 // `TruncatedText` is pi-tui's own component for "one line, clipped" (dist/components/truncated-text.d.ts
 // `constructor(text, paddingX?, paddingY?)`), so the clip is pi-tui's rule, not ours.
 const component = new TruncatedText(String(row ?? ""), 0, 0);
 return { component, row: String(row ?? "") };
}

/** Build the component tree for one frame of rows (one `Text` per row, stacked by a `Container`). */
export function buildFrame(rows, { width = Infinity } = {}) {
 const container = new Container();
 const parts = [];
 for (const row of rows ?? []) {
  const part = rowComponent(row, { width });
  container.addChild(part.component);
  parts.push(part);
 }
 return { container, parts };
}

/**
 * The captured paint: what pi-tui would write for this frame, as lines.
 *
 * @param {object} frame as returned by `buildFrame`
 * @param {number} [opts.width] terminal columns
 * @param {number} [opts.height] terminal rows; rows past it are dropped (a frame taller than the
 *   viewport would scroll and tear the layout - Durian-Pi's `composeFrame` clip, kept as a rule)
 * @returns {{lines, dropped, width, height}} so a demo can assert BOTH what rendered and what was cut
 */
export function paint(frame, { width = 80, height = Infinity } = {}) {
 const lines = frame.container.render(width);
 const h = Number.isFinite(height) ? Math.max(0, Math.floor(height)) : lines.length;
 const kept = lines.slice(0, h);
 return {
  lines: kept,
  dropped: lines.slice(h),
  width,
  height: h,
  // pi-tui's own cell measure, so the demo can assert no painted row exceeds the width in CELLS.
  maxCells: kept.reduce((max, line) => Math.max(max, visibleWidth(line)), 0),
 };
}

/**
 * The frame rows with the INPUT OVERLAY laid over one of them.
 *
 * Compositing here, and colouring the draft BEFORE compositing it, is what keeps pi's palette on the
 * line the user is typing: src/tui/theme.mjs `applyThemeToRows` colours a row that STARTS with
 * `INPUT_MARK`, and pi-tui's own `compositeTuiLine` wraps whatever it composites in its own escapes,
 * so a surface that themed the whole frame afterwards leaves that already-escaped row alone (theme.mjs'
 * own rule: a row that carries an escape introducer keeps the colours it was built with). `overlay` is
 * an input machine answering `mode` ("input" while the user is typing) and `overlayRow(base, { width })`
 * - see ./viewmode.mjs; `theme`, when handed over, paints just the draft with pi's palette. `overlayRow`'s
 * `cover` makes the typed row own the whole row it stands on, so the frame row underneath never shows
 * through the middle of a word. While the overlay is closed the rows come back untouched: the frame UNDER
 * it stays whole, and the next paint rebuilds it (the header's rule).
 */
export function withInputOverlay(rows, overlay = null, { width = 80, at = 1, theme = null } = {}) {
 const list = (Array.isArray(rows) ? rows : []).map(String);
 if (!overlay || overlay.mode !== "input" || !list.length) return list;
 const index = Math.max(0, Math.min(Math.floor(Number(at)), list.length - 1));
 const out = list.slice();
 const draft = String(overlay.overlayRow(out[index], { width }) ?? "");
 const coloured = theme ? applyThemeToRows([draft], theme, { inputMark: INPUT_MARK }).lines[0] : draft;
 out[index] = overlayRow(out[index], coloured, { width, at: 0, cover: true });
 return out;
}

/**
 * One frame from the sync state, in one call: rows -> components -> lines.
 *
 * `limit` is the row budget (the terminal's height minus header/footer); the transcript rows are the
 * tail, which is what a client wants when it can only show the newest stretch - pi-durable's own
 * `ConversationWindow` decides what the window holds, this only decides what paints.
 *
 * `overlay`/`overlayAt` lay an input machine over one row (see `withInputOverlay`), so BOTH `rows` and
 * `painted.lines` carry what the user actually sees while typing - a row surface whose typed draft is
 * never painted is a surface the user types blind. `theme` colours just that draft with pi's palette.
 */
export function renderFrame(sync, { width = 80, height = 24, limit = null, conversationId = sync.conversationId, overlay = null, overlayAt = 1, theme = null } = {}) {
 const rows = withInputOverlay(
  frameRows({ ...sync, width, ...(limit === null ? {} : { limit }) }),
  overlay,
  { width, at: overlayAt, theme },
 );
 const frame = buildFrame(rows, { width });
 return { rows, frame, painted: paint(frame, { width, height }) };
}

/**
 * The input OVERLAY: the row being typed sits ON TOP of the frame, which stays underneath.
 *
 * @param {string} base the frame row the overlay covers
 * @param {string} overlay the typed row (the prompt mark and the text so far)
 * @param {number} [opts.width] terminal columns
 * @returns {string} the composited line, through pi-tui's own `compositeTuiLine`
 *   (dist/tui.d.ts: "Composite overlay content into a terminal line at a fixed column")
 */
export function overlayRow(base, overlay, { width = 80, at = 0, cover = false } = {}) {
 const text = String(overlay ?? "");
 // `cover` asks pi-tui's own compositing for the whole row (overlayWidth === width), so a short typed
 // draft never leaves the row underneath showing through the middle of a word.
 return compositeTuiLine(String(base ?? ""), text, at, cover ? width : Math.min(visibleWidth(text), width), width);
}

/** The overlay prompt mark - reported here so a demo can assert what the user sees while typing. */
export const INPUT_MARK = "> ";

/** Whether a frame row is one of our own rows (header/transcript/stream/footer), by the gutter marks. */
export function classifyRow(row) {
 const text = String(row ?? "");
 if (/^\s*#/.test(text)) return "transcript";
 if (/^~/.test(text)) return "stream";
 if (/^\s*[-=]/.test(text)) return "meta";
 return "other";
}
