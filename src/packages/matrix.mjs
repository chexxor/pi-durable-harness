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
 { capability: "event handler", names: ["before_provider_request", "BeforeProviderRequestEvent", "BeforeProviderRequestEventResult", "payload"], status: "shimmed",
 reason: "pi's event is {type, payload} and its handler result is the REPLACEMENT payload (dist/core/extensions/types.d.ts: `BeforeProviderRequestEventResult = unknown`), which is pi-durable's own replacement slot (GenerationHooks.beforeProviderRequest takes {model, payload} and its result replaces the body for that request) - so src/packages/adapter.mjs threads pi's payload through the chain and hands pi-durable {payload}. UNEXERCISED OFFLINE, and said so: pi-ai's faux provider, which every offline demo answers with, never reaches that call site (pi-durable fires beforeRequest there instead), which is why the demo names the ABSENCE rather than a firing",
 evidence: "demo/packages.test.mjs" },
 { capability: "event handler", names: ["after_provider_response", "AfterProviderResponseEvent", "status", "headers"], status: "shimmed",
 reason: "the hook POINTS line up - pi-durable's afterResponse fires once per terminal provider message, before classification - but pi's EVENT does not: pi's AfterProviderResponseEvent is {type, status: number, headers: Record<string,string>}, the provider's HTTP answer, and pi-durable hands pi-ai's AssistantMessage, which carries neither. So the bridged handler gets pi's event NAME and nothing invented; a handler that branches on `event.status` sees no status. The firing itself is asserted by the demo",
 evidence: "demo/packages.test.mjs" },
 { capability: "event handler", names: ["session_before_compact", "SessionBeforeCompactEvent", "SessionBeforeCompactResult", "customInstructions", "reason", "cancel", "compaction", "summary"], status: "shimmed",
 reason: "pi's event is {type, preparation, branchEntries, customInstructions?, reason} and pi-durable's CompactionTask hands {reason, entries, messages, firstKept, instructions?} - and pi-durable's CompactionReason is the SAME vocabulary pi spells (manual | threshold | overflow), so `reason` and pi's `customInstructions` map 1:1 while pi's `preparation` (its CompactionPreparation: messagesToSummarize, turnPrefixMessages, isSplitTurn, tokensBefore, previousSummary, fileOps, settings) and pi's session-FILE `branchEntries` are replaced by pi-durable's own selection (entries/messages/firstKept). pi's result {cancel?, compaction?: CompactionResult{summary, firstKeptEntryId, tokensBefore, usage?, details?}} becomes pi-durable's {decline: true} | {summary: string}: pi's `cancel` is pi-durable's decline, pi's `compaction.summary` is pi-durable's summary, and pi's own cut numbers (firstKeptEntryId, tokensBefore, usage, details) are dropped because pi-durable picks its own cut. The demo asserts the firing, pi's reason word, the custom instructions crossing, and that a declined compaction leaves no summary entry",
 evidence: "demo/packages.test.mjs" },
 { capability: "pi's compaction-result fields pi-durable computes itself", names: ["firstKeptEntryId", "tokensBefore", "estimatedTokensAfter", "usage", "details", "previousSummary", "fileOps", "isSplitTurn", "turnPrefixMessages", "messagesToSummarize"], status: "unsupported",
 reason: "pi's CompactionResult and CompactionPreparation carry pi's OWN range selection (first kept entry, tokens before/after, per-attempt usage, split-turn flags, extracted file ops) beside the summary text; pi-durable's CompactionTask selects its cut itself (dist/harness/compaction.js `selectCut`, `summarizedMessages`) and its hook contract only accepts {decline} | {summary}, so those fields have no receiver here - which is what the row is for, not a to-do",
 evidence: null },
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
{ capability: "skill command (/skill:name)", names: ["_expandSkillCommand", "expandPromptTemplates", "disable-model-invocation", "disableModelInvocation"], status: "shimmed",
 reason: "pi expands /skill:name into its own <skill name= location=> block over pi's `stripFrontmatter` body (imported, not re-implemented) with the arguments appended - the shape copied from dist/core/agent-session.js `_expandSkillCommand`; an unknown skill name passes through, as pi does",
 evidence: "demo/cli.test.mjs" },
{ capability: "prompt template", names: ["prompts", "prompt templates", "expandPromptTemplate", "substituteArgs", "argument-hint", "argumentHint"], status: "shimmed",
 reason: "pi's loader reads .md prompt templates; pi expands one BEFORE the input enters the agent, and this harness expands them the same way at its input seams (src/promptplane.mjs's `substitute` re-implementation of pi's substitution table, from docs/prompt-templates.md - pi's own `substituteArgs`/`parseCommandArgs` live in dist/core/prompt-templates.js but the pinned release does not export them, so the table is re-implemented from the doc rather than called)",
 evidence: "demo/cli.test.mjs" },
{ capability: "theme", names: ["themes", "concreteColors", "fgAnsi", "resolvedColors", "theme"], status: "shimmed",
 reason: "pi's theme files are loaded as data, and the palette they carry (pi's OWN token names `accent`/`borderMuted` with rgb triples, or fgAnsi numbers for palette-only terminals) is what colours the rows this harness feeds pi-tui - src/tui/theme.mjs never invents a hue and leaves a row uncoloured when a theme lacks the token",
	 evidence: ["demo/packages.test.mjs", "demo/cli.test.mjs"] },
 { capability: "context file", names: ["agentsFiles", "AGENTS.md"], status: "shimmed",
 reason: "pi's own loadProjectContextFiles content is installed as pi-durable system-prompt sections, one per file, keyed by path",
 evidence: "demo/packages.test.mjs" },
{ capability: "theme selection", names: ["setTheme", "auto-detect", "system", "ThemeSelectorComponent"], status: "unsupported",
 reason: "pi picks a theme through its settings dialog, auto-detects light/dark from the terminal, and swaps its renderer objects (`setTheme`); this harness reads pi's `theme` SETTING and pi's discovered record, but has no dialog and no renderer objects to swap",
 evidence: null },
 { capability: "package", names: ["pi manifest", "package.json pi"], status: "shimmed",
 reason: "src/packages/discover.mjs reads pi's manifest kinds and both package planes on disk, and an unknown kind becomes an explicit row rather than a silent drop",
 evidence: "demo/packages.test.mjs" },
 { capability: "package install", names: ["npm install", "git clone", "DefaultPackageManager.install", "--extensions", "--local", "-l", "--extension"], status: "unsupported",
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
 { capability: "compaction", names: ["compaction policy", "CompactionEntry", "session_compact", "session_compact_failed", "session_before_compact", "DEFAULT_COMPACTION_POLICY", "CompactionSettings", "compactionPolicy", "selectCut"], status: "native",
 reason: "pi-durable owns compaction (DEFAULT_COMPACTION_POLICY, the compaction task, CompactionSettings); the harness configures it rather than reimplementing it, and the OFF switch is proven to gate pi-durable's OWN automatic paths (dist/harness/compaction.js `compactionPolicy` layers the conversation over the harness, dist/harness/generation.js `thresholdCompaction` returns undefined when `!policy.enabled` and the overflow branch requires `compaction?.enabled === true`): a grown context plus an explicit compact under pi's `compaction.enabled: false` commits no `pi.compaction` entry. demo/packages.test.mjs shows the same call with the switch ON, including a pi handler chain declining it",
 evidence: ["demo/settings.test.mjs", "demo/packages.test.mjs"] },
 { capability: "pi's own library plane (settings, providers, resources, context files) reused unchanged by the user path", names: ["SettingsManager", "ModelRuntime", "ModelRegistry", "DefaultResourceLoader", "discoverAndLoadExtensions", "loadProjectContextFiles", "formatSkillsForPrompt", "stripFrontmatter", "readStoredCredential", "createModels", "fauxProvider"], status: "native",
 reason: "no translation happens on this plane: src/agentplane.mjs calls pi's OWN library exports as pi spells them - pi's SettingsManager for the two settings scopes, pi's ModelRuntime/ModelRegistry for the provider catalog with pi-ai's faux provider armed beside it (and pi's auth file for keys, through pi's readStoredCredential), pi's DefaultResourceLoader for extensions/skills/prompts/themes, pi's loadProjectContextFiles for AGENTS.md files, pi's formatSkillsForPrompt and pi's stripFrontmatter for the skill block - and composes them ONCE before Harness.open in the real CLI path, not only in a fixture. The evidence is measured from a run's own stderr inventory (`plane:` counts of packages, loaded extensions, bridged registrations, templates, skills, themes, context files, skipped kinds) plus the pty proof that a terminal run of cli.mjs composes the same plane; nothing on this plane is reimplemented",
 evidence: ["demo/cli.test.mjs", "demo/tty.test.mjs", "demo/packages.test.mjs", "demo/providers.test.mjs"] },
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
 { capability: "per-resource opt-out flags", names: ["--no-extensions", "--no-skills", "--no-themes", "--no-prompt-templates", "--no-context-files", "noExtensions", "noSkills", "noPromptTemplates", "noThemes", "noContextFiles"], status: "shimmed",
 reason: "pi filters its resource plane at invocation time, and DefaultResourceLoaderOptions at this pin names the same five kinds (noExtensions / noSkills / noPromptTemplates / noThemes / noContextFiles). The harness maps its --no-* flags onto those option names BEFORE pi's loader runs, so a kind the run skipped never enters the plane rather than being filtered out of pi's answer afterwards; the run's own inventory then names every kind it did not load, and the demo compares the counts with and without the flags on the same fixture cwd",
 evidence: ["demo/cli.test.mjs"] },
 { capability: "built-in extension and MCP opt-out", names: ["--no-builtin-tools", "--no-mcp", "disabledBuiltinExtensions"], status: "unsupported",
 reason: "pi's loader also names disabledBuiltinExtensions (built-ins such as `mcp` off by name), and pi's --no-mcp stops its MCP extension. This harness never loads pi's builtin mcp extension, so there is nothing to disable and no MCP tool surface to answer with; pi's --no-builtin-tools is tool SELECTION, a different surface the harness has under its own names (--tools, --exclude-tools, --no-tools)",
 evidence: ["demo/cli.test.mjs"] },
 { capability: "provider credential read (auth state, not auth writing)", names: ["readStoredCredential", "hasConfiguredAuth", "getProviderAuthStatus"], status: "shimmed",
 reason: "pi resolves a provider's key at request time through its own auth file, and provider-composer.js calls that source \"stored credential\" - a provider models.json declares without an inline apiKey is still configured when pi's auth file carries an api_key. The harness uses pi's own readStoredCredential for that (not a second reader of pi's file format) and pi's precedence: stored credential answers before models.json's inline key. pi-ai then reports the provider as configured (hasConfiguredAuth) and answers its AuthStatus record. NO credential is written, minted or refreshed here - the row above names pi's credential commands as unsupported, and an OAuth credential is not inlined because pi-ai's Models plane takes an api key and pi's login flows are not run",
 evidence: ["demo/providers.test.mjs"] },
 { capability: "credential and OAuth commands", names: ["--api-key", "--approve", "--no-approve", "--no-browser", "--bearer-token-env-var", "--oauth-client-id", "--oauth-client-secret", "--oauth-client-registration", "--oauth-client-name", "--oauth-callback-port", "--min-expiry", "--exposure"], status: "unsupported",
 reason: "pi's credential commands write pi's own auth files and can run an OAuth browser flow. This harness reads auth STATE through pi's ModelRuntime (src/providers.mjs) and never writes a credential, never runs a browser, and never mints a token - a model whose auth is absent is reported as such, which is what the demo shows",
 evidence: "demo/providers.test.mjs" },
 { capability: "model listing", names: ["--list-models", "--models"], status: "shimmed",
 reason: "the harness answers the same question OFFLINE through pi's own model plane: src/providers.mjs registers pi's providers, and cli.mjs answers pi's own `--list-models [search]` verb BEFORE it opens a store, printing pi's ModelRuntime.getAvailable over pi's provider plane with pi's OWN column names (`provider model context max-out thinking images`), pi's provider/id sort, pi's own fuzzyFilter (imported from pi-tui) over `${provider} ${model}`, pi's own `No models matching \"<pattern>\"` wording, and pi's token shorthand, which is copied from pi's pinned dist/cli/list-models.js because that file is NOT importable at this pin (the package's exports are only \".\" and \"./rpc-entry\", and dist/index.d.ts names neither listModels nor formatNoModelsAvailableMessage). The one measured difference from pi, and why the row stays `shimmed` rather than `native`: this ModelRuntime is created with `allowModelNetwork: false` and `refreshOnCreate: false`, so pi's startup catalog refresh never runs and the list is what pi's plane already knows HERE, and the `auth` column is a harness addition beside pi's columns (answered through models.registry.hasConfiguredAuth, which is the registry's view - the runtime's copy does not know the providers src/providers.mjs registered)",
 evidence: ["demo/providers.test.mjs", "demo/cli.test.mjs"] },
// The `--faux`/`--model` pair is the ONE place this harness decides WHO answers a run, so it gets its own
// row rather than hiding under the model-listing row above: pi never names `--faux` at all, and the rule has
// to say what happens when pi's model flag and pi-ai's scripted plane meet at OPEN.
 { capability: "the model a run answers with, and pi-ai's faux plane beside it", names: ["--model", "--provider", "--faux", "realModel"], status: "shimmed",
  reason: "ONE rule decides who answers: src/cli-intent.mjs sets `realModel = !opened.faux`, so pi-ai's faux plane answers ONLY a run that spells `--faux`. pi spells the answer's model at invocation in its own CLI tables (docs/cli.md:332-333: `| `--provider <provider>` | All | Resolve credentials for a provider |`, `| `--model <model>` | All | Resolve credentials from a model; may be combined with `--provider` |`), and the harness resolves those two spellings through pi's model plane (src/providers.mjs). pi names NO `--faux` verb anywhere - grep for `faux` over pi's pinned docs is 0 hits - so the row is a harness rule BESIDE pi's spellings, and it states what the two meeting means: BEFORE (measured, offline, no endpoint reached) `--mode rpc --model strata/qwen3.8-flash-next-iq3_s --faux probe` opened against pi's REAL provider plane while arming pi-ai's script beside it (get_state answered provider strata and the scripted reply never entered), i.e. a run that asked for the scripted plane could still reach an endpoint. AFTER, the same spelling is refused at OPEN in ONE sentence shared by both gates (src/providers.mjs' `fauxPlaneRefusal`, which src/rpc.mjs' per-switch `set_model` gate now calls too, so the open-time refusal and the in-session one cannot drift): `this run spelled --faux, so pi-ai's faux plane answers it; <provider>/<modelId> would reach pi's provider plane instead`. The refusal runs BEFORE the ownership claim and before any store open, so a refused run leaves NO store file and NO lock (measured: the run's `.pi-harness` directory stayed empty, the sqlite files absent), and the row surface prints the same sentence with child exit=1. The open-time check is deliberately STRICTER than pi's Models-plane prefix rule - under `--faux`, `--model` may only be a bare id, a `faux/` prefix, or `--provider faux` - so an invented model id is refused too rather than answered by a plane that does not know it. Evidence spells `--model <ref> ... --faux <reply>` in that order because `--faux` TAKES the scripted reply, so `--faux --model X` would swallow `--model` (this cost one measurement).",
  evidence: ["demo/modeldefault.test.mjs"] },
 { capability: "session identity flags", names: ["--session-id", "--session-dir", "--continue", "--resume", "-c", "-r", "--no-session"], status: "shimmed",
 reason: "pi addresses a session by a file-level id; pi-durable conversations are store-resident, so the harness names one with --conversation and takes the store's latest with --resume/--continue (demo/cli.test.mjs). pi's --session-dir (a directory of session FILES) is pi's --store here: one SQLite store per directory, opened once (src/core.mjs). pi's --no-session runs pi-durable's in-memory Session instead of a store (demo/core.test.mjs proves both backends)",
 evidence: "demo/cli.test.mjs" },
 { capability: "pi's own rendering and version flags", names: ["--tui-mode", "--verbose", "--no-refresh", "--version"], status: "shimmed",
 reason: "pi's --tui-mode/--verbose/--no-refresh steer pi's own print-mode renderer and package refresh, which pi-durable has no plane for (this harness's TUI is a separate surface on pi-tui components, rules shown headless in demo/tui.test.mjs); pi's -v/--version IS answered here: cli.mjs --version prints the pin and the declared plane from pi-main.pin.json and package.json on disk (\"pin v1.5.1 (dd30101cfc5b) - 10 @earendil-works packages declared\"), no network",
 evidence: "demo/tui.test.mjs" },
{ capability: "prompt template at invocation (--prompt-template)", names: ["--prompt-template"], status: "unsupported",
 reason: "pi runs a named template at INVOCATION; this harness has no such flag and no template-selection surface - a template reaches the model only through the INPUT seam (`/review focus`, which pi expands the same way)",
 evidence: null },
{ capability: "theme at invocation (--use-theme)", names: ["--use-theme"], status: "shimmed",
 reason: "pi picks a theme for the run with --use-theme <name[/name]>; this harness takes the theme from pi's own `theme` SETTING instead (docs/themes.md: the selection is saved as the `theme` setting) and applies the palette pi discovered for it, which is why a run in a directory with no theme discovered paints nothing rather than a default hue",
 evidence: "demo/cli.test.mjs" },
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
 reason: "pi lets an extension replace the in-TUI editor, feed its autocomplete providers and intercept terminal input; those are pi's input plane. The harness's TUI is a viewer that hands a submitted line to the writer CLI (demo/tui-interactive.mjs), so it has no extension-facing editor to replace and no way for a pi extension to add a provider - pi's own dock provider (the row below) is composed inside piDockOf() by the harness, not reachable through pi's extension context, and pi's `ui.onTerminalInput` interception stays unclaimed because pi-tui's own `ProcessTerminal` owns stdin on the pi-screen path",
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
 { capability: "pi's explicit resource paths at invocation (--extension/-e, --skill, --prompt-template; --theme refused)", names: ["--extension", "-e", "--skill", "--prompt-template", "--theme", "additionalSkillPaths", "additionalThemePaths", "additionalPromptTemplatePaths", "additionalExtensionPaths", "additionalResourcePaths"], status: "shimmed",
 reason: "an explicit path reaches pi's OWN loader under pi's OWN option names, at BOTH levels: src/packages/loader.mjs passes pi's `additional*Paths` to DefaultResourceLoader (demo/packages.test.mjs loads a fixture skill and prompt that way, and a missing path is reported rather than guessed), and cli.mjs honours pi's `--extension`/`-e <path>`, `--skill <path>` and `--prompt-template <path>` - repeatable, as pi's help says - by collecting them as `additionalResourcePaths` and forwarding them through src/cli-intent.mjs' harnessInvocation into src/agentplane.mjs, which spreads them into pi's loadPiResources options. No second discovery rule is written here: the run's own inventory then names what that path added (extensions 3 -> 4, commands 18 -> 19) and cli.mjs' `explicit:` line names the path, the extension it loaded and the command it registered (`/shouty`), with pi's own registration row for the source. What does NOT map is named below rather than folded in: pi's `--theme <path>` is REFUSED BY NAME because this harness applies only the palette pi discovered for pi's own `theme` SETTING (docs/themes.md), so an explicit theme path would load a palette no selection rule picks, and pi's `--skill`/`--theme` also DISABLE the DISCOVERED resources, while this harness keeps that set and opts kinds out through its own `--no-*` flags (row above)",
 evidence: ["demo/packages.test.mjs", "demo/cli.test.mjs"] },
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
 { capability: "pi's override/wrap of a tool pi already offers (pi's wrapRegisteredTool)", names: ["wrapRegisteredTool", "wrapRegisteredTools", "wrapTool", "wraps"], status: "shimmed",
 reason: "pi's docs say an extension may override a built-in tool, or wrap one for logging and access control without reimplementing the UI, and pi ships wrapRegisteredTool/wrapRegisteredTools for exactly that; pi-durable's Extension has a `wraps` slot whose wrapper RECEIVES the registration being wrapped, so the bridge turns a colliding pi registration into a wrap: pi's definition supplies the description, pi's prepareArguments repairs the arguments, and pi-durable's own registration stays the worker. The harness does NOT let pi replace pi-durable's execute - replacing the shell behind one name would change what the store's single mutation line does, and pi-durable's registry replaces by NAME rather than offering two tools called bash",
 evidence: "demo/packages.test.mjs" },
 { capability: "pi's offline mode", names: ["--offline"], status: "shimmed",
 reason: "scripts/sync-pi.mjs --offline reports drift as \"offline\" instead of asking upstream, and every demo in this repo runs offline (measured: strace -f -e trace=connect over the suite shows 0 AF_INET connects); what pi's --offline does NOT map onto is pi's own model-plane offline behaviour, since this harness answers turns with pi-ai's faux provider",
 evidence: "scripts/sync-pi.mjs" },
 { capability: "pi's CLI options this harness answers no branch for, refused BY NAME at the flag parser",
 names: ["--api-key", "--session-id", "--session-dir", "--fork", "--name", "-n", "--models", "--no-builtin-tools", "-nbt", "--no-mcp", "--theme", "--use-theme", "--export", "--verbose", "--tui-mode", "--approve", "-a", "--no-approve", "-na", "--offline"],
 status: "unsupported",
 reason: "MEASURED, not remembered: src/piflags.mjs reads pi's `Options:` table off pi's pinned dist/cli/args.js - 42 rows at this pin, spellings, value shapes and pi's own description words - and THROWS if that block, or pi's --mode/--print/--, stops shipping; cli.mjs' parseArgs answers one spelling per branch, and a spelling pi's table names that NO branch answered throws `pi flag <pi's own help line>; this harness does not take it - the capability matrix names it in docs/world/reference/package-support.md`. That is the ONLY place a pi flag could be swallowed into the prompt words, which is how a user loses a flag at the command line; a spelling pi's table does not name keeps the harness's own rejection (`unknown flag` for a long spelling, pi's own `Unknown option:` wording for a short one). The spellings named here are exactly the ones no branch answers at this pin, and each has its reason in the row above that names it: --api-key/--approve/-a/--no-approve/-na write credentials or trust project-local files; --session-id/--session-dir address pi's session FILES, answered here by --session/--conversation on the store and --store for the directory; --fork mints a forked session file; --name/-n labels a session; --models feeds pi's Ctrl+P cycling; --no-builtin-tools/-nbt and --no-mcp switch off planes this harness never loads; --theme <path> would load a palette while the run applies only pi's `theme` SETTING palette; --use-theme picks that selection through pi's settings dialog; --export writes pi's HTML renderer; --verbose overrides pi's quietStartup; --tui-mode chooses between pi's fullscreen and regular renderers (this screen composes pi-tui's own TuiAltScreen only); --offline skips pi's startup network operations, which this harness never runs (its ModelRuntime is created with allowModelNetwork:false and refreshOnCreate:false). demo/cli.test.mjs runs EVERY spelling named here and requires pi's own help words in the refusal, so a flag pi gains - or a flag this harness starts swallowing - turns the check and this row red instead of quietly changing what a run means",
 evidence: "demo/cli.test.mjs" },

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
 reason: "the harness renders through pi-tui's own components rather than owning terminal bytes: TuiMainScreen on ProcessTerminal paints the frame of rows src/tui/frame.mjs builds from pi-durable's entries (the ROW surface, kept reachable with --tui/--row-view), and pi-tui's truncation/width helpers measure what a row may occupy",
 evidence: ["demo/tui.test.mjs", "demo/tui-interactive.mjs"] },
 // ---- pi's interactive WINDOW: what `npm run cli` paints on a TTY by default ----
 // pi's interactive layer is dist/modes/interactive/{chat-viewport.js,components/*.js,theme/theme.js}, and
 // dist/index.d.ts at v1.5.1 re-exports the COMPONENTS and theme helpers but NOT the viewport factory, the
 // app-key table, the editor palette or the footer's data provider. A row below therefore says which piece
 // is pi's own export and which piece is re-derived from pi's exported parts, so a pin that exports the
 // missing piece turns the row false instead of leaving it true forever.
 { capability: "pi-tui's fullscreen screen and layout pieces (pi's window, not pi's row print)", names: ["TuiAltScreen", "ScrollView", "VStack", "Spacer", "Box"], status: "native",
 reason: "the default TTY surface is pi-tui's own fullscreen screen: cli.mjs mounts `new TuiAltScreen(new ProcessTerminal(), false, undefined)` and src/tui/piscreen.mjs's piScreen() hangs pi's composition off it - one ScrollView over the transcript document, two VStacks and pi-tui's Spacer, placed by pi's own verified rule (a Spacer before every CompactionEntry row, and before a UserEntry row only once pi-chat rows have already been appended) - so scrolling, shrinking and row allocation are pi-tui's code, not a harness layout. demo/piscreen.test.mjs asserts the clipping and the Spacer count against pi-tui's own painted bytes through pi's PUBLIC Terminal interface",
 evidence: ["demo/piscreen.test.mjs", "demo/pieditor.test.mjs", "demo/tty.test.mjs"] },
 { capability: "pi's chat viewport factory (the layout above, as pi spells it)", names: ["createChatViewport"], status: "shimmed",
 reason: "pi's window is built inside createChatViewport (dist/modes/interactive/chat-viewport.js), which dist/index.d.ts does NOT re-export at v1.5.1 - only the pieces it composes. piScreen() re-derives THAT shape from pi-tui's exported pieces (ScrollView {follow: end, primary: true, overscroll: chain, scrollbar}, dock VStack at pi's own shrink/minSize ladder, root VStack basis 0/grow 1 over a dock basis auto), and pi builds this ONCE per session, so the caller keeps the SAME document/status/footer containers and refills them in place - pi's scroll position lives INSIDE its ScrollView (followingEnd/currentScrollTop/transientScrollbarVisible, and dist/components/scroll-view.js throws on a second addChild/removeChild/clear), which is what keeps a view pi's altScreen keys scrolled across frames instead of restarting it; the claim is about pi's layout, not about a layout invented here; falsifiable: a pin that exports createChatViewport lets this row name it instead",
 evidence: ["demo/piscreen.test.mjs", "demo/tty.test.mjs"] },
 { capability: "pi's own message and tool components draw pi-durable's committed entries", names: ["UserMessageComponent", "AssistantMessageComponent", "ToolExecutionComponent", "CompactionSummaryMessageComponent", "SkillInvocationMessageComponent", "CustomMessageComponent", "updateArgs", "updateResult", "outputPad"], status: "native",
 reason: "all six are re-exported by dist/index.d.ts (dist/modes/interactive/components/index.ts) and the harness constructs them itself, one per pi-durable entry (src/tui/piscreen.mjs piEntryComponents): a pi.user entry becomes pi's UserMessageComponent (with pi's SkillInvocationMessageComponent ahead of it when the entry carries pi's own skill block), an assistant entry's pi-ai blocks become pi's AssistantMessageComponent plus one pi ToolExecutionComponent per toolCall, pi-durable's pi.tool_result entry becomes that component's own updateResult (pi's content, pi-durable's details, pi-ai's isError and timing), pi-durable's pi.compaction entry becomes pi's CompactionSummaryMessageComponent, and pi-durable's context-reset entry - which pi has no component for - becomes pi's CustomMessageComponent with pi-durable's own word rather than a harness marker. A RUNNING tool redraws through pi's updateArgs/updateResult(isPartial = true) driven from pi-durable's LiveState ToolSlot, and pi's outputPad keeps the output column pi's setting asks for",
 evidence: ["demo/piscreen.test.mjs", "demo/tty.test.mjs"] },
 { capability: "pi's in-TUI editor as the input dock", names: ["CustomEditor", "KeybindingsManager", "TUI_KEYBINDINGS", "addToHistory", "EditorOptions", "CustomEditorOptions"], status: "native",
 reason: "the dock is pi's own CustomEditor (dist/modes/interactive/components/custom-editor.d.ts) over pi-tui's exported KeybindingsManager and pi-tui's exported TUI_KEYBINDINGS table, so pi draws the caret, the bordered box, the draft history and pi's own keybinding hints, and pi's key TABLE decides what a keystroke means: demo/pieditor.test.mjs asserts ENTER reaches pi's onSubmit before any pi-durable submit happens, that a typed line is acked exactly once, that ESC is pi's cancel rather than a harness rule, and that pi's own up-arrow (`tui.editor.cursorUp`, whose default key is pi's own KeyId word `up` off dist/keys.d.ts) recalls the prompt just sent and resubmits it AS A NEW PROMPT: two ENTERs over the same words are TWO admissions, TWO requestIds and TWO committed `pi.user` rows, because pi treats every finished draft as a new prompt (dist/modes/interactive/interactive-mode.js `setupEditorSubmitHandler` calls `session.prompt(text)` once per ENTER), while pi's OWN `Editor.history` still holds the words exactly ONCE because pi's `addToHistory` skips a CONSECUTIVE duplicate - which is why the fallback requestId `src/tui/writer.mjs` invents names the SUBMISSION EVENT (`tui:` + pi-durable's own `process.pid` + a per-process counter, one fresh id per typed line this process sends) rather than the typed words: the text-derived key let pi-durable's exactly-once admission answer the recalled resubmission with the FIRST submission, so the recalled turn never happened and only ONE row landed (the measured symptom-4 bug); a caller that must resend ONE logical submission still hands over its own stable `requestId` and still gets the EXISTING submission back, which is what demo/tui and demo/cli count. pi's history state is reached only through pi's PUBLIC `addToHistory` (pi-tui dist/components/editor.d.ts, whose doc says \"Called after successful submission\") and pi's own `history` array: pi has NO history constructor option at this pin - pi's `EditorOptions` carries only `paddingX`/`autocompleteMaxVisible` and pi's `CustomEditorOptions` adds only `embedWorkingStatus`, so a `{ history }` ctor arg is silently DROPPED by pi (measured: up-arrow over a store that already had committed prompts answered `status=nothing was typed`, because pi's `history` stayed empty and pi's `navigateHistory` returns) - which is why src/tui/pidockloop.mjs seeds pi's committed `pi.user` prompts and pushes every submitted draft through pi's method rather than through an argument it does not have; pi's own `historyIndex = -1` (not browsing), `historyDraft` capture/restore and 100-entry cap are pi's code, untouched here",
 evidence: ["demo/pieditor.test.mjs", "demo/tty.test.mjs", "demo/pieditor-interactive.mjs", "demo/recall.test.mjs"] },
 { capability: "pi's prompt-history recall at the harness's OWN row overlay (the row surface is this harness's input machine, not pi's Editor)", names: ["addToHistory", "tui.editor.cursorUp", "tui.editor.cursorDown", "PI_HISTORY_LIMIT", "historyDraft"], status: "shimmed",
 reason: "the ROW surface (--tui/--row-view) keeps this harness's own one-line OVERLAY (src/tui/viewmode.mjs, whose header names its original and ROADMAP 99's remember-the-view-under rule), which is not pi's `Editor`, so pi's history MACHINERY cannot serve it and its rules are spelled here in pi's own words: pi's `addToHistory` body (trim, skip empty, skip a consecutive duplicate, `unshift` so index 0 is NEWEST, cap at pi's own 100 - exported as `PI_HISTORY_LIMIT`), pi's `historyIndex = -1` not-browsing state, pi's `navigateHistory(direction)` arithmetic (`newIndex = historyIndex - direction`, up is -1 so up DEEPENS, out-of-range refused, pi's `historyDraft` captured when browsing first starts and restored back at -1), and pi leaving browsing on submit and on setText. pi's KEY, however, IS pi-tui's export and is taken as pi spells it: src/tui/driver.mjs matches pi's own `Key.up`/`Key.down` (the KeyId words pi's `tui.editor.cursorUp`/`cursorDown` default to) through pi-tui's exported `matchesKey`, never a hand-decoded `\\x1b[A`, and an arrow over a non-empty non-browsing line is pi's cursor MOVE, which on a one-line overlay marks a repaint and types NOTHING - the measured bug it used to have was escape bytes landing inside the prompt. Two measured row-surface divergences pi's own key machine caused are fixed in the same place, and named rather than hidden: this harness's headless rule claimed a bare `r` on an empty line as REFRESH, which ate the first letter of a real terminal's prompt (measured: `remember the number seven` reached the agent as `emember the number seven`), so `refreshOnBareR` keeps that answer only for the scripted/headless demos and a real terminal refreshes through pi's own `Key.ctrl(\"r\")` - the same split `quitOnBareQ` already draws for `q`; and pi-ai's faux plane answers from a QUEUE, so a `--faux` session now arms one scripted reply PER ADMISSION (the print path and the pi-style screen already did), without which a second prompt in one row-surface session answered `status=unanswered`",
 evidence: ["demo/recall.test.mjs", "demo/tui.test.mjs", "demo/cli.test.mjs", "demo/tty.test.mjs"] },
 { capability: "pi-tui's dialogs and layout pieces this harness does not compose (the window uses the rows above)", names: ["HStack", "Markdown", "Image", "Input", "Editor", "SelectList", "SettingsList", "Loader", "CancellableLoader", "MouseRegion", "Focusable"], status: "unsupported",
 reason: "pi-tui's plain `Editor`, its dialogs, loaders, mouse region, focus and layout boxes that pi's own in-TUI editors and selectors use; the harness composes pi's `CustomEditor` (row above) rather than pi-tui's plain `Editor`, pi-durable has no dialog, selection or settings-list state for the rest to present at this pin, and there is no image plane here, so pi's `Image` component never has content to draw (pi's message components render markdown through their own internal renderers, which the harness never constructs directly)",
 evidence: null },
 { capability: "pi's app-key defaults for the dock (the keystrokes that cancel, clear and exit)", names: ["APP_KEYBINDINGS", "app.interrupt", "app.exit", "app.clear"], status: "shimmed",
 reason: "pi declares its app-key table as `declare const APP_KEYBINDINGS` in dist/core/keybindings.d.ts, which dist/index.d.ts does NOT re-export at v1.5.1 and whose runtime module dist/core/keybindings.js is not in the package's exports map either, so src/tui/piscreen.mjs's piAppKeyDefaults() READS pi's table (key names, default keys and descriptions) off pi's pinned declaration file on this machine - and throws if a pin stops declaring it - instead of retyping pi's keys here; only the three dock actions the harness claims are taken, so pi's `app.suspend`, `app.thinking.cycle`, `app.thinking.save` and `app.model.cycleForward` stay unclaimed and the cycling that would use them is named below",
 evidence: ["demo/pieditor.test.mjs", "demo/tty.test.mjs"] },
 { capability: "pi's theme palette as the harness paints it (no hue typed here)", names: ["getEditorTheme", "getMarkdownTheme", "getSelectListTheme", "initTheme", "Theme"], status: "shimmed",
 reason: "pi's colours are pi's palette, read from pi's own plane: `initTheme()`, `getMarkdownTheme()`, `getSelectListTheme()` and pi's `Theme` class ARE re-exported at v1.5.1 and are called directly, but pi's editor palette `getEditorTheme()` and pi's `theme` proxy are NOT root-exported at this pin, so piEditorTheme() re-derives pi's own two fields ({ borderColor: pi's `borderMuted` token through pi's installed palette, selectList: pi's `getSelectListTheme()` }) and piColour() reads pi's installed palette off the two global slots pi's own proxy reads; installPiTheme() builds pi's `Theme` from the record pi's resource loader discovered because pi's internal loadTheme cannot reach a package theme at this pin, and no hex literal or ANSI number is typed in src/tui/piscreen.mjs",
 evidence: ["demo/piscreen.test.mjs", "demo/tty.test.mjs"] },
 { capability: "pi's footer line, fed by pi-durable's committed usage instead of pi's AgentSession", names: ["FooterComponent", "setAutoCompactEnabled", "calculateContextTokens"], status: "native",
 reason: "piFooterOf() hands pi's exported FooterComponent pi's own field ladder - state.{model, thinkingLevel}, sessionManager.{getEntryCount, getSessionId, getLeafId, getEntries, getCwd, getSessionName}, getContextUsage(), modelRuntime.isUsingSubscription and routedModel - and every value is pi-durable's: entry count, leaf id, entries and cwd from the read that opened this conversation, pi-ai's calculateContextTokens over pi-durable's committed usage records, and pi's ModelRecord context window. pi's own totals read pi's OWN entry shapes, which are not pi-durable's EntryRecords, so the entries are handed over through piSessionEntriesOf() - a read-only shape mapper that turns pi-durable's newest-first page into pi's oldest-first `{type: \"message\"}` rows carrying pi-durable's own `usage` records (plus a `{type: \"compaction\"}` row with no usage, since pi-durable files summarization spend in its own `pi.usage` ledger): pi's ↓/↑ token words, its R/W cache words and its CH cache-hit rate are therefore pi-durable's committed numbers, and demo/tty.test.mjs asserts those words as painted inside an allocated terminal; setAutoCompactEnabled is pi's own FooterComponent method carrying pi-durable's compaction switch, so pi's `(auto)` marker is absent exactly when pi's settings say compaction is off, and pi-durable keeps no session name so pi omits that part rather than inventing one",
 evidence: ["demo/piscreen.test.mjs", "demo/tty.test.mjs"] },
 { capability: "pi's footer data provider (branch and provider count for the footer above)", names: ["FooterDataProvider", "getGitBranch", "getAvailableProviderCount", "getExtensionStatuses"], status: "shimmed",
 reason: "pi's FooterDataProvider class is declared in dist/core/footer-data-provider.d.ts but not re-exported at v1.5.1, and pi's FooterComponent only needs the read-only Pick of it, so the same method names are handed over as a plain object built by piGitBranchOf(): getGitBranch() answers piGitBranchOf(cwd), which reads the run cwd's own `.git/HEAD` with node:fs (no shell, null when the cwd is not a repository), src/tui/pidockloop.mjs feeds that answer into piFooterOf, and pi's own footer.js appends ` (${branch})` after the cwd - demo/tty.test.mjs asserts that pair as painted, at the repo cwd, inside an allocated pty; getAvailableProviderCount() counts pi's providers, and getExtensionStatuses() answers an empty Map because this plane reports no extension statuses, which is pi's own way of drawing no per-extension line",
 evidence: ["demo/piscreen.test.mjs", "demo/tty.test.mjs"] },
 { capability: "pi's startup header plus the pi-durable session marker and the store URL this run opened", names: ["keyHint", "CURRENT_SESSION_VERSION"], status: "shimmed",
 reason: "pi assembles its header inside pi's InteractiveMode, which is not composed here, so the harness paints pi's exported pieces: pi's own CURRENT_SESSION_VERSION inside pi-tui's `Box`, the model line off pi's ModelRecord, the packages/skills/templates this run's plane discovered, and pi's exported keyHint() over pi-tui's keybinding names - plus the two lines that make this run distinguishable: pi-durable's marker `pi-durable session (this harness's <backend> store, not a pi session)` and the store spelled with node:url's pathToFileURL over the resolved path, the same absolute path pi-durable's ONE storage opener gets (src/core.mjs calls openNodeSqliteStorage(resolve(storePath))), since pi-durable exposes no storage URL accessor at this pin and no scheme is typed here; a --no-session run says the state is in memory instead of pointing at a file it never wrote",
 evidence: ["demo/pieditor.test.mjs", "demo/tty.test.mjs", "demo/piscreen.test.mjs"] },
 { capability: "pi's own logo/onboarding header and its animated border", names: ["BuiltInHeader", "shouldShowStartupHeader", "supportsPiLogo", "piWordmark", "DynamicBorder"], status: "unsupported",
 reason: "BuiltInHeader, shouldShowStartupHeader, supportsPiLogo and piWordmark are private to pi's bundled interactive-mode chunk (dist/modes/interactive/interactive-mode.js) and are not re-exported at v1.5.1, so the harness paints pi's exported pieces (row above) rather than pi's logo and onboarding text; pi's DynamicBorder IS re-exported at this pin but is not composed here - the header's box is pi-tui's `Box` rules",
 evidence: null },
 { capability: "pi's animated status indicators and its program status reporter", names: ["IdleStatus", "WorkingStatusIndicator", "WorkingIndicatorOptions", "setWorkingIndicator", "setEditorWorkingStatusIndicator", "isEmbeddedStatus", "ProgramStatusReporter"], status: "unsupported",
 reason: "pi animates working/compaction/retry indicators inside pi's InteractiveMode (IdleStatus and WorkingStatusIndicator in dist/modes/interactive/components/status-indicator.d.ts, WorkingIndicatorOptions as pi's extension-facing type, setWorkingIndicator and setEditorWorkingStatusIndicator as pi's private interactive-mode methods, isEmbeddedStatus as pi's private editor probe) and reports program status through ProgramStatusReporter; this screen draws pi-durable's LiveState as pi Text rows instead (piStatusRows: pi-durable's throttled generation.message, then one row per pi-durable ToolSlot with pi-durable's own status word) and installs no indicator object into pi's editor. THE HARNESS'S OWN STATUS/METADATA LINES are pi-durable's words and they are painted as their OWN rows in pi's TRANSCRIPT region while the window is open, never over the dock: src/tui/pidockloop.mjs' notes/say hands every such line to piNoteRows (src/tui/piscreen.mjs), one pi `Text` per line, so pi's width handling does ALL the splitting - pi's own `wrapTextWithAnsi(normalizedText, contentWidth)` plus pi's `wrapSingleLine`/`breakLongWord` (pi-tui dist/utils.d.ts:56 exports wrapTextWithAnsi; dist/components/text.js breaks a token longer than the width character by character) - so `submitted: requestId=... submissionId=... status=...`, a `model: set_model: ...` line and a refusal line each take as many rows as pi's width handling needs and NO painted row is wider than the terminal, while pi's bordered dock/draft rows stay whole (measured at a 44x26 pty: the ack and the `model:`/`get_available_models:` lines own rows 5-19, pi broke `.../131`+`072/true` mid-token, dock borders stayed at rows 20 and 26, widest painted row 44). Raw stderr writes stay ONLY for runs with no window open (print/JSON/RPC/headless), measured byte-for-byte against the same run before the change (459 bytes each, diff identical modulo ids)",
 evidence: ["demo/piscreen.test.mjs", "demo/tty.test.mjs"] },
 { capability: "pi's interactive driver and its selector dialogs (re-exported at v1.5.1, but nothing here drives them)", names: ["InteractiveMode", "AgentSessionRuntime", "LoginDialogComponent", "OAuthSelectorComponent", "ModelSelectorComponent", "ThinkingSelectorComponent", "SessionSelectorComponent", "TreeSelectorComponent", "ShowImagesSelectorComponent", "SettingsSelectorComponent", "UserMessageSelectorComponent"], status: "unsupported",
 reason: "all of these ARE re-exported by dist/index.d.ts at v1.5.1 - pi's InteractiveMode and its AgentSessionRuntime own pi's own in-TUI loop - but composing them would ask this harness to run pi's agent loop, write credentials for /login and /logout, switch or fork pi's session files, switch a session tree, or hold pi's one AgentState model and thinking level per conversation; this run's state is pi-durable's Conversation of EntryRecords admitted by pi-durable's own rules and routed by pi-durable's own backend, so those dialogs have nothing to drive",
 evidence: null },
 { capability: "pi's editor autocomplete dropdown over pi's commands, templates and skills", names: ["AutocompleteProviderFactory", "CombinedAutocompleteProvider", "autocompleteMaxVisible", "setAutocompleteProvider", "fuzzyFilter"], status: "shimmed",
 reason: "HONOURED at pi's OWN dock: src/tui/piscreen.mjs' piDockOf() installs the provider through pi's PUBLIC Editor.setAutocompleteProvider (which is what pi's own setupAutocompleteProvider() calls; pi's EditorOptions at this pin carry only paddingX/autocompleteMaxVisible, so the provider is NOT a constructor option) over pi-tui's exported CombinedAutocompleteProvider, and pi's slash-trigger rule (handleInput tries autocomplete once `/` starts a line) is pi's OWN hardcoded rule in Editor.handleInput, so no trigger character is spelled here. pi's visible count comes from pi's OWN SettingsManager.getAutocompleteMaxVisible() for the run cwd (docs/settings.md: 5, clamped by pi's Editor to 3..20), which pi's Editor reports back through getAutocompleteMaxVisible(). The command list is pi's recipe (pi's createBaseAutocompleteProvider) fed by pi's OWN data: pi's builtin slash table as pi's SlashCommand entries, pi's discovered prompt templates and `skill:` rows (gated on pi's SettingsManager.getEnableSkillCommands(), pi's default true) with pi's own `[tag]` source prefix from pi's private InteractiveMode prototype helpers (called with `this` hand-carried, so no pi instance is composed - the helpers THROW rather than paraphrase if a pin drops them), pi's package extension commands minus pi's builtin names (labelled with what THIS harness does with each), and pi's `model`/`thinking` ARGUMENT menus answered from pi-durable's own get_available_models/get_available_thinking_levels through pi-tui's exported fuzzyFilter with pi's OWN model search text (pi's dist model-search.js, imported by file URL from pi's own package entry, since pi's exports map lists only the package root and ./rpc-entry and copying the formula would reimplement pi's ranking rule). What pi offers and this harness still REFUSES BY NAME: pi's file-path completion (fdPath is handed as null, measured: getSuggestions(['@x'],0,2) and ['@'],0,1 and ['.'],0,2 answer no items while ['/mo'],0,3 answers pi's command item, so pi's file items are genuinely not offered, not hidden), pi's `login` argument menu (this harness writes no credentials, so pi's provider options list is empty), and pi's ModelSelectorComponent dialog that bare `/model` would open (a row above). `AutocompleteProviderFactory` stays named-not-used: pi-coding-agent's dist/index.d.ts:8 exports it as a TYPE (`type AutocompleteProviderFactory`) - pi's extension-facing shape for wrapping this provider - and no pi extension reaches it here, since pi's extension UI plane (the row above: ui.addAutocompleteProvider) is a different, still-unsupported capability.",
 evidence: ["demo/autocomplete.test.mjs", "demo/pieditor.test.mjs", "demo/piscreen.test.mjs"] },
 { capability: "pi's extension dialog subprotocol (RPC UI)", names: ["extension_ui_request", "extension_ui_response", "ExtensionUIContext", "select", "confirm", "input", "editor", "notify", "set_editor_text"], status: "unsupported",
 reason: "pi's extensions open dialogs over a separate RPC subprotocol - a request record, a host that renders it, and an ExtensionUIContext that answers; this harness's RPC session has no UI channel and pi-durable has no dialog plane at this pin, so a bridged extension that calls ctx.ui throws, loudly, rather than hanging on a dialog nothing renders",
 evidence: null },
 // ---- pi's SLASH-COMMAND surface: what a typed draft that starts with `/` or `!` MEANS ----
 // pi dispatches these inside its own editor submit handler (dist/modes/interactive/interactive-mode.js
 // `setupEditorSubmitHandler`), which is private to pi's InteractiveMode and so not composed here (row
 // above). What IS shipped at this pin is the DATA pi dispatches from: pi's builtin table
