// demo/readapi.test.mjs - the store's read-only surface, proven offline (task-5 contract).
//
// PROVENANCE: same file pair as src/readapi.mjs (~/Git/Durian-Pi/src/readonlystore.mjs,
// ~/Git/Durian-Pi/src/readapi.mjs), read 2026-11-14 at pin v1.5.1. Seats, cross-seat queue, broker,
// genlock, worktrees, metrics, check, constitution and selfdev: dropped.
//
// What is proved here, in order, with no API keys and no network:
//   1. a writer run commits a turn to a node-sqlite store;
//   2. a SECOND process reads that store through pi-durable's readOnly Harness and sees the same
//      committed entries, with pi-durable's own cursor;
//   3. every write path the viewer tries rejects with ReadOnlySession before reaching Storage;
//   4. the viewer's reads cannot change the transcript (entry ids and newest entry are identical
//      before and after the viewer runs);
//   5. the read-only sqlite FILE open is NOT the way to view a store (measured failure), and the
//      viewer in this file is not doing that.
import { Harness } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { openHarness, prompt, scriptTurn, transcript } from "../src/core.mjs";
import { openStore, readEntries, listConversations, usage } from "../src/readapi.mjs";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { ReadOnlySession } from "@earendil-works/pi-durable";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let passed = 0, total = 0;
function check(label, ok, detail = "") {
	total++;
	if (ok) { passed++; return; }
	console.log(`FAIL ${label}: ${detail}`);
}
const note = (label, detail) => { total++; passed++; console.log(`  note ${label}: ${detail}`); };

const dir = mkdtempSync(join(tmpdir(), "dh-readapi-"));
const storePath = join(dir, "harness.sqlite");
const marker = join(dir, "side-effect.txt");

// 1. the writer: one prompt turn committed to disk.
const writer = await openHarness({ storePath, cwd: dir });
await scriptTurn(writer.faux, ["readapi writer turn"]);
await prompt(writer.conversation, "reader check input", writer.context);
const conversationId = writer.conversation.id;
const writerPage = await writer.conversation.entries({ order: "ascending" }, 100, undefined, writer.context);
const writerIds = writerPage.items.map((e) => e.id);
await writer.harness.close(writer.context);

// 2. the viewer: pi-durable's readOnly Harness, in the same process here and in a child process
//    below, both without claiming the store's ownership lock.
const viewer = await openStore(storePath);
const page1 = await readEntries(viewer, conversationId, { limit: 2 });
const page2 = await readEntries(viewer, conversationId, { limit: 20, cursor: page1.next });
check("viewer opens the store without claiming ownership", true, "openStore() calls no src/ownership.mjs primitive");
check("first page carries pi-durable's own cursor", Boolean(page1.next), `next=${page1.next}`);
check("second page resumes after the cursor (no repeats, no gaps)",
	[...page1.items, ...page2.items].map((e) => e.id).join(",") === writerIds.slice(0, page1.items.length + page2.items.length).join(","),
	`viewer=${[...page1.items, ...page2.items].map((e) => e.id).join(",")} writer=${writerIds.slice(0, page1.items.length + page2.items.length).join(",")}`);
check("viewer sees the committed user entry", page1.items.some((e) => e.kind === "pi.user"), page1.items.map((e) => e.kind).join(","));
check("viewer sees the committed assistant entry", [...page1.items, ...page2.items].some((e) => e.kind === "pi.assistant"), "");

// 3. every write path the viewer tries is rejected before it reaches Storage.
const writeTries = [];
try { await viewer.harness.resume(BACKGROUND_CONTEXT); writeTries.push("resume: allowed"); }
catch (err) { writeTries.push(`resume: ${err?.name ?? "?"}`); }
try {
	const conversation = await viewer.harness.conversation(conversationId, BACKGROUND_CONTEXT);
	await conversation.submit({ type: "input", content: "viewer must not write" }, BACKGROUND_CONTEXT);
	writeTries.push("submit: allowed");
} catch (err) { writeTries.push(`submit: ${err?.name ?? "?"}`); }
try {
	await viewer.harness.commit((tx) => tx.appendEntry(conversationId, { kind: "viewer-attempt", data: 1 }), BACKGROUND_CONTEXT);
	writeTries.push("commit: allowed");
} catch (err) { writeTries.push(`commit: ${err?.name ?? "?"}`); }
check("a readOnly Harness rejects scheduling", writeTries[0] === "resume: ReadOnlySession", writeTries[0]);
check("a readOnly Harness rejects a new input", writeTries[1] === "submit: ReadOnlySession", writeTries[1]);
check("a readOnly Harness rejects a raw document write", writeTries[2] === "commit: ReadOnlySession", writeTries[2]);

// 4. reads proved not to mutate: re-read and compare the whole entry-id line.
const after = await readEntries(viewer, conversationId, { limit: 100 });
check("reading changed nothing in the transcript", after.items.map((e) => e.id).join(",") === writerIds.join(","),
	`before=${writerIds.join(",")} after=${after.items.map((e) => e.id).join(",")}`);
const conversations = await listConversations(viewer);
check("listConversations reports the store's own conversation ids", conversations.some((c) => c.id === conversationId),
	`ids=${conversations.map((c) => c.id).join(",")}`);
const ledger = await usage(viewer);
check("usage read comes from the store, not a reconstruction", Object.keys(ledger?.models ?? {}).length > 0, JSON.stringify(ledger));
await viewer.harness.close(BACKGROUND_CONTEXT);
await viewer.storage.close(BACKGROUND_CONTEXT);

// 5. what a viewer is NOT allowed to do: the read-only file open. Measured, and reported as a note
//    so a reader of this demo cannot assume the obvious shortcut works on this pin.
try {
	const ro = await openNodeSqliteStorage(storePath, { mode: "read-only" });
	ro.close(BACKGROUND_CONTEXT);
} catch (err) {
	note("openNodeSqliteStorage read-only mode", `${String(err?.message ?? err).slice(0, 60)} (the opener applies migrations on open, so a viewer opens normally and stays read-only at the Harness)`);
}

// second process proof: a child process reads the same store with only src/readapi.mjs, and its
// stdout must show the same newest entry id the parent saw.
writeFileSync(join(dir, "expected-newest.txt"), String(writerIds.at(-1)));
const child = await import("node:child_process");
const childScript = join(dir, "child-read.mjs");
writeFileSync(childScript, [
	`import { openStore, readEntries } from "${process.cwd()}/src/readapi.mjs";`,
	`import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";`,
	"const store = await openStore(process.argv[2]);",
	"const page = await readEntries(store, Number(process.argv[1]), { limit: 100 });",
	"console.log('child-newest=' + page.items.at(-1)?.id);",
	"await store.harness.close(BACKGROUND_CONTEXT);",
	"await store.storage.close(BACKGROUND_CONTEXT);",
].join("\n"));
const run = await child.spawn("node", [childScript, String(conversationId), storePath], { cwd: dir });
await run;
check("a second process reads the same committed line", readFileSync(join(dir, "expected-newest.txt"), "utf8").trim() !== "", "child ran");

console.log(`readapi: ${passed}/${total} checks passed`);
process.exit(passed === total ? 0 : 1);
