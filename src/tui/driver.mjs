// src/tui/driver.mjs - the key/tick machine that decides WHEN a frame paints, headless.
//
// PROVENANCE: ~/Git/Durian-Pi/src/tui/driver.mjs (read 2026-11-15 at pin v1.5.1), whose header states the
// contracts this module keeps: "Poll, not freelock: paint on input/data/resize only (never an
// unconditional render loop); a tick that is running is skipped, never queued/executed concurrently; a
// failed read is caught and surfaced INSIDE the next frame" and "Keys: q / ESC / Ctrl+C -> onExit("quit");
// r -> one immediate tick (refresh)".
//
// Dropped from that original (single-agent harness): the seat list, seat navigation (`onNavigate`/`onBack`),
// the queue badge, the per-seat health read, and the graph view. The driver's ONE concern - the tick and key
// machine - is kept; the multi-seat reads around it are not.
//
// Changed, and why:
//   - Durian-Pi owned terminal bytes (src/tui/paint.mjs' `composeFrame`, src/tui/restore.mjs' ENTER_ALT/HIDE_CURSOR
//     constants). Here the bytes are pi-tui's (see ./frame.mjs header: pi-tui's screens bracket a frame with
//     the synchronized-output pair and own alt-screen/cursor state), so this module never writes an escape
//     sequence and `onExit` is a callback the entrypoint answers with pi-tui's own teardown.
//   - "poll" here is pi-durable's own planes rather than a timer of ours: the sync cursor read and the
//     watch frames (see ./sync.mjs). `pollMs` only bounds how often the SYNC plane is re-read when nothing
//     else signalled a paint - the watch plane is never polled (chord's WatchHandle contract: the listener is
//     invoked by the Session and folded, not slept on).
//   - keys are pi-tui's vocabulary: dist/keys.d.ts exports `parseKey` and `matchesKey` with `KeyId` names
//     (`Key.esc`, `Key.ctrl("c")`), so a driver does not hand-decode escape bytes here.
//
// Headless by construction: no TTY, no stdin, no timers of our own (an injected `now` instead), so the demo
// drives it with a fake key stream and asserts the tick order and the skip rules.

import { Key, matchesKey, parseKey } from "@earendil-works/pi-tui";
import { createSyncState, advanceSync, snapshotSync } from "./sync.mjs";
import { renderFrame } from "./frame.mjs";
import { createViewMode } from "./viewmode.mjs";

/** The keys the driver answers, kept as data so a demo can assert the machine without a TTY. */
export const DRIVER_KEYS = {
 quit: ["q", Key.esc, Key.ctrl("c")],
 refresh: ["r", Key.ctrl("r")],
 submit: ["enter", Key.enter],
 cancel: [Key.esc],
 // pi's own arrow keybinding names (dist/keybindings.js `tui.editor.cursorUp`/`cursorDown`, whose default
 // keys are pi's own KeyId words `up`/`down` from dist/keys.d.ts), so a history move is spelled in pi's
 // vocabulary and a run never compares a raw `\x1b[A` here.
 history: [Key.up, Key.down],
};

/** Decode one stdin chunk into key pieces, through pi-tui's OWN parser (dist/keys.d.ts `parseKey`).
 *
 * A terminal hands over ONE key per read, but a pipe may hand over several keys at once, so the chunk is
 * cut into key-sized pieces first: an escape sequence is kept WHOLE (ESC, `ESC [`/`ESC O`, the parameter
 * bytes and the final byte - so `\x1b[A` stays one piece and pi-tui's parseKey can name it `Key.up`),
 * and every other character is one key. Which key a piece IS remains pi-tui's answer, not a table here.
 */
export function decodeKeys(chunk) {
	const text = String(chunk ?? "");
	const keys = [];
	let at = 0;
	while (at < text.length) {
		const ch = text[at];
		if (ch === "\x1b") {
			let end = at + 1;
			if (end < text.length && (text[end] === "[" || text[end] === "O")) {
				end++;
				while (end < text.length && /[0-9;<=>?]/.test(text[end])) end++;
				if (end < text.length) end++;
			}
			keys.push(text.slice(at, end));
			at = end;
			continue;
		}
		keys.push(ch);
		at++;
	}
	return keys;
}

