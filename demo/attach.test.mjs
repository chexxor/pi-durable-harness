// demo/attach.test.mjs - task-10 contract, proved with two real processes in one directory.
// Provenance: written for the multiplexer requirement; rules live in src/ownership.mjs and
// src/attach.mjs, which are extracted from ~/Git/Durian-Pi/src/instance.mjs (identity) and
// ~/Git/Durian-Pi/src/readonlystore.mjs + brokerread.mjs (second-process reads), 2026-11-14.
// Offline: no keys, no network.
import { spawn } from "node:child_process";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readOwner } from "../src/ownership.mjs";

const checks = [];
function check(name, ok, detail = "") {
	checks.push({ name, ok: !!ok, detail });
	if (!ok) console.log(`FAIL ${name} :: ${detail}`);
}

function run(script, args) {
	return new Promise((resolve) => {
		const p = spawn(process.execPath, [join(import.meta.dirname, script), ...args], { stdio: ["ignore", "pipe", "pipe"] });
		let out = "";
		let err = "";
		p.stdout.on("data", (d) => (out += d.toString()));
		p.stderr.on("data", (d) => (err += d.toString()));
		p.on("exit", (code) => resolve({ code, out, err }));
	});
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(join(tmpdir(), "dh-attach-"));
const store = join(dir, "session.sqlite");
const base = ["--store", store, "--cwd", dir];

// Phase A: the owner must be ALIVE while other processes try to attach, so spawn it without
// waiting for exit. A single instance running to completion is covered by step 4's successor.
const owner = spawn(process.execPath, [join(import.meta.dirname, "attach-writer.mjs"), ...base, "--hold", "9000"], { stdio: ["ignore", "pipe", "pipe"] });
let ownerOut = "";
owner.stdout.on("data", (d) => (ownerOut += d.toString()));
await wait(3000);
check("owner claimed the store", existsSync(join(dir, ".pi-harness")) && readOwner(store).owned, JSON.stringify(readOwner(store)));

const ownerState = readOwner(store);
check("reader sees a live owner", ownerState.owned && ownerState.lock.pid === owner.pid, JSON.stringify(ownerState));

// 2. a second WRITER must be refused LOUDLY, naming the holder.
const secondWriter = await run("attach-writer.mjs", [...base, "--hold", "1000"]);
check("second writer refused", secondWriter.code === 1, `code=${secondWriter.code} err=${secondWriter.err.slice(0, 200)}`);
check("refusal names the holder pid", secondWriter.err.includes(`pid ${owner.pid}`), secondWriter.err.slice(0, 200));
check("refusal names the store and the holder's start time", secondWriter.err.includes(ownerState.lock.storePath) && secondWriter.err.includes("since"), secondWriter.err.slice(0, 200));

// 3. an attached reader reads the owner's committed transcript without opening a mutation line.
const reader = await run("attach-reader.mjs", [...base, "--prompt", "queued input from the attached client"]);
check("reader attached and exited 0", reader.code === 0, `code=${reader.code} err=${reader.err.slice(0, 300)}`);
const readerJson = reader.out.split("\n").map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
check("reader reports attached-as-reader", readerJson.some((j) => j.attached && j.as === "reader"), JSON.stringify(readerJson));
check("reader could read committed entries", readerJson.some((j) => j.readableEntries > 0), JSON.stringify(readerJson));
check("queued input landed exactly once", readerJson.some((j) => j.requestId && j.sameSubmission === true && j.userEntriesWithText === 1), JSON.stringify(readerJson));

// 4. clean exit releases the store: the next invocation may become the writer.
owner.kill("SIGTERM");
await wait(1500);
check("clean exit releases the lock", !readOwner(store).owned, JSON.stringify(readOwner(store)));
const successor = await run("attach-reader.mjs", [...base, "--become-writer"]);
check("a new writer can claim after release", successor.code === 0, `code=${successor.code} err=${successor.err.slice(0, 300)}`);

// 5. a KILLED owner leaves a stale lock, which must read as free, not as owned.
const killable = spawn(process.execPath, [join(import.meta.dirname, "attach-writer.mjs"), ...base, "--hold", "20000"], { stdio: ["ignore", "pipe", "pipe"] });
await wait(3000);
check("killable owner is holding", readOwner(store).owned, JSON.stringify(readOwner(store)));
killable.kill("SIGKILL");
await wait(1500);
const after = readOwner(store);
check("killed owner leaves a stale (free) lock", !after.owned && after.stale, JSON.stringify(after));
const reclaim = await run("attach-writer.mjs", [...base, "--hold", "1000"]);
check("store is reclaimable after SIGKILL", reclaim.code === 0, `code=${reclaim.code} err=${reclaim.err.slice(0, 200)}`);

console.log(`attach: ${checks.filter((c) => c.ok).length}/${checks.length} checks passed`);
process.exit(checks.every((c) => c.ok) ? 0 : 1);