// (`BUILTIN_SLASH_COMMANDS` in dist/core/slash-commands.js, declared in dist/core/slash-commands.d.ts),
 // pi's EXACT-vs-`/name <args>` match rule (spelled as `text === "/name"` / `text.startsWith("/name ")`
 // in that submit handler) and pi's built-in extension registrations. src/slashplane.mjs READS all three
 // off pi's pinned dist - and throws if a pin stops shipping them - rather than remembering a list, so a
 // row below is falsifiable against a pin that changes pi's command surface.
 {
  capability: "pi's slash commands dispatched at pi's own dock, honoured where pi-durable has state",
  names: ["/new", "/model", "/thinking", "/compact", "/session", "/copy", "/tree", "/clone"],
  status: "shimmed",
  reason: "ONE policy module answers the question for BOTH surfaces - src/slashplane.mjs is asked by pi's own dock (src/tui/pidockloop.mjs) and by the row surface (cli.mjs' writerTui), so a slash line cannot mean one thing in pi's window and another in the row view. The rules are pi's, read off pi's pinned dist (pi's builtin table, pi's derived EXACT-vs-prefix match rule, pi's `!`/`!!` bash rule); what this harness honours, it honours by calling pi-durable's EXISTING verbs through the ONE command handler src/rpc.mjs exports (`new_session`, `set_model` split at pi's first `/`, `set_thinking_level`, `compact`, `get_session_stats` + `get_state`, `get_last_assistant_text`, `get_tree`, `clone`) - nothing here reimplements a verb. BARE `/model` is HONOURED too: it answers pi-durable's EXISTING `get_available_models` verb (pi's own model-listing answer, so the candidate list is pi's model plane's list, with pi's own `argumentHint` `<provider/model>` printed from pi's builtin table) rather than refusing for a missing argument - what stays refused BY NAME is pi's `ModelSelectorComponent` dialog itself (row above), which nothing here drives. `/model <ref>` writes the conversation's own Agent.model through pi-durable's `configure()`, and rpc.mjs' gate refuses a ref pi's own Models plane does not know BEFORE configure() writes it: MEASURED at this pin with the pty helper, an unknown ModelRef leaves the NEXT prompt with NO answer at all and nothing painted, so a silent switch would be a lie; a `--faux` run is likewise refused for a non-faux ref because src/cli-intent.mjs' ONE rule says pi-ai's faux plane answers it. A decision pi-durable RAN (`ran`) or that pi-durable acted on (`quit`) still clears the draft with pi's OWN rule (`clearEditor()`: editor setText to empty and nothing else), but a draft pi-durable could NOT run - a refusal BY NAME - is handed BACK to pi's Editor through pi's PUBLIC `setText` (pi-tui dist/components/editor.js:928), because pi-tui's own `submitValue()` (:1145) empties the state BEFORE `onSubmit` runs, and pi's OWN precedent for a command it could not run is to keep the typed text: interactive-mode.js:2798-2799 (`showWarning(\"A bash command is already running. Press Esc to cancel it first.\"); this.editor.setText(text);`) and pi's `showExtensionCustom` save-and-restore (:2415 `const savedText = this.editor.getExpandedText?.() ?? this.editor.getText();`, :2423 `const restoreEditor = () => {`, :2427 `this.editor.setText(savedText);`). MEASURED at a 44x26 pty: `/goal keep going` paints pi-durable's BY-NAME refusal over 7 rows and still sits BETWEEN pi's dock borders on the following frame, and the longer `/goal keep going until the offline fixtures pass` is wrapped by pi's Editor itself into a TWO-ROW dock draft (`/goal keep going until the offline` then `fixtures pass`) - no painted row exceeds the 44-column terminal and the store gains NO `pi.user` row for either. pi's own Esc rule (onEscape -> cancel -> setText(\"\")) clears a kept draft, which is what a human uses to drop one, so a scripted run types pi's Esc between refused drafts. The refusal never reaches `submitDraft`, so no admission happens and `writerSubmit` stays the ONE mutation line; the refusal WORDING is unchanged pi-durable wording, split only by pi's wrapping",
  evidence: ["demo/slash.test.mjs", "demo/pieditor.test.mjs"],
 },
 {
  capability: "pi's /quit leaves the session through the ordinary cleanup",
  names: ["/quit"],
  status: "native",
  reason: "pi's /quit rule is `clearEditor()` then leave, and pi's own entry for it is the template literal `Quit ${APP_NAME}` over pi's `APP_NAME` (dist/config.js reads pi's `pkg.piConfig?.name` with a fallback string, and pi's package declares no name, so pi says pi itself), so the words printed here are pi's own rather than a typed sentence. Nothing is submitted - the draft is cleared and the dock loop returns, so the caller's ordinary cleanup runs: settle what was queued, close the Harness, release the writer claim. A whole typed line of `quit`/`exit`/`q` still leaves the same way (pi-durable's own quit-word rule), and the dock's tally records WHY it left so the exit is visible rather than inferred",
  evidence: "demo/slash.test.mjs",
 },
 {
  capability: "pi's `!bash` / `!!bash` input at the dock",
  names: ["!bash", "!!bash"],
  status: "native",
  reason: "measured at this pin rather than assumed: rpc.mjs already answers pi's `bash` verb over pi-durable's own NodeExecutionEnv (`makeEnv({ cwd })`, confinement pi-durable's) and queues the output as follow-up input exactly as rpc-commands.md documents (\"Included bash output reaches the model on the next prompt, not immediately\"), so the dock HONOURES `!cmd` and maps pi's `!!cmd` onto that verb's `excludeFromContext` flag; the queued submission id lands on parts.settlements, the same list cli.mjs' settleInvocation waits on, so the queueing process reaches an answer before it closes rather than parking input in pi.inbox",
  evidence: "demo/slash.test.mjs",
 },
 {
  capability: "pi's built-in slash commands this harness cannot honour, refused BY NAME in pi's own words",
  names: ["/settings", "/scoped-models", "/export", "/import", "/share", "/bug", "/name", "/changelog", "/hotkeys", "/trust", "/login", "/logout", "/resume", "/reload"],
  status: "unsupported",
  reason: "each is refused, not swallowed and not guessed at: the line printed is pi's OWN `description` string for that name, read off pi's pinned builtin table, followed by the plane this harness has none of (pi's in-TUI selectors and dialogs, pi's session FILES, credentials for /login and /logout, pi's changelog/trust/keybinding reload). The refusal therefore says what the command does in pi and what this store is, in pi's words plus this repo's, and nothing here invents pi's wording; the command names are named in docs/world/reference/package-support.md rather than silently dropped, which is what keeps the row falsifiable if a later pin gains the concept",
  evidence: "demo/slash.test.mjs",
 },
 {
  capability: "pi's /fork is refused BY NAME: pi's dock matches it EXACTLY only and opens its own selector",
  names: ["/fork"],
  status: "unsupported",
  reason: "MEASURED from pi's OWN submit handler rather than assumed: pi matches `/fork` EXACTLY only (`text === \"/fork\"`; the names that take arguments at pi's dock are only model, thinking, export, import, bug, name, login, compact), so `/fork 2` is not a command at pi's dock and pi submits it as a message - and the EXACT form opens pi's own message selector, a UI this harness does not compose (row above). So `/fork` moves OUT of the honoured set: the refusal prints pi's own `description` for it, pi's words for what it asks for, and pi-durable's candidate EntryIds through pi-durable's EXISTING `get_fork_messages` verb, so the refusal is actionable rather than a dead end. The fork itself still exists where pi-durable has it: pi's RPC `fork` verb (row above) is answered on pi-durable's conversation plane, and this harness's `--fork` flag is its own row - what does not map is opening pi's selector at the dock",
  evidence: "demo/slash.test.mjs",
 },
 {
  capability: "pi's built-in EXTENSION slash commands (registered by pi's own built-in extensions)",
  names: ["/llama", "/mcp"],
  status: "unsupported",
  reason: "these are not in pi's builtin table: pi's own built-in extension modules register them (`pi.registerCommand(name, { description })` in dist/extensions/llama/index.js and dist/extensions/mcp/index.js), and src/slashplane.mjs finds them by scanning pi's built-in extension modules for that registration, so the refusal carries pi's description AND names the module that registers it. This harness loads none of pi's built-in extensions - it loads the pi PACKAGES found on disk (row above) - so the commands those modules would register have nothing to run",
  evidence: "demo/slash.test.mjs",
 },
 {
  capability: "pi's package-plane commands discovered for this cwd, refused BY NAME at the dock",
  names: ["/deepinfra-billing", "/look-pack", "/goal", "/sisyphus", "/goal-cancel", "/goal-direct", "/sisyphus-direct", "/goal-list", "/goal-status", "/goal-refresh", "/goal-recovery", "/goal-focus", "/goal-unfocus", "/goal-settings", "/goal-tweak", "/goal-clear", "/goal-pause", "/goal-resume"],
  status: "unsupported",
  reason: "the commands the pi packages THIS cwd discovered register (pi-durable's own `get_commands` answers them with pi's source tag extension and its invocation tag unsupported) are refused at the dock with src/promptplane.mjs' existing reason - pi invokes this command inside pi's CLI (a slash command with its own arguments and completion behavior) - so the wording stays pi-durable's package plane's rather than a paraphrase, and the matrix names every one of them as measured on THIS machine rather than as a remembered list",
  evidence: "demo/slash.test.mjs",
 },
 {
  capability: "pi's unknown `/name` and pi's template/skill command names keep pi's Normal message submission",
  names: ["/skill:name"],
  status: "shimmed",
  reason: "pi's fallthrough branch - a name its builtin table does not list is submitted as a normal message, and pi's skill commands and prompt templates are expanded at the input seam (docs/extensions.md: input is checked for extension commands first, then skill commands, then prompt templates) - so src/slashplane.mjs returns `fallthrough` for those names and the caller submits the draft through the ONE seam src/cli-intent.mjs' expandRunInput exposes, which is what keeps pi's `/skill:name` expansion (row above) alive at the dock rather than shadowing it with a refusal",
  evidence: ["demo/slash.test.mjs", "demo/cli.test.mjs"],
 },
 {
  capability: "pi's prompt-template and /skill:name expansion at the pi-style dock",
  names: ["/template", "/skill", "expandRunInput", "expandPromptTemplate", "_expandSkillCommand"],
  status: "shimmed",
  reason: "pi expands BOTH kinds before the text enters the agent (docs/prompt-templates.md: 'Pi expands the template before the resulting text enters the agent'; dist/core/agent-session.js runs `_expandSkillCommand` then `expandPromptTemplate` and returns `prompt: expandedText`), so the dock submits src/slashplane.mjs' `expanded` — pi's OWN expansion reached through src/cli-intent.mjs' `expandRunInput` — and says so in the same sentence the print path and the row surface print; pi's HISTORY keeps the TYPED draft (pi calls `this.editor.addToHistory?.(text)` with the unexpanded text before `session.prompt(text)` expands it, interactive-mode.js:2827/2839), so piAddToHistory stays raw. BEFORE this row: the expansion was computed only to look for a refusal and the expanded text was DISCARDED, so `/review concurrency` reached the agent as the literal name; AFTER, the committed row is 'Review the staged changes. Focus on concurrency. All args: concurrency' and the skill draft enters as pi's OWN <skill name=...> block with the args appended, while pi's history machine still holds both typed drafts newest-first",
  evidence: ["demo/pieditor.test.mjs", "demo/slash.test.mjs"],
 },
 {
  capability: "pi's /help is NOT a pi builtin at this pin, so answering it is a HARNESS ADDITION",
  names: ["/help"],
  status: "shimmed",
  reason: "pi does not ship a `/help` name at v1.5.1 - it is absent from BUILTIN_SLASH_COMMANDS and from pi's own slash-commands.md, and pi's command menu is its editor autocomplete dropdown (row above: not composed here) - so the harness answers `/help` as its own addition, labelled as such in this row rather than passed off as pi's: the menu it prints is pi's own data (pi's builtin table, pi's built-in extension registrations, and pi's discovered package commands) each labelled with what THIS harness does with it, and no description is written by hand here",
  evidence: "demo/slash.test.mjs",
 },
 {
  capability: "pi's editor keybinding actions at pi's own dock",
  names: ["tui.editor.historyPrevious", "tui.editor.historyNext", "tui.editor.cursorLeft", "tui.editor.cursorRight", "tui.editor.cursorWordLeft", "tui.editor.cursorWordRight", "tui.editor.cursorLineStart", "tui.editor.cursorLineEnd", "tui.editor.jumpForward", "tui.editor.jumpBackward", "tui.editor.pageUp", "tui.editor.pageDown", "tui.editor.deleteCharBackward", "tui.editor.deleteCharForward", "tui.editor.deleteWordBackward", "tui.editor.deleteWordForward", "tui.editor.deleteToLineStart", "tui.editor.deleteToLineEnd", "tui.editor.yank", "tui.editor.yankPop", "tui.editor.undo"],
  status: "native",
  reason: "piDockOf hands pi's Editor a `KeybindingsManager` built from pi's OWN exported `TUI_KEYBINDINGS`, so every id in pi's registry is bound at THIS dock (measured: `getKeys(id)` at the dock equals pi's own `getKeybindings()` registry answer for all 47 `tui.*` ids, 41 of them carrying pi's key words and 6 answering `[]`, and pi's matcher attributes the typed bytes to them); pi's Editor then decides the meaning: from the draft `alpha beta gamma` pi's deleteWordBackward leaves `alpha beta `, pi's deleteToLineStart leaves ``, pi's cursorLineStart + deleteCharForward leave `lpha beta gamma`, pi's yank restores after a delete, and pi's undo reverts the typed draft. pi's OWN rule for the delete pair is pi-tui's Editor branch `if (kb.matches(data, \"tui.editor.deleteToLineEnd\")) this.deleteToEndOfLine();` (pi-tui dist/components/editor.js:661-662), whose body (:1393) deletes `currentLine.slice(this.state.cursorCol)` - CARET to END OF LINE, leaving the words before the caret ALONE (measured AT A REAL PTY in demo/keybindings.test.mjs: typing `keep drop`, FIVE pi cursorLeft keystrokes, then pi's ctrl+k paints the row `keep` and NO row in that segment carries pi's `drop`; typing `draft hello world`, pi's ctrl+line-start, then pi's ctrl+k paints NO row carrying pi's typed words, pi's ENTER then answers `submitted: requestId=undefined submissionId=undefined status=nothing  was typed`, and over that whole run the store's ONLY pi.user text - read back through src/readapi.mjs' ONE opener - is pi's `keep`). The harness's dock hint row for that id now uses pi's OWN exported `keyHint` wording - pi's dock hint line reads `keyHint(\"tui.editor.deleteToLineEnd\", \"to delete to end\")` (pi-coding-agent dist/modes/interactive/interactive-mode.js:766) and pi's docs/keybindings.md:79 spells the same id as `Delete to line end` - and piStatusRows paints a hint row ONLY when pi's exported `keyText(word)` answers a non-empty key, so an action pi binds no key to contributes NO row rather than a false hint (measured in demo/keybindings.test.mjs: pi's `keyText` answers `ctrl+k` for pi's bound id and the empty string for `tui.editor.historyPrevious` and `tui.altScreen.lineUp`, and the rows piStatusRows paints for [that bound id PLUS those two unbound ids] are EXACTLY the rows it paints for [the bound id alone], pi's own `keyHint` spelling `ctrl+k to delete to end`); the stale label `ctrl+k to clear the draft` named neither pi's words nor a true action (pi's ctrl+k leaves the text before the caret, not an empty draft), and `src/tui/piscreen.mjs` now carries `piDockHints` as the list of actions this dock actually handles. pi binds NO default key for `tui.editor.historyPrevious`/`tui.editor.historyNext` at this pin (measured: pi's table carries `defaultKeys` [] and `getKeys` answers []), and this dock's editor is one line, so pi's `pageUp`/`pageDown` and the `jump` pair have nothing to page or jump here - named, not dropped.",
  evidence: "demo/keybindings.test.mjs",
 },
 {
  capability: "pi's input keybinding actions at pi's own dock (newline, submit, autocomplete trigger)",
  names: ["tui.input.newLine", "tui.input.submit", "tui.input.tab"],
  status: "native",
  reason: "same manager as the row above: pi's `newLine` appends a line to the draft, pi's `submit` empties it and fires pi's `onSubmit` (which src/tui/pidockloop.mjs listens to), and pi's `tab` is pi's OWN autocomplete trigger, measured in demo/autocomplete.test.mjs; no key name is spelled here - pi's table and pi's matcher decide which bytes mean which action.",
  evidence: ["demo/keybindings.test.mjs", "demo/autocomplete.test.mjs"],
 },
 {
  capability: "pi's select-list keybinding actions (no select list is composed here)",
  names: ["tui.select.up", "tui.select.down", "tui.select.pageUp", "tui.select.pageDown", "tui.select.confirm", "tui.select.cancel"],
  status: "unsupported",
  reason: "these ids belong to pi-tui's `SelectList` component, which this harness does not compose (row above names it as not composed); pi's registry still BINDS them in the global table (measured: pi's matcher attributes up/down/pageUp/pageDown/enter/escape to them at the dock's manager), but no component here reads a selection, so no selection moves. pi's `/model` candidate list and pi's dropdown are pi's autocomplete dropdown printed as rows, not pi's SelectList, so pi's enter-on-selection rule has nothing to confirm here.",
  evidence: "demo/keybindings.test.mjs",
 },
 {
  capability: "pi's selection-copy keybinding (ctrl+c at the dock is pi's clear/exit key, not copy)",
  names: ["tui.input.copy"],
  status: "unsupported",
  reason: "pi's OWN Editor declines to act on the id and returns - the branch carries pi's comment 'Ctrl+C - let parent handle (exit/clear)' in pi-tui's dist/components/editor.js - so the byte goes to pi's app level, which THIS dock claims as pi's `app.clear` (measured: pi's matcher answers tui.input.copy, tui.select.cancel and app.clear for 0x03 at this dock, and src/tui/pidockloop.mjs registers pi's double-tap clear/exit handler). The copy pi really offers at this screen is pi's `TuiAltScreen` text-selection copy, option `copyOnSelect` (default true, pi's release path writes pi's OSC 52 sequence and flashes pi's own 'Copied!'): measured at a pty, feeding pi's mouse press and release byte forms painted NO 'Copied!' and wrote no OSC 52 record in the capture, so nothing is copied here; pi's own `getConflicts()` stays empty at piDockOf because pi's app defaults claim the byte, so the clash is named rather than invented.",
  evidence: "demo/keybindings.test.mjs",
 },
 {
  capability: "pi's alt-screen keybinding actions (pi's fullscreen viewport, which IS this harness's pi-style screen)",
  names: ["tui.altScreen.pageUp", "tui.altScreen.pageDown", "tui.altScreen.halfPageUp", "tui.altScreen.halfPageDown", "tui.altScreen.lineUp", "tui.altScreen.lineDown", "tui.altScreen.previousPrompt", "tui.altScreen.nextPrompt", "tui.altScreen.search", "tui.altScreen.searchNext", "tui.altScreen.searchPrevious", "tui.altScreen.searchClose", "tui.altScreen.top", "tui.altScreen.bottom"],
  status: "native",
  reason: "this harness's pi-style screen IS pi-tui's `TuiAltScreen` (src/tui/piscreen.mjs), and pi's own class matches these ids ITSELF through pi's GLOBAL registry `getKeybindings()` (measured: it carries all 47 tui ids, so the altScreen ids stay bound without this harness touching them) - the manager given to pi's Editor is a different object. Measured at real-pty runs with scripts/ptydrive.mjs - demo/keybindings.test.mjs at 70x30 (6 typed keystrokes, then pi's pageUp, pageDown, ctrl+home, ctrl+end and previousPrompt feeds) and demo/scrollwheel.test.mjs at 48x16 (5 prompts, then pi's wheel-up gesture TWICE, a wheel-down, pi's pageUp and pi's pageDown) - whose segment labels now name the keystroke whose PAINT the segment holds: pi's pageUp leaves the transcript WHERE it was scrolled (the same painted rows persist across the following changed frames, no snap to the bottom), pi's pageDown (pi's own `ESC[6~`) PAGES pi's view BACK so its OWN response segment shows pi's newest prompt row and no longer pi's header row, pi's ctrl+home lands on the document TOP (pi's header rows plus the `pi-durable session` marker) and pi's ctrl+end lands on the document END with pi's transient `\u2503` scrollbar thumb, and pi's follow-end engages ONLY once the view sits at that end - a commit typed while the view is scrolled up stays OFF screen, the same commit typed after pi's ctrl+end lands ON screen. demo/keybindings.test.mjs asserts that shape (pi's matcher attributes all 61 byte forms this sweep feeds with no invented action name, pi answers NO action for 20 of them - including pi's TWO wheel-gesture forms, since a wheel is not a keybinding - the per-feed document TOP/END responses, `topSegments == 2 && endSegments == 3` over the five feeds, and freshEnd>=1), and demo/scrollwheel.test.mjs asserts that at 48x16 ONE wheel gesture moves pi's transcript region EXACTLY one row, a wheel-down puts it back EXACTLY where the first wheel-up left it, pi's pageUp puts every still-visible row 5 screen rows lower (a page, not a wheel tick), pi's pageDown then returns the region EXACTLY to where pi's pageUp left off, and pi paints its scrollbar thumb only while the view sits off the content end. All 14 alt-screen ids also appear in pi's own `dist/tui-alt-screen.js`, which is the component pi matches them in. pi binds no default key for `halfPageUp`/`halfPageDown`/`lineUp`/`lineDown` at this pin (measured: pi's table carries `defaultKeys` [] and `getKeys` answers []), and pi's `search` keystroke (pi's own `ctrl+shift+f` cell) answers NO id at the dock for any byte form tried here (measured: `ESC[102;6U`, `ESC[102;5U`, `ESC[102;3U`, `ESC[576U` answer nothing; a raw pty never answers the kitty keyboard-protocol query pi-tui asks for, which is what would send those bytes), so the `Search` overlay pi's own alt-screen search component would open stays named with the limit, not dropped.",
  evidence: ["demo/keybindings.test.mjs", "demo/scrollwheel.test.mjs"],
 },
 {
  capability: "pi's mouse wheel over the transcript and pi's ScrollView view state (pi's alt-screen wheel path, NOT a keybinding id)",
  names: ["ScrollView", "parseWheelEvent", "routeWheel", "WheelScrollAccelerator", "scrollBy", "scrollTo", "scrollToStart", "scrollToEnd", "updateLayout", "scrollTop", "isFollowingEnd", "isScrollbarVisible"],
  status: "native",
  reason: "the harness's pi-style screen composes pi-tui's OWN `ScrollView`, so pi's component moves the view and no scroll rule of our own is typed here. Measured IN PROCESS against pi-tui's runtime export `ScrollView` (demo/scrollwheel.test.mjs): a 21-line pi `Text` under pi's own {follow: end, primary: true, overscroll: chain, scrollbar: auto} answers pi's scrollTop 13 for an 8-row viewport while pi's scrollbar is NOT visible, pi's `scrollBy(-1)` returns 0 and leaves pi's scrollTop 12 with pi no longer following the end and pi's thumb VISIBLE, pi's `scrollBy(-99)` returns -87 and clamps at pi's scrollTop 0, pi's `scrollTo(5)`/`scrollToStart`/`scrollToEnd` answer pi's 5/0/13, pi's follow-end ENGAGES only once the view sits at that end, and pi calls the `requestRender` callback its own `updateLayout` receives. Measured AT A REAL PTY at 48x16: pi's TWO wheel byte forms `ESC[<64;20;10M` and `ESC[<65;20;10M` answer NO keybinding id at pi's matcher (pi's alt screen routes a wheel BEFORE pi's keybindings are asked), ONE gesture moves pi's transcript region by EXACTLY one row, a wheel-DOWN gesture returns it EXACTLY, and pi's thumb paints only while the view is off the content end. pi's wheel PATH is read as TEXT off pi-tui's own dist because it is NOT a runtime export at this pin: dist/tui-alt-screen.js carries `parseWheelEvent` and `routeWheel` and constructs `new WheelScrollAccelerator(options.wheelScrollLines ?? 1)`, dist/wheel-scroll.js carries `export class WheelScrollAccelerator`, and importing that name from `@earendil-works/pi-tui` THROWS - so pi's own file names are cited, not an import here. pi's own accelerator is what makes ONE row per feed true: `lines === \"auto\"` with a NEW gesture (gap over pi's GESTURE_GAP_MS 200ms) returns 1 line, and the committed driver spaces writes 0.9s apart. pi's mouse MOVE/HOVER region and its drag selection stay named by the row above (pi-tui's `MouseRegion` is not composed here), and pi-tui sends no terminal mouse-mode enable query at this pin, so the wheel bytes arrive only because a real terminal answers them.",
  evidence: "demo/scrollwheel.test.mjs",
 },
 {
  capability: "pi's session-picker and tree-navigator keybindings (no pi session picker or tree navigator is composed here)",
  names: ["app.session.new", "app.session.tree", "app.session.fork", "app.session.resume", "app.session.togglePath", "app.session.toggleSort", "app.session.toggleNamedFilter", "app.session.rename", "app.session.delete", "app.session.deleteNoninvasive", "app.tree.foldOrUp", "app.tree.unfoldOrDown", "app.tree.editLabel", "app.tree.toggleLabelTimestamp", "app.tree.filter.default", "app.tree.filter.noTools", "app.tree.filter.userOnly", "app.tree.filter.labeledOnly", "app.tree.filter.all", "app.tree.filter.cycleForward", "app.tree.filter.cycleBackward"],
  status: "unsupported",
  reason: "these ids belong to pi's `SessionSelectorComponent` and pi's tree navigator, which this harness does not compose (the row above names pi's interactive driver and its selector dialogs as unsupported); measured: the dock's manager resolves ONLY app.interrupt/app.clear/app.exit among pi's 43 app ids, so no key here carries any of them. pi's `/new`, `/fork` and `/resume` VERBS are honoured as slash commands in another row; the KEYBINDINGS open dialogs this harness never opens, and pi-durable's store is pi-durable's own conversation tree, not pi's session tree, so there is nothing to fold, label or filter through these ids.",
  evidence: "demo/keybindings.test.mjs",
 },
 {
  capability: "pi's model/model-list/thinking keybindings (the selector dialogs they open are refused elsewhere)",
  names: ["app.model.select", "app.model.cycleForward", "app.model.cycleBackward", "app.models.save", "app.models.enableAll", "app.models.clearAll", "app.models.toggleProvider", "app.models.reorderUp", "app.models.reorderDown", "app.thinking.cycle", "app.thinking.save", "app.thinking.toggle"],
  status: "unsupported",
  reason: "pi opens its `ModelSelectorComponent` and `ThinkingSelectorComponent` for these ids, and this harness composes neither (named unsupported in the row above); measured: none of them is bound at the dock. The UNDERLYING state is pi-durable's and is reached in pi's own words instead: `/model <provider/id>` switches the model THIS run answers with and `/thinking <level>` sets pi's thinking level, both answered from pi-durable's `get_available_models`/`get_available_thinking_levels`, so pi's cycling of a dialog pi never opens is refused BY NAME while the model change itself happens.",
  evidence: ["demo/keybindings.test.mjs", "demo/modeldefault.test.mjs"],
 },
 {
  capability: "pi's message/tree/tools/clipboard/external-editor/suspend keybindings (no carrier at this dock)",
  names: ["app.message.copy", "app.message.followUp", "app.message.dequeue", "app.tools.expand", "app.editor.external", "app.clipboard.pasteImage", "app.suspend"],
  status: "unsupported",
  reason: "the last four are pi's input-plane actions: pi's external editor replaces pi's in-TUI editor (the input-plane row names that capability), pi's clipboard paste feeds an image pi-durable's store never receives this way, pi's suspend pauses pi's own agent loop (pi-durable admits through the ONE writer seam instead), and pi's `show more` tools line belongs to pi's footer provider this harness feeds with pi-durable's own committed usage; the message trio drives pi's own message queue - steering, follow-up and dequeue - which pi-durable reaches with its own steering verbs. measured: none of the 43 app ids except app.interrupt/app.clear/app.exit is bound at the dock, so refusing them names an action pi's registry carries and no key here answers.",
  evidence: "demo/keybindings.test.mjs",
 },
 {
  capability: "the configuration files pi's own library plane reads for this run",
  names: ["<agent-dir>/settings.json", "<agent-dir>/models.json", "<agent-dir>/auth.json", "<agent-dir>/AGENTS.override.md", "<agent-dir>/extensions/", "<agent-dir>/skills/", "<agent-dir>/prompts/", "<agent-dir>/themes/", ".pi/settings.json", ".pi/extensions/", ".pi/skills/", ".pi/prompts/", ".pi/themes/"],
  status: "native",
  reason: "pi's OWN readers do the reading, at both levels, and this harness calls them rather than parsing any of these files: src/settings.mjs calls pi's `SettingsManager.create(cwd, agentDir)` (measured: a fixture `<agent-dir>/settings.json` and a fixture `.pi/settings.json` both reach getGlobalSettings/getProjectSettings, and pi's merge makes the PROJECT value the effective one); src/packages/loader.mjs' `loadPiResources` runs pi's `DefaultResourceLoader` (measured on a fixture cwd: skills, prompt templates and themes load from BOTH the fixture `<agent-dir>` and the fixture `.pi`, and the run's own inventory reports them); src/agentplane.mjs feeds those same records to pi's `discoverAndLoadExtensions` for `<agent-dir>/extensions/` and `.pi/extensions/`; src/providers.mjs reads pi's `<agent-dir>/models.json` and pi's `<agent-dir>/auth.json` as pi's own credential path; and src/packages/loader.mjs' `loadContextFiles` runs pi's `loadProjectContextFiles` (measured: `<agent-dir>/AGENTS.override.md` and the cwd's `AGENTS.md` come back as pi's context files). No path string is a guess: each is pi's configuration.md table cell, and pi ships every basename in its pinned dist.",
  evidence: ["demo/keybindings.test.mjs", "demo/packages.test.mjs", "demo/settings.test.mjs", "demo/providers.test.mjs"],
 },
 {
  capability: "the configuration paths pi's own plane reads but this harness does not",
  names: ["<agent-dir>/keybindings.json", "<agent-dir>/mcp.json", ".pi/mcp.json", "<agent-dir>/SYSTEM.md", "<agent-dir>/APPEND_SYSTEM.md", ".pi/SYSTEM.md", ".pi/APPEND_SYSTEM.md"],
  status: "unsupported",
  reason: "measured, not remembered: piDockOf's `userBindings` slot is never fed - the ONLY call site (src/tui/pidockloop.mjs) passes no user bindings, so pi's `<agent-dir>/keybindings.json` would rename keys that never change here (named rather than loaded silently). pi's `SYSTEM.md`/`APPEND_SYSTEM.md` DO reach pi's own loader (measured: `resources.systemPrompt` = the fixture marker, `resources.appendSystemPrompt` = the fixture list) but src/cli-intent.mjs takes `instructions` ONLY from pi's `--system-prompt`/`--append-system-prompt` words, so pi's system files never enter this run's agent record. this harness writes no credentials and imports no MCP plane (measured: no import of pi's MCP package appears in src/, demo/ or scripts/, and pi's own `runtime.mcpServers` map answers `{}` for a fixture `<agent-dir>/mcp.json` plus a fixture `.pi/mcp.json`, whose marker strings reach none of pi's resource records), so both `mcp.json` paths are refused BY NAME.",
  evidence: "demo/keybindings.test.mjs",
 },
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

/** The rows as the markdown docs/world/reference/package-support.md holds, generated from the rows and not kept beside them. */
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