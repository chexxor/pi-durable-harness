// src/tui/viewmode.mjs - the view/overlay state machine, headless.
//
// PROVENANCE: ~/Git/Durian-Pi/src/tui/viewmode.mjs (read 2026-11-15 at pin v1.5.1), whose header records
// ROADMAP 99's bug: "`i` used to be a THIRD view ... typing over a conversation DROPPED it, and Esc/submit
// always returned to the seat list". The rule that fixed it is kept as behaviour here: "Input is an
// OVERLAY, not a view: entering it REMEMBERS the view underneath, and closing it RESTORES that view, so a
// submit/cancel over a conversation lands back in that conversation."
//
// Dropped outright (single-agent harness; README says the orchestration layer is dropped, not
// reimplemented): VIEW_SEATS and the seat-selection transitions. This harness has ONE view, so the machine
// keeps exactly one view plus the overlay, and `unknown initial view -> VIEW_SEATS` became
// `unknown initial view -> VIEW_CONVERSATION` - the same "an unknown view must not become a silent third
// mode" rule with the seat default removed.
//
// Why it stays a separate module, in Durian-Pi's own words: pure and headless "so the transitions are
// testable without a terminal". Dropping the frame under an overlay is a bug a TTY makes painfully slow to
// see; a demo sees it in one assert.
//
// ADDED for the row surface (up-arrow recalls the previous prompt, the user's fourth symptom): pi's own
// prompt-history machine, spelled here because THIS machine is Durian-Pi's own overlay, not pi's component.
// The rule is pi's, read off pi's pinned dist at v1.5.1 (pi-tui dist/components/editor.js), and pi's OWN
// public API (`Editor.addToHistory`, pi-tui dist/components/editor.d.ts:90, whose doc says "Called after
// successful submission") is what the pi-style SCREEN uses instead (see src/tui/piscreen.mjs' piAddToHistory):
//   - pi's list is newest-first: pi's body is `text = text.trim(); if (!text) return;` then pi's no-consecutive-
//     duplicate rule (`if (this.history.length > 0 && this.history[0] === trimmed) return;`) then
//     `this.history.unshift(trimmed)`, capped at pi's own 100 entries (`this.history.pop()`).
//   - pi's cursor is `historyIndex = -1` (not browsing), `0` = most recent, larger = older.
//   - pi's recall is `navigateHistory(direction)`: it RETURNS when history is empty, moves with
//     `newIndex = historyIndex - direction` (up is -1, so up DEEPENS the index), refuses out-of-range moves,
//     captures pi's `historyDraft` when browsing first starts, and sets the line with
//     `setTextInternal(history[historyIndex], "start")`; back at -1 pi restores the draft it had captured.
//   - pi leaves browsing on submit and on setText (`exitHistoryBrowsing()`), so a recalled line that gets
//     ENTERed is a fresh submission rather than a stuck browsing mode.
// pi's arrow KEY is pi-tui's own keybinding name `tui.editor.cursorUp` (dist/keys.d.ts `KeyId`, pi's default
// key `up`), which src/tui/driver.mjs matches through pi-tui's exported `matchesKey` with pi's own `Key.up` -
// no escape byte is decoded here.

import { INPUT_MARK } from "./frame.mjs";

export const VIEW_CONVERSATION = "conversation";
export const MODE_INPUT = "input";
/** pi's own history size limit (pi-tui dist/components/editor.js: "Limit history size", 100). */
export const PI_HISTORY_LIMIT = 100;

/** Build the state machine: one view, plus the input overlay on top of it. */
export function createViewMode(initial = VIEW_CONVERSATION) {
 let view = VIEW_CONVERSATION;
 // `under` is what the overlay covers: entering input REMEMBERS it (the header's rule).
 let under = null;
 let open = false;
 let typed = [];
 // pi's prompt-history state, kept as pi keeps it (see the header): a newest-first list, `browse` is pi's
 // `historyIndex` (-1 = not browsing, 0 = newest) and `draft` is pi's `historyDraft`, the line the user was
 // typing when browsing first began.
 const historyList = [];
 let browse = -1;
 let draft = null;
 const machine = {
  get view() { return view; },
  get mode() { return open ? MODE_INPUT : "view"; },
  get typed() { return typed.join(""); },
  get history() { return historyList.slice(); },
  get browsing() { return browse; },
  // pi's `addToHistory`, in pi's own order and pi's own rules.
  noteHistory(text) {
   const trimmed = String(text ?? "").trim();
   if (!trimmed) return false;
   if (historyList.length > 0 && historyList[0] === trimmed) return false;
   historyList.unshift(trimmed);
   if (historyList.length > PI_HISTORY_LIMIT) historyList.pop();
   return true;
  },
  // pi's `navigateHistory(direction)`, in pi's own arithmetic: up is -1 and DEEPENS the index, down is +1
  // and returns toward the newest, and back at -1 pi restores the draft it captured when browsing began.
  recallHistory(direction) {
   if (!historyList.length) return { browsed: false, why: "no history yet" };
   const newIndex = browse - direction;
   if (newIndex < -1 || newIndex >= historyList.length) return { browsed: false, why: "nothing further" };
   if (browse === -1 && newIndex >= 0) draft = typed.join("");
   browse = newIndex;
   typed = browse === -1 ? [draft] : [String(historyList[browse] ?? "")];
   if (!open) under = view;
   open = true;
   return { browsed: true, typed: typed.join("") };
  },
  enterInput(text = "") {
   if (!open) under = view;
   open = true;
   typed = [String(text ?? "")];
   return machine;
  },
  append(text) {
   if (!open) throw new Error(`append with the overlay closed would type into a view, not into input`);
   typed.push(String(text ?? ""));
   return machine;
  },
  // Esc cancels: the view UNDER the overlay comes back whole.
  cancel() {
   if (!open) return { view, canceled: true, typed: "" };
   // pi leaves history browsing on setText, which is what a cancel does to the draft.
   browse = -1;
   draft = null;
   typed = [];
   const restored = under ?? view;
   under = null;
   open = false;
   view = restored;
   return { view: restored, canceled: true };
  },
  // Submit hands the typed line over and lands back in the SAME view the overlay covered.
  submit() {
   const text = typed.join("");
   const restored = under ?? view;
   // pi leaves history browsing on submit (`exitHistoryBrowsing()`), so the NEXT line types fresh.
   browse = -1;
   draft = null;
   typed = [];
   under = null;
   open = false;
   view = restored;
   return { view: restored, typed: text };
  },
  // The row the user sees while typing; the mark is frame.mjs's, so the overlay and the mark agree.
  overlayRow(underlyingRow, { width = Infinity } = {}) {
   const text = `${INPUT_MARK}${typed.join("")}`;
   return Number.isFinite(width) && text.length > width ? `${text.slice(0, Math.max(0, width - 1))}~` : text;
  },
 };
 return machine;
}
