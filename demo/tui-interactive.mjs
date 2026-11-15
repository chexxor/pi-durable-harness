// demo/tui-interactive.mjs - the interactive TUI entrypoint: pi-tui's own screens over this harness's read
// planes. NOT part of the offline suite (a TTY has no meaning in a suite); demo/tui.test.mjs is the offline
// proof of the same modules, and this file is what a human runs.
//
// PROVENANCE: the driver/entrypoint split of ~/Git/Durian-Pi/src/tui/driver.mjs + ~/Git/Durian-Pi/ui.mjs
// (read 2026-11-15 at pin v1.5.1). Dropped from that original (single-agent harness): seats, seat navigation,
// the queue badge, the graph view, the `ctx` line.
//
// Changed, and why:
//   - terminal bytes and alt-screen/cursor restore belong to pi-tui, and the wiring order here is pi's OWN,
//     taken from the pinned dist: dist/cli/startup-ui.js does
//     `new TuiMainScreen(new ProcessTerminal(), settingsManager.getShowHardwareCursor(), getAgentDir())`
//     then `ui.start()` / `ui.requestRender()` / `ui.invalidate()` / `ui.clear()` (dist/tui.d.ts TUI declares
//     `addChild`, `clear`, `start`, `stop(TuiStopOptions)`). No escape sequence and no raw-mode toggle is
//     written in this file, so the exit paths are pi-tui's teardown rather than our bytes;
//   - the data behind the rows is this harness's read planes: a readOnly store (src/readapi.mjs), the sync
//     cursor read and the watch plane (src/tui/sync.mjs) - the TUI never opens a mutation line, and
//     docs/attach.md records the measured read-only-file failure that rules a second writer out;
//   - keys and tick rules come from src/tui/driver.mjs, which is headless and whose rules demo/tui.test.mjs
//     asserts, so the interactive path and the proved path are the same machine;
//   - a typed line is HANDED OFF to `cli.mjs` rather than written here: the viewer is a reader, and one
//     writer owns the store's mutation line.

import { Container, ProcessTerminal, TruncatedText, TuiMainScreen } from "@earendil-works/pi-tui";
import { openStore, listConversations } from "../src/readapi.mjs";
import { createSyncState, advanceSync, snapshotSync } from "../src/tui/sync.mjs";
import { renderFrame, rowComponent } from "../src/tui/frame.mjs";
import { createUiDriver, DRIVER_KEYS } from "../src/tui/driver.mjs";
import { request, ownerAlive } from "../src/attach.mjs";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { parseArgs } from "node:util";

const { positionals: positionals, values: values } = parseArgs({ allowPositionals: true, strict: false, allowShort: true });
const storePath = values["store"] ?? positionals[0];
// --writer-socket: the socket the OWNING session serves (see demo/attach-writer.mjs and docs/attach.md).
// Given one, a submitted line is handed over that transport and lands on the owner's mutation line
// exactly once by requestId; without one, the viewer prints the command for the writer it cannot be.
const writerSocket = values["writer-socket"];
if (!storePath) {
 console.error("usage: node demo/tui-interactive.mjs --store <path.sqlite> [--conversation <id>]\n" +
  Object.entries(DRIVER_KEYS).map(([verb, keys]) => `${verb}: ${keys.join(" / ")}`).join("\n") +
  "\nthis viewer reads; it never opens a second mutation line (see docs/attach.md).");
 process.exit(2);
}

const store = await openStore(storePath, { readOnly: true });
const conversations = await listConversations(store, { limit: 10 });
const conversationId = values["conversation"] ?? conversations?.items?.[0]?.id;
if (!conversationId) {
 console.error(`no conversation to view in ${storePath}: listConversations found ${conversations?.items?.length ?? 0}`);
 process.exit(1);
}

const sync = createSyncState(conversationId);
await advanceSync(store, sync, { context: BACKGROUND_CONTEXT });

const size = () => ({ columns: process.stdout.columns ?? 80, rows: process.stdout.rows ?? 24 });
const screen = new TuiMainScreen(new ProcessTerminal(), values["hardware-cursor"] === "true", undefined);

const paintState = async () => {
 const state = snapshotSync(sync, { conversationId });
 const at = size();
 const frame = renderFrame(state, { width: at.columns, height: at.rows });
 // The layout is rebuilt per paint from fresh values (rows.mjs returns new rows every read), so pi-tui's
 // component cache cannot paint a stale frame; `clear()` + `addChild` is pi's own sequence.
 screen.clear();
 for (const row of frame.rows) screen.addChild(rowComponent(row, { width: at.columns }).component);
 screen.invalidate();
 screen.requestRender();
 return frame;
};

const driver = createUiDriver({
 getSize: size,
 readState: async () => {
  await advanceSync(store, sync, { context: BACKGROUND_CONTEXT });
  return snapshotSync(sync, { conversationId });
 },
 paint: async (state, { width, height }) => await paintState(),
 pollMs: 700,
 onInput: async (line) => {
  // The viewer never writes durable state itself: the OWNING session holds the store's mutation line
  // (docs/attach.md). With --writer-socket the typed line goes over that transport, where pi-durable's
  // SubmissionDraft requestId makes a resend land exactly once; the viewer's next paint then shows the
  // row the owner committed.
  if (writerSocket && await ownerAlive(writerSocket)) {
   try {
    const ack = await request(writerSocket, "prompt", { text: line, requestId: `tui-${process.pid}-${Date.now()}` });
    console.log(`the owner accepted it: requestId=${ack.requestId} submissionId=${ack.submissionId} status=${ack.status}`);
   } catch (err) {
    console.log(`the owner refused it: ${err?.message ?? err}`);
   }
   return;
  }
  console.log(`no live owner socket (pass --writer-socket <path>); the writer would be given: cli.mjs --store ${storePath} --conversation ${conversationId} -p ${JSON.stringify(line)}`);
 },
 onExit: (reason) => {
  screen.clear();
  screen.requestRender();
  screen.stop();
 },
});

paintState().catch((err) => {
 console.error(`first paint failed: ${String(err?.message ?? err)}`);
 process.exit(1);
});

if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.on("data", async (chunk) => {
 const answer = driver.noteData(chunk);
 if (answer.quit) {
  await driver.quit(answer.quit);
  await store.harness.close(BACKGROUND_CONTEXT);
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.exit(0);
 }
 // Only the sync plane is re-read here: the watch plane belongs to a Session that drives the line, and
 // src/tui/sync.mjs' header records the measured fact that a fresh readOnly Session receives no frames.
 await driver.poll(Date.now());
});