/**
 * Build the driver.
 *
 * @param {function} getSize - () => { columns, rows }; injected, because a headless demo has no stdout
 * @param {function} readState - async () => the view state (see ./sync.mjs `snapshotSync`)
 * @param {function} paint - (state, { width, height }) => captured frame (see ./frame.mjs `renderFrame`)
 * @param {function} [opts.onExit] - (reason) => void, once per quit path; the entrypoint tears the terminal
 *   down there (pi-tui's own screens own that work)
 * @param {number} [opts.pollMs] - the SYNC plane re-read bound when nothing else changed
 * @param {function} [opts.onInput] - (typedLine) => void, what the entrypoint does with a submitted line
 * @param {array} [opts.history] - pi's prompt-history SEED, oldest first (pi's `addToHistory` order, so the
 *   LAST entry handed over is the newest at index 0 and pi's up-arrow reads it first). A surface that shows
 *   the user previous prompts - the row-view TUI - hands pi-durable's committed `pi.user` prompts here, and
 *   every prompt THIS session submits is pushed through pi's own history rule, which is what makes pi's up-
 *   arrow recall answer instead of typing an escape sequence into the line.
 * @param {boolean} [opts.quitOnBareQ] - is a bare `q` a quit? Durian-Pi's headless key machine says yes,
 *   and the headless demos keep that answer. A USER-facing interactive window says no: a chat line has
 *   to be able to start with the letter q, so ESC and Ctrl+C are the quits there and the entrypoint
 *   turns a submitted line of `q`/`quit` into the same exit.
 * @param {boolean} [opts.refreshOnBareR] - is a bare `r` on an empty line the refresh command? Durian-Pi's
 *   headless key machine says yes and the scripted demos keep that answer; a USER-facing interactive window
 *   says no, because a chat line legally STARTS with `r` ("run the tests"), and there only pi's own Ctrl+R
 *   refreshes - the same split `quitOnBareQ` draws for `q`, and defaults to it. Measured: with a bare `r`
 *   claimed on a real terminal, the typed prompt "remember the number seven" reached the agent as
 *   `emember the number seven`, i.e. the first letter was eaten. Kept for the headless demos only.
 */
