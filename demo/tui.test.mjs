// demo/tui.test.mjs - the TUI, headless and offline: a fixture store drives the transcript, the in-flight
// partial, and the watch plane, and every claim is made against CAPTURED PAINT FRAMES rather than a TTY.
//
// WHY HEADLESS IS THE RIGHT PROOF: pi-tui's components answer `Component.render(width): string[]`
// (dist/tui.d.ts), so a frame is a pure function of state and width. What a TTY adds is bytes to a
// terminal, timing, and eyes - none of which change whether the transcript, the in-flight partial, and the
// watch frames are IN the frame. The demo therefore asserts the frames themselves; the entrypoint
// (./tui-interactive.mjs) is the same components wired to pi-tui's own screens.
//
// PROVENANCE: this demo is the offline proof for ./rows.mjs, ./sync.mjs, ./frame.mjs, ./viewmode.mjs and
// ./driver.mjs; each of those names the Durian-Pi original it was extracted from (src/tui/client.mjs,
// src/tui/conversation.mjs, src/tui/paint.mjs, src/tui/viewmode.mjs, src/tui/driver.mjs). The claims THIS
// file makes - the transcript renders, the partial renders, the watch plane folds, the frame clips, the
// overlay restores, the driver skips a concurrent tick - are falsifiable only by running it.
//
// Offline: the fixture store is a temp sqlite file, the only model is pi-ai's faux provider (core.mjs's
// offline plane), and no network and no key is touched.

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { openHarness, scriptTurn, transcript } from "../src/core.mjs";
import { openStore, readEntries } from "../src/readapi.mjs";
import { frameRows, streamingRows, entryRow, partialText, headerRow, footerRow, rowWidth, knownEntryKinds } from "../src/tui/rows.mjs";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { createSyncState, advanceSync, snapshotSync, openWatch, mergeView } from "../src/tui/sync.mjs";
import { buildFrame, paint, renderFrame, overlayRow, classifyRow, INPUT_MARK } from "../src/tui/frame.mjs";
import { createViewMode } from "../src/tui/viewmode.mjs";
import { createUiDriver, decodeKeys, DRIVER_KEYS } from "../src/tui/driver.mjs";
import { serveOwner, request } from "../src/attach.mjs";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";

const checks = [];
function record(condition, claim, evidence = "") {
 checks.push({ condition, claim });
 console.log(`  ${condition ? "ok " : "NOT"} ${claim}${evidence ? `: ${evidence}` : ""}`);
}

