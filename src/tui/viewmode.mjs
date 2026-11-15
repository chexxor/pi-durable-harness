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

import { INPUT_MARK } from "./frame.mjs";

export const VIEW_CONVERSATION = "conversation";
export const MODE_INPUT = "input";

/** Build the state machine: one view, plus the input overlay on top of it. */
export function createViewMode(initial = VIEW_CONVERSATION) {
 let view = VIEW_CONVERSATION;
 // `under` is what the overlay covers: entering input REMEMBERS it (the header's rule).
 let under = null;
 let open = false;
 let typed = [];
 const machine = {
  get view() { return view; },
  get mode() { return open ? MODE_INPUT : "view"; },
  get typed() { return typed.join(""); },
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
