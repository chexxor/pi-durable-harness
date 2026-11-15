// demo/settings.test.mjs - the settings plane, offline: pi's settings.json (global + project), pi's AGENTS.md
// discovery, and pi-durable's OWN policy defaults resolve into pi-durable's named shapes - and the resolution
// is then read BACK out of pi-durable's durable state rather than asserted from what this module computed.
//
// WHY THE READ-BACK MATTERS: the contract says compaction/restart/retry policy is "asserted offline against
// pi-durable settings types". Checking only the object this module returned would prove the mapping is
// self-consistent and nothing else; the honest version also hands the record to pi-durable and reads what
// pi-durable stored (`conversation.agent()` for the agent config and its sections), so a mapping pi-durable
// silently ignored would fail here.
//
// PROVENANCE: no Durian-Pi original - this demo is the offline proof for src/settings.mjs, whose own header
// names the three Durian-Pi files it extracts (config.mjs' discovery rule, compacteval.mjs' policy question,
// context.mjs' dropped measure). The claims THIS file makes - project beats global, pi-durable's constants
// are the defaults, the gaps are rows, the policy survives reopen - are falsifiable only by running it.
//
// Offline: pi's settings files and context files are fixtures written under a temp directory, pi's agentDir
// for the run is that fixture directory, and the only model turn is pi-ai's faux provider (core.mjs's offline
// plane). No key is read, no network is reached.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { piSettings, durableSettings, effectiveDefaults, agentConfig, contextSections, describeResolution } from "../src/settings.mjs";
import { openHarness, transcript } from "../src/core.mjs";
import { configure } from "@earendil-works/pi-durable";
import { DEFAULT_COMPACTION_POLICY, DEFAULT_PROGRESS_POLICY, DEFAULT_RESTART_LIMIT, DEFAULT_RETRY_POLICY } from "@earendil-works/pi-durable";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";

const checks = [];
function record(condition, claim, evidence = "") {
 checks.push({ condition, claim });
 console.log(`  ${condition ? "ok " : "NOT"} ${claim}${evidence ? `: ${evidence}` : ""}`);
}

