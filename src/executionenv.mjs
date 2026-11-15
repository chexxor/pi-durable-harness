// src/executionenv.mjs - the environment tools run in, and only tools run through it.
//
// PROVENANCE: extracted from ~/Git/Durian-Pi/src/seattools.mjs (`makeSeatEnv`, and the header's rule
// that tools and their environment "have to agree": a file tool without an environment has `api.env`
// undefined and every call fails in `requireEnv(api)`), read 2026-11-15 at pin v1.5.1. What changed:
// seats, seat roots, per-item worktrees, verifier/coordinator tool removals, the read-only command
// registry and confine.mjs's boundary policy are dropped - a single-agent harness has one cwd per
// conversation, not a roster of roots. The part kept is the discipline: the environment is built per
// call from the conversation's own cwd, and it is what confines the tools.
//
// WHY THE ENVIRONMENT IS A BUILDER AND NOT A VALUE: node_modules/@earendil-works/pi-durable/dist/
// harness/types.d.ts declares `env(ExecutionEnv | undefined)` inside the agent/api surface, and the
// Harness calls it for the conversation a task belongs to - so handing back one shared instance would
// pin every conversation to the first cwd. core.mjs's `openHarness` builds one per call for the same
// reason; this file is what it builds.

import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { cwd as processCwd } from "node:process";

/**
 * The environment for one conversation's cwd.
 *
 * `shellEnv` is passed only when a caller wants a narrower environment than the process's own (Durian-Pi
 * used this for a non-interactive git environment); omitting it means tools inherit the process
 * environment, which is pi-durable's own default, not ours.
 */
export function makeEnv(options = {}) {
	const { cwd = processCwd(), shellPath = null, shellEnv = null } = options;
	// @temp: `shellPath` and `shellEnv` are the only two knobs NodeExecutionEnv's constructor declares
	// @temp: (node_modules/@earendil-works/pi-durable/dist/env/node.d.ts: `{ cwd; shellPath?; shellEnv?;
	// @temp: watch? }`) - anything beyond them would be a confinement policy this harness has not been
	// @temp: given, and Durian-Pi's confine.mjs boundary is exactly that policy, which is dropped here.
	return new NodeExecutionEnv({
		// @temp: `cwd` is resolved by the caller (core.mjs resolves it once); NodeExecutionEnv keeps it as
		// @temp: given, and every path a tool takes is resolved against it by the environment's own
		// @temp: `absolutePath`/`canonicalPath` methods rather than by string arithmetic here.
		cwd,
		...(shellPath ? { shellPath } : {}),
		...(shellEnv ? { shellEnv } : {}),
	});
}

/**
 * What an environment exposes, as data a caller can assert against.
 *
 * The list is read from the pinned declaration (dist/env/node.d.ts), not from a memory of it, so a
 * harness that gains or loses a capability cannot keep claiming the old set.
 */
export function describeEnv(env) {
	return {
		id: env.id,
		// "Every local environment sees the same files." - quoted from node.d.ts:6, which is why `id`
		// is not a secret or a sandbox name: a NodeExecutionEnv is a cwd, not an isolation boundary.
		cwd: env.cwd,
		// @temp: the method names are the declared surface of ExecutionEnv as NodeExecutionEnv implements
		// @temp: it; kept as strings so a caller can compare a capability list without holding the object.
		// @temp: `watch` is listed because it is what makes a file change observable to a harness, and
		// @temp: src/watchapi.mjs (task-5) is the one place that uses it.
		// @temp: written out rather than derived with Object.keys() so the list is a claim about the
		// @temp: DECLARED surface (dist/env/node.d.ts at this pin), not about what a prototype walk happens
		// @temp: to find. Verified by hand against that file: every method below is in the declaration, and
		// @temp: the declaration's last five (createDir/remove/createTempDir/createTempFile/cleanup) are
		// @temp: included rather than dropped, because a capability list that stops short reads as a claim
		// @temp: that the environment cannot delete or make a temp file - which it can.
		capabilities: [
			"watch", "absolutePath", "joinPath", "exec",
			"openTextLineReader", "readTextFile", "readTextLines", "readBinaryFile", "openBinaryReader",
			"writeFile", "appendFile", "truncateFile", "flushFile", "renameFile", "fileInfo", "listDir",
			"openDirReader", "canonicalPath", "exists", "createDir", "remove", "createTempDir", "createTempFile",
			"cleanup",
		],
		// What it is NOT: an isolation boundary. Durian-Pi's seatguard.mjs header says exactly this of
		// its own guard - "a check on a command STRING is unsound by nature... so this narrows what is
		// already confined, while src/confine.mjs is the boundary. Both, not either." A single-agent
		// harness gets the OS user's permissions, and this file says so instead of pretending otherwise.
		isolation: "none: same uid, same filesystem; the cwd is a convention, not a wall",
	};
}
