// demo/cli-open.mjs - a CLI invocation over the ONE shared path, with one extra tool whose pi-durable
// replay policy is DECLARED instead of defaulted.
//
// PROVENANCE: same seam as src/cli-intent.mjs (~/Git/Durian-Pi/cli.mjs and intent.mjs, read 2026-11-15
// at pin v1.5.1). Why this file exists: `cli.mjs` is the surface users run, and it cannot carry a demo
// tool without inventing a flag pi does not have. This fixture is the same seam one notch closer to the
// harness - it resolves its argv through src/cli-intent.mjs' `parseFlags` and `intent`, then calls the
// SAME `harnessInvocation` cli.mjs calls, and installs the probe tool through core.mjs's own
// `extraExtensions` knob ("Extensions a caller installs after the defaults: the same name replaces").
// Everything that decides the answer - the store, the verbs, the recovery, the replay rule - is that one
// path, not a copy here.
//
// Fixture-only flags: `--probe <unsafe|safe>` (which policy the demo tests), `--marker <path>` (where
// that tool's side effect lands), `--cwd <dir>` (a fixture runs in a directory of its own). parseFlags
// records them and `intent()` ignores them, so a fixture cannot smuggle a harness knob through a flag
// the real CLI does not have.
//
// The tool and its field, quoted from the pinned dist rather than remembered:
//   node_modules/@earendil-works/pi-durable/dist/harness/types.d.ts, inside ToolRegistration:
//     /** Whether an interrupted execution may rerun on recovery. Default `unsafe`. */
//     readonly replay?: "safe" | "unsafe";
// and the rule that reads it, from dist/harness/tool.d.ts and pi-durable's README:
//     "Durable intent: the final arguments and the replay policy recorded before execution." (ToolTaskCheckpoint
//      phase "execute" carries { arguments, replay })
//     "the tool reruns on reopen only when it is declared `replay: \"safe\"`; otherwise the model gets
//      an `interrupted` error result with the output committed so far."
// Declaring both values in one extension is what lets the demo show the FIELD decides, instead of
// asserting a rule the reader cannot otherwise see. The tool appends one line per EXECUTION, so a
// replay is countable from outside the process, and it then sits inside its phase, which is what makes
// a process die in the middle of a call (pi-durable's README: "There is no sleep in the middle of a
// phase: a phase reruns from its top after a restart").

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { defineExtension, defineTool } from "@earendil-works/pi-durable";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { agentEvent, finalAnswerText, harnessInvocation, parseFlags, settleInvocation } from "../src/cli-intent.mjs";
import { scriptTurn, transcript } from "../src/core.mjs";

/** How long one execution stays inside its phase, so a parent can kill the process in the middle of it.
 * Long enough that the marker line (appended first) is already visible, short enough that the safe
 * contrast - which DOES rerun on reopen - still finishes inside the demo's budget. */
const sleepMs = 4000;

function probeExtension() {
 const tool = (name, replay) => defineTool({
	 name,
	 description: "Append one marker line for this EXECUTION, then stay inside the call.",
	 // No path from the model: the marker path is a constant, so this tool needs no path guard.
	 parameters: { type: "object", properties: {}, required: [] },
	 // pi-durable's field, quoted above: this is the whole point of the fixture.
	 replay,
	 async execute(args, api, context) {
		// The environment is the tools' only route to files (src/executionenv.mjs's rule), so a tool
		// that cannot name one fails loudly rather than reaching process fs behind its back.
		// @temp: env.appendFile takes (path, content, context) and answers chord's Result { ok, error? }.
		// @temp: the append happens BEFORE the wait, so the effect a dead process performed is on disk
		// @temp: and countable before the process can be killed.
		// @temp: process.pid names the execution, so two executions are two distinguishable lines.
		if (!api?.env) throw new Error("the probe tool needs the conversation's execution environment");
	 const path = process.env.PI_DEMO_MARKER;
	 const appended = await api.env.appendFile(path, `ran pid=${process.pid}\n`, context);
	 if (!appended?.ok) throw new Error(`the probe tool could not write ${path}: ${appended?.error}`);
	 await new Promise((r) => setTimeout(r, sleepMs));
	 return { content: [{ type: "text", text: "the probe call finished its phase" }] };
	 },
 });
 return defineExtension({ name: "cli-probe", tools: [tool("probe_unsafe", "unsafe"), tool("probe_safe", "safe")] });
}

