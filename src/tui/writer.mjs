// src/tui/writer.mjs - the TUI as the session's OWN process: the view planes over the writer's
// Harness, and a typed line goes to that same conversation.
//
// PROVENANCE: the writer/reader split is this harness's, not an extraction - Durian-Pi's TUI was a
// seat-switcher over a broker (~/Git/Durian-Pi/src/tui/driver.mjs, ui.mjs, readstate.mjs, read 2026-11-15
// at pin v1.5.1), and its seat list, seat navigation, the queue badge and the graph view are dropped
// outright here (single-agent harness). What is kept from that original is the rule that the TUI decides
// WHEN to paint and never owns the data behind the rows.
//
// What changed, and why:
//   - demo/tui-interactive.mjs is a VIEWER: it reads a readOnly store and hands a typed line off to
//     the owning writer over src/attach.mjs' transport, because a second process must not open a
//     second mutation line. `--tui` (cli.mjs) is the OTHER side: the process that already owns the
//     mutation line runs the TUI over its own Harness, so a typed line goes straight to
//     Conversation.submit - no socket, no second writer, and exactly-once still comes from pi-durable's
//     requestId admission, not from a ledger here;
//   - the view planes are reused unchanged (src/tui/sync.mjs' sync cursor read and the watch plane):
//     over the writer's own Session the WATCH plane delivers frames, which is the same-Session plane
//     demo/tui.test.mjs measures; over a fresh readOnly Session it delivers none, which is the
//     cross-Session fact that file's header records. So the writer view streams and the viewer view
//     re-reads, and both are the same code.

import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createSyncState, advanceSync, openWatch, snapshotSync } from "./sync.mjs";
import { renderFrame } from "./frame.mjs";

/**
 * The writer's view state: the sync cursor read plus the watch plane over THIS process's Harness.
 * `parts.harness` is passed as the store because src/tui/sync.mjs only needs a `harness` handle
 * (Conversation.entries and the watch), and here that handle is the writer's own Session - the one
 * that owns the mutation line, so the frames it gets are the same Session's commits, not a re-read.
 */
export async function openWriterView(parts, { conversationId = parts.conversation.id, context = BACKGROUND_CONTEXT } = {}) {
 const store = { harness: parts.harness, storage: parts.storage };
 const state = createSyncState(conversationId);
 await advanceSync(store, state, { context });
 // The watch plane: over the writer's own Session every frame arrives, and each frame is folded
// into the same state the sync read fed (openWatch's own contract).
 const watch = await openWatch(store, conversationId, {
 state,
 context,
 onFrame: null,
 });
 return {
 state,
 watch,
 conversationId,
 // One paint's rows, from the current state: the same renderFrame the viewer uses. `overlay`/`overlayAt`
 // go straight through, so the row surface paints the line the user is typing over one frame row.
 read: async () => snapshotSync(state, { conversationId }),
 paint: async ({ width = 80, height = 24, overlay = null, overlayAt = 1, theme = null } = {}) =>
  renderFrame(state, { width, height, conversationId, overlay, overlayAt, theme }),
 stop: async () => await watch.stop(),
 };
}

/**
 * A typed line, straight to the conversation this process owns.
 *
 * pi-durable's `requestId` is what makes a resend land exactly once (admitSubmission returns the
 * EXISTING submission), so the writer keeps a stable id per typed line rather than per send: the
 * TUI can resend the same line after a repaint and still get one input.
 *
 * `whenBusy` is pi-durable's word for "the conversation is already running": a typed line while a
 * run is live steers that run, which is pi's interactive behaviour (`Esc` interrupts, typing
 * steers) with pi-durable's queue instead of pi's message queue.
 *
 * WHAT THE FALLBACK `requestId` NAMES (measured, and this is the fix for "up-arrow recalls the last
 * prompt I typed" landing no second row): pi-durable's `requestId` is a SUBMISSION identity, not a
 * text fingerprint - `admitSubmission()` returns the EXISTING submission for a requestId already on
 * the Session line (node_modules/@earendil-works/pi-durable/dist/harness/submissions.js). Deriving it
 * from the typed words therefore makes the SECOND time a user sends the same words a no-op: a prompt
 * typed and then recalled by pi's up-arrow and sent again printed `status=done` on the FIRST
 * submissionId and committed ONE `pi.user` row, so the recalled turn never happened. pi's own rule is
 * the other way round: every finished draft is a new prompt (dist/modes/interactive/interactive-mode.js
 * `setupEditorSubmitHandler` calls `session.prompt(text)` once per ENTER, and pi's `Editor.addToHistory`
 * doc says it is "Called after successful submission."), so this fallback names the SUBMISSION EVENT -
 * one fresh id per typed line this process sends, keyed by pi-durable's own `process.pid` scope. The
 * admission rule itself is unchanged and stays reachable: a caller that must resend ONE logical
 * submission hands over its own stable `requestId` (src/rpc.mjs' `msg.requestId ?? msg.id`, src/attach.mjs'
 * client round-trip) and pi-durable still answers with the EXISTING submission, which is what demo/tui
 * and demo/cli count. Nothing here opens storage and nothing else mutates.
 */
let submissionEvent = 0;
export async function writerSubmit(parts, text, { context = BACKGROUND_CONTEXT, requestId = null, whenBusy = "steer" } = {}) {
 if (!String(text ?? "").trim()) return { skipped: "nothing was typed" };
 // One fresh id per submission EVENT this process sends; an explicit requestId stays pi-durable's own
 // exactly-once key (see above), so a caller that retries one logical submission still lands once.
 const key = String(requestId ?? `tui:${process.pid}:${(submissionEvent += 1)}`);
 const submission = await parts.conversation.submit({ type: "input", content: String(text), requestId: key, ...(whenBusy ? { whenBusy } : {}) }, context);
 // The run this input started has to answer before the process closes, so the caller's
 // settleInvocation waits on it - the same list cli.mjs' print path feeds.
 parts.settlements.push(submission.id);
 const admission = await submission.status(context);
 return { submissionId: submission.id, requestId: key, status: admission.status, whenBusy };
}
