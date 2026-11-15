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
 * @param {boolean} [opts.quitOnBareQ] - is a bare `q` a quit? Durian-Pi's headless key machine says yes,
 *   and the headless demos keep that answer. A USER-facing interactive window says no: a chat line has
 *   to be able to start with the letter q, so ESC and Ctrl+C are the quits there and the entrypoint
 *   turns a submitted line of `q`/`quit` into the same exit.
 */
export function createUiDriver({ getSize, readState, paint, onExit = () => {}, pollMs = 500, onInput = () => {}, color = false, quitOnBareQ = true } = {}) {
 let running = false;
 let painted = 0;
 let lastPaintAt = null;
 let lastError = null;
 let dirty = true;
 const marks = [];
 const view = createViewMode();
 const typedOut = [];

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
   if (idle && (id === "r" || matchesKey(raw, Key.ctrl("r")))) {
    mark("refresh (one immediate tick)");
    continue;
   }
   if (id === "enter" || id === "return") {
    const submitted = view.submit();
    if (submitted.typed) {
     typedOut.push(submitted.typed);
     onInput(submitted.typed);
    }
    mark("input submitted");
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
  get painted() { return painted; },
  get dirty() { return dirty; },
  get marks() { return marks.slice(); },
  get typedOut() { return typedOut.slice(); },
 };
}
