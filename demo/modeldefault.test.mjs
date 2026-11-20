#!/usr/bin/env node
// demo/modeldefault.test.mjs - WHO answers a run, decided in ONE place and measured everywhere else: a run
// that names NO model resolves pi's OWN settings default through pi's OWN provider plane, pi-ai's faux
// plane is armed ONLY when `--faux` is spelled, and the label the interactive screen paints is the pair
// that decision made - never a fallback that makes a real run look offline.
//
// PROVENANCE: no Durian-Pi original - Durian-Pi never drove an input component and never resolved a
// default model itself (its seats ran the `pi` CLI as a child process, so pi's settings default and
// pi's provider plane stayed inside that child); there is nothing there to extract. Symbols VERIFIED
// AGAINST PINED packages, read on this machine at pin v1.5.1:
//   pi-coding-agent dist/core/settings.d.ts `SettingsManager` (through src/settings.mjs' piSettings):
//     the settings keys that NAME a model are `defaultProvider` + `defaultModel`;
//   pi-coding-agent dist/core/model-registry.d.ts `ModelRegistry.hasConfiguredAuth(model: Model<Api>)`
//     (NOT model-runtime.d.ts' `hasConfiguredAuth(providerId)`, which does not know the providers
//     src/providers.mjs registered - measured in demo/cli.test.mjs' `--list-models` row);
//   pi-ai dist/models.d.ts `Models.getModel(provider, id)` and dist/faux.d.ts `fauxProvider`;
//   pi-tui `Terminal`, `Editor.handleInput/onSubmit` and the exported `stripTerminalSequences`;
//   pi-durable dist/harness/types.d.ts `Agent { model, ... }` and `Harness.open`.
// DROPPED from pi's own interactive layer, on purpose and NAMED in the capability matrix rather than
// silently: pi's `InteractiveMode` and its model-selector dialogs, pi's autocomplete dropdown, pi's
// session FILES, and pi's `--api-key` flag (no plane here - refused BY NAME, row in docs/world/reference/package-support.md).
//
// WHY THE FEED IS ONE KEYSTROKE PER CHUNK: measured, not assumed - piDockLoop's scripted feed appends
// "\n", which pi-tui's Editor is NOT (its ENTER is "\r"), so a whole-line chunk draws and submits
// nothing; a real terminal hands one keystroke per chunk, so that is what this demo feeds.
//
// WHY NOTHING IS SUBMITTED ON THE REAL-MODEL RUN: this file is in the offline suite, so no check here
// may reach a provider endpoint. The real-model run feeds ONLY `/quit`, so the dock paints and leaves
// WITHOUT one admission - which is also the check that `/quit` is never counted as a submission. That
// pi's settings model really answers lives in .ai-work/pi-cli-parity-goal/proof-live-pty.json, a live
// pty run whose answer text and `plane:`/`screen:` lines are captured there, not in the suite.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { claimWriter, releaseWriter, readOwner } from "../src/ownership.mjs";
import { harnessInvocation, settleInvocation } from "../src/cli-intent.mjs";
import { piSettings } from "../src/settings.mjs";
import { agentPlane } from "../src/agentplane.mjs";
import { lookupModel, fauxPlaneRefusal } from "../src/providers.mjs";
import { piDockLoop } from "../src/tui/pidockloop.mjs";
import { TuiAltScreen, stripTerminalSequences } from "@earendil-works/pi-tui";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";

const ROOT = process.cwd();
const CLI = join(ROOT, "cli.mjs");
const checks = [];

function record(ok, label, detail = "") {
 checks.push({ ok, label });
 console.log(`  ${ok ? "ok " : "NOT"} ${label}${detail ? `: ${detail}` : ""}`);
}

function captureTerminal(columns, rows, sink) {
 const terminal = {
  start: (onInput, onResize) => {},
  stop: () => {},
  write: (data) => { sink.push(data); },
  moveBy: () => {},
  hideCursor: () => {},
  showCursor: () => {},
  clearLine: () => {},
  clearFromCursor: () => {},
  clearScreen: () => {},
  setTitle: () => {},
  setProgress: () => {},
  drainInput: async () => [],
 };
 Object.defineProperty(terminal, "columns", { get: () => columns });
 Object.defineProperty(terminal, "rows", { get: () => rows });
 Object.defineProperty(terminal, "kittyProtocolActive", { get: () => false });
 return terminal;
}