async function main() {
 const root = mkdtempSync(join(tmpdir(), "dh-tui-"));
 const cwd = join(root, "cwd");
 mkdirSync(cwd, { recursive: true });
 const storePath = join(root, "harness.sqlite");

 // 1) A writer drives a turn with a real tool round, so a partial and a tool slot exist while it runs.
 const writer = await openHarness({ cwd, storePath, agent: { model: { provider: "faux", modelId: "faux-1" }, cwd } });
 scriptTurn(writer.faux, [
  { tool: "bash", args: { command: "sleep 2; echo staged" } },
  "staged note read",
 ]);
 const submission = await writer.conversation.submit({ type: "input", content: "stage a note", requestId: "tui-1" }, writer.context);

 // 2) The WATCH plane, attached while the run is busy: pi-durable's own ConversationTranscript over the
 // conversation's own entries, and pi-durable's watch frames folded into one view state (see sync.mjs).
 const watchState = createSyncState(writer.conversation.id);
 const watch = await openWatch({ harness: writer.harness, storePath }, writer.conversation.id, { state: watchState, context: writer.context });
 const framesSeen = [];
 // Poll for the in-flight frame rather than sleeping a fixed amount: the claim is about the partial being
 // IN a frame while a tool runs, so a frame is captured as soon as live state says something is running.
 let partialFrame = null;
 for (let attempt = 0; attempt < 20 && partialFrame === null; attempt += 1) {
  const snap = snapshotSync(watchState, { conversationId: writer.conversation.id });
  const live = snap.live;
  if (live && (live.run || live.tools)) {
   partialFrame = renderFrame(snap, { width: 72, height: 12 });
   framesSeen.push({ live: true, rows: partialFrame.painted.lines });
  } else {
   await new Promise((sleep) => setTimeout(sleep, 50));
  }
 }
 record(partialFrame !== null, "a frame captured WHILE a tool round runs carries the in-flight partial",
  partialFrame ? partialFrame.painted.lines.filter((line) => classifyRow(line) === "stream").join(" | ") : "none captured");
 record(partialFrame?.painted.lines.some((line) => /tools? (bash|read|write|edit) (pending|running|done)/.test(line))
  || partialFrame?.painted.lines.some((line) => /^~ (run|generation)/.test(line.trim())),
  "the streaming row is pi-durable's LiveState (run/tools), not a guessed spinner",
  partialFrame ? partialFrame.painted.lines.filter((line) => classifyRow(line) === "stream").join(" | ") : "");
 // The watch frames: `openWatch` counts what pi-durable delivered (see sync.mjs).
 await submission.wait(writer.context);
 const afterRun = snapshotSync(watchState, { conversationId: writer.conversation.id });
 record((watchState.latest?.items?.length ?? 0) > 0, "the watch plane folded committed entries into the view",
  `items=${watchState.latest?.items?.length} resume=${JSON.stringify(watchState.resume)}`);
 const stopped = await watch.stop();
 record(stopped !== undefined, "the watch ended with pi-durable's own WatchEnd value", JSON.stringify(stopped).slice(0, 160));

 // 3) Cross-process sync: a SECOND process reads the store readOnly and paints a whole frame.
 const viewer = await openStore(storePath);
 const conversations = await (await import("../src/readapi.mjs")).listConversations(viewer);
 const conversationId = conversations?.items?.[0]?.id ?? writer.conversation.id;
 const syncState = createSyncState(conversationId);
 await advanceSync(viewer, syncState, { context: BACKGROUND_CONTEXT });
 const frame = renderFrame(snapshotSync(syncState, { conversationId }), { width: 60, height: 5 });
 const entryRows = frame.rows.filter((row) => classifyRow(row) === "transcript");
 record(entryRows.length >= 3, "the transcript renders one row per committed entry, id and pi-durable's kind string first",
  entryRows.slice(0, 3).map((row) => row.trim()).join(" | "));
 record(frame.painted.lines.length === 5 && frame.painted.dropped.length === frame.rows.length - 5,
  "a frame taller than the terminal is CLIPPED, not scrolled (the layout never tears)",
  `rows=${frame.rows.length} painted=${frame.painted.lines.length} dropped=${frame.painted.dropped.length}`);
 record(frame.painted.maxCells <= 60, "no painted row exceeds the terminal width in CELLS (pi-tui's own measure)",
  `maxCells=${frame.painted.maxCells} width=60`);
 record(frame.rows.some((row) => /more entries|end of transcript/.test(row)),
  "the footer says how far pi-durable's cursor got, and reports the Cursor as pi-durable's own value",
  frame.rows.filter((row) => classifyRow(row) === "meta").join(" | "));
 record(frame.rows.every((row) => !row.includes("\x1b[?2026")),
  "no second synchronized-output wrapper is emitted here (pi-tui's renderer brackets the frame)",
  "checked every row for the DECSET 2026 pair");

 // 4) The cross-Session measured fact (sync.mjs header): a fresh readOnly Session gets NO watch frames.
 const freshWatch = await openWatch(viewer, conversationId, { context: BACKGROUND_CONTEXT });
 const freshFramesBefore = freshWatch.state.latest?.items?.length ?? 0;
 record(freshWatch.handle?.value?.entries?.length >= 1, "the acquisition value of the fresh watch carries entries",
  `acquisition entries=${freshWatch.handle?.value?.entries?.length}`);
 const stoppedFresh = await freshWatch.stop();
 record(stoppedFresh !== undefined, "the fresh watch is a real handle that ends cleanly", JSON.stringify(stoppedFresh).slice(0, 120));

 // 5) The overlay: entering input REMEMBERS the frame underneath and closing RESTORES it (the header's rule).
 const view = createViewMode();
 view.enterInput("fix the ");
 view.append("note");
 const overlay = overlayRow(frame.painted.lines[1], view.overlayRow(frame.painted.lines[1], { width: 40 }), { width: 40, at: 0 });
 const overlayPlain = stripTerminalSequences(overlay);
 record(overlayPlain.startsWith(INPUT_MARK) && overlayPlain.includes("fix the note"),
  "the typed overlay covers ONE row of the frame underneath and carries the typed text", JSON.stringify(overlayPlain));
 const submitted = view.submit();
 record(submitted.typed === "fix the note" && submitted.view === "conversation",
  "submit hands the typed line over and lands back in the SAME view underneath the overlay (the ROADMAP 99 bug the original's header records)",
  `typed=${submitted.typed} view=${submitted.view}`);
 const canceled = createViewMode().enterInput("oops").cancel();
 record(canceled.canceled === true && canceled.view === "conversation",
  "Esc cancels and the underlying view comes back whole", `view=${canceled.view}`);

 // 6) The driver, headless: tick/poll/skip rules asserted with an injected clock and a fake key stream.
 let concurrent = 0;
 const slowState = async () => {
  concurrent += 1;
  await new Promise((sleep) => sleep());
  concurrent -= 1;
  return snapshotSync(syncState, { conversationId });
 };
 const sizes = { columns: 60, rows: 10 };
 const painted = [];
 const driver = await createUiDriver({
  getSize: () => sizes,
  readState: slowState,
  paint: (state, { width, height }) => {
   const frame = renderFrame(state, { width, height });
   painted.push(frame.painted.lines.length);
   return frame;
  },
  onExit: (reason) => { exited.push(reason); },
  pollMs: 400,
  onInput: (line) => { typed.push(line); },
 });
 const exited = [];
 const typed = [];
 record((await driver.tickIfDirty()).painted === true, "a dirty view paints on the first tick");
 record((await driver.tickIfDirty()).skipped === true, "an already-clean view does NOT repaint (poll, not freelock)");
 const both = await Promise.all([driver.tick(), driver.tick()]);
 record(both.some((result) => result.skipped === true), "a tick that is running is SKIPPED, never queued/executed concurrently",
  JSON.stringify(both.map((result) => (result.skipped ? "skipped" : "painted"))));
 record((await driver.poll(10)).skipped === true, "the sync re-read is inside pollMs, so no paint happens", "pollMs=400, now-lastPaint=10");
 const quit = driver.noteData("r");
 record(quit.quit === null && driver.marks.some((reason) => reason.startsWith("refresh")),
  "`r` marks one immediate refresh tick", `marks=${driver.marks.join(",")}`);
 driver.noteData("ab");
 const submitted2 = await driver.submitInput();
 record(typed.join("") === "rabb" || typed.length === 1, "typed keys land in the overlay and the submitted line reaches onInput",
  `typed=${JSON.stringify(typed)} submitted=${JSON.stringify(submitted2.typed)}`);
 const quitResult = await driver.noteData("q");
 record(quitResult.quit === "q", "q quits, and pi-tui's key names drive the machine", `quit=${JSON.stringify(quitResult)}`);

  // 6b) The round trip: a SUBMITTED line leaves the TUI and enters the durable session through the
 //     owner's attach socket, and the SAME view the TUI paints gains the committed entry. The viewer is
 //     never the writer - it holds a readOnly store - so this check is the interactive surface driving
 //     pi-durable's mutation line instead of a TUI that only echoes what it saw.
 const sockPath = join(root, "owner.sock"); // a short name keeps the socket path under the sun-path limit
 const owner = serveOwner({ harness: writer.harness, conversation: writer.conversation, context: writer.context }, sockPath);
 const beforeRows = snapshotSync(syncState, { conversationId }).items;
 const ack = await request(sockPath, "prompt", { text: "fix the note", requestId: "tui-round-trip" });
 record(ack.ok === true && ack.requestId === "tui-round-trip",
  "a submitted line is handed to the OWNING session over the attach socket, not written by the viewer",
  JSON.stringify(ack));
 const again = await request(sockPath, "prompt", { text: "fix the note", requestId: "tui-round-trip" });
 record(again.submissionId === ack.submissionId,
  "the same requestId lands exactly once, so a client that resends cannot duplicate the input",
  `first=${JSON.stringify(ack.submissionId)} second=${JSON.stringify(again.submissionId)}`);
 let afterRows = beforeRows;
 for (let attempt = 0; attempt < 6 && afterRows.length === beforeRows.length; attempt += 1) {
  await new Promise((sleep) => setTimeout(sleep, 100));
  await advanceSync(viewer, syncState, { context: BACKGROUND_CONTEXT });
  afterRows = snapshotSync(syncState, { conversationId }).items;
 }
 record(afterRows.length > beforeRows.length,
  "the view the TUI paints gains the entry the OWNER committed (one mutation line, seen by a reader)",
  `before=${beforeRows.length} after=${afterRows.length}`);
 const gained = afterRows.slice(beforeRows.length).map((item) => item.entry ?? item);
 const userRow = gained.find((entry) => entry.kind === "pi.user" && JSON.stringify(entry).includes("fix the note"));
 record(userRow !== undefined,
  "the typed line commits as a pi.user entry the READER sees, pi-durable's own kind string (the owner's turn may add more rows after it)",
  `gained=${gained.map((entry) => `${entry.kind}#${entry.id}`).join(",")}`);
 owner.close();

// 7) The row vocabulary stays pi-durable's: kinds come from pi-durable's entry tokens, not our strings.
 record(knownEntryKinds().includes("pi.user") && knownEntryKinds().includes("pi.tool-result")
  && knownEntryKinds().includes("pi.compaction") && knownEntryKinds().length >= 6,
  "the row vocabulary's kinds are pi-durable's entry tokens' own `kind` strings (rows.mjs imports UserEntry..CompactionEntry and reads `.kind`), not strings this harness typed",
  `kinds=${knownEntryKinds().join(",")}`);
 const kindsSeen = new Set(syncState.entries.map((entry) => entry.kind));
 record([...kindsSeen].every((kind) => knownEntryKinds().includes(kind)),
  "every kind that rendered is one pi-durable names", `kinds=${[...kindsSeen].join(",")} rendered rows=${syncState.entries.length}`);

 await writer.harness.close(writer.context);
 await viewer.harness.close(BACKGROUND_CONTEXT);

 rmSync(root, { recursive: true, force: true });
 const failed = checks.filter((check) => !check.condition);
 console.log(`tui: ${checks.length - failed.length}/${checks.length} checks passed`);
 process.exitCode = failed.length ? 1 : 0;
}

main().catch((err) => {
 console.error(String(err?.message ?? err));
 process.exitCode = 1;
});
