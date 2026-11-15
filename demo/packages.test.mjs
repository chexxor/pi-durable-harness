// PROVENANCE: no Durian-Pi original - Durian-Pi's seats spawned the `pi` CLI as a child process (its src/job-object.mjs
// owns the spawn),
// so pi's package plane lived inside that process and there was nothing to load from outside it; this harness
// loads that plane from outside on demand, which is a different claim and is named here rather than left blank.
// demo/packages.test.mjs - the offline proof for the pi-package compatibility layer: a pi package is
// found on disk, loaded by pi's own loader, and its tool answers through pi-durable's registry - with
// rows for the capabilities that did not map.
//
// WHY THIS DEMO WRITES ITS OWN FIXTURE: the contract asks for a REAL pi package layout, and this machine
// has real published pi packages on disk (awesome-pi-themes, pi-deepinfra, pi-goal-x, plus this project's
// own @woksin/pi-context-budget under .pi/npm/node_modules), so those ARE discovered and loaded here.
// What a real package cannot give a demo is a tool whose ANSWER can be checked offline: a published
// extension's tool is written against pi's runner, which pi-durable never binds. So the demo adds a
// fixture package of the SAME layout - a `pi` manifest in package.json plus extensions/, skills/,
// prompts/, themes/ - whose tool ignores pi's context. Real packages prove the layout and the loader;
// the fixture proves the mapping. Neither alone would be enough.
//
// HOW IT STAYS OFFLINE: PI_OFFLINE is set before pi's loader runs - pi's own switch (package-manager.js:
// "Whether PI_OFFLINE is set; package installs and updates then skip all network access") - no API key is
// read, and the model is scripted on pi-ai's faux provider.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openHarness, prompt, scriptTurn, transcript } from "../src/core.mjs";
import { packageRoots, discoverPackages, extensionPaths } from "../src/packages/discover.mjs";
import { loadPiExtensions, loadPiResources, loadContextFiles } from "../src/packages/loader.mjs";
import { adaptPiExtension, skillsExtension, contextFileExtension } from "../src/packages/adapter.mjs";
import { CodingTools, createBashTool } from "@earendil-works/pi-durable/tools";
import { defineExtension, hook, CompactionTask } from "@earendil-works/pi-durable";
import { capabilityMatrix, unmappedRuntime } from "../src/packages/matrix.mjs";
import { getAgentDir, formatSkillsForPrompt } from "@earendil-works/pi-coding-agent";
import { applyThemeToRows, themeForeground, themeTokens } from "../src/tui/theme.mjs";

// pi's own offline switch, set before anything pi reads: the package plane must resolve from what is
// ALREADY on disk, and a demo that reached npm would not be offline in the sense the repo's contract
// uses. pi documents this env name in package-manager.js (`isOfflineModeEnabled`).
process.env.PI_OFFLINE = "1";

const checks = [];
function check(name, condition, detail = "") {
 checks.push({ name, ok: !!condition, detail });
 if (!condition) console.log(`FAIL ${name} :: ${detail}`);
}

