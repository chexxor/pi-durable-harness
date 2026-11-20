// src/settings.mjs - pi's settings.json, pi's context files, and the AGENT CONFIG all resolve into the
// shapes pi-durable names for them; nothing here stores any of it.
//
// PROVENANCE: three Durian-Pi files, read 2026-11-15 at pin v1.5.1.
//   - ~/Git/Durian-Pi/src/config.mjs ("environment variables win, then a JSON config file, then built-in
//     defaults. One vocabulary ... so operators never have to learn a second spelling") - the DISCOVERY
//     RULE is what is kept: a config that resolves differently from what the tool then acts on is the bug
//     Durian-Pi recorded there ("the rig looked broken when it was simply pointed at a different database"),
//     and this module answers that by resolving through pi's OWN SettingsManager rather than by reading
//     settings.json a second time in a second vocabulary;
//   - ~/Git/Durian-Pi/src/compacteval.mjs - its policy work is dropped (that file replays a store through
//     an eval-level model context to grade compaction quality, which needs a live endpoint and a judge);
//     what survives here is the question it asks of POLICY: which knobs are on for which model;
//   - ~/Git/Durian-Pi/src/context.mjs - the context-consumption MEASURE (usage fields summed against a
//     named denominator) is dropped from this file: pi-durable keeps its own spend/usage plane
//     (`harness.usage`), and re-deriving consumption here would be harness-owned state.
//   - the multi-seat half of every one of them (per-seat config, per-seat context, per-seat model choice)
//     is dropped outright - this harness is single-agent.
//
// WHY pi's OWN resolver is called rather than a parser of the same file: pi's settings.json merges global
// and project scopes, keeps resource lists combined, and validates values; a second parser here would be
// a second vocabulary for one file, which is the drift Durian-Pi's config comment names. What this module
// adds is only the MAPPING onto pi-durable's names, and the pi keys that have no pi-durable counterpart
// are returned as rows, not folded away (the same discipline as docs/world/reference/package-support.md).
//
// Symbols checked against the pinned dist of @earendil-works 1.5.1, not assumed:
//   - pi-coding-agent dist/core/settings-manager.d.ts: `class SettingsManager { static create(cwd, agentDir?,
//     options?) }`, `getSettings(): Settings`, `getGlobalSettings()`, `getProjectSettings()`, `drainErrors()`;
//   - pi-coding-agent dist/core/settings-schema.d.ts: `interface CompactionSettings { enabled?, reserveTokens?,
//     keepRecentTokens?, modelOverrides? }`, `interface RetrySettings { enabled?, maxRetries?, baseDelayMs?,
//     maxAgentDelayMs?, provider?, maxDelayMs }`, `Settings.steeringMode / followUpMode`, `defaultTools`,
//     `defaultProvider / defaultModel / defaultThinkingLevel / modelThinkingLevels`, `sessionDir`;
//   - pi-durable dist/harness/types.d.ts: `HarnessSettings { extensions?, stream?, retry?: Partial<ConversationRetryPolicy>,
//     compaction?: CompactionSettings, progress?: Partial<ProgressPolicy>, steeringMode?, followUpMode?, contextRetentionMs?,
//     documentRetentionMs?, afterFailedRun?, restartLimit? }`, `ConversationRetryPolicy { enabled, maxRetries, baseDelayMs,
//     maxAgentDelayMs? }`, `CompactionPolicy { enabled, reserveTokens, keepRecentTokens, backgroundTokens }`;
//   - pi-durable dist/index.d.ts: DEFAULT_RETRY_POLICY, DEFAULT_COMPACTION_POLICY, DEFAULT_PROGRESS_POLICY,
//     DEFAULT_RESTART_LIMIT (exported, so "the built-in default" is pi-durable's own number, never a copy);
//   - pi-durable dist/harness/types.d.ts `Agent { model?, thinkingLevel?, extensions?, tools?, modelTools?,
//     instructions?, cwd?, maxTurns?, compaction? }`, whose `instructions` pi-durable renders as the reserved
//     section key `instructions` (dist/harness/agent.js `export const INSTRUCTIONS_KEY = "instructions"`).
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { SettingsManager, getAgentDir, loadProjectContextFiles } from "@earendil-works/pi-coding-agent";
import { DEFAULT_COMPACTION_POLICY, DEFAULT_PROGRESS_POLICY, DEFAULT_RESTART_LIMIT, DEFAULT_RETRY_POLICY } from "@earendil-works/pi-durable";
import { contextFileExtension } from "./packages/adapter.mjs";
import { resolveModelRef } from "./providers.mjs";

