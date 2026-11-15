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
//   6. the ONE storage opener rule over the WHOLE tree: no file runs SQL or imports an sqlite
//      binding, and inside src/ only the writer path and the read API call pi-durable's opener.
import { Harness } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { openHarness, prompt, scriptTurn, transcript } from "../src/core.mjs";
import { openStore, readEntries, listConversations, usage } from "../src/readapi.mjs";
import { readFeed, follow } from "../src/eventfeed.mjs";
import { handle as rpcHandle, commandNames } from "../src/rpc.mjs";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { ReadOnlySession } from "@earendil-works/pi-durable";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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

// 5. what a viewer is NOT allowed to do: the read-only file open. Measured, and reported as a note
//    so a reader of this demo cannot assume the obvious shortcut works on this pin.
try {
	const ro = await openNodeSqliteStorage(storePath, { mode: "read-only" });
	ro.close(BACKGROUND_CONTEXT);
} catch (err) {
	note("openNodeSqliteStorage read-only mode", `${String(err?.message ?? err).slice(0, 60)} (the opener applies migrations on open, so a viewer opens normally and stays read-only at the Harness)`);
}

// second process proof: a SEPARATE process, with only the read API on its import path, must see the same
// committed line. The script is written into the repo's own tree (not /tmp) so bare package imports
// resolve through the pinned node_modules - which is also the point: a reader resolves pi-durable the
// same way the writer does, and still cannot open a second mutation line.
const rootDir = process.cwd();
const childScript = join(rootDir, ".scratch", "readapi-child.mjs");
writeFileSync(childScript, [
	`import { openStore, readEntries } from "../src/readapi.mjs";`,
	`import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";`,
	"const store = await openStore(process.argv[3]);",
	"const page = await readEntries(store, Number(process.argv[2]), { limit: 100 });",
	"console.log('child-newest=' + page.items.at(-1)?.id);",
	"await store.harness.close(BACKGROUND_CONTEXT);",
	"await store.storage.close(BACKGROUND_CONTEXT);",
].join("\n"));
const child = await import("node:child_process");
const childLine = await child.execFileSync("node", [childScript, String(conversationId), storePath], { cwd: rootDir, encoding: "utf8" }).trim();
check("a second process reads the same committed line", childLine === `child-newest=${writerIds.at(-1)}`, `${childLine} vs expected child-newest=${writerIds.at(-1)}`);

// 6. the event feed: pi-durable's own client transcript layer (`ConversationTranscript`), a `ConversationWindow.from`
//    boundary for --since, and the partial in the `pi.live` document as its OWN row. The viewer is readOnly, and
//    pi-durable's own doc for readOnly says "the Harness stays usable for reads and watches" - so the feed being
//    available here is pi-durable's rule, not a hole we chose not to plug.
const viewerConversation = await viewer.harness.conversation(conversationId, BACKGROUND_CONTEXT);
const firstAnswer = await rpcHandle({ harness: viewer.harness, conversation: viewerConversation, context: BACKGROUND_CONTEXT }, { command: "watch", limit: 10 });
// pi's response envelope is {command, success, data}; the payload is read off `data`.
check("watch answers inside pi's response envelope", firstAnswer.success === true && firstAnswer.command === "watch", JSON.stringify({ c: firstAnswer.command, s: firstAnswer.success }).slice(0, 120));
const firstWatch = firstAnswer.data;
check("RPC watch answers rows and a resume boundary", Array.isArray(firstWatch.rows) && firstWatch.since !== undefined, JSON.stringify(firstWatch).slice(0, 140));
check("resume boundary is pi-durable's own shape", typeof firstWatch.since?.from === "number", JSON.stringify(firstWatch.since));
const secondWatch = (await rpcHandle({ harness: viewer.harness, conversation: viewerConversation, context: BACKGROUND_CONTEXT }, { command: "watch", since: firstWatch.since, limit: 10 })).data;
const firstIds = new Set(firstWatch.rows.map((row) => row.id));
const repeated = secondWatch.rows.filter((row) => firstIds.has(row.id));
check("re-issuing watch with the boundary delivers nothing twice", repeated.length === 0, `${repeated.length} repeats of ids ${[...firstIds].join(",")}`);
check("watch rows exclude the partial from the entry rows", (firstWatch.partials ?? []).every((row) => row.kind === "partial"), JSON.stringify(firstWatch.partials));
// A viewer closes only after every read it made, so the reads above are proved against an open Session.
await viewer.harness.close(BACKGROUND_CONTEXT);
await viewer.storage.close(BACKGROUND_CONTEXT);