async function main() {
 const flags = parseFlags(process.argv.slice(2), { fixture: ["probe", "marker", "cwd"] });
 const cwd = flags.cwd ?? process.cwd();
 const marker = flags.marker ?? join(cwd, "cli-marker.txt");
 // The tool reads its marker path from the environment rather than from the model's arguments, so a
 // model cannot steer where the side effect lands.
 process.env.PI_DEMO_MARKER = marker;
 const parts = await harnessInvocation({ ...flags, cwd }, { extraExtensions: [probeExtension()] });
 const policy = flags.probe ?? "unsafe";
 const prompt = flags.messages.join(" ").trim();

	// pi's own verbs, resolved by the shared path: words are an input, `-c`/`--continue` without words is
	// "continue this directory's root conversation", and `--session <id>` reopens one named conversation.
	// A continue with no words submits NOTHING, which is the only honest way to watch a reopen: an input
	// here would start a NEW run, and a tool call in that new run is a call the model chose to make again,
	// not a replay of the call the dead process left.
 let submitted = null;
 if (prompt) submitted = await parts.conversation.submit({ type: "input", content: prompt, requestId: `cli-open-${policy}` }, parts.context);
 if (submitted) parts.settlements.push(submitted.id);

	// The faux plane is core.mjs's (pi-ai's faux provider: no key, no network), and every process arms its
	// own replies. The script follows what the reopened run is DOING, not what the fixture wants:
	//   - a fresh run asks the model to call the probe, then answer after the tool round;
	//   - a reopen resumes the run that was waiting on the interrupted call, so its next request is
	//     answered straight away. Asking the model for another tool call here would be a second call the
	//     model made, and the demo could not tell a replay from that.
 const resuming = !prompt;
 if (parts.faux) scriptTurn(parts.faux, resuming ? ["the interrupted run answered after reopen"] : [{ tool: `probe_${policy}` }, "the probe call ended, answering now"]);

 const report = {
	 invocation: policy,
	 mode: parts.intent.mode,
	 verb: parts.intent.verb,
	 reopened: parts.reopened,
	 priorLines: parts.priorLines,
	 conversationId: parts.conversation.id,
	 submissionId: submitted?.id,
	 requestSent: Boolean(submitted),
 };
 // A print run waits for the answer; a run that is about to be killed waits too, which is what keeps it
// inside the tool call until the parent kills it.
 await settleInvocation(parts, BACKGROUND_CONTEXT);
 const entries = await transcript(parts.conversation, parts.context, 100);
 report.markerLines = existsSync(marker) ? readFileSync(marker, "utf8").split("\n").filter((l) => l.trim()).length : 0;
 // The tool results as pi-durable settled them: `data.diagnostics` carries the code, so the recovery
 // answer is read off committed state rather than from anything this fixture noticed.
 report.toolResults = entries
	 .filter((e) => e.kind === "pi.tool-result")
	 .map((e) => ({ id: e.id, codes: (e.data?.diagnostics ?? []).map((d) => `${d.code}:${d.severity}`) }));
 report.answer = finalAnswerText(entries);
 report.events = entries.map(agentEvent).map(({ type, kind, id }) => ({ type, kind, id }));
 console.log(JSON.stringify(report));
 await parts.harness.close(parts.context);
}

main().catch((err) => {
 console.error(String(err?.message ?? err));
 process.exitCode = 1;
});