// pi's own key names, as the pinned schema spells them, grouped by what pi-durable does with them. A key
// listed here and not mapped is a refusal the docs can show, not a silently ignored file entry.
const PI_POLICY_KEYS = ["compaction", "retry", "steeringMode", "followUpMode"];
const PI_AGENT_KEYS = ["defaultProvider", "defaultModel", "defaultThinkingLevel", "modelThinkingLevels", "defaultTools", "enabledModels"];
const PI_OTHER_KEYS = ["sessionDir", "branchSummary", "cacheWarming", "terminal", "images", "markdown", "thinkingBudgets", "transport", "tuiMode", "warning", "quietStartup", "fullscreenExitOutput", "mermaid", "packageSource", "defaultProjectTrust", "sessionShareDestination"];

/** pi's effective settings for one cwd: global (`<agentDir>/settings.json`) plus project (`.pi/settings.json`),
 * project winning, resource lists combined - pi's OWN merge, since two merge rules on one file is the drift
 * this module exists to avoid. `errors` is pi's own report of a scope it could not read. */
export function piSettings({ cwd = process.cwd(), agentDir = getAgentDir(), trusted = true } = {}) {
 const manager = SettingsManager.create(cwd, agentDir, { projectTrusted: trusted });
 return {
 settings: manager.getSettings(),
 global: manager.getGlobalSettings(),
 project: manager.getProjectSettings(),
 errors: manager.drainErrors(),
 // The path pair is what lets a demo prove WHICH file a value came from, instead of asserting a merge.
 paths: { agentDir, project: join(cwd, ".pi", "settings.json") },
 };
}

/**
 * The same policy under pi-durable's names. Only keys both sides spell are carried; `unmapped` names the
 * rest, with the reason, so `docs/world/reference/package-support.md` can print them and a reader can see a missing knob
 * rather than trust a mapping.
 *
 * pi's `retry` carries a `provider` sub-object and a `maxDelayMs` that pi-durable's `ConversationRetryPolicy`
 * has no field for - pi-durable's retry is about MODEL attempts (its DEFAULT_RETRY_POLICY: maxRetries 3,
 * baseDelayMs 2000, maxAgentDelayMs 60000), and transport-level provider retry is a different question.
 * pi-durable's side of the gap: `backgroundTokens`, `progress`, `restartLimit`, `contextRetentionMs`,
 * `documentRetentionMs`, `afterFailedRun`, `toolExecution` - pi's settings.json has no key for any of them.
 */
export function durableSettings(settings = {}) {
 const picked = (source, keys) => Object.fromEntries(keys.filter((k) => source?.[k] !== undefined).map((k) => [k, source[k]]));
 const unmapped = [];
 const retry = picked(settings?.retry, ["enabled", "maxRetries", "baseDelayMs", "maxAgentDelayMs"]);
 for (const key of ["provider", "maxDelayMs"]) {
 if (settings?.retry?.[key] !== undefined) unmapped.push({ key: `retry.${key}`, reason: "pi-durable's retry policy is about model attempts (ConversationRetryPolicy); provider transport retry has no field there" });
 }
 const compaction = picked(settings?.compaction, ["enabled", "reserveTokens", "keepRecentTokens", "modelOverrides"]);
 for (const key of Object.keys(settings?.compaction ?? {})) {
 if (!["enabled", "reserveTokens", "keepRecentTokens", "modelOverrides"].includes(key)) unmapped.push({ key: `compaction.${key}`, reason: "no field in pi-durable's CompactionSettings at this pin" });
 }
 const mapped = {
 ...(Object.keys(retry).length ? { retry } : {}),
 ...(Object.keys(compaction).length ? { compaction } : {}),
 ...(settings?.steeringMode ? { steeringMode: settings.steeringMode } : {}),
 ...(settings?.followUpMode ? { followUpMode: settings.followUpMode } : {}),
 };
 for (const key of PI_POLICY_KEYS) {
 if (settings?.[key] !== undefined && !Object.keys(mapped).includes(key)) unmapped.push({ key, reason: "no pi-durable counterpart at this pin" });
 }
 for (const key of PI_OTHER_KEYS) {
 if (settings?.[key] !== undefined) unmapped.push({ key, reason: "pi's display/session concern; this harness keeps its own surface for it (store path is core.mjs's --store, TUI is src/tui/)" });
 }
 return { settings: mapped, unmapped };
}