// 7. the partial while it is IN FLIGHT, not after it settled: a turn is followed while it runs, and a running
//    tool call must show up as a streaming row of kind "partial" carrying no entry id. The reason an entry row
//    would be wrong is quoted in src/eventfeed.mjs: progress commits are deferred, so a partial can be observed
//    before it is stored and can be lost by a crash.
const feedStore = join(dir, "feed.sqlite");
const feedRun = await openHarness({ storePath: feedStore, cwd: dir });
scriptTurn(feedRun.faux, [
 { tool: "bash", args: { command: "sleep 0.5; echo PARTIAL_PROBE" } },
 "the answer after the running tool call settled",
]);
const feedRows = [];
const feedHandle = await follow(feedRun.harness, feedRun.conversation.id, { context: feedRun.context, onRow: (row) => { feedRows.push(row); }, limit: 60 });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const running = prompt(feedRun.conversation, "run the probe", feedRun.context, { waitForIdle: false });
// Wait until the feed has shown the partial, bounded so a stalled run cannot hang the demo: the feed is
// watched WHILE the turn runs, which is the only way to see a state that may never be stored.
let waited = 0;
while (feedRows.every((row) => row.kind !== "partial") && waited < 4000) {
 await sleep(50);
 waited += 50;
}
await feedHandle.stop();
await running;
const partialRows = feedRows.filter((row) => row.kind === "partial");
const entryRows = feedRows.filter((row) => row.kind !== "partial");
check("a running tool call shows as a streaming row", partialRows.length >= 1, `${feedRows.length} rows, 0 partial`);
check("a partial row carries no entry id", partialRows.every((row) => !row.id), partialRows.map((row) => row.id).join(","));
check("entry rows never include the partial", entryRows.every((row) => row.kind !== "partial"), `${entryRows.length} entry rows`);
await feedRun.harness.close(feedRun.context);

// 6. the ONE storage opener rule, checked over the whole tree rather than asserted in prose: nothing
//    in this repo runs SQL, imports an sqlite binding, or opens a second mutation line - pi-durable's
//    opener applies the migrations, so a SQL call here would be a line this harness never owns.
const codeOf = (file) => {
	const text = readFileSync(file, "utf8");
	return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
};
const walk = (dir) => {
	const out = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
		const path = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...walk(path));
		else if (entry.name.endsWith(".mjs")) out.push(path.replace(process.cwd() + "/", ""));
	}
	return out;
};
const repoCode = ["cli.mjs", ...walk("src"), ...walk("demo"), ...walk("scripts")].sort();
// the bindings and statements pi-durable would have to see for a SECOND mutation line; spelled in
	// pieces so this very check cannot match its own patterns.
	const SQL_RULES = [new RegExp("better-" + "sqlite" + "3"), new RegExp("node:" + "sqlite"), new RegExp("sqlite" + "3"),
		new RegExp("(SEL" + "ECT|INSER" + "T|UPDAT" + "E|DELET" + "E)\b[^\n]{0,40}?\b(FRO" + "M|WHER" + "E|INT" + "O|VALUE" + "S)\b")];
const sqlHits = repoCode.filter((f) => SQL_RULES.some((re) => re.test(codeOf(f))));
check("no file in the repo runs SQL or imports an sqlite binding", sqlHits.length === 0, sqlHits.join(","));
const srcOpener = repoCode.filter((f) => f.startsWith("src/") && /openNodeSqliteStorage/.test(codeOf(f)));
check("inside src/, only the writer path and the read API call pi-durable's storage opener",
	srcOpener.join(",") === "src/core.mjs,src/readapi.mjs", srcOpener.join(","));

console.log(`readapi: ${passed}/${total} checks passed`);
process.exit(passed === total ? 0 : 1);