// The fixture's extension module, in pi's own shape: a module whose default export is `pi -> void`
// (pi's `ExtensionFactory`), registering pi's `ToolDefinition` (execute takes
// toolCallId, params, signal, onUpdate, ctx and returns AgentToolResult {content, details}), and
// subscribing with pi's `on(event, handler)`. Nothing here knows pi-durable.
const FIXTURE_EXTENSION = [
 "export default (pi) => {",
 " pi.registerTool({",
 " name: \"fixture_echo\",",
 " description: \"Echo text back, a number of times.\",",
 " parameters: { type: \"object\", properties: { text: { type: \"string\" }, times: { type: \"number\" } }, required: [\"text\"] },",
 // pi's own pre-validation repair slot; the bridge installs it unchanged, so a model sending "3" as a
 // string is repaired before pi-durable validates - the same rule pi-durable documents for its own tools.
 " prepareArguments: (args) => ({ text: args.text, times: typeof args.times === \"string\" ? Number(args.times) : args.times }),",
 " execute: async (toolCallId, params, signal, onUpdate, ctx) => {",
 " const times = params.times ?? 1;",
 " return { content: [{ type: \"text\", text: Array(times).fill(params.text).join(\" \") }], details: { toolCallId, times } };",
 " },",
 " });",
 " pi.registerTool({",
 " name: \"fixture_refuse\",",
 " description: \"A call this extension's tool_call handler always blocks.\",",
 " parameters: { type: \"object\", properties: { why: { type: \"string\" } }, required: [\"why\"] },",
 " execute: async (toolCallId, params, signal, onUpdate, ctx) => {",
 " return { content: [{ type: \"text\", text: \"this call should never have run\" }] };",
 " },",
 " });",
 // pi patches a call's arguments by mutating event.input IN PLACE, and blocks by returning
 // {block, reason}; both are pi's shapes, and the bridge turns them into pi-durable's
 // {arguments} replacement and {block} refusal.
 " pi.on(\"tool_call\", (event, ctx) => { if (event.toolName === \"fixture_echo\") event.input = { ...event.input, text: \"patched\" }; });",
 " pi.on(\"tool_call\", (event, ctx) => { if (event.toolName === \"fixture_refuse\") return { block: true, reason: String(event.input.why) }; });",
 // pi's own override case: an extension registering a name pi already offers (docs/extensions.md: "wrap
 // built-in tools for logging or access control without reimplementing the UI"). pi-durable's word for it
 // is the `wraps` slot, so the bridge turns THIS registration into a wrap instead of a second tool.
 " pi.registerTool({",
 " name: \"bash\",",
 " description: \"pi's extension overriding a tool the harness already offers.\",",
 " parameters: { type: \"object\", properties: { command: { type: \"string\" } }, required: [\"command\"] },",
 // pi's pre-validation repair, in pi's own words: a model that sends `cmd` instead of pi-durable's
 // `command` is repaired BEFORE validation, and the repaired shape is what pi-durable's worker gets.
 " prepareArguments: (args) => ({ command: typeof args.command === \"string\" ? args.command : String(args.cmd ?? \"\") }),",
 " execute: async (toolCallId, params, signal, onUpdate, ctx) => {",
 " return { content: [{ type: \"text\", text: \"second-shell-must-not-run\" }], details: { toolCallId } };",
 " },",
 " });",
 // pi's provider-stage and compaction handler chains: the HOOK POINTS exist in pi-durable (GenerationTask
 // beforeProviderRequest/afterResponse, CompactionTask beforeCompact), so the bridge has to fire them, and
 // the fixture records what each handler actually received on globalThis - the same realm jiti runs in, so
 // the demo reads the handler's own report rather than a remembered one.
 " pi.on(\"before_provider_request\", (event, ctx) => { const b = (globalThis.__bridge ??= {}); b.providerRequest = { sawPayload: event.payload !== undefined, keys: Object.keys(event.payload ?? {}) }; });",
 " pi.on(\"before_provider_request\", (event, ctx) => { const b = (globalThis.__bridge ??= {}); b.providerRequestSecond = { sawPayload: event.payload !== undefined }; });",
 " pi.on(\"after_provider_response\", (event, ctx) => { const b = (globalThis.__bridge ??= {}); b.providerResponse = { type: event.type, statusSeen: event.status ?? null }; });",
 " pi.on(\"session_before_compact\", (event, ctx) => { const b = (globalThis.__bridge ??= {}); b.compact = { reason: event.reason, custom: event.customInstructions ?? null, entries: (event.preparation?.entries ?? []).length }; return { cancel: true }; });",
 // Two events with no pi-durable hook point, registered on purpose so the inventory has to name them.
 " pi.on(\"session_start\", (event, ctx) => {});",
 " pi.on(\"invented_event_at_this_pin\", (event, ctx) => {});",
 "};",
].join("\n");