/** What pi-durable's built-in default WOULD be for the settings this mapping produced, stated with pi-durable's
 * OWN exported constants. A demo asserts the resolved policy against these, so "default" is pi-durable's number
 * rather than a remembered one. */
export function effectiveDefaults() {
 return {
 retry: { ...DEFAULT_RETRY_POLICY },
 compaction: { ...DEFAULT_COMPACTION_POLICY },
 progress: { ...DEFAULT_PROGRESS_POLICY },
 restartLimit: DEFAULT_RESTART_LIMIT,
 };
}

/**
 * The AGENT CONFIG: pi's model choice, thinking level, tool selection, and context files, in pi-durable's
 * `Agent` shape. `ref` follows the prefix rule src/providers.mjs extracted (a `provider/model` spelling, or a
 * bare model id against `defaultProvider`), so a settings file that names `deepinfra llama-3.1-8b` and a CLI
 * that types `deepinfra/llama-3.1-8b` resolve to the same ModelRef rather than to two guesses.
 */
export function agentConfig(settings = {}, { cwd = process.cwd(), instructions = null, models = null } = {}) {
 const provider = settings?.defaultProvider ?? null;
 const modelId = settings?.defaultModel ?? null;
 const thinkingLevels = settings?.modelThinkingLevels ?? {};
 const level = settings?.defaultThinkingLevel ?? null;
 const out = {
 // pi's defaultProvider/defaultModel become pi-durable's `ModelRef` through src/providers.mjs' prefix
 // rule, which needs a registry to know whether a leading segment IS a provider; with no registry the
 // spelling is kept as one model id under the default provider rather than guessed at.
 ...(provider || modelId ? { model: models ? resolveModelRef(models, [provider, modelId].filter(Boolean).join("/")) : { provider: provider ?? "faux", modelId: modelId ?? "faux-1" } } : {}),
 ...(level ? { thinkingLevel: level } : {}),
 // pi's `defaultTools` plain names are pi-durable's `Agent.tools` array; a list of only `+name`/`-name`
 // entries edits the inherited selection instead, which pi's own `applyToolModifiers` answers and this
 // harness does not re-implement - so those entries are refused here by name rather than guessed at.
 ...(Array.isArray(settings?.defaultTools) && settings.defaultTools.every((entry) => !/^[+-]/.test(entry)) ? { tools: settings.defaultTools } : {}),
 ...(instructions ? { instructions } : {}),
 cwd,
 };
 const refused = [];
 if (Array.isArray(settings?.defaultTools) && settings.defaultTools.some((entry) => /^[+-]/.test(entry))) {
 refused.push({ key: "defaultTools (+name/-name entries)", reason: "pi edits the inherited selection with its own applyToolModifiers; this harness names the offered set instead (Agent.tools)" });
 }
 if (settings?.defaultThinkingLevel === undefined && Object.keys(thinkingLevels).length) {
 refused.push({ key: "modelThinkingLevels without defaultThinkingLevel", reason: "pi-durable's Agent carries ONE thinkingLevel for the conversation; per-model levels would be a second resolution here" });
 }
 return { agent: out, refused };
}

/** The context files for one cwd, as pi-durable sections: pi's OWN AGENTS.md-style discovery (`loadProjectContextFiles`),
 * then the adapter's section keys (pi-durable validates a section key as `/^[a-z][a-z0-9_-]*$/`, which is why a
 * path is slugged rather than used as a key). */
export function contextSections({ cwd = process.cwd(), agentDir = getAgentDir() } = {}) {
 const files = loadProjectContextFiles({ cwd, agentDir });
 return { files, extension: contextFileExtension(files, cwd) };
}

/** One human-readable line per resolved knob, for docs and for a demo's evidence block. */
export function describeResolution(settings = {}, resolved = {}) {
 const rows = [];
 for (const [scope, source] of [["global", resolved?.global], ["project", resolved?.project]]) {
 for (const key of PI_POLICY_KEYS) {
 if (source?.[key] !== undefined) rows.push({ scope, key, value: JSON.stringify(source[key]) });
 }
 }
 for (const [key, value] of Object.entries(resolved?.settings ?? {})) {
 rows.push({ scope: "resolved", key, value: JSON.stringify(value) });
 }
 return rows;
}