async function runScript(script, args, { stdin = null } = {}) {
 const child = spawn("node", [script, ...args], { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
 let stdout = "";
 let stderr = "";
 child.stdout.on("data", (chunk) => { stdout += String(chunk); });
 child.stderr.on("data", (chunk) => { stderr += String(chunk); });
 if (stdin !== null) child.stdin.write(stdin);
 child.stdin.end();
 await new Promise((done) => child.once("exit", done));
 return { stdout, stderr, exit: child.exitCode };
}

/** One headless dock pass over ONE invocation: pi's Editor draws, pi's key table decides the keystrokes,
 * and the caller feeds nothing but `feed` + ENTER. Returns pi's tally, the decision lines pi printed, and
 * the painted bytes with pi's own sequences stripped. */
async function dockRun({ parts, feed, sink, width = 72, height = 24 }) {
 const ui = new TuiAltScreen(captureTerminal(width, height, sink), false, undefined);
 ui.start();
 const said = [];
 const keys = [...Array.from(`${feed}\r`)];
 const tally = await piDockLoop({
  parts,
  ui,
  size: () => ({ columns: width, rows: height }),
  context: BACKGROUND_CONTEXT,
  keystrokes: true,
  reader: () => keys,
  report: (line) => said.push(line),
 });
 await settleInvocation(parts);
 ui.clear();
 ui.requestRender();
 ui.stop();
 return { tally, said, painted: stripTerminalSequences(sink.join("")) };
}

async function main() {
 const dir = mkdtempSync(join(tmpdir(), "dh-model-"));

 // 1) WHO names the model, from pi's OWN resolver: pi's global settings at pi's agentDir plus this
// cwd's project settings, merged by pi's SettingsManager (src/settings.mjs never re-reads the file).
 const settings = piSettings({ cwd: dir });
 const defaultProvider = settings.settings?.defaultProvider ?? null;
 const defaultModel = settings.settings?.defaultModel ?? null;
 const settingsRef = defaultProvider && defaultModel ? `${defaultProvider}/${defaultModel}` : null;
 record(Boolean(settingsRef) && (settings.paths?.agentDir ?? null) && (settings.paths?.project ?? null),
  "pi's settings plane names a default model pair (defaultProvider + defaultModel) and the two files it merged",
  `ref=${JSON.stringify(settingsRef)} settingsPaths=${Object.keys(settings.paths ?? {}).length} errors=${(settings.errors ?? []).length}`);

 // 2) The SAME pair, from the ONE plane every surface composes: a run that says a real model may answer
// (realModel, which src/cli-intent.mjs sets from ONE rule: pi-ai's faux plane answers ONLY `--faux`).
 const plane = await agentPlane({ cwd: dir, realModel: true });
 const ref = plane.modelRef ?? null;
 record(ref && `${ref.provider}/${ref.modelId}` === settingsRef,
  "the model plane resolves pi's settings default into its own modelRef (no model typed in this file)",
  `plane=${JSON.stringify(ref ? `${ref.provider}/${ref.modelId}` : null)} settings=${JSON.stringify(settingsRef)}`);
 const agentModel = plane.agent?.model ?? null;
 record(agentModel && agentModel.provider === defaultProvider && String(agentModel.modelId ?? agentModel.model) === defaultModel,
  "the agent record the Harness is opened with carries pi's settings model, not pi-ai's faux plane",
  `agent=${JSON.stringify(agentModel ? `${agentModel.provider}/${agentModel.modelId ?? agentModel.model}` : null)}`);
 const found = await lookupModel(plane.modelRuntime, settingsRef);
 record(found?.model != null && plane.modelRuntime.registry.hasConfiguredAuth(found.model) === true,
  "pi's ModelRegistry resolves that pair to a Model record and says pi's auth plane configures it",
  `resolved=${found?.model != null} auth=${found?.model != null ? plane.modelRuntime.registry.hasConfiguredAuth(found.model) : "n/a"}`);
 const fauxWarnings = (plane.warnings ?? []).filter((w) => w?.scope === "model" && /faux/i.test(String(w?.message ?? "")));
 record(fauxWarnings.length === 0,
  "a real-model plane says NOTHING about pi-ai's faux plane answering it (the warning is not a decorative line, it names a different decision)",
  `model warnings=${(plane.warnings ?? []).filter((w) => w?.scope === "model").length} faux=${fauxWarnings.length}`);

 // 3) That decision reaches the screen pi paints, and NOTHING is admitted on this run.
 const realStore = join(dir, "real.sqlite");
 const claimReal = claimWriter(realStore);
 record(claimReal.mode === "writer" && readOwner(realStore).owned,
  "this process claimed the store before the real-model dock opened",
  `pid=${process.pid}`);
 const realParts = await harnessInvocation({ store: realStore, cwd: dir, messages: [] }, { context: BACKGROUND_CONTEXT });
 const realSink = [];
const realRun = await dockRun({ parts: realParts, feed: "/quit", sink: realSink });
 record(realRun.tally.quit === "quit" && realRun.tally.submitted === 0 && realRun.tally.slash[0]?.handled === "quit",
  "the real-model dock leaves on `/quit` with ZERO admissions, so this offline proof never reached a provider",
  `quit=${JSON.stringify(realRun.tally.quit)} submitted=${realRun.tally.submitted} slash=${JSON.stringify((realRun.tally.slash ?? []).map((d) => d.handled))}`);
 record(realRun.painted.includes(`model ${defaultProvider}/${defaultModel}`),
  "the painted header names pi's settings default, spelled `model <provider>/<id>`",
  `painted=${JSON.stringify(realRun.tally.paints)} header=${JSON.stringify(`model ${defaultProvider}/${defaultModel}`)}`);
 const footerRow = realRun.painted.includes(`(${defaultProvider})`) && realRun.painted.includes(defaultModel);
 record(footerRow && !realRun.painted.includes("faux/faux-1"),
  "the painted footer carries the same pair as pi's model word (`(<provider>) <id>`), and pi's screen never says faux/faux-1 on this run",
  `providerParen=${JSON.stringify(`(${defaultProvider})`)} id=${JSON.stringify(defaultModel)} faux=${realRun.painted.includes("faux/faux-1")}`);
 await realParts.harness.close(BACKGROUND_CONTEXT);
 const releasedReal = releaseWriter(realStore);
 record(releasedReal && !readOwner(realStore).owned,
  "leaving the real-model run ran the ordinary cleanup: the Harness closed and this process released its claim",
  `released=${releasedReal} owner=${JSON.stringify(readOwner(realStore))}`);

 // 4) `--faux` spelled at the CLI: the answer is pi-ai's script, and the plane SAYS what it did not do.
 const cliStore = join(dir, "cli.sqlite");
 const marker = "the answer a spelled --faux run commits";
const printRun = await runScript(CLI, ["--store", cliStore, "--cwd", dir, "--faux", marker, "-p", "say the line"]);
 record(printRun.exit === 0 && printRun.stdout.trim() === marker,
  "a `--faux` print run exits 0 and answers with the scripted text and nothing else",
  `exit=${printRun.exit} stdout=${JSON.stringify(printRun.stdout.trim())}`);
 const warnLines = printRun.stderr.split("\n").filter((line) => line.startsWith("warning [model]:"));
 record(warnLines.length === 1 && warnLines[0].includes(settingsRef ?? "\u0000") && warnLines[0].includes("did not ask for a real model"),
  "the run that spelled `--faux` says SO on stderr, naming pi's settings pair rather than substituting it silently",
  `warnings=${JSON.stringify(warnLines)}`);

 // 5) The LABEL PAIR: the same dock over a `--faux` run, where the plane kept its modelRef null.
 const fauxStore = join(dir, "faux.sqlite");
 const claimFaux = claimWriter(fauxStore);
 const fauxParts = await harnessInvocation({ store: fauxStore, cwd: dir, faux: marker, messages: [] }, { context: BACKGROUND_CONTEXT });
 const fauxSink = [];
const fauxRun = await dockRun({ parts: fauxParts, feed: "/quit", sink: fauxSink });
 record(fauxParts.modelRef === null && fauxRun.painted.includes("model faux/faux-1"),
  "a `--faux` run's dock labels pi-ai's faux plane (modelRef stays null, so the pair comes from the agent record)",
  `modelRef=${JSON.stringify(fauxParts.modelRef)} painted=${JSON.stringify(fauxRun.tally.paints)}`);
 await fauxParts.harness.close(BACKGROUND_CONTEXT);
 record(releaseWriter(fauxStore) && !readOwner(fauxStore).owned,
  "the faux run cleaned up and released its claim too",
  `owner=${JSON.stringify(readOwner(fauxStore))}`);

 // 6) pi's `--list-models [search]` verb, searched FOR pi's settings default: the pair is in the plane
// pi answers through, and the list is answered BEFORE any store is claimed.
 const listStore = join(dir, "list.sqlite");
 const listRun = await runScript(CLI, ["--store", listStore, "--cwd", dir, "--list-models", defaultModel ?? ""]);
 const listOut = listRun.stdout.split("\n").filter((line) => line.trim());
 record(listRun.exit === 0 && listOut.length >= 2 && listOut[0].startsWith("provider"),
  "`--list-models <id>` prints pi's own header row plus its model rows",
  `exit=${listRun.exit} rows=${listOut.length} first=${JSON.stringify(listOut[0] ?? "")}`);
 record(listOut.some((line) => line.startsWith(defaultProvider ?? "\u0000") && line.includes(defaultModel ?? "\u0000"))
  && !existsSync(listStore) && !readOwner(listStore).owned,
  "pi's settings default appears as a row of pi's own columns, and listing claimed no store",
  `stderr=${JSON.stringify(listRun.stderr.trim())} storeWritten=${existsSync(listStore)}`);

 // 7) The row surface honours `/quit` too, and admits nothing: `--faux` is what makes it offline here.
// The CHILD claims this store, so the parent must not claim it - a parent that did would make the child
// attach as a reader to a socket it never serves (measured: `cannot reach the owning harness ... ENOENT`).
 const rowStore = join(dir, "row.sqlite");
 const rowRun = await runScript(CLI, ["--store", rowStore, "--cwd", dir, "--tui", "--keystroke-input", "--faux", marker], { stdin: "/quit\r" });
 const rowLines = rowRun.stderr.split("\n");
 record(rowRun.exit === 0 && rowLines.some((line) => line.startsWith("theme:")),
  "the row surface answers `--tui --keystroke-input` and names pi's palette line",
  `exit=${rowRun.exit} theme=${JSON.stringify(rowLines.filter((line) => line.startsWith("theme:")))}`);
 record(!rowLines.some((line) => line.startsWith("submitted:")),
  "`/quit` on the row surface admitted NOTHING: pi-durable's ONE mutation line never saw the draft",
  `stderr=${JSON.stringify(rowRun.stderr.trim())}`);
 record(!readOwner(rowStore).owned,
  "the child process that claimed the row surface released its own claim before exiting, so the store is reclaimable",
  `owner=${JSON.stringify(readOwner(rowStore))}`);

 // 8) WHERE pi's `--model` and pi-ai's `--faux` MEET, and why that meeting is refused at OPEN rather
// than resolved twice: `--faux <reply>` TAKES the scripted reply, so the evidence must spell `--model <ref>`
// BEFORE `--faux <reply>` (measured: `--faux --model X` swallows `--model` into the script).
 const refusedModel = "strata/qwen3.8-flash-next-iq3_s";
 const shared = fauxPlaneRefusal(...refusedModel.split("/")); // ONE sentence, one source, both gates
 const refusedStore = join(dir, "refused.sqlite");
 const rpcRefused = await runScript(CLI,
  ["--mode", "rpc", "--store", refusedStore, "--cwd", dir, "--model", refusedModel, "--faux", marker],
  { stdin: '{"type":"get_state"}\n' });
 record(rpcRefused.exit === 1 && rpcRefused.stderr.includes(shared) && !existsSync(refusedStore) && !readOwner(refusedStore).owned,
  "a `--faux` run that also names pi's `--model <real ref>` is refused at OPEN: exit 1, pi's plane named in the sentence, NO store written and NO claim left",
  `exit=${rpcRefused.exit} store=${existsSync(refusedStore)} owner=${JSON.stringify(readOwner(refusedStore))} stderr=${JSON.stringify(rpcRefused.stderr.trim())}`);
 const rowRefused = await runScript(CLI,
  ["--store", refusedStore, "--cwd", dir, "--tui", "--keystroke-input", "--model", refusedModel, "--faux", marker],
  { stdin: "/quit\\r" });
 record(rowRefused.exit === 1 && rowRefused.stderr.includes(shared),
  "the row surface refuses the SAME spelling in the SAME sentence, so one rule decides who answers on every surface",
  `exit=${rowRefused.exit} stderr=${JSON.stringify(rowRefused.stderr.trim())}`);
 const rpcSwitch = await runScript(CLI,
  ["--mode", "rpc", "--store", join(dir, "switched.sqlite"), "--cwd", dir, "--faux", marker],
  { stdin: `{"type":"set_model","provider":"strata","modelId":"qwen3.8-flash-next-iq3_s"}\n` });
 record(rpcSwitch.stdout.includes(`"error":"set_model: ${shared}"`),
  "the mid-session `set_model` gate names the SAME sentence, so the open-time refusal and the in-session one cannot drift",
  `stdout=${JSON.stringify(rpcSwitch.stdout.trim())}`);
 const fauxKept = await runScript(CLI,
  ["--mode", "rpc", "--store", join(dir, "fauxref.sqlite"), "--cwd", dir, "--faux", marker, "--model", "faux/faux-1"],
  { stdin: '{"type":"get_state"}\n' });
 record(fauxKept.exit === 0 && fauxKept.stdout.includes('"provider":"faux"'),
  "the refusal is narrow, not a ban: a `--faux` run may still name pi-ai's own plane, and get_state answers it",
  `exit=${fauxKept.exit} stdout=${JSON.stringify(fauxKept.stdout.trim())}`);
}

await main();

const failed = checks.filter((check) => !check.ok);
console.log(`modeldefault: ${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) process.exitCode = 1;