const cwd = mkdtempSync(join(tmpdir(), "dh-pkg-"));
const pkg = join(cwd, "pkg");
mkdirSync(pkg, { recursive: true });
for (const kind of ["extensions", "skills", "prompts", "themes"]) mkdirSync(join(pkg, kind));
writeFileSync(join(pkg, "package.json"), JSON.stringify({
 name: "@harness/fixture-package",
 version: "1.0.0",
 pi: {
 extensions: ["./extensions"],
 skills: ["./skills"],
 prompts: ["./prompts"],
 themes: ["./themes"],
 // A kind real packages on this machine declare and no harness implements: `image`, a badge URL.
 image: "https://example.invalid/badge.png",
 // A kind declared but deliberately absent on disk, so the "declared, not present" row has evidence.
 // @temp: the path below is the one this demo never writes.
 missingKind: [],
 },
}));
writeFileSync(join(pkg, "extensions", "fixture.ts"), FIXTURE_EXTENSION);
// A module pi's loader cannot even parse: the contract's "a bad package warns and is skipped" half.
writeFileSync(join(pkg, "extensions", "broken.ts"), "export default (pi) => { this is not javascript;");
writeFileSync(join(pkg, "skills", "fixture-skill.md"), "---\nname: fixture-skill\ndescription: A skill the fixture package declares.\n---\nSay FIXTURE_SKILL_BODY.\n");
writeFileSync(join(pkg, "prompts", "fixture-prompt.md"), "---\nname: fixture-prompt\ndescription: A prompt template the fixture declares.\n---\nReview $ARGUMENTS.\n");
writeFileSync(join(cwd, "AGENTS.md"), "# Fixture rules\n\nOnly the fixture rules apply in this demo.\n");

const agentDir = getAgentDir();
const roots = [...packageRoots(process.cwd(), agentDir), { root: pkg, plane: "fixture" }];
const discovered = discoverPackages(roots);
const foundNames = discovered.found.map((row) => row.package);
check("real pi packages discovered", foundNames.length >= 4, `only ${foundNames.join(",")}`);
for (const name of ["awesome-pi-themes", "pi-deepinfra", "pi-goal-x", "@woksin/pi-context-budget"]) {
 check(`discovered ${name}`, foundNames.includes(name), foundNames.join(","));
}
check("fixture package discovered", foundNames.includes("@harness/fixture-package"), foundNames.join(","));
// An unknown manifest kind is kept as a row rather than dropped: dropping it would make a future pi kind
// read as "supported" when nothing here supports it.
check("unknown manifest kind kept as a row", discovered.missing.some((row) => row.kind === "unknown:image"), discovered.missing.map((row) => row.kind).join(","));
check("unknown package plane kept distinct", roots.some((r) => r.plane === "fixture") && discovered.found.some((row) => row.plane === "fixture"), foundNames.join(","));

const paths = extensionPaths(discovered);
check("fixture extension path found", paths.some((p) => p.includes("fixture.ts")), paths.join(","));
const loaded = await loadPiExtensions([...paths, join(pkg, "extensions", "broken.ts")], cwd, agentDir);
check("a loader failure is a row, not a throw", loaded.errors.length >= 1, `${loaded.errors.length} errors for ${paths.length + 1} paths`);
check("the broken extension did not load", !loaded.extensions.some((e) => e.path.includes("broken.ts")), "it loaded anyway");
check("the fixture extension loaded", loaded.extensions.some((e) => e.path.includes("fixture.ts")), `${loaded.extensions.length} loaded`);
const realLoaded = loaded.extensions.filter((e) => !e.path.includes("fixture.ts"));
check("at least one REAL pi extension loaded offline", realLoaded.length >= 1, `${loaded.extensions.length} loaded, none real`);

const inventory = [];
const fixtureExt = loaded.extensions.find((e) => e.path.includes("fixture.ts"));
const harnessToolOf = Object.fromEntries(([...CodingTools.tools, createBashTool()].map((tool) => [tool.name, tool])));
const fixtureAdapted = adaptPiExtension(fixtureExt, { name: "fixture-ping", inventory, offered: [...Object.keys(harnessToolOf)], existingOf: (name) => harnessToolOf[name] });
check("the fixture's two NEW tools bridged", fixtureAdapted.tools.length === 2, `${fixtureAdapted.tools.length} tools`);
check("pi's override of an offered name became a pi-durable wrap, not a second tool", fixtureAdapted.wraps.length === 1, `tools=${fixtureAdapted.tools.length} wraps=${fixtureAdapted.wraps.length}`);
check("the wrap names the tool it wraps", (fixtureAdapted.wraps[0]?.tool ?? null) === "bash" && typeof fixtureAdapted.wraps[0]?.wrap === "function", JSON.stringify({ tool: fixtureAdapted.wraps[0]?.tool, keys: Object.keys(fixtureAdapted.wraps[0] ?? {}) }));
check("the wrap is inventoried as mapped, not dropped", inventory.some((row) => row.name === "bash" && row.status === "shimmed"), inventory.filter((row) => row.name === "bash").map((r) => r.status).join(","));
const realExt = realLoaded.find((e) => e.tools.size > 0);
check("a real package registers tools", !!realExt, realLoaded.map((e) => `${e.path} tools=${e.tools.size}`).join(" | "));
const realAdapted = realExt ? adaptPiExtension(realExt, { name: "pi-real-package", inventory }) : null;
check("real package tool bridged into a pi-durable extension", realAdapted !== null && realAdapted.tools.length >= 1, realExt ? `${realExt.tools.size} pi tools -> ${realAdapted.tools.length} bridged` : "no real tool found");

