// demo/attach-writer.mjs - the owning instance used by demo/attach.test.mjs.
// Provenance: writer/reader pair written for task-10; the ownership rule is in src/ownership.mjs
// (extracted from ~/Git/Durian-Pi/src/instance.mjs) and the transport in src/attach.mjs.
import { join } from "node:path";
import { openHarness, prompt, scriptTurn } from "../src/core.mjs";
import { claimWriter, releaseWriter, touchOwner } from "../src/ownership.mjs";
import { serveOwner } from "../src/attach.mjs";

function arg(name, fallback = null) {
	const i = process.argv.indexOf(`--${name}`);
	return i >= 0 ? process.argv[i + 1] : fallback;
}

const store = arg("store");
const cwd = arg("cwd");
const holdMs = Number(arg("hold", "5000"));

if (!store || !cwd) {
	console.error("attach-writer needs --store and --cwd");
	process.exit(2);
}

let claim;
try {
	// Claim FIRST: the store is opened only by the process that owns it, so a second invocation
	// never touches the mutation line.
	claim = claimWriter(store);
} catch (err) {
	console.error(String(err?.message ?? err));
	process.exit(1);
}

const h = await openHarness({ cwd, storePath: store });
const server = serveOwner(h, claim.lock.socket);

scriptTurn(h.faux, [
	{ tool: "bash", args: { command: "echo owner-turn" } },
	"the owner ran a turn",
]);
await prompt(h.conversation, "hello from the owner", h.context);

console.log(JSON.stringify({ owned: true, pid: process.pid, socket: claim.lock.socket, conversation: h.conversation.id }));

// Release on signal so the demo can prove the store becomes free after a clean exit.
for (const signal of ["SIGINT", "SIGTERM"]) {
	process.on(signal, () => {
		server.close();
		releaseWriter(store);
		console.log(JSON.stringify({ released: true, pid: process.pid }));
		process.exit(0);
	});
}

const heartbeat = setInterval(() => touchOwner(store), 1000);
await new Promise((r) => setTimeout(r, holdMs));
clearInterval(heartbeat);
server.close();
releaseWriter(store);
console.log(JSON.stringify({ released: true, pid: process.pid }));
await h.harness.close(h.context);
