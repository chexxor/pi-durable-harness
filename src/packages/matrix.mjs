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
 { capability: "command", names: ["registerCommand", "commands", "getCommands"], status: "unsupported",
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
 { capability: "tool renderer", names: ["toolRenderers", "registerToolRenderer", "registerTool "], status: "unsupported",
 reason: "same as the message renderer: pi-durable's tool result is data, and the harness's view of it is its own",
 evidence: null },
 { capability: "entry renderer", names: ["entryRenderers", "registerEntryRenderer"], status: "unsupported",
 reason: "same as the message renderer: pi-durable's transcript entries have no render hook",
 evidence: null },
 { capability: "markdown transformer", names: ["markdownTransformer", "registerMarkdownTransformer"], status: "unsupported",
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
 { capability: "package install", names: ["npm install", "git clone", "DefaultPackageManager.install", "--extensions", "--local", "--extension"], status: "unsupported",
 reason: "installing resolves from npm/git over the network, and every demo in this repo runs offline; the harness loads packages that are already on disk and reports the rest as absent. pi's install scope flags (--extensions for a path, --local/--extension for which plane a package lands in) select a plane this harness only READS - src/packages/discover.mjs labels the two planes it finds (user and project) rather than writing into either",
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
 reason: "the harness's TUI is built directly on @earendil-works/pi-tui, the same library pi draws with, and it is interactive in the sense pi's TUI is: a submitted line leaves the viewer over the attach socket, commits in the OWNING session, and the same view gains that pi.user row on the next paint. demo/tui.test.mjs proves that round trip (typed line -> socket -> one committed submission -> the reader's view grows), and demo/tui-interactive.mjs is the TTY path a human runs",
 evidence: ["demo/tui.test.mjs", "demo/tui-interactive.mjs"] },
 { capability: "compaction", names: ["compaction policy", "CompactionEntry", "session_compact", "session_compact_failed", "session_before_compact"], status: "native",
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
 { capability: "session identity flags", names: ["--session-id", "--session-dir", "--continue", "--resume", "-c", "-r", "--no-session"], status: "shimmed",
 reason: "pi addresses a session by a file-level id; pi-durable conversations are store-resident, so the harness names one with --conversation and takes the store's latest with --resume/--continue (demo/cli.test.mjs). pi's --session-dir (a directory of session FILES) is pi's --store here: one SQLite store per directory, opened once (src/core.mjs). pi's --no-session runs pi-durable's in-memory Session instead of a store (demo/core.test.mjs proves both backends)",
 evidence: "demo/cli.test.mjs" },
 { capability: "pi's own rendering and version flags", names: ["--tui-mode", "--verbose", "--no-refresh", "--version"], status: "shimmed",
 reason: "pi's --tui-mode/--verbose/--no-refresh steer pi's own print-mode renderer and package refresh, which pi-durable has no plane for (this harness's TUI is a separate surface on pi-tui components, rules shown headless in demo/tui.test.mjs); pi's -v/--version IS answered here: cli.mjs --version prints the pin and the declared plane from pi-main.pin.json and package.json on disk (\"pin v1.5.1 (dd30101cfc5b) - 10 @earendil-works packages declared\"), no network",
 evidence: "demo/tui.test.mjs" },
 { capability: "invocation-time resource selection", names: ["--prompt-template", "--use-theme"], status: "unsupported",
 reason: "running a prompt template and picking a theme at invocation are pi UI verbs; the harness injects both kinds as durable pi-durable sections instead (demo/packages.test.mjs), and pi-durable's registry has no theme plane",
 evidence: "demo/packages.test.mjs" },
 // ---- pi's ExtensionContext / ExtensionAPI / Custom UI surfaces, named by pi's OWN docs sections ----
 // scripts/audit-pi-docs.mjs harvests the method headings of pi's extensions.md sections (ExtensionContext,
 // ExtensionCommandContext, ExtensionAPI Methods, Custom UI, MCP Servers) and the dotted calls pi writes in
 // them (`ctx.ui.select(...)`, `sessionManager.getBranch(...)`), and coverage is answered ONLY from a row's
 // `names:` array - a reason sentence that happens to mention pi's verb is not coverage. So a method pi adds
 // to one of those sections turns the audit red, and a row below has to say what pi-durable lacks, not just
 // that something is missing.
 { capability: "extension context (what a pi handler receives)", names: ["ExtensionContext", "ExtensionToolContext", "ExtensionCommandContext", "ExtensionAPI", "ExtensionFactory", "cwd", "runtime"], status: "shimmed",
 reason: "src/packages/adapter.mjs hands a pi handler { cwd, runtime: api.registry } built from pi-durable's HookApi (api.env.cwd, api.registry) - which is where pi extensions read their working directory and reach pi's runtime object; every OTHER member of pi's ExtensionContext is named below rather than handed out",
 evidence: "demo/packages.test.mjs" },
 { capability: "pi's ExtensionContext accessors and actions (the runner's verbs)", names: ["hasUI", "isProjectTrusted", "mode", "signal", "isIdle", "hasPendingMessages", "abort", "shutdown", "getContextUsage", "compact", "sessionManager", "modelRegistry", "scopedModels", "model", "thinkingLevel", "sessionManager.getEntries", "sessionManager.getBranch", "sessionManager.buildContextEntries", "sessionManager.getLeafId", "sessionManager.getSessionFile", "modelRegistry.getProvider", "modelRegistry.getAvailable", "modelRegistry.streamSimple"], status: "unsupported",
 reason: "these are pi's ExtensionRunner verbs and accessors, and this harness binds no pi runner - pi's own loader comment says its runtime actions are throwing stubs until runner.initialize(). A handler that calls one throws INSIDE the pi-durable hook, which blocks the call: the loud outcome an extension that needs pi's own session should get. Where pi-durable has a real analogue it is a DIFFERENT surface, named here rather than folded in: the model/thinking choice is durable Agent state (demo/settings.test.mjs), the model plane is pi's ModelRegistry at library level in src/providers.mjs (demo/providers.test.mjs), compaction is a task (demo/settings.test.mjs), and abort is the harness's own RPC command (demo/cli.test.mjs)",
 evidence: "demo/packages.test.mjs" },
 { capability: "pi's session replacement verbs", names: ["newSession", "fork", "navigateTree", "switchSession", "reload", "waitForIdle", "session_before_switch", "session_before_fork"], status: "unsupported",
 reason: "pi's ExtensionCommandContext replaces the session it runs (new/fork/navigate/switch) and fires events when it does. pi-durable's store has no switch/fork/navigate-tree verb: a conversation carries its parent as {conversationId, at} and the read API surfaces that parentage instead (demo/readapi.test.mjs shows the parent rows). So an extension asking pi to fork or navigate has no receiver",
 evidence: "demo/readapi.test.mjs" },
 { capability: "pi's system prompt accessors", names: ["getSystemPrompt", "getSystemPromptOptions"], status: "shimmed",
 reason: "the harness composes what pi would hand back: pi-durable's Agent instructions plus the context-file sections pi's loader found, resolved through pi's own SettingsManager so project scope beats global (demo/settings.test.mjs reads the composed agent doc back out of durable state)",
 evidence: "demo/settings.test.mjs" },
 { capability: "pi's message submission verbs", names: ["sendMessage", "sendUserMessage"], status: "shimmed",
 reason: "pi's ExtensionAPI puts a message into pi's running session; this harness puts input into the writer conversation over the attach socket / RPC mode, and pi-durable's SubmissionDraft requestId admission makes that land EXACTLY once even if the client retries (demo/attach.test.mjs counts the committed entries after two submissions with one requestId)",
 evidence: "demo/attach.test.mjs" },
 { capability: "entry injection (pi's `pi.appendEntry`)", names: ["appendEntry"], status: "shimmed",
 reason: "pi-durable has the verb on its OWN plane - Session.commit's tx.appendEntry(conversationId, {kind, data}) - and the read API proves that same verb is refused through a read-only transport. What does NOT map is pi's custom entry TYPES: pi-durable's entry kinds are its own set (UserEntry/SystemEntry/AssistantEntry/ToolResultEntry/ResetEntry/CompactionEntry in dist/entries.d.ts), so an injected custom kind is an entry pi-durable names, not pi's",
 evidence: "demo/readapi.test.mjs" },
 { capability: "pi's session metadata verbs (and pi's --name at invocation)", names: ["setSessionName", "getSessionName", "setLabel", "--name", "-n"], status: "unsupported",
 reason: "pi names and labels sessions and entries; pi-durable's dist names no label or session-name plane at this pin, and conversations are addressed by their store ids (demo/readapi.test.mjs lists them with their parentage)",
 evidence: "demo/readapi.test.mjs" },
 { capability: "pi's tool exposure verbs", names: ["getActiveTools", "getAllTools", "setActiveTools"], status: "shimmed",
 reason: "tool selection here happens at the registry level: --tools/--exclude-tools change which pi-durable tools are OFFERED (an unoffered call settles tool_unavailable in the Harness rather than a guess), and registry.snapshot().tools() is the all-tools view the demo prints",
 evidence: ["demo/cli.test.mjs", "demo/packages.test.mjs"] },
 { capability: "pi's model and thinking verbs", names: ["setModel", "getThinkingLevel", "setThinkingLevel"], status: "shimmed",
 reason: "the choice is durable state rather than a session mutation: pi-durable's Agent carries model and thinkingLevel, and the reopened second process reads the same values back out of pi.agent (demo/settings.test.mjs)",
 evidence: "demo/settings.test.mjs" },
 { capability: "pi's event bus object", names: ["events"], status: "unsupported",
 reason: "pi hands extensions an EventBus (`pi.events`) they can subscribe to. pi-durable's observables are per-task hooks (ToolTask.beforeTool/afterTool, GenerationTask.beforeProviderRequest/afterResponse, CompactionTask.beforeCompact), LiveState for running work, and the transcript watch layer this harness serves as RPC `watch` (demo/readapi.test.mjs). There is no pi-style bus object to subscribe to",
 evidence: "demo/readapi.test.mjs" },
 { capability: "pi's provider registration", names: ["registerProvider", "unregisterProvider"], status: "shimmed",
 reason: "src/providers.mjs registers providers through pi's own ModelRegistry (class ModelRegistry with registerProvider(providerName, config) and find(provider, modelId) in dist/core/model-registry.d.ts) at library level, offline, and reports auth state beside each model",
 evidence: "demo/providers.test.mjs" },
 { capability: "pi's virtual models", names: ["registerVirtualModel", "unregisterVirtualModel"], status: "unsupported",
 reason: "a virtual model is an alias pi's runner resolves at model-select time. This harness resolves model refs itself (the prefix rule) against pi's ModelRegistry, and pi-durable's Agent carries ONE model row per conversation, so an extension-registered alias has no receiver",
 evidence: "demo/providers.test.mjs" },
 { capability: "pi's MCP plane (and pi's mcp add/login options)", names: ["registerMcpServer", "unregisterMcpServer", "getMcpServers", "mcp_servers_change", "mcpServers", "mcp.json", "--env", "--url", "--header", "--timeout", "--description"], status: "unsupported",
 reason: "pi's MCP servers - added with --env KEY=VALUE for a stdio server, --url + --header KEY=VALUE for a streamable HTTP one, --description to name it, and signed in with --timeout <seconds> - are served by pi's own config and the @earendil-works/pi-mcp package, which this repo PINS but never imports (rg for `pi-mcp` in src/, demo/, scripts/ finds no import), and pi-durable's dist names no MCP task or hook. An extension that registers an MCP server therefore has nothing to serve it",
 evidence: null },
 { capability: "pi's UI dialog verbs (ctx.ui)", names: ["ctx.ui", "ui.select", "ui.confirm", "ui.input", "ui.editor", "ui.notify"], status: "unsupported",
 reason: "ctx.ui is built by pi's ExtensionRunner for pi's TUI; nothing here provides it, so an extension calling ctx.ui.select() throws (the loud outcome). The harness's own TUI owns the equivalent surface - a one-row input overlay that covers the frame underneath and restores it on submit/Esc - built on pi-tui components (demo/tui.test.mjs, demo/tui-interactive.mjs)",
 evidence: "demo/tui.test.mjs" },
 { capability: "pi's renderer-plane UI knobs", names: ["ui.setStatus", "ui.setWidget", "ui.setFooter", "ui.setHeader", "ui.setTitle", "ui.setWorkingMessage", "ui.setWorkingVisible", "ui.setWorkingIndicator", "ui.setHiddenThinkingLabel", "ui.getToolsExpanded", "ui.setToolsExpanded", "ui.theme.fg", "ui.getAllThemes", "ui.getTheme", "ui.setTheme"], status: "unsupported",
 reason: "these steer pi's own transcript renderer and theme objects. The harness's header/footer/stream rows are its OWN pi-tui composition (src/tui/frame.mjs, demo/tui.test.mjs clips them to the terminal), and pi-durable's registry has no theme plane: pi's themes load as durable sections (demo/packages.test.mjs), they are not renderer objects pi's `setTheme` could swap",
 evidence: "demo/tui.test.mjs" },
 { capability: "pi's in-TUI editor and autocomplete", names: ["ui.setEditorText", "ui.getEditorText", "ui.pasteToEditor", "ui.setEditorComponent", "ui.getEditorComponent", "ui.addAutocompleteProvider", "ui.onTerminalInput"], status: "unsupported",
 reason: "pi lets an extension replace the in-TUI editor, feed its autocomplete providers and intercept terminal input; those are pi's input plane. The harness's TUI is a viewer that hands a submitted line to the writer CLI (demo/tui-interactive.mjs), so it has no editor to replace and no autocomplete provider to add",
 evidence: "demo/tui-interactive.mjs" },
 { capability: "custom pi-tui components and overlay mode", names: ["ui.custom"], status: "shimmed",
 reason: "the harness composes pi-tui's own components (Container, Text, TruncatedText, compositeTuiLine, visibleWidth) into its frames and implements the one-row overlay pi's Overlay Mode calls itself - but through pi-tui, not through pi's `ctx.ui.custom()` hook, which no extension can reach here",
 evidence: "demo/tui.test.mjs" },
 { capability: "pi's lifecycle and provider-stage events with no pi-durable task", names: ["project_trust", "resources_discover", "before_provider_headers", "provider_stream_event", "cache_warming_decision"], status: "unsupported",
 reason: "pi fires these at stages pi-durable has no task or hook for: pi's project-trust decision for project extensions, resource discovery, provider HEADER rewriting (pi-durable's hook is the whole REQUEST, beforeProviderRequest), raw stream events, and cache-warming decisions. pi-durable's hook points are ToolTask.beforeTool/afterTool, GenerationTask.beforeProviderRequest/afterResponse and CompactionTask.beforeCompact",
 evidence: null },
 { capability: "pi's exec verb", names: ["exec"], status: "shimmed",
 reason: "pi's `pi.exec` runs a command through pi's own runner; the harness runs shell commands through pi-durable's NodeExecutionEnv (src/executionenv.mjs keeps only pi's knobs: cwd, shellPath, shellEnv) and the bash tool's execution through that env is shown offline (demo/tools.test.mjs)",
 evidence: "demo/tools.test.mjs" },
 { capability: "pi's settings accessor", names: ["getSettings"], status: "shimmed",
 reason: "pi's `pi.getSettings()` hands an extension pi's merged settings; src/settings.mjs resolves the SAME thing through pi's own SettingsManager (project scope beating global) and hands the resolved policy to pi-durable, where a reopened second process reads the stored values back (demo/settings.test.mjs)",
 evidence: "demo/settings.test.mjs" },
 { capability: "pi's session export verb", names: ["--export"], status: "unsupported",
 reason: "pi writes a session FILE out as HTML (`pi --export <input> [output]`); this harness has no HTML renderer plane and no session files - the transcript is pi-durable's committed entries, and the way a reader sees them is src/readapi.mjs or `--mode json`, which prints pi-durable's own entry rows (demo/cli.test.mjs, demo/readapi.test.mjs)",
 evidence: null },
 { capability: "pi's explicit resource paths (--skill/--theme)", names: ["--skill", "--theme", "additionalSkillPaths", "additionalThemePaths", "additionalPromptTemplatePaths", "additionalExtensionPaths"], status: "shimmed",
 reason: "an explicit path reaches pi's OWN loader through its own option names (src/packages/loader.mjs passes `additional*Paths` to DefaultResourceLoader, and demo/packages.test.mjs loads a fixture skill and prompt that way, including a missing path that is reported rather than guessed); what does NOT map is the flag's other half: pi's --skill/--theme also DISABLE discovered resources, while this harness keeps the discovered set and reports both halves",
 evidence: "demo/packages.test.mjs" },
 { capability: "pi's own package update verbs", names: ["--all", "--force", "--self"], status: "shimmed",
 reason: "pi's `pi update` / `pi update --all` / `--self` / `--force` reinstall pi's npm packages; this harness moves the PIN instead: scripts/sync-pi.mjs --update <ref> refuses a ref it cannot see, and its PIN/DECLARED/RESOLVED report says whether the installed packages match the pin (it also refuses to reinstall pi itself, since this harness never vendors pi's CLI)",
 evidence: "scripts/sync-pi.mjs" },
 { capability: "pi's credential check surface", names: ["--credentials", "auth check"], status: "unsupported",
 reason: "pi's `pi auth check --credentials` prints a resolved credential; this harness never holds or prints one - every offline demo runs on pi-ai's faux provider with no key, and src/spend.mjs reports spend by ENDPOINT class (loopback free, LAN/local not free) rather than by credential",
 evidence: "demo/providers.test.mjs" },
 { capability: "pi's fork-at-invocation flag", names: ["--fork"], status: "unsupported",
 reason: "pi's --fork starts a NEW session file forked from an existing one; this harness keeps one store per directory and pi-durable's history is fork-aware for READS (entries carry parent {conversationId, at}, and demo/readapi.test.mjs prints that parentage), but nothing here mints a forked conversation at invocation - a reopened conversation continues the same committed line (demo/cli.test.mjs)",
 evidence: "demo/readapi.test.mjs" },
 { capability: "pi's structured-output flag (--json)", names: ["--json", "--mode"], status: "shimmed",
 reason: "this harness spells the same output as `--mode json` - NDJSON, one committed pi-durable entry per line, asserted by demo/cli.test.mjs - rather than a boolean --json; pi's --json on its auth/mcp commands has no analogue here (those verbs are the rows above)",
 evidence: "demo/cli.test.mjs" },
 { capability: "pi's offline mode", names: ["--offline"], status: "shimmed",
 reason: "scripts/sync-pi.mjs --offline reports drift as \"offline\" instead of asking upstream, and every demo in this repo runs offline (measured: strace -f -e trace=connect over the suite shows 0 AF_INET connects); what pi's --offline does NOT map onto is pi's own model-plane offline behaviour, since this harness answers turns with pi-ai's faux provider",
 evidence: "scripts/sync-pi.mjs" },

 // ---- pi's RPC reference: rpc.md states the protocol, rpc-commands.md enumerates the verbs ----
 { capability: "pi's RPC verbs answered from durable state", names: ["prompt", "steer", "follow_up", "abort", "clear_queue", "new_session", "get_state", "get_messages", "get_entries", "get_tree", "get_last_assistant_text", "get_session_stats", "get_commands", "set_model", "get_available_models", "set_thinking_level", "get_available_thinking_levels", "set_auto_compaction", "compact", "switch_session", "fork", "clone", "get_fork_messages", "bash"], status: "shimmed",
 reason: "every verb pi's rpc-commands.md documents is answered on a pi-durable plane rather than dropped: the prompting verbs go through Conversation.submit with pi's record id as the exactly-once admission key, the reads walk pi-durable's EntryRecords, the session verbs use Conversation.fork/switch/newConversation, and bash runs in pi-durable's execution env with its output queued as follow-up input; each reply is committed durable state only",
 evidence: ["demo/rpc.test.mjs", "demo/attach.test.mjs"] },
 { capability: "pi's RPC verbs with no pi-durable plane", names: ["cycle_model", "cycle_thinking_level", "set_steering_mode", "set_follow_up_mode", "set_auto_retry", "abort_retry", "abort_bash", "export_html", "set_session_name"], status: "unsupported",
 reason: "pi cycles among models and thinking levels SCOPED to a session, and this harness has one agent model per conversation (set_model) plus one thinking level, so there is no cycle to advance; pi's steering/follow-up modes are settings of pi's own message queue while this harness queues on pi-durable's InboxDoc; pi's retry switches live in pi's runner while pi-durable retries inside its GenerationTask; abort_bash needs an interruptible bash mid-run, export_html an HTML exporter and set_session_name a session-name plane, none of which pi-durable offers at this pin - and each is refused by name, with the reason in the reply, rather than silently ignored",
 evidence: "demo/rpc.test.mjs" },
 { capability: "pi's JSON/RPC event records the harness answers", names: ["session", "agent_start", "agent_end", "agent_settled", "turn_start", "turn_end", "message_start", "message_end", "message_update", "text_end", "thinking_end", "toolcall_end", "tool_execution_start", "tool_execution_end", "bash_execution_update", "queue_update", "extension_error"], status: "shimmed",
 reason: "src/pievents.mjs wraps pi-durable's committed EntryRecords in pi's record shapes - the message objects ARE pi-ai's own messages, passed through - and the RPC session adds pi's bash_execution_update from pi-durable's onOutput chunks, pi's queue_update over pi-durable's InboxDoc, and pi's extension_error when a bridged handler throws",
 evidence: ["demo/rpc.test.mjs", "demo/cli.test.mjs"] },
 { capability: "pi's JSON streaming-delta records", names: ["text_start", "text_delta", "thinking_start", "thinking_delta", "toolcall_start", "toolcall_delta"], status: "unsupported",
 reason: "pi emits deltas while a provider streams; pi-durable commits an assistant entry when its turn ends and reports in-flight progress through its own partials (src/eventfeed.mjs), so this harness answers the authoritative message_update forms (text_end, thinking_end, toolcall_end) instead of replaying deltas it never observed - a delta replay would be a claim about in-flight state the store does not hold",
 evidence: null },
 { capability: "pi's retry event records", names: ["auto_retry_start", "auto_retry_end", "summarization_retry_attempt_start", "summarization_retry_finished", "summarization_retry_scheduled"], status: "unsupported",
 reason: "pi-durable retries inside its GenerationTask per DEFAULT_RETRY_POLICY and reports the settled outcome, so the harness answers agent_end with willRetry rather than a per-attempt record stream: pi-durable's retry is task state, not an event channel at this pin",
 evidence: null },
 { capability: "pi's announcement records with no durable channel", names: ["compaction_start", "compaction_end", "entry_appended", "session_info_changed", "thinking_level_changed"], status: "unsupported",
 reason: "pi announces compaction, custom-entry injection, a changed display name and a changed thinking level as records; pi-durable runs compaction as a CompactionTask whose result the RPC session answers with directly, and it has no custom-entry, session-name or thinking-change channel at this pin - set_thinking_level reports the new level in its own reply instead",
 evidence: null },
 { capability: "pi-ai's message types read from committed entries", names: ["AgentMessage", "SystemMessage", "UserMessage", "AssistantMessage", "ToolResultMessage", "TextContent", "ThinkingContent", "ImageContent", "ToolCall", "Usage", "Model"], status: "native",
 reason: "pi-durable's EntryRecord carries `model`, the exact pi-ai message list it put in the provider's context, so the harness reads pi-ai's own types out of it (get_state, get_messages, get_tree, get_session_stats and the JSON records all pass these through) and resolves pi-ai's Model metadata for the context window rather than modelling messages again",
 evidence: ["demo/readapi.test.mjs", "demo/rpc.test.mjs"] },
 { capability: "pi's session-manager message kinds", names: ["BashExecutionMessage", "CustomMessage", "BranchSummaryMessage", "CompactionSummaryMessage"], status: "unsupported",
 reason: "pi's session manager synthesises these messages over its own entry kinds (bash typed by a user, entries an extension appended, branch summaries, compaction summaries); pi-durable keeps bash input as an InboxDoc item and offers no branch-summary or custom-entry plane at this pin, so the RPC session refuses the verbs that would have to produce them",
 evidence: null },
 { capability: "pi's session-file entry types and reader", names: ["SessionHeader", "SessionMessageEntry", "ModelChangeEntry", "ThinkingLevelChangeEntry", "UsageEntry", "CustomEntry", "LabelEntry", "SessionEntry", "Messages", "SessionManager"], status: "unsupported",
 reason: "pi persists a session as a JSONL file of these entry types and its SessionManager reads and writes them; this store is pi-durable's SQLite Conversation of EntryRecords behind the ONE storage opener, so pi's file reader is not attached - get_session_stats names the store in `sessionFile` and the session verbs work on ConversationId, and reading pi's JSONL format would be a second mutation line",
 evidence: ["demo/readapi.test.mjs", "demo/attach.test.mjs"] },
 { capability: "pi-tui components this harness composes", names: ["TuiMainScreen", "ProcessTerminal", "Container", "TruncatedText", "Text"], status: "native",
 reason: "the harness renders through pi-tui's own components rather than owning terminal bytes: TuiMainScreen on ProcessTerminal paints the frame of rows src/tui/frame.mjs builds from pi-durable's entries, and pi-tui's truncation/width helpers measure what a row may occupy",
 evidence: ["demo/tui.test.mjs", "demo/tui-interactive.mjs"] },
 { capability: "pi-tui's dialogs and layout components the harness does not compose", names: ["VStack", "HStack", "Spacer", "Markdown", "Image", "Input", "Editor", "SelectList", "SettingsList", "ScrollView", "Loader", "CancellableLoader", "MouseRegion", "KeybindingsManager", "Focusable", "CustomEditor"], status: "unsupported",
 reason: "these are pi-tui's interactive dialogs, indicators and layout boxes pi's own in-TUI editors, selectors and scrollable views use; this harness's TUI paints transcript rows and takes typed input through its own driver, and pi-durable has no dialog/selection state for those components to present at this pin",
 evidence: null },
 { capability: "pi's extension dialog subprotocol (RPC UI)", names: ["extension_ui_request", "extension_ui_response", "ExtensionUIContext", "select", "confirm", "input", "editor", "notify", "set_editor_text"], status: "unsupported",
 reason: "pi's extensions open dialogs over a separate RPC subprotocol - a request record, a host that renders it, and an ExtensionUIContext that answers; this harness's RPC session has no UI channel and pi-durable has no dialog plane at this pin, so a bridged extension that calls ctx.ui throws, loudly, rather than hanging on a dialog nothing renders",
 evidence: null },
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