// pi's own resource plane, with the fixture's skill and prompt paths handed over as pi's own
// additional*Paths options - the option shape for a layout that is not on pi's two package planes.
const missingPath = join(pkg, "prompts", "absent-this-demo-never-writes.md");
const plane = await loadPiResources(cwd, agentDir, {
 additionalSkillPaths: [join(pkg, "skills", "fixture-skill.md")],
 additionalPromptTemplatePaths: [join(pkg, "prompts", "fixture-prompt.md"), missingPath],
});
check("fixture skill reachable", plane.skills.some((skill) => skill.name === "fixture-skill"), plane.skills.map((s) => s.name).join(","));
check("fixture prompt template reachable", plane.prompts.some((p) => JSON.stringify(p).includes("fixture-prompt")), `${plane.prompts.length} prompts`);
check("real themes reachable from pi's plane", plane.themes.length >= 1, `${plane.themes.length} themes`);
// pi's PALETTE on the harness's own TUI rows, over a theme pi's loader discovered rather than a colour
// typed here: docs/themes.md says a theme "control[s] the colors Pi uses in interactive mode", and the
// record pi hands back carries pi's OWN token names (`accent`, `borderMuted`) with rgb triples. The check
// below is that the codes this harness paints with are the numbers pi's file publishes, which is what
// separates pi's palette from a guess.
const themeRecord = plane.themes.find((theme) => theme.concreteColors?.accent) ?? plane.themes[0];
const accentCode = themeForeground(themeRecord, "accent");
const mutedCode = themeForeground(themeRecord, "borderMuted");
const painted = applyThemeToRows(["  #7 pi.user hello", "> typing now"], themeRecord);
check("pi's palette reaches the rows fed to pi-tui",
  accentCode && mutedCode && painted.lines.length === 2 && painted.coloured === 2 &&
  painted.lines.some((line) => line.includes(`[${accentCode}m`)) &&
  painted.lines.some((line) => line.includes(`[${mutedCode}m`)) &&
  themeTokens(themeRecord).includes("accent"),
  `theme=${themeRecord.name} accent=${accentCode} borderMuted=${mutedCode} tokens=${themeTokens(themeRecord).length} coloured=${painted.coloured}`);
check("a theme without the token leaves rows uncoloured instead of guessing a hue",
  applyThemeToRows(["  plain"], { concreteColors: {} }).coloured === 0, "empty palette answers zero");
check("a missing resource path is a diagnostic, not a crash", plane.promptDiagnostics.length >= 1, `${plane.promptDiagnostics.length} diagnostics`);
check("pi's own skill formatter used", formatSkillsForPrompt(plane.skills).includes("fixture-skill"), formatSkillsForPrompt(plane.skills).slice(0, 120));

const contextFiles = loadContextFiles(cwd, agentDir);
check("fixture context file read by pi's loader", contextFiles.some((f) => f.path.includes("AGENTS.md")), contextFiles.map((f) => f.path).join(","));

const extensions = [fixtureAdapted.extension, ...(realAdapted ? [realAdapted.extension] : []), skillsExtension(plane.skills), contextFileExtension(contextFiles, cwd)];
 const h = await openHarness({ cwd, extraExtensions: extensions.filter(Boolean) });
const offered = h.registry.snapshot().tools().map((entry) => entry.tool.name);
check("fixture tool offered by the registry", offered.includes("fixture_echo"), offered.join(","));
check("real package tool offered by the registry", realExt && [...realExt.tools.keys()].some((name) => offered.includes(name)), offered.join(","));

const agent = await h.conversation.agent(h.context);
const sectionKeys = (agent.sections ?? []).map((s) => s.key);
check("skills section reaches the agent", sectionKeys.includes("skills"), sectionKeys.join(","));
check("context file section reaches the agent", sectionKeys.some((key) => key.includes("agents_md")), sectionKeys.join(","));

