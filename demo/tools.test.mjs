// demo/tools.test.mjs - task-4 contract, offline: read/write/edit/bash through a NodeExecutionEnv in
// a temp cwd, one custom defineTool whose argument coercion runs, and a beforeTool hook BLOCK case.
// No API keys, no network: the model plane is pi-ai's faux provider, and the tool calls below are what
// a real model would send - what is under test is the surface (registrations, env, guard), not choices.
// Provenance: mirrors the tool/env/guard shape of ~/Git/Durian-Pi/src/seattools.mjs and
// ~/Git/Durian-Pi/src/seatguard.mjs (read 2026-11-15 at pin v1.5.1); the open sequence mirrors
// ~/Git/Durian-Pi/src/tui/durable/adapter.mjs. Seats, worktrees and queue rules are dropped.
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as durable from "@earendil-works/pi-durable";
import { fauxProvider, createModels } from "@earendil-works/pi-ai";
import { openHarness, prompt, scriptTurn, transcript } from "../src/core.mjs";
import { makeEnv } from "../src/executionenv.mjs";
import { guardExtension, scratchNoteTool, toolsetExtension } from "../src/toolsurface.mjs";

const checks = [];
function check(name, ok, detail = "") {
 checks.push({ name, ok: !!ok, detail });
 if (!ok) console.log(`FAIL ${name} :: ${detail}`);
}

const dir = mkdtempSync(join(tmpdir(), "dh-tools-"));
const cwd = mkdtempSync(join(tmpdir(), "dh-tools-cwd-"));
const store = join(dir, "session.sqlite");
const fixture = join(cwd, "file");
writeFileSync(fixture, "hello from the tool\n");
const scratchFile = join(cwd, "harness-scratch.md");
const secretPath = join(cwd, "secret.txt");

const faux = fauxProvider();
const models = createModels({ [faux]: [{ id: "faux-tiny", type: "message", contextPeriod: "none" }] });

const harness = await openHarness({
 cwd,
 storePath: store,
 agent: { instructions: "Use the tools, then answer in one line." },
 // `tools: false` closes pi-durable's default set so the extension below is the whole surface:
 // the demo asserts the exact tool names it offered, which a defaulted-plus-installed set would not.
 tools: false,
 extraExtensions: [
 // pi-durable's own coding tools, named one by one, so the surface is exactly what the demo asserts
 toolsetExtension(["read", "write", "edit", "bash"]),
 // our own tool, defined with defineTool and installed like any other extension
 durable.defineExtension({ name: "dh.scratch", tools: [scratchNoteTool] }),
 // the guard, on ToolTask: one deny rule on shell commands, one on file paths
 guardExtension({ cwd, shell: ["rm\\s+-rf"], paths: ["secret"] }),
 ],
});

const other = join(cwd, "other");


// The calls below are what a real model would send; each response carries ONE tool call so the turn is
// a sequence of generations whose order is deterministic (a parallel set in one response would record
// all call INTENTS before any handler ran - see the header note and src/rpc.mjs).
scriptTurn(harness.faux, [
 { tool: "read", args: { path: "file" } },
 { tool: "write", args: { path: "other", content: "first line\nsecond line\n" } },
 { tool: "edit", args: { path: "other", edits: [{ oldText: "first line", newText: "edited first line" }] } },
 { tool: "bash", args: { command: "printf tool-out\\n" } },
 // the blocked call: a deny rule fires, and the model sees the reason rather than a silent skip
 { tool: "bash", args: { command: "rm -rf file" } },
 // our tool, called with `repeat` as a STRING: the coercion in prepareArguments must make it 3
 { tool: "scratch_note", args: { text: "offline note", repeat: "3" } },
 { tool: "write", args: { path: "secret.txt", content: "must not be written\n" } },
 "the tools ran",
]);
await prompt(harness.conversation, "use the tools", harness.context);

const entries = await transcript(harness.conversation, harness.context, 200);
const kinds = entries.map((e) => e.kind);
const results = entries.filter((e) => e.kind === "pi.tool-result").map((e) => JSON.stringify(e.model));
const all = results.join("\n");

check("backend is node-sqlite", harness.backend === "node-sqlite", harness.backend);
// The registry's own view is the assertion about the surface: the demo never claims a tool exists
// because it passed one in.
const snapshot = harness.registry.snapshot();
const toolNames = snapshot.tools().map((t) => t.tool.name);
const installed = snapshot.installed().map((e) => e.name);
check("only the named tools are offered", ["read", "write", "edit", "bash", "scratch_note"].every((n) => toolNames.includes(n)), toolNames.join(","));
check("the guard extension is installed", installed.includes("harness.guard"), installed.join(","));

// `path: "file"` is RELATIVE, so resolving it is the environment's job: a tool that resolved against
// the process cwd would have read nothing here.
check("read resolved a relative path through the env", all.includes("hello from the tool"), "");
check("write created the file", existsSync(other), other);
check("edit replaced the first line", existsSync(other) && (readFileSync(other, "utf8", { flag: "r" }).split("\n")[0] ?? "") === "edited first line", existsSync(other) ? readFileSync(other, "utf8") : "missing");
check("bash ran through the env", all.includes("tool-out"), "");

// The blocked shell call: the reason names the deny rule, and the target is still on disk.
check("the guard blocked rm -rf", all.includes("deny rule"), "");
check("the guarded call left the file alone", existsSync(fixture), fixture);
// The blocked write: nothing was created, which is the effect-free answer the guard promises.
check("the path deny rule left no file", !existsSync(secretPath), secretPath);

// Our own tool: `repeat: "3"` came in as a string, so the count the tool reports must be 3 - which is
// the repair running BEFORE validation (a repaired value inside execute could not make it 3 at all).
check("the string repeat was repaired to 3", all.includes("3 line(s) appended"), "");
check("the scratch file holds 3 lines", existsSync(scratchFile) && readFileSync(scratchFile, "utf8").trim().split("\n").length === 3, existsSync(scratchFile) ? readFileSync(scratchFile, "utf8") : "missing");

check("the turn ended with assistant text", entries.some((e) => e.kind === "pi.assistant" && (e.model?.[0]?.content ?? []).some((c) => c.type === "text" && c.text.includes("the tools ran"))), "");
check("every tool call has a committed result", results.length >= 6, `${results.length} results for ${toolNames.length} offered tools`);

console.log(`tools: cwd=${cwd} results=${results.length} kinds=${kinds.join(",")}`);
console.log(`tools: ${checks.filter((c) => c.ok).length}/${checks.length} checks passed`);
process.exit(checks.every((c) => c.ok) ? 0 : 1);