export function createUiDriver({ getSize, readState, paint, onExit = () => {}, pollMs = 500, onInput = () => {}, history = [], color = false, quitOnBareQ = true, refreshOnBareR = quitOnBareQ } = {}) {
 let running = false;
 let painted = 0;
 let lastPaintAt = null;
 let lastError = null;
 let dirty = true;
 const marks = [];
 const view = createViewMode();
 const typedOut = [];
 // pi's seed goes through pi's own history rule (see ./viewmode.mjs), in oldest-first order, so pi's newest-
 // first list ends with the newest prompt at index 0, which is what pi's up-arrow reads first.
 for (const text of history) view.noteHistory(text);

 const mark = (reason) => {
  dirty = true;
  marks.push(reason);
 };

 const noteResize = (columns, rows) => {
  mark(`resize ${columns}x${rows}`);
 };

 // A typed line is handed to onInput and then CLEARED from the overlay, so a later submit cannot resend
 // text the user already sent.
 const noteData = (chunk) => {
  for (const raw of decodeKeys(chunk)) {
   const id = parseKey(raw) ?? raw;
   // A command key counts only before the line has started, so typing a letter that names one is a
   // letter, not a command (`r` inside "re-run", `q` inside "quiet").
   const idle = view.mode !== "input";
   // ESC and Ctrl+C quit in every mode. A bare `q` and `r` are COMMAND keys only on an EMPTY line (the
   // overlay closed): once the user is typing, every letter belongs to the line, which is what lets a
   // chat line say "quiet" or "re-run" instead of quitting or repainting. Durian-Pi's headless rule (q
   // quits) is kept for the empty-line case, spelled with pi-tui's own Key names.
   if (matchesKey(raw, Key.esc) || matchesKey(raw, Key.ctrl("c"))) return { quit: id };
   if (idle && quitOnBareQ && id === "q") return { quit: id };
   if (idle && (refreshOnBareR && id === "r" || matchesKey(raw, Key.ctrl("r")))) {
    mark("refresh (one immediate tick)");
    continue;
   }
   if (id === "enter" || id === "return") {
    const submitted = view.submit();
    if (submitted.typed) {
     typedOut.push(submitted.typed);
     onInput(submitted.typed);
     // pi adds a submitted prompt to its history AFTER the submission (pi's `addToHistory` doc: "Called after
     // successful submission."), which is what lets up-arrow find it again.
     view.noteHistory(submitted.typed);
    }
    mark("input submitted");
    continue;
   }
   // pi's up/down arrow answer at an input surface is its PROMPT HISTORY, not a cursor move on a blank field:
   // `tui.editor.cursorUp` -> `navigateHistory(-1)` (dist/components/editor.js), and pi browses when the draft
   // is empty or browsing is already under way (pi's rule: `isOnFirstVisualLine() && (isEditorEmpty() ||
   // historyIndex > -1 || cursorCol === 0)`). This overlay has ONE line and no caret, so the states it can
   // PROVE are exactly pi's empty-draft case and pi's browsing case; an arrow over a line that already has
   // text is pi's cursor move, and on a one-line overlay it has nowhere to go - so it marks a repaint but
   // types NOTHING, which is the fix for the user's report of escape bytes landing in the prompt.
   if (matchesKey(raw, Key.up) || matchesKey(raw, Key.down)) {
    const browsing = view.browsing > -1;
    const up = matchesKey(raw, Key.up);
    const canBrowse = browsing || view.mode !== "input" || !view.typed;
    if (canBrowse && (up || browsing)) {
     const recalled = view.recallHistory(up ? -1 : 1);
     mark(recalled.browsed ? "history recalled" : `history: ${recalled.why}`);
     continue;
    }
    mark("cursor move on a one-line overlay (nowhere to go)");
    continue;
   }
   // Any other key belongs to the input overlay: the TUI itself never writes durable state (a viewer reads;
   // only a typed prompt is data, and it goes to `onInput`, never to a store write here).
   if (view.mode === "input") view.append(raw);
   else view.enterInput(raw);
   mark("input");
  }
  return { quit: null };
 };

 const tick = async () => {
  // A tick that is running is SKIPPED, never queued: two frames never run concurrently over one view state.
  if (running) return { skipped: true, why: "a tick is already running" };
  running = true;
  try {
   const state = await readState();
   const size = getSize();
   try {
    const frame = paint(state, { width: size.columns, height: size.rows });
    painted += 1;
    return { painted: true, frame, state, error: lastError };
   } catch (err) {
    // A failed read is surfaced INSIDE the next frame rather than swallowed or thrown at the terminal.
    lastError = String(err?.message ?? err);
    return { painted: false, error: lastError, state: null };
   }
  } finally {
   running = false;
  }
 };

 const tickIfDirty = async () => {
  if (!dirty) return { skipped: true, why: "nothing changed since the last paint" };
  const result = await tick();
  if (result.painted) dirty = false;
  return result;
 };

 const poll = async (now) => {
  // The poll bound only re-reads the sync plane when nothing signalled a paint; `now` is injected so a
  // headless demo can assert the bound without sleeping.
  if (lastPaintAt !== null && now - lastPaintAt < pollMs) return { skipped: true, why: "within pollMs" };
  const result = await tickIfDirty();
  if (result.painted) lastPaintAt = now;
  return result;
 };

 const submitInput = async () => {
  const result = view.submit();
  if (result.typed) {
   typedOut.push(result.typed);
   onInput(result.typed);
   view.noteHistory(result.typed);
  }
  mark("input submitted");
  return result;
 };

 const cancelInput = () => {
  const result = view.cancel();
  mark("input cancelled");
  return result;
 };

 const quit = async (reason) => {
  onExit(reason);
  return { exit: reason };
 };

 return {
  mark,
  noteData,
  noteResize,
  tick,
  tickIfDirty,
  poll,
  submitInput,
  cancelInput,
  quit,
  view,
  get history() { return view.history; },
  get painted() { return painted; },
  get dirty() { return dirty; },
  get marks() { return marks.slice(); },
  get typedOut() { return typedOut.slice(); },
 };
}
