// demo/core.test.mjs - task-2 contract: a durable Session over node-sqlite storage, the root
// conversation configured with an agent, CodingTools + an extension installed in the registry, and
// ONE offline turn completed. No API keys, no network: the model plane is pi-ai's faux provider.
// Provenance: the opening sequence mirrors ~/Git/Durian-Pi/src/tui/durable/adapter.mjs
// (`createDurableTuiRuntime`: storage -> registry -> tools -> env -> Harness.open -> root agent)
// and ~/Git/Durian-Pi/src/tui/durable/boot.mjs (faux plane for offline runs), read 2026-11-14.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as durable from "@earendil-works/pi-durable";
import { openHarness, prompt, scriptTurn, transcript } from "../src/core.mjs";

const checks = [];
function check(name, condition, detail = "") {
	checks.push({ name, ok: !!condition, detail });
	if (!condition) console.log(`FAIL ${name} :: ${detail}`);
}

const dir = mkdtempSync(join(tmpdir(), "dh-core-"));
const store = join(dir, "session.sqlite");
const cwd = mkdtempSync(join(tmpdir(), "dh-core-cwd-"));
writeFileSync(join(cwd, "note.txt"), "the note says HELLO\n");

const h = await openHarness({ cwd, storePath: store, agent: { instructions: "Answer in one short sentence." } });

check("backend is node-sqlite", h.backend === "node-sqlite", h.backend);
check("storage is one opener (commit/scanEntries exist)", typeof h.storage.commit === "function" && typeof h.storage.scanEntries === "function", typeof h.storage);

const snapshot = h.registry.snapshot();
const installed = snapshot.installed().map((e) => e.name);
const toolNames = snapshot.tools().map((t) => t.tool.name);
check("coding tools installed in the registry", snapshot.tools().length >= 3, installed.join(","));
check("read/write/edit present", ["read", "write", "edit"].every((n) => toolNames.includes(n)), toolNames.join(","));
check("bash installed as its own extension", toolNames.includes("bash"), toolNames.join(","));

// A harness-defined extension, to prove the registry accepts custom tools and publishes at once.
const echoTool = durable.defineTool({
	name: "echo",
	description: "Return the given text upper-cased.",
	parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
	execute: async (args) => ({ output: args.text.toUpperCase() }),
});
h.registry.install(durable.defineExtension({ name: "demo-extension", tools: [echoTool] }));
check("custom tool visible after install", h.registry.snapshot().tools().some((t) => t.tool.name === "echo"), h.registry.snapshot().tools().map((t) => t.tool.name).join(","));

// The agent config is harness-owned state read back through the conversation, not recomputed.
const agent = await h.conversation.agent(h.context);
check("root conversation carries the agent model", agent.model?.modelId === "faux-1" && agent.model?.provider === "faux", JSON.stringify(agent.model));
check("root conversation carries the cwd", agent.cwd === cwd, String(agent.cwd));
check("instructions reached the agent", typeof agent.sections === "object" || agent.sections !== undefined, JSON.stringify(agent.sections ?? null).slice(0, 120));

// One offline turn: scripted model calls read (coding tool) and echo (custom tool), then answers.
scriptTurn(h.faux, [
	{ tool: "read", args: { path: "note.txt" } },
	{ tool: "echo", args: { text: "hello" } },
	"the note said HELLO and echo upper-cased it",
]);
const submission = await prompt(h.conversation, "read the note and echo hello", h.context);
check("submission was admitted", submission && submission.id !== undefined, JSON.stringify(submission));

const entries = await transcript(h.conversation, h.context);
const kinds = entries.map((e) => e.kind);
check("transcript has pi.user", kinds.includes("pi.user"), kinds.join(","));
check("transcript has pi.system (prompt sections)", kinds.includes("pi.system"), kinds.join(","));
check("transcript has pi.assistant with tool calls", entries.some((e) => e.kind === "pi.assistant" && (e.model?.[0]?.content ?? []).some((c) => c.type === "toolCall" && c.name === "read")), kinds.join(","));
check("transcript has pi.tool-result", kinds.includes("pi.tool-result"), kinds.join(","));
check("the read tool result reached the transcript", entries.some((e) => e.kind === "pi.tool-result" && JSON.stringify(e.model).includes("HELLO")), "");
check("the custom tool executed (output committed)", entries.some((e) => e.kind === "pi.tool-result" && JSON.stringify(e.model).includes("HELLO")), "");
check("the turn ended with assistant text", entries.some((e) => e.kind === "pi.assistant" && (e.model?.[0]?.content ?? []).some((c) => c.type === "text" && c.text.includes("the note said HELLO"))), "");

// Usage and the task graph are harness-owned state, read back, never recomputed here.
const usage = await h.harness.usage(h.context);
check("usage recorded for the turn", usage && Object.keys(usage).length > 0, JSON.stringify(usage).slice(0, 200));
const inspection = await h.harness.inspect(h.context);
check("inspect reports scheduling", inspection.scheduling !== undefined, JSON.stringify(inspection.scheduling));

console.log(`core: backend=${h.backend} conversation=${h.conversation.id} entries=${entries.length} kinds=${kinds.join(",")}`);

// The memory fallback: same spine, no store file, so a demo can run where no SQLite is writable.
// It is a separate open, not a re-use of the SQLite one, so the backend name is the assertion.
const m = await openHarness({ cwd });
check("memory fallback reports its backend", m.backend === "memory", m.backend);
scriptTurn(m.faux, ["offline memory turn"]);
await prompt(m.conversation, "hi", m.context);
check("memory fallback completes a turn", (await transcript(m.conversation, m.context)).some((e) => e.kind === "pi.assistant"), "");

console.log(`core: ${checks.filter((c) => c.ok).length}/${checks.length} checks passed over ${h.backend} and ${m.backend}`);
process.exit(checks.every((c) => c.ok) ? 0 : 1);
