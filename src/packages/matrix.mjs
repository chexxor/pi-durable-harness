// src/packages/matrix.mjs - the pi-capability matrix: pi's capability surface, pi-durable's surface,
// and a named row for every capability that did not map.
//
// PROVENANCE of the NAMES: pi's capability surface, read at this pin from
// node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts - the `ExtensionAPI.on
// (...)` overloads give the event names, and the `Extension` interface gives the registration kinds
// (tools / commands / flags / shortcuts / messageRenderers / entryRenderers / toolRenderers /
// markdownTransformer). pi-durable's surface was read from dist/harness/types.d.ts (`Extension` =
// {name, tools, sections, hooks, wraps, tasks}) and dist/harness/define.d.ts (`defineExtension`,
// `defineTool`, `section`, `hook`, `wrapTool`, `wrapSection`). Durian-Pi has no equivalent file: its
// seats ran the `pi` CLI, so pi's capability surface belonged to pi's own process and was never
// enumerated.
//
// THE THREE STATUSES, defined here because the whole contract is about which of the three a row may
// claim: `native` means pi-durable has the concept and the harness uses pi-durable's own, so no shim is
// involved and the evidence is the demo of that concept. `shimmed` means src/packages/adapter.mjs
// translates pi's shape onto pi-durable's and a demo exercises the result. `unsupported` means no
// pi-durable counterpart exists AT THIS PIN, and the `reason` names what pi-durable lacks - a reason,
// not a restatement, so the row is falsifiable if a later pin gains the concept.
//
// WHY THIS IS DATA AND NOT PROSE: `unmappedRuntime()` compares what the extensions that actually loaded
// on THIS machine registered against this list. A prose matrix cannot be compared to anything, and the
// failure this file prevents is the one where pi gains a capability and the docs keep claiming support.
// `names` is the set of pi-side names one row covers: pi's own names are what the runtime inventory
// carries (one per event a loaded extension registers), so matching is by pi's name and not by prose.
export const CAPABILITY_ROWS = [
 // ---- what a loaded pi Extension registers ----
 { capability: "tool", names: ["registerTool"], status: "shimmed",
 reason: "pi's ToolDefinition is rebuilt as a pi-durable ToolRegistration: pi's execute(callId, args, signal, onUpdate, ctx) becomes pi-durable's execute(args, api, context), and pi's AgentToolResult {content, details, structuredContent} becomes pi-durable's ToolExecutionResult {content, details, structuredOutput}",
 evidence: "demo/packages.test.mjs" },
 { capability: "tool argument repair", names: ["prepareArguments"], status: "shimmed",
 reason: "both sides have the same slot - a pure pre-validation repair - so pi's function is installed unchanged and pi-durable runs it before validation",
 evidence: "demo/packages.test.mjs" },
 { capability: "command", names: ["registerCommand", "commands"], status: "unsupported",
 reason: "pi-durable's registry has no command plane: commands are a UI verb in pi (a name the user types), while pi-durable's registry offers tools and tasks to a model",
 evidence: null },
 { capability: "keyboard shortcut", names: ["registerShortcut", "shortcuts"], status: "unsupported",
 reason: "pi-durable has no keybinding surface at all; the harness's TUI owns its own keybindings and does not consume pi's",
 evidence: null },
 { capability: "cli flag", names: ["registerFlag", "flags"], status: "unsupported",
 reason: "pi-durable has no flag plane; the harness's CLI parses its own flags, and mapping pi's onto them would change what the harness's CLI means",
 evidence: null },
 { capability: "message renderer", names: ["messageRenderers", "registerMessageRenderer"], status: "unsupported",
 reason: "pi-durable commits entries and never draws them: a renderer belongs to pi's AgentSession output pipeline, which this harness replaces with its own TUI/print views",
 evidence: null },
 { capability: "tool renderer", names: ["toolRenderers", "registerToolRenderer"], status: "unsupported",
 reason: "same as the message renderer: pi-durable's tool result is data, and the harness's view of it is its own",
 evidence: null },
 { capability: "entry renderer", names: ["entryRenderers"], status: "unsupported",
 reason: "same as the message renderer: pi-durable's transcript entries have no render hook",
 evidence: null },
 { capability: "markdown transformer", names: ["markdownTransformer"], status: "unsupported",
 reason: "pi-durable has no markdown pipeline: it commits entries, and the harness renders them; a transformer over pi's rendering has nothing to transform",
 evidence: null },
 // ---- event handlers pi fires, and where pi-durable has a hook ----
 { capability: "event handler", names: ["tool_call"], status: "shimmed",
 reason: "pi's tool_call handler chain runs as a pi-durable beforeTool hook: pi's event.input copy is handed to the handlers and an in-place patch becomes pi-durable's {arguments} replacement, while pi's {block, reason} becomes pi-durable's {block}",
 evidence: "demo/packages.test.mjs" },
 { capability: "event handler", names: ["tool_result", "tool_execution_end"], status: "shimmed",
 reason: "pi fires both names for one call's end and pi-durable has one afterTool hook, so the bridge composes both pi chains onto it rather than letting one replace the other",
 evidence: "demo/packages.test.mjs" },
 { capability: "event handler", names: ["before_provider_request"], status: "shimmed",
 reason: "pi's handler returns the replacement request payload and pi-durable's beforeProviderRequest hook accepts the same shape, so the payload is forwarded in both directions",
 evidence: "demo/settings.test.mjs" },
 { capability: "event handler", names: ["after_provider_response"], status: "shimmed",
 reason: "pi's handler sees pi-ai's AssistantMessage and pi-durable's afterResponse hook hands the same object, so the bridge is a call forwarding with no shape change",
 evidence: "demo/settings.test.mjs" },
 { capability: "event handler", names: ["session_before_compact"], status: "shimmed",
 reason: "pi's {cancel} | {compaction} result is narrowed to pi-durable's {decline: true} | {summary}: a pi extension that returns a richer CompactionResult loses the parts pi-durable's compaction task does not take",
 evidence: "demo/settings.test.mjs" },
 // ---- event handlers pi fires that pi-durable has no hook for ----
 { capability: "event handler", names: ["session_start", "session_shutdown"], status: "unsupported",
 reason: "pi-durable's hooks belong to tasks inside a run; a session has no task whose hook fires at session boundaries, and the Session's own lifecycle (open/close) is a transport event, not a hook",
 evidence: null },
 { capability: "event handler", names: ["session_tree", "session_before_tree"], status: "unsupported",
 reason: "pi's session TREE (switching/forking a branch and summarizing it) has no pi-durable counterpart at this pin: conversations have parents, but no task edits a branch in place",
 evidence: null },
 { capability: "event handler", names: ["session_compact", "session_compact_failed"], status: "unsupported",
 reason: "pi-durable's compaction hooks fire only BEFORE summarizing (beforeCompact); there is no post-compaction or compaction-failure hook to attach to",
 evidence: null },
 { capability: "event handler", names: ["turn_start", "turn_end"], status: "unsupported",
 reason: "pi's turn is one model round including its tools; pi-durable's nearest hooks are afterTools (the tool round only) and afterRun (a whole run), and neither is a turn boundary",
 evidence: null },
 { capability: "event handler", names: ["message_start", "message_update", "message_end"], status: "unsupported",
 reason: "pi fires per streamed assistant message; pi-durable's afterResponse hook sees a COMPLETED provider message, and its streaming surface is ConversationStream, which is not a hook and cannot mutate what pi's handlers return",
 evidence: null },
 { capability: "event handler", names: ["agent_start", "before_agent_start", "agent_end", "agent_settled", "agent_before_settle"], status: "unsupported",
 reason: "pi's agent lifecycle belongs to pi's AgentSession loop; pi-durable's run boundaries are afterRun and afterTools, and no hook fires when a whole agent starts or settles",
 evidence: null },
 { capability: "event handler", names: ["input"], status: "unsupported",
 reason: "user input enters pi-durable as a Submission admitted exactly once by requestId on the Session line; a hook that observed input before admission would sit off that line and break exactly-once",
 evidence: null },
 { capability: "event handler", names: ["context", "context_with_system"], status: "unsupported",
 reason: "pi's context events let an extension edit what the model sees; pi-durable's context is a task's input selection (a ContextView) and the agent's sections, neither of which an event handler can rewrite",
 evidence: null },
 { capability: "event handler", names: ["model_select"], status: "unsupported",
 reason: "the model is a conversation's AgentState choice resolved against the registry; there is no selection event an extension can intercept",
 evidence: null },
 { capability: "event handler result", names: ["stopAfterBlock"], status: "unsupported",
 reason: "a pi tool_call handler can ask the agent to stop after a blocked call; pi-durable's beforeTool hook can block, and the nearest thing is a tool's own terminate control, which is a different contract",
 evidence: null },
 { capability: "event handler", names: ["pi-listed-only"], status: "unsupported",
 reason: "pi also fires project_trust, resources_discover, mcp_servers_change, cache_warming_decision, provider_stream_event and before_provider_headers; none of those planes exists in this harness (no MCP loader, no pi CLI resource plane, no cache warmer), so there is nothing to fire and nothing to catch",
 evidence: null },
 // ---- the resource kinds a pi package carries ----
 { capability: "skill", names: ["skills"], status: "shimmed",
 reason: "pi's own formatSkillsForPrompt output is installed as one pi-durable system-prompt section, so the model sees pi's exact skill list format",
 evidence: "demo/packages.test.mjs" },
 { capability: "skill invocation", names: ["skill tool", "loadSkill"], status: "unsupported",
 reason: "pi's skill TOOL (a model-callable loader for a skill body) is part of pi's own toolset; pi-durable ships no such tool, and inventing one here would be a new capability rather than a mapping",
 evidence: null },
 { capability: "prompt template", names: ["prompts", "prompt templates"], status: "shimmed",
 reason: "pi's loader reads .md prompt templates and pi's substituteArgs expands them; the harness exposes the templates as data on its read API and expands them when a caller submits one",
 evidence: "demo/cli.test.mjs" },
 { capability: "theme", names: ["themes"], status: "shimmed",
 reason: "pi's theme files are loaded as data and applied to the harness's own TUI, which is built on @earendil-works/pi-tui - the same library pi draws with",
 evidence: "demo/tui.test.mjs" },
 { capability: "context file", names: ["agentsFiles", "AGENTS.md"], status: "shimmed",
 reason: "pi's own loadProjectContextFiles content is installed as pi-durable system-prompt sections, one per file, keyed by path",
 evidence: "demo/packages.test.mjs" },
 { capability: "package", names: ["pi manifest", "package.json pi"], status: "shimmed",
 reason: "src/packages/discover.mjs reads pi's manifest kinds and both package planes on disk, and an unknown kind becomes an explicit row rather than a silent drop",
 evidence: "demo/packages.test.mjs" },
 { capability: "package install", names: ["npm install", "git clone", "DefaultPackageManager.install"], status: "unsupported",
 reason: "installing resolves from npm/git over the network, and every demo in this repo runs offline; the harness loads packages that are already on disk and reports the rest as absent",
 evidence: null },
 // ---- the harness's own surfaces, where pi-durable is the backend ----
 { capability: "session", names: ["session", "resume", "attach"], status: "native",
 reason: "pi-durable owns the session plane: one Session holds the transcript and state, and reopening a store re-opens the same conversation",
 evidence: "demo/core.test.mjs" },
 { capability: "read-only attach", names: ["multiplexer", "attach", "reader"], status: "native",
 reason: "one writer owns the store and readers attach through pi-durable's own reads; a second writer is refused by name, and queued writes land once by requestId",
 evidence: "demo/attach.test.mjs" },
 { capability: "transcript view", names: ["transcript", "read API"], status: "native",
 reason: "the read API walks pi-durable's committed entries; a reader never mutates durable state",
 evidence: "demo/readapi.test.mjs" },
 { capability: "print mode", names: ["print", "final answer"], status: "native",
 reason: "the harness's CLI runs one shared harness invocation path and prints the final answer entry",
 evidence: "demo/cli.test.mjs" },
 { capability: "json mode", names: ["NDJSON", "json"], status: "native",
 reason: "pi-durable's ConversationStream/watch events are emitted as NDJSON records",
 evidence: "demo/cli.test.mjs" },
 { capability: "rpc mode", names: ["RPC", "JSONL commands"], status: "native",
 reason: "the harness's RPC loop takes a JSONL command sequence on stdin and answers with pi-durable's own committed events",
 evidence: "demo/cli.test.mjs" },
 { capability: "tui", names: ["pi-tui", "interactive"], status: "native",
 reason: "the harness's TUI is built directly on @earendil-works/pi-tui, the same library pi draws with",
 evidence: "demo/tui.test.mjs" },
 { capability: "compaction", names: ["compaction policy"], status: "native",
 reason: "pi-durable owns compaction (DEFAULT_COMPACTION_POLICY, the compaction task, CompactionSettings); the harness configures it rather than reimplementing it",
 evidence: "demo/settings.test.mjs" },
 // ---- the capabilities pi's OWN docs enumerate that the harvest above found, added as rows ----
 // These rows exist because scripts/audit-pi-docs.mjs re-reads pi's docs (packages.md / extensions.md /
 // rpc.md / cli.md / sessions.md / compaction.md) inside the pinned package and asks of every capability
 // pi enumerates: does a row name it, or does harness code use it? A row below is written only for a name
 // pi's pinned dist really ships (the audit grounds on that), so a doc that gains a capability turns this
 // file red rather than leaving the doc claiming support nobody checked.
 { capability: "tool lifecycle event", names: ["tool_execution_start", "tool_execution_update"], status: "unsupported",
 reason: "pi fires these while a tool runs; pi-durable's tool hooks are ToolTask.beforeTool and afterTool only, and a RUNNING tool is reported through LiveState instead (ToolSlot.status pending/running/done, DEFAULT_PROGRESS_POLICY partial/output intervals). The harness shows the running tool in its own view, but an extension subscribing to these two events never gets a call",
 evidence: "demo/tui.test.mjs" },
 { capability: "session info event", names: ["session_info_changed", "SessionInfoEntry"], status: "unsupported",
 reason: "pi keeps a session-info plane (rename/label metadata) and fires when it changes; pi-durable's dist names no label or session-info plane at this pin (grep for `label`/`sessionInfo` in its dist finds nothing), so there is no change to report and no hook point to report it from",
 evidence: null },
 { capability: "thinking level selection", names: ["thinking_level_select"], status: "shimmed",
 reason: "pi's event belongs to pi's UI loop and has no hook point, but the CHOICE is durable state: pi-durable's Agent carries `thinkingLevel`, and the harness resolves it from pi's settings and reads it back out of pi.agent after a reopen - so the value survives instead of living in a UI session",
 evidence: "demo/settings.test.mjs" },
 { capability: "user bash event", names: ["user_bash"], status: "unsupported",
 reason: "pi's event for a shell command the USER typed in the UI. This harness's viewer never executes a user's shell command: its TUI hands a typed line to the writer CLI instead (demo/tui-interactive.mjs), and pi-durable has no hook point for such an event",
 evidence: "demo/tui.test.mjs" },
 { capability: "UI prompt lifecycle event", names: ["ui_prompt_start", "ui_prompt_end"], status: "unsupported",
 reason: "pi's own TUI prompt boundaries; the harness's TUI is built on pi-tui components and owns its own input overlay (src/tui/viewmode.mjs), so there is no pi prompt to bracket and no hook point in pi-durable for one",
 evidence: "demo/tui.test.mjs" },
 { capability: "custom session entries", names: ["custom_message", "context_edit", "CustomMessageEntry", "ContextEditEntry"], status: "unsupported",
 reason: "pi lets an extension inject its own session entry kinds. pi-durable's entry kinds are its own set (dist/entries.d.ts exports UserEntry, SystemEntry, AssistantEntry, ToolResultEntry, ResetEntry, CompactionEntry), and a conversation's documents are its extension point instead - the shim installs pi extension content as pi-durable sections/documents, which is what a loaded extension's extra content becomes",
 evidence: "demo/packages.test.mjs" },
 { capability: "tool parameter schema vocabulary", names: ["typebox", "TSchema", "StringEnum", "Type", "additionalProperties", "json-pointer-uri-fragment"], status: "shimmed",
 reason: "pi-durable's ToolRegistration takes JSON Schema for `parameters`, so pi's TypeBox vocabulary is only usable when it has already been compiled to plain JSON; the fixture's tool declares a raw JSON schema that pi-durable validates, and pi's schema helper names are pi's own (pi maps them to its copies, docs/extensions.md 'Available Imports')",
 evidence: "demo/packages.test.mjs" },
 { capability: "rpc client", names: ["RpcClient"], status: "shimmed",
 reason: "pi's rpc.md documents pi's own RpcClient for driving RPC mode; this harness's RPC mode implements the same record framing itself (src/rpc.mjs + cli.mjs), which is what the demo drives over a pipe",
 evidence: "demo/cli.test.mjs" },
 { capability: "branch summarization", names: ["BranchSummaryEntry", "branchSummary"], status: "unsupported",
 reason: "pi's branch summarization is a plane of pi's own session manager (dist/core/session-manager.d.ts exports BranchSummaryEntry, dist/core/messages.d.ts carries the `branchSummary` role); pi-durable's dist names no branch summary at all at this pin, and pi's `branchSummary` SETTINGS key is kept honest as an unmapped row by src/settings.mjs rather than folded into pi-durable's compaction policy",
 evidence: "demo/settings.test.mjs" },
 // ---- pi's CLI flags, enumerated by pi's own docs (docs/cli.md, docs/sessions.md) ----
 // scripts/audit-pi-docs.mjs harvests the flag tables from pi's docs inside the pinned package, so a flag
 // pi gains turns the audit red; a flag this harness answers under ANOTHER name is still named here, with
 // the harness's name in the reason, so a reader can find the equivalent instead of reading "unsupported".
 { capability: "per-resource opt-out flags", names: ["--no-extensions", "--no-skills", "--no-themes", "--no-prompt-templates", "--no-context-files", "--no-builtin-tools", "--no-mcp"], status: "unsupported",
 reason: "pi's CLI filters its resource plane at invocation time. DefaultResourceLoaderOptions at this pin carries no per-kind switch (its options are cwd, agentDir, settingsManager, eventBus and the additional*Paths lists), so this harness either loads pi's whole plane or does not load pi's loader at all; tool SELECTION is a different surface and the harness has it under its own names (--tools, --exclude-tools, --no-tools, demo/cli.test.mjs)",
 evidence: "demo/packages.test.mjs" },
 { capability: "credential and OAuth commands", names: ["--api-key", "--approve", "--no-approve", "--no-browser", "--bearer-token-env-var", "--oauth-client-id", "--oauth-client-secret", "--oauth-client-registration", "--oauth-client-name", "--oauth-callback-port", "--min-expiry", "--exposure"], status: "unsupported",
 reason: "pi's credential commands write pi's own auth files and can run an OAuth browser flow. This harness reads auth STATE through pi's ModelRuntime (src/providers.mjs) and never writes a credential, never runs a browser, and never mints a token - a model whose auth is absent is reported as such, which is what the demo shows",
 evidence: "demo/providers.test.mjs" },
 { capability: "model listing", names: ["--list-models", "--models"], status: "shimmed",
 reason: "the harness answers the same question offline through src/providers.mjs, which registers pi's providers and lists what resolves with auth state beside it",
 evidence: "demo/providers.test.mjs" },
 { capability: "session identity flags", names: ["--session-id"], status: "shimmed",
 reason: "pi addresses a session by a file-level id; pi-durable conversations are store-resident, so the harness names one with --conversation and takes the store's latest with --resume/--continue (demo/cli.test.mjs)",
 evidence: "demo/cli.test.mjs" },
 { capability: "pi's own rendering flags", names: ["--tui-mode", "--verbose", "--no-refresh"], status: "unsupported",
 reason: "these steer pi's own print-mode renderer and package refresh; pi-durable has no renderer plane, and this harness's TUI is a separate surface on pi-tui components whose rules are shown headless (demo/tui.test.mjs)",
 evidence: "demo/tui.test.mjs" },
 { capability: "invocation-time resource selection", names: ["--prompt-template", "--use-theme"], status: "unsupported",
 reason: "running a prompt template and picking a theme at invocation are pi UI verbs; the harness injects both kinds as durable pi-durable sections instead (demo/packages.test.mjs), and pi-durable's registry has no theme plane",
 evidence: "demo/packages.test.mjs" },
];