const wrapMarker = join(cwd, "piwrap.txt");
scriptTurn(h.faux, [
 // pi's override case end to end: the model sends `cmd`, pi's prepareArguments repairs it to pi-durable's
 // `command`, pi-durable's OWN bash runs the command exactly once, and the wrapper adds its log line.
 { tool: "bash", args: { cmd: `printf 'pi-wrap\\n' >> ${wrapMarker}` } },
 // `times` arrives as a STRING, so pi's prepareArguments (bridged unchanged) has to repair it before
 // pi-durable validates; the tool_call handler then patches `text`, which the bridge reports as
 // pi-durable's argument replacement. Both are visible in the committed result.
 { tool: "fixture_echo", args: { text: "sent", times: "3" } },
 { tool: "fixture_refuse", args: { why: "because the fixture says so" } },
 "the package plane answered",
]);
await prompt(h.conversation, "package plane", h.context);
const entries = await transcript(h.conversation, h.context);
const results = entries.filter((e) => e.kind === "pi.tool-result").map((e) => JSON.stringify(e.model));
check("fixture tool ran through pi-durable's registry", results.some((r) => r.includes("patched patched patched")), results.join(" | "));
check("pi's prepareArguments repaired the string number", results.some((r) => r.includes('"times":3') || r.includes("patched patched patched")), results.join(" | "));
check("pi's tool_call handler patched the arguments", results.some((r) => r.includes("patched")), results.join(" | "));
check("pi's blocking handler refused the second call", results.some((r) => r.includes("blocked") || r.includes("because the fixture says so")) && !results.some((r) => r.includes("should never have run")), results.join(" | "));
const wrapped = results.filter((r) => r.includes("logged by pi's wrapper of bash"));
check("pi-durable's own bash ran once under the wrap (the marker file gained one line)", readFileSync(wrapMarker, "utf8").split("\n").filter((l) => l.trim()).length === 1, `marker lines=${readFileSync(wrapMarker, "utf8").trim()}`);
check("the wrapped call reports pi's wrapper line beside pi-durable's own output", wrapped.length === 1, `${wrapped.length} wrapped results: ${wrapped.join(" | ").slice(0, 200)}`);
check("no second shell implementation ran (pi's override composes instead of replacing)", !results.some((r) => r.includes("second-shell-must-not-run")), results.join(" | ").slice(0, 240));
check("pi's argument repair reached pi-durable's worker (cmd became command)", wrapped.length === 1 && readFileSync(wrapMarker, "utf8").includes("pi-wrap"), `wrapped=${wrapped.length} marker=${readFileSync(wrapMarker, "utf8").trim()}`);
check("the turn ended with an answer", entries.some((e) => e.kind === "pi.assistant" && JSON.stringify(e.model).includes("the package plane answered")), entries.map((e) => e.kind).join(","));

// The inventory is what the docs promise, so the promise has to cover what actually loaded: every name
// a REAL pi extension registered must be a row of the matrix, and the detector must be able to fail
// (the fixture's invented event is what proves it can).
const realInventory = inventory.filter((row) => row.name !== "invented_event_at_this_pin" && row.name !== "session_start" && row.name !== "bash");
check("matrix covers every real pi capability that loaded", unmappedRuntime(realInventory).length === 0, unmappedRuntime(realInventory).map((row) => `${row.capability}:${row.name}`).join(" | "));
check("the detector catches an unnamed capability", unmappedRuntime(inventory).some((row) => row.name === "invented_event_at_this_pin"), "detector found nothing to report");

const doc = readFileSync("docs/package-support.md", "utf8");
const unsupported = capabilityMatrix("unsupported");
const unnamed = unsupported.filter((row) => !row.names.every((name) => doc.includes(name)));
check("docs name every unsupported capability", unnamed.length === 0, unnamed.map((row) => row.names.join(",")).join(" | "));
check("docs name every shimmed capability too", doc.includes("shimmed"), doc.slice(0, 200));

 // The bridge's provider-stage handlers fired on the run pi-durable made, and the handler's own report
 // names what it saw: pi's payload reached the handler (pi's event is {type, payload}), and the SECOND
 // handler saw a payload too, which is pi-durable's chain rather than pi's runner.
  const bridged = globalThis.__bridge ?? {};
 // What pi's bridged handler REPORTED, from the handler's own words rather than a remembered list: pi's
 // after_provider_response chain fires on pi-durable's afterResponse hook, and pi's HTTP fields (status,
 // headers) are NOT invented on the way in - pi-durable's hook hands pi-ai's message, not pi's response.
 check("pi's after_provider_response handler fired on pi-durable's afterResponse hook",
  bridged.providerResponse !== undefined && bridged.providerResponse.type === "after_provider_response",
  JSON.stringify(bridged.providerResponse));
 check("pi's event NAME reached the handler while pi's HTTP status stayed absent (nothing was invented)",
  bridged.providerResponse !== undefined && bridged.providerResponse.statusSeen === null,
  JSON.stringify(bridged.providerResponse));
 // pi's before_provider_request chain is INSTALLED (src/packages/adapter.mjs builds the hook) but the
 // pinned pi-ai faux provider, which every offline demo answers with, never reaches pi-durable's
 // beforeProviderRequest call site - pi-durable fires beforeRequest there instead. Recorded rather than
 // assumed, because it is the reason the matrix row's evidence names the demos it can NOT cite.
 check("the faux plane does not reach pi's before_provider_request hook point (recorded, not assumed)",
  bridged.providerRequest === undefined,
  `providerRequest=${JSON.stringify(bridged.providerRequest)}`);
 // pi's /compact on pi-durable's compaction plane: Harness.compact runs a CompactionTask whose beforeCompact
 // hook carries pi's session_before_compact chain. The conversation's own compaction settings are what make
 // range selection find a cut at all (dist/harness/compaction.js returns complete() when selectCut finds
 // none, and then no hook fires), and the fixture's handler CANCELS, which is pi-durable's {decline: true}.
  // pi-durable selects a cut by walking back until `keepRecentTokens` are kept and cutting at the first
 // candidate that has something to summarize BEFORE it (dist/harness/compaction.js), so the demo grows the
 // context with two more settled turns before asking for a summary - an empty range would complete the task
 // without ever firing a hook, which is pi-durable's documented behaviour rather than a failure.
 scriptTurn(h.faux, ["one more settled answer"]);
 await prompt(h.conversation, "another input to grow the range", h.context);
 scriptTurn(h.faux, ["and one more"]);
 await prompt(h.conversation, "one more input", h.context);
 const beforeCompactCount = (await transcript(h.conversation, h.context)).length;
 await h.conversation.configure({ compaction: { enabled: true, reserveTokens: 1, keepRecentTokens: 0 } }, h.context);
 const compactAnswer = await h.conversation.compact("keep the durable facts", h.context);
  try { const diagOutcome = await h.harness.waitForTask(compactAnswer, h.context); console.error(`DIAG outcome=${JSON.stringify(diagOutcome)}`); } catch (err) { console.error(`DIAG waitForTask threw: ${String(err?.message ?? err)}`); }
 const afterCompaction = await transcript(h.conversation, h.context);
 check("pi's session_before_compact handler fired on pi-durable's CompactionTask",
  bridged.compact !== undefined && bridged.compact.reason === "manual",
  JSON.stringify(bridged.compact));
 check("pi's compaction reason vocabulary is pi-durable's own (manual/threshold/overflow)",
  bridged.compact !== undefined && ["manual", "threshold", "overflow"].includes(String(bridged.compact.reason)),
  `reason=${bridged.compact?.reason}`);
 check("pi's cancel became pi-durable's decline, so no summary entry landed and the task completed with nothing",
  afterCompaction.length === beforeCompactCount && !afterCompaction.some((e) => String(e.kind).includes("compaction")),
  `entries before=${beforeCompactCount} after=${afterCompaction.length} kinds=${afterCompaction.map((e) => e.kind).join(",")} task=${JSON.stringify(compactAnswer)}`);
 check("pi's custom instructions crossed to pi-durable's CompactionTask input",
  bridged.compact !== undefined && bridged.compact.custom === "keep the durable facts" && bridged.compact.entries > 0,
  JSON.stringify(bridged.compact));
console.log(`${checks.filter((c) => c.ok).length}/${checks.length} checks passed`);
console.log(`packages=${foundNames.length} loaded=${loaded.extensions.length} errors=${loaded.errors.length} offered=${offered.join(",")} sections=${sectionKeys.join(",")}`);
if (checks.some((c) => !c.ok)) process.exit(1);