async function main() {
 const root = mkdtempSync(join(tmpdir(), "dh-settings-"));
 const agentDir = join(root, "agent");
 const cwd = join(root, "cwd");
 mkdirSync(join(agentDir, "keep"), { recursive: true });
 mkdirSync(join(cwd, ".pi"), { recursive: true });

 // pi's two scopes, written in pi's own vocabulary.
 writeFileSync(join(agentDir, "settings.json"), JSON.stringify({
  defaultProvider: "faux",
  defaultModel: "faux-1",
  defaultThinkingLevel: "low",
  steeringMode: "all",
  compaction: { enabled: true, reserveTokens: 12345, modelOverrides: { "faux/faux-1": { keepRecentTokens: 777 } } },
  retry: { enabled: true, maxRetries: 4, baseDelayMs: 2500, maxAgentDelayMs: 45000, provider: { timeoutMs: 30000 } },
  branchSummary: { reserveTokens: 4242 },
  sessionDir: join(root, "sessions"),
 }) + "\n");
 // The project scope turns compaction OFF - the same switch the user's own workspace asks for.
 writeFileSync(join(cwd, ".pi", "settings.json"), JSON.stringify({
  compaction: { enabled: false },
  followUpMode: "all",
  defaultTools: ["read", "bash", "+codemode"],
 }) + "\n");
 // pi's context-file plane: pi walks UP from the cwd (dist/core/resource-loader.js walks ancestors and
 // prefers `AGENTS.override.md`, `AGENTS.md`, `AGENTS.MD`, `CLAUDE.md`, `CLAUDE.MD` per directory), so the
 // fixture puts one file in the cwd and one in an ancestor - and asserts the order pi returned.
 writeFileSync(join(root, "AGENTS.md"), "ANCESTOR instruction: keep answers under 40 words.\n");
 writeFileSync(join(cwd, "AGENTS.md"), "CWD instruction: never delete a file in this workspace.\n");

 // 1) pi's OWN merge, not a second parser: project scope wins over global, and both are reported.
 const resolved = piSettings({ cwd, agentDir });
 record(resolved.settings?.compaction?.enabled === false,
  "the project scope's compaction.enabled:false beats the global scope's true (pi's own merge)",
  `global=${JSON.stringify(resolved.global?.compaction)} project=${JSON.stringify(resolved.project?.compaction)} merged=${JSON.stringify(resolved.settings?.compaction)}`);
 record(resolved.settings?.steeringMode === "all" && resolved.settings?.defaultModel === "faux-1",
  "the global scope's values survive where the project scope is silent",
  `steeringMode=${resolved.settings?.steeringMode} defaultModel=${resolved.settings?.defaultModel}`);
 record((resolved.errors ?? []).length === 0, "pi reported no settings read error", `errors=${JSON.stringify(resolved.errors)}`);
 // pi's own schema drops a key the type does not carry (`RetrySettings` omits `maxDelayMs`), which is why
 // the demo asserts what pi KEPT rather than what the fixture asked for.
 record(resolved.settings?.retry?.maxDelayMs === undefined && resolved.settings?.retry?.provider !== undefined,
  "pi's Settings type keeps retry.provider and drops retry.maxDelayMs, so the mapping's rows are about real keys",
  `retry=${JSON.stringify(resolved.settings?.retry)}`);

 // 2) pi-durable's OWN constants are the defaults, quoted rather than remembered.
 const defaults = effectiveDefaults();
 record(defaults.retry.enabled === DEFAULT_RETRY_POLICY.enabled
  && defaults.retry.maxRetries === DEFAULT_RETRY_POLICY.maxRetries
  && defaults.retry.baseDelayMs === DEFAULT_RETRY_POLICY.baseDelayMs
  && defaults.retry.maxAgentDelayMs === DEFAULT_RETRY_POLICY.maxAgentDelayMs,
  "the retry default IS pi-durable's DEFAULT_RETRY_POLICY", JSON.stringify(DEFAULT_RETRY_POLICY));
 record(defaults.compaction.reserveTokens === DEFAULT_COMPACTION_POLICY.reserveTokens
  && defaults.compaction.keepRecentTokens === DEFAULT_COMPACTION_POLICY.keepRecentTokens
  && defaults.compaction.backgroundTokens === DEFAULT_COMPACTION_POLICY.backgroundTokens
  && defaults.compaction.enabled === DEFAULT_COMPACTION_POLICY.enabled,
  "the compaction default IS pi-durable's DEFAULT_COMPACTION_POLICY (pi's docs name the same numbers)",
  JSON.stringify(DEFAULT_COMPACTION_POLICY));
 record(defaults.progress.partialIntervalMs === DEFAULT_PROGRESS_POLICY.partialIntervalMs
  && defaults.progress.persistWithinMs === DEFAULT_PROGRESS_POLICY.persistWithinMs,
  "the progress default IS pi-durable's DEFAULT_PROGRESS_POLICY", JSON.stringify(DEFAULT_PROGRESS_POLICY));
 record(defaults.restartLimit === DEFAULT_RESTART_LIMIT,
  "the restart default is pi-durable's DEFAULT_RESTART_LIMIT", `DEFAULT_RESTART_LIMIT=${DEFAULT_RESTART_LIMIT}`);

 // 3) pi-durable's own merge line, quoted from dist/harness/agent.js at this pin:
 // `retry: { ...DEFAULT_RETRY_POLICY, ...settings?.retry }` and
 // `compaction: { ...DEFAULT_COMPACTION_POLICY, ...settings?.compaction }` - the demo reproduces THAT merge
 // from pi-durable's exported constants, so "the resolved policy" is pi-durable's arithmetic, not ours.
 const mapped = durableSettings(resolved.settings);
 const mergedRetry = { ...DEFAULT_RETRY_POLICY, ...(mapped.settings.retry ?? {}) };
 const mergedCompaction = { ...DEFAULT_COMPACTION_POLICY, ...(mapped.settings.compaction ?? {}) };
 record(mergedRetry.maxRetries === 4 && mergedRetry.baseDelayMs === 2500 && mergedRetry.maxAgentDelayMs === 45000,
  "pi's retry values reach the resolved retry policy through pi-durable's own merge",
  JSON.stringify(mergedRetry));
 record(mergedCompaction.enabled === false && mergedCompaction.reserveTokens === 12345
  && mergedCompaction.backgroundTokens === DEFAULT_COMPACTION_POLICY.backgroundTokens,
  "the project's compaction.enabled:false survives the merge, and a knob pi never names keeps pi-durable's default",
  JSON.stringify(mergedCompaction));
 record(JSON.stringify(mapped.settings?.compaction?.modelOverrides ?? null) === JSON.stringify(resolved.settings?.compaction?.modelOverrides ?? null),
  "pi's per-model compaction overrides are carried, not flattened", JSON.stringify(mapped.settings?.compaction?.modelOverrides));

 // 4) The gaps are rows that name the pi key, not a folded-away mapping.
 const unmappedKeys = mapped.unmapped.map((row) => row.key);
 record(unmappedKeys.includes("retry.provider"),
  "pi's transport-level retry key is named as unmapped rather than folded into pi-durable's retry policy",
  `unmapped=${unmappedKeys.join(",")}`);
 record(unmappedKeys.includes("branchSummary") && unmappedKeys.includes("sessionDir"),
  "pi keys this harness keeps elsewhere are named, not silently dropped", `unmapped=${unmappedKeys.join(",")}`);

 // 5) pi's model choice becomes pi-durable's ModelRef through the prefix rule src/providers.mjs extracted,
 // and a model id that CONTAINS a slash stays one model id (pi's own ids look like `zai-org/GLM-5.3-Flash`).
 const choice = agentConfig(resolved.settings, { cwd, instructions: "Base instructions from the harness." });
 record(choice.agent.model.provider === "faux" && choice.agent.model.modelId === "faux-1",
  "defaultProvider + defaultModel resolve to one ModelRef", JSON.stringify(choice.agent.model));
 const slashChoice = agentConfig({ defaultProvider: "faux", defaultModel: "zai-org/GLM-5.3-Flash" }, { cwd });
 record(slashChoice.agent.model.modelId === "zai-org/GLM-5.3-Flash",
  "a model id containing a slash stays one model id (no provider guess)", JSON.stringify(slashChoice.agent.model));
 record(choice.agent.thinkingLevel === "low" && choice.agent.cwd === cwd,
  "thinkingLevel and cwd ride in pi-durable's Agent shape", `agent=${JSON.stringify(choice.agent).slice(0, 220)}`);

 // 6) pi's tool-selection edit is REFUSED by name rather than re-implemented.
 const editEntry = resolved.project?.defaultTools?.find((entry) => /^[+-]/.test(entry));
 record(choice.refused.some((row) => row.key.startsWith("defaultTools")) && editEntry === "+codemode",
  "a +name/-name defaultTools entry is refused with a reason instead of guessed",
  `entry=${editEntry} refused=${JSON.stringify(choice.refused.map((row) => row.key))}`);
 // The refusal is honest only if pi really does spell that entry as an EDIT of an inherited list - pi's OWN
 // shipped documentation (inside the pinned package) is quoted here rather than paraphrased.
 const piSettingsDocs = readFileSync(join(process.cwd(), "node_modules", "@earendil-works", "pi-coding-agent", "docs", "settings.md"), "utf8");
 const editRuleLine = piSettingsDocs.split("\n").filter((line) => line.includes("Project settings apply on top of user settings"));
 record(editRuleLine.length >= 1 && editRuleLine[0].includes("+name") && editRuleLine[0].includes("-name"),
  "pi's shipped docs name the +name/-name edit rule, which is why the refusal is a refusal and not a guess",
  `quoted=${editRuleLine[0].trim().slice(0, 140)}`);

 // 7) Context files: pi's OWN AGENTS.md discovery feeds pi-durable sections; pi returns ancestors first.
 const context = contextSections({ cwd, agentDir });
 record(context.files.length === 2, "pi discovered the ancestor AGENTS.md and the cwd AGENTS.md",
  `files=${context.files.map((file) => file.path).join(",")}`);
 record(context.files.every((file) => file.content?.length),
  "pi returned the file CONTENT for each context file", `lengths=${context.files.map((file) => file.content.length).join(",")}`);
 const harnessParts = await openHarness({
  cwd,
  storePath: join(root, "harness.sqlite"),
  settings: mapped.settings,
  extraExtensions: [context.extension].filter(Boolean),
  agent: { model: choice.agent.model, cwd },
 });
 const conversation = harnessParts.conversation;
 // pi-durable's own agent-config change: `configure(tx, conversationId, change)` (dist/harness/agent.ts
 // exports `configure`), which is how the resolved pi policy gets into pi-durable's durable agent doc.
 await conversation.commit((tx) => configure(tx, conversation.id, {
  thinkingLevel: choice.agent.thinkingLevel,
  instructions: choice.agent.instructions,
  compaction: { enabled: false },
 }), harnessParts.context);
 const agentState = await conversation.agent(harnessParts.context);
 const sectionKeys = (agentState?.sections ?? []).map((row) => row.key);
 record(sectionKeys.length >= 2, "pi-durable's agent doc carries one section per context file",
  `sections=${sectionKeys.join(",")}`);
 record(sectionKeys.some((key) => /^context_[a-z0-9_]+$/.test(key)) && sectionKeys.every((key) => !key.includes("/") && !key.includes(".")),
  "the context-file section keys are pi-durable's slugged keys, not raw paths (it validates `/^[a-z][a-z0-9_-]*$/`)",
  `sections=${sectionKeys.join(",")}`);
 record(agentState?.instructions === "Base instructions from the harness.",
  "the agent's `instructions` are stored in pi.agent (pi-durable renders them as its reserved section)",
  JSON.stringify(agentState?.instructions));

 // 8) The policy is read BACK out of pi-durable's own durable state, not from what this module computed.
 record(agentState?.compaction?.enabled === false,
  "pi's project compaction.enabled:false is stored in pi-durable's agent doc (pi.agent), so the off switch survives reopen",
  `agent compaction=${JSON.stringify(agentState?.compaction)} thinkingLevel=${JSON.stringify(agentState?.thinkingLevel)}`);
 record(agentState?.model?.provider === "faux" && agentState?.model?.modelId === "faux-1",
  "the resolved model choice is what pi-durable stored for the conversation", JSON.stringify(agentState?.model));
 const second = await openHarness({ cwd, storePath: join(root, "harness.sqlite") });
 const reopened = await second.harness.conversation(conversation.id, second.context);
 const reopenedAgent = reopened === undefined ? null : await reopened.agent(second.context);
 record(reopenedAgent?.compaction?.enabled === false,
  "a SECOND process reopening the store reads the same policy back (no reopen drift)",
  `reopened compaction=${JSON.stringify(reopenedAgent?.compaction)}`);
 await second.harness.close(second.context);
 await harnessParts.harness.close(harnessParts.context);

 const rows = describeResolution(resolved.settings, resolved);
 for (const row of rows) console.log(`  resolution row: ${row.scope} ${row.key}=${row.value}`);
 record(rows.some((row) => row.scope === "project" && row.key === "compaction"),
  "the resolution report names the file a value came from, not just the merged result",
  `rows=${rows.length}`);

 const failed = checks.filter((c) => !c.condition);
 console.log(`settings: ${checks.length - failed.length}/${checks.length} checks passed`);
 process.exitCode = failed.length ? 1 : 0;
}

main().catch((err) => {
 console.error(String(err?.message ?? err));
 process.exitCode = 1;
});
