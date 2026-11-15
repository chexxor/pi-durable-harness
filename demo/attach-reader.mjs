// demo/attach-reader.mjs - an attached client: reads through the owner, queues writes onto one line.
// Provenance: written for task-10; transport in src/attach.mjs, ownership rule in src/ownership.mjs.
import { openHarness, prompt, scriptTurn } from "../src/core.mjs";
import { claimWriter, readOwner, releaseWriter } from "../src/ownership.mjs";
import { request } from "../src/attach.mjs";

function arg(name, fallback = null) {
	const i = process.argv.indexOf(`--${name}`);
	return i >= 0 ? process.argv[i + 1] : fallback;
}

const store = arg("store");
const cwd = arg("cwd");
if (!store || !cwd) {
	console.error("attach-reader needs --store and --cwd");
	process.exit(2);
}

if (arg("become-writer") !== null) {
	// The "store is free" path: claim, run a turn, release.
	try {
		const claim = claimWriter(store);
		const h = await openHarness({ cwd, storePath: store });
		scriptTurn(h.faux, ["the second instance became the writer"]);
		await prompt(h.conversation, "writer after the owner left", h.context);
	 const page = await h.conversation.entries({}, 50, undefined, h.context);
		console.log(JSON.stringify({ becameWriter: true, pid: process.pid, entries: page.items.length }));
		releaseWriter(store);
		await h.harness.close(h.context);
		process.exit(0);
	} catch (err) {
		console.error(String(err?.message ?? err));
		process.exit(1);
	}
}

const state = readOwner(store);
if (!state.owned) {
	console.error(state.stale ? `no live owner: ${state.reason}` : "no owner claimed the store");
	process.exit(3);
}

const status = await request(state.lock.socket, "status");
if (!status.ok) {
	console.error(`owner is not answering: ${status.error}`);
	process.exit(1);
}
console.log(JSON.stringify({ attached: true, as: "reader", ownerPid: status.pid, ownerStartedAt: state.lock.startedAt, store: state.lock.storePath }));

const page = await request(state.lock.socket, "read", { limit: 50 });
const kinds = page.items.map((e) => e.kind);
console.log(JSON.stringify({ readableEntries: page.items.length, kinds }));

if (arg("prompt") !== null) {
	const requestId = arg("request-id", `demo-${process.pid}`);
	const first = await request(state.lock.socket, "prompt", { text: arg("prompt"), requestId });
	const again = await request(state.lock.socket, "prompt", { text: arg("prompt"), requestId });
	const after = await request(state.lock.socket, "read", { limit: 100 });
	const matches = after.items.filter((e) => e.kind === "pi.user" && JSON.stringify(e.model).includes(arg("prompt"))).length;
	console.log(JSON.stringify({ requestId, firstSubmission: first.submissionId, repeatSubmission: again.submissionId, userEntriesWithText: matches, sameSubmission: first.submissionId === again.submissionId }));
}
process.exit(0);