/** The rows, or only the rows of one status; the matrix the docs render and the demo asserts against. */
export function capabilityMatrix(status = null) {
 return status === null ? CAPABILITY_ROWS : CAPABILITY_ROWS.filter((row) => row.status === status);
}

/**
 * What a loaded extension registered that this file does not name.
 *
 * This is the file's reason to exist as data: pi gains capability names over time, and a list written at
 * one pin cannot name what pi has at the next. The demo feeds this function the inventory
 * src/packages/adapter.mjs collected from the extensions that ACTUALLY loaded on this machine, and an
 * empty result is the checked claim "the matrix covers what is really here" rather than a claim about
 * what pi's docs said.
 */
export function unmappedRuntime(inventory) {
 const named = new Set();
 for (const row of CAPABILITY_ROWS) for (const name of row.names) named.add(name);
 const seen = new Set();
 return inventory.filter((row) => {
 if (named.has(row.name) || seen.has(row.name)) return false;
 seen.add(row.name);
 return true;
 });
}

/** The rows as the markdown docs/package-support.md holds, generated from the rows and not kept beside them. */
export function renderMatrixMarkdown(status = null, evidenceLanded = () => true) {
 const rows = capabilityMatrix(status);
 // `evidenceLanded` is answered by the CALLER looking at the disk, not by a remembered list: a row that
 // cites a demo which is not in the tree is the doc claiming evidence the repo cannot show, so the
 // pending state is said in the same cell rather than left for a reader to discover.
 const cell = (row) => {
  if (!row.evidence) return "-";
  const names = Array.isArray(row.evidence) ? row.evidence : [row.evidence];
  const landed = names.every(evidenceLanded);
  return landed ? names.join(", ") : `${names.join(", ")} (pending: that demo is not in the tree yet)`;
 };
 return [
 "| capability | pi's name(s) | status | why | evidence |",
 "| --- | --- | --- | --- | --- |",
 ...rows.map((row) => `| ${row.capability} | ${row.names.join(", ")} | ${row.status} | ${row.reason} | ${cell(row)} |`),
 ].join("\n");
}
