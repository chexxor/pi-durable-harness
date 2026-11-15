// src/core.mjs - the harness spine: one durable Session, one root conversation, one registry.
//
// PROVENANCE: extracted from ~/Git/Durian-Pi/src/tui/durable/adapter.mjs (`createDurableTuiRuntime`,
// `installDefaultTools`) and ~/Git/Durian-Pi/src/tui/durable/boot.mjs (`bootDurableTui`), read 2026-11-14
// at pin v1.5.1. What changed and why:
//   - the coding-agent host (ModelRuntime / SettingsManager / SessionManager / createAgentSession) is
//     dropped: pi-durable's Harness is the conversation, so a second session layer would be a second
//     source of truth for the same transcript;
//   - the TUI view plumbing (`attachConversationView`, `DurableSessionCore`, the Proxy) belongs to the
//     TUI module (task-6), not the core;
//   - every seat/broker/worktree concept is dropped outright - this harness is single-agent;
//   - `options.tools !== false` became `tools` so a caller can also turn the shell off independently.
// Every symbol used here was verified against the pinned dist .d.ts of @earendil-works 1.5.1
// (see `node scripts/sync-pi.mjs --report`); nothing is invented.
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels, fauxProvider, fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import * as durable from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { CodingTools, createBashTool } from "@earendil-works/pi-durable/tools";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Durian-Pi's adapter installed exactly this list; the codemode extension is opt-in here because
// codemode needs the sandbox package and a worker budget, and a demo that does not use it should
// not pay for it.
export function defaultToolExtensions({ bash = true, codemode = false } = {}) {
	const extensions = [CodingTools];
	// A separate extension for the shell so a caller can deny bash without losing read/write/edit.
	// `registry.install` replaces by name, so an extension name is an identity, not a label.
	if (bash) extensions.push(durable.defineExtension({ name: "shell", tools: [createBashTool()] }));
	if (codemode) {
		// Lazy: @earendil-works/pi-codemode is a heavier dependency, and it is only needed when asked.
		// @temp: kept as a dynamic import so a harness opened without codemode never loads it.
		return extensions;
	}
	return extensions;
}

/**
 * Open the harness. `storePath` is the ONE storage opener: when it is absent the caller gets an
 * in-memory Session, and `backend` says which one it got, so a demo can never silently test the
 * wrong plane.
 */
export async function openHarness(options = {}) {
	const { cwd = process.cwd(), storePath = null, settings, agent, registry = null, tools = true } = options;
	const context = options.context ?? BACKGROUND_CONTEXT;

	const storage = storePath ? await openNodeSqliteStorage(resolve(storePath)) : new durable.MemoryStorage();
	// The registry is the toolset, and it is shared: the core installs the coding tools into it, and
	// the package loader (task-8) installs discovered pi extensions into the same one.
	const reg = registry ?? durable.createRegistry();
	if (tools) for (const extension of defaultToolExtensions(options.toolOptions ?? {})) reg.install(extension);

	// Tools reach files and processes only through this environment, built per call from the
	// conversation agent's cwd - the Harness calls it, we do not hold an env.
	const env = (target) => new NodeExecutionEnv({ cwd: target.cwd ?? cwd });

	// The offline model plane: pi-ai's faux provider, no credentials, no network, scripted replies.
	// It is armed only when the caller handed in no real `models`, so a run can never claim that a
	// real provider answered.
	const faux = options.models ? null : fauxProvider({ models: [{ id: "faux-1" }] });
	const models = options.models ?? createModels();
	if (faux) models.setProvider(faux.provider);

	const harness = await durable.Harness.open(
		storage,
		{ models, registry: reg, env, ...(settings === undefined ? {} : { settings }) },
		context,
	);

	// The root conversation is the only conversation this harness opens for a user; `root()` creates
	// it in one commit and carries the agent config (model + cwd), which is the harness's own state.
	const conversation = await harness.root(context, {
		agent: { model: agent?.model ?? { provider: "faux", modelId: "faux-1" }, cwd, ...(agent?.instructions ? { instructions: agent.instructions } : {}) },
	});

	return { storage, registry: reg, harness, conversation, models, faux, env, cwd, context, backend: storePath ? "node-sqlite" : "memory" };
}

/**
 * Script one offline turn. pi-ai's StopReason is "stop" | "length" | "toolUse" | "error" | "aborted"
 * | "deferred", and pi-durable's generation task starts a tool round only on `toolUse` with at least
 * one toolCall block - a wrong stop reason is not an error, it is a turn that quietly answers instead
 * of running the tool, so the two shapes are spelled out here rather than left to the caller.
 */
export function scriptTurn(faux, steps) {
	if (!faux) throw new Error("scriptTurn needs the offline faux plane; a real provider was configured");
	faux.setResponses(steps.map((step) => {
		if (typeof step === "string") return fauxAssistantMessage(step, { stopReason: "stop" });
		if (step.tool) return fauxAssistantMessage([fauxToolCall(step.tool, step.args ?? {})], { stopReason: "toolUse" });
		return step;
	}));
}

/** Submit user input and (by default) wait for the run to settle. */
export async function prompt(conversation, text, context = BACKGROUND_CONTEXT, options = {}) {
	const submission = await conversation.submit({ type: "input", content: text, ...(options.whenBusy ? { whenBusy: options.whenBusy } : {}) }, context);
	if (options.waitForIdle !== false) await conversation.waitForIdle(context);
	return submission;
}

/** Committed entries of the root conversation, oldest first. */
export async function transcript(conversation, context = BACKGROUND_CONTEXT, limit = 100) {
	const page = await conversation.entries({ conversationId: conversation.id }, limit, undefined, context);
	return page.items;
}

/** Fresh temp cwd for demos so a run never touches the project tree. */
export function scratchCwd(prefix = "dh-cwd-") {
	return mkdtempSync(join(tmpdir(), prefix));
}
