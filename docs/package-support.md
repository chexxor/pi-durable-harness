# pi package support matrix

One row per pi capability, and nothing here is a guess: the rows live as data in
`src/packages/matrix.mjs`, and this file is what `scripts/render-matrix.mjs` renders from that data. Edit
the data, not this file - a doc edited beside the data cannot be checked against it, and the whole point
of the matrix is that an unsupported capability is NAMED, so an un-named capability is a finding rather
than a shrug.

Status meanings, since the three words carry the contract:

- `native` - pi-durable has the concept and the harness uses pi-durable's own; no shim is involved.
- `shimmed` - pi's shape is translated onto pi-durable's by `src/packages/adapter.mjs`, and the named
 demo exercises the result.
- `unsupported` - no pi-durable counterpart exists at the pinned release; the `why` column says what
 pi-durable lacks, which is what makes the row falsifiable if a later release gains the concept.

## The matrix

| capability | pi's name(s) | status | why | evidence |
| --- | --- | --- | --- | --- |
| tool | registerTool | shimmed | pi's ToolDefinition is rebuilt as a pi-durable ToolRegistration: pi's execute(callId, args, signal, onUpdate, ctx) becomes pi-durable's execute(args, api, context), and pi's AgentToolResult {content, details, structuredContent} becomes pi-durable's ToolExecutionResult {content, details, structuredOutput} | demo/packages.test.mjs |
| tool argument repair | prepareArguments | shimmed | both sides have the same slot - a pure pre-validation repair - so pi's function is installed unchanged and pi-durable runs it before validation | demo/packages.test.mjs |
| command | registerCommand, commands | unsupported | pi-durable's registry has no command plane: commands are a UI verb in pi (a name the user types), while pi-durable's registry offers tools and tasks to a model | - |
| keyboard shortcut | registerShortcut, shortcuts | unsupported | pi-durable has no keybinding surface at all; the harness's TUI owns its own keybindings and does not consume pi's | - |
| cli flag | registerFlag, flags | unsupported | pi-durable has no flag plane; the harness's CLI parses its own flags, and mapping pi's onto them would change what the harness's CLI means | - |
| message renderer | messageRenderers, registerMessageRenderer | unsupported | pi-durable commits entries and never draws them: a renderer belongs to pi's AgentSession output pipeline, which this harness replaces with its own TUI/print views | - |
| tool renderer | toolRenderers, registerToolRenderer | unsupported | same as the message renderer: pi-durable's tool result is data, and the harness's view of it is its own | - |
| entry renderer | entryRenderers | unsupported | same as the message renderer: pi-durable's transcript entries have no render hook | - |
| markdown transformer | markdownTransformer | unsupported | pi-durable has no markdown pipeline: it commits entries, and the harness renders them; a transformer over pi's rendering has nothing to transform | - |
| event handler | tool_call | shimmed | pi's tool_call handler chain runs as a pi-durable beforeTool hook: pi's event.input copy is handed to the handlers and an in-place patch becomes pi-durable's {arguments} replacement, while pi's {block, reason} becomes pi-durable's {block} | demo/packages.test.mjs |
| event handler | tool_result, tool_execution_end | shimmed | pi fires both names for one call's end and pi-durable has one afterTool hook, so the bridge composes both pi chains onto it rather than letting one replace the other | demo/packages.test.mjs |
| event handler | before_provider_request | shimmed | pi's handler returns the replacement request payload and pi-durable's beforeProviderRequest hook accepts the same shape, so the payload is forwarded in both directions | demo/settings.test.mjs |
| event handler | after_provider_response | shimmed | pi's handler sees pi-ai's AssistantMessage and pi-durable's afterResponse hook hands the same object, so the bridge is a call forwarding with no shape change | demo/settings.test.mjs |
| event handler | session_before_compact | shimmed | pi's {cancel} | {compaction} result is narrowed to pi-durable's {decline: true} | {summary}: a pi extension that returns a richer CompactionResult loses the parts pi-durable's compaction task does not take | demo/settings.test.mjs |
| event handler | session_start, session_shutdown | unsupported | pi-durable's hooks belong to tasks inside a run; a session has no task whose hook fires at session boundaries, and the Session's own lifecycle (open/close) is a transport event, not a hook | - |
| event handler | session_tree, session_before_tree | unsupported | pi's session TREE (switching/forking a branch and summarizing it) has no pi-durable counterpart at this pin: conversations have parents, but no task edits a branch in place | - |
| event handler | session_compact, session_compact_failed | unsupported | pi-durable's compaction hooks fire only BEFORE summarizing (beforeCompact); there is no post-compaction or compaction-failure hook to attach to | - |
| event handler | turn_start, turn_end | unsupported | pi's turn is one model round including its tools; pi-durable's nearest hooks are afterTools (the tool round only) and afterRun (a whole run), and neither is a turn boundary | - |
| event handler | message_start, message_update, message_end | unsupported | pi fires per streamed assistant message; pi-durable's afterResponse hook sees a COMPLETED provider message, and its streaming surface is ConversationStream, which is not a hook and cannot mutate what pi's handlers return | - |
| event handler | agent_start, before_agent_start, agent_end, agent_settled, agent_before_settle | unsupported | pi's agent lifecycle belongs to pi's AgentSession loop; pi-durable's run boundaries are afterRun and afterTools, and no hook fires when a whole agent starts or settles | - |
| event handler | input | unsupported | user input enters pi-durable as a Submission admitted exactly once by requestId on the Session line; a hook that observed input before admission would sit off that line and break exactly-once | - |
| event handler | context, context_with_system | unsupported | pi's context events let an extension edit what the model sees; pi-durable's context is a task's input selection (a ContextView) and the agent's sections, neither of which an event handler can rewrite | - |
| event handler | model_select | unsupported | the model is a conversation's AgentState choice resolved against the registry; there is no selection event an extension can intercept | - |
| event handler result | stopAfterBlock | unsupported | a pi tool_call handler can ask the agent to stop after a blocked call; pi-durable's beforeTool hook can block, and the nearest thing is a tool's own terminate control, which is a different contract | - |
| event handler | pi-listed-only | unsupported | pi also fires project_trust, resources_discover, mcp_servers_change, cache_warming_decision, provider_stream_event and before_provider_headers; none of those planes exists in this harness (no MCP loader, no pi CLI resource plane, no cache warmer), so there is nothing to fire and nothing to catch | - |
| skill | skills | shimmed | pi's own formatSkillsForPrompt output is installed as one pi-durable system-prompt section, so the model sees pi's exact skill list format | demo/packages.test.mjs |
| skill invocation | skill tool, loadSkill | unsupported | pi's skill TOOL (a model-callable loader for a skill body) is part of pi's own toolset; pi-durable ships no such tool, and inventing one here would be a new capability rather than a mapping | - |
| prompt template | prompts, prompt templates | shimmed | pi's loader reads .md prompt templates and pi's substituteArgs expands them; the harness exposes the templates as data on its read API and expands them when a caller submits one | demo/cli.test.mjs |
| theme | themes | shimmed | pi's theme files are loaded as data and applied to the harness's own TUI, which is built on @earendil-works/pi-tui - the same library pi draws with | demo/tui.test.mjs |
| context file | agentsFiles, AGENTS.md | shimmed | pi's own loadProjectContextFiles content is installed as pi-durable system-prompt sections, one per file, keyed by path | demo/packages.test.mjs |
| package | pi manifest, package.json pi | shimmed | src/packages/discover.mjs reads pi's manifest kinds and both package planes on disk, and an unknown kind becomes an explicit row rather than a silent drop | demo/packages.test.mjs |
| package install | npm install, git clone, DefaultPackageManager.install | unsupported | installing resolves from npm/git over the network, and every demo in this repo runs offline; the harness loads packages that are already on disk and reports the rest as absent | - |
| session | session, resume, attach | native | pi-durable owns the session plane: one Session holds the transcript and state, and reopening a store re-opens the same conversation | demo/core.test.mjs |
| read-only attach | multiplexer, attach, reader | native | one writer owns the store and readers attach through pi-durable's own reads; a second writer is refused by name, and queued writes land once by requestId | demo/attach.test.mjs |
| transcript view | transcript, read API | native | the read API walks pi-durable's committed entries; a reader never mutates durable state | demo/readapi.test.mjs |
| print mode | print, final answer | native | the harness's CLI runs one shared harness invocation path and prints the final answer entry | demo/cli.test.mjs |
| json mode | NDJSON, json | native | pi-durable's ConversationStream/watch events are emitted as NDJSON records | demo/cli.test.mjs |
| rpc mode | RPC, JSONL commands | native | the harness's RPC loop takes a JSONL command sequence on stdin and answers with pi-durable's own committed events | demo/cli.test.mjs |
| tui | pi-tui, interactive | native | the harness's TUI is built directly on @earendil-works/pi-tui, the same library pi draws with | demo/tui.test.mjs |
| compaction | compaction policy | native | pi-durable owns compaction (DEFAULT_COMPACTION_POLICY, the compaction task, CompactionSettings); the harness configures it rather than reimplementing it | demo/settings.test.mjs |
| tool lifecycle event | tool_execution_start, tool_execution_update | unsupported | pi fires these while a tool runs; pi-durable's tool hooks are ToolTask.beforeTool and afterTool only, and a RUNNING tool is reported through LiveState instead (ToolSlot.status pending/running/done, DEFAULT_PROGRESS_POLICY partial/output intervals). The harness shows the running tool in its own view, but an extension subscribing to these two events never gets a call | demo/tui.test.mjs |
| session info event | session_info_changed, SessionInfoEntry | unsupported | pi keeps a session-info plane (rename/label metadata) and fires when it changes; pi-durable's dist names no label or session-info plane at this pin (grep for `label`/`sessionInfo` in its dist finds nothing), so there is no change to report and no hook point to report it from | - |
| thinking level selection | thinking_level_select | shimmed | pi's event belongs to pi's UI loop and has no hook point, but the CHOICE is durable state: pi-durable's Agent carries `thinkingLevel`, and the harness resolves it from pi's settings and reads it back out of pi.agent after a reopen - so the value survives instead of living in a UI session | demo/settings.test.mjs |
| user bash event | user_bash | unsupported | pi's event for a shell command the USER typed in the UI. This harness's viewer never executes a user's shell command: its TUI hands a typed line to the writer CLI instead (demo/tui-interactive.mjs), and pi-durable has no hook point for such an event | demo/tui.test.mjs |
| UI prompt lifecycle event | ui_prompt_start, ui_prompt_end | unsupported | pi's own TUI prompt boundaries; the harness's TUI is built on pi-tui components and owns its own input overlay (src/tui/viewmode.mjs), so there is no pi prompt to bracket and no hook point in pi-durable for one | demo/tui.test.mjs |
| custom session entries | custom_message, context_edit, CustomMessageEntry, ContextEditEntry | unsupported | pi lets an extension inject its own session entry kinds. pi-durable's entry kinds are its own set (dist/entries.d.ts exports UserEntry, SystemEntry, AssistantEntry, ToolResultEntry, ResetEntry, CompactionEntry), and a conversation's documents are its extension point instead - the shim installs pi extension content as pi-durable sections/documents, which is what a loaded extension's extra content becomes | demo/packages.test.mjs |
| tool parameter schema vocabulary | typebox, TSchema, StringEnum, Type, additionalProperties, json-pointer-uri-fragment | shimmed | pi-durable's ToolRegistration takes JSON Schema for `parameters`, so pi's TypeBox vocabulary is only usable when it has already been compiled to plain JSON; the fixture's tool declares a raw JSON schema that pi-durable validates, and pi's schema helper names are pi's own (pi maps them to its copies, docs/extensions.md 'Available Imports') | demo/packages.test.mjs |
| rpc client | RpcClient | shimmed | pi's rpc.md documents pi's own RpcClient for driving RPC mode; this harness's RPC mode implements the same record framing itself (src/rpc.mjs + cli.mjs), which is what the demo drives over a pipe | demo/cli.test.mjs |
| branch summarization | BranchSummaryEntry, branchSummary | unsupported | pi's branch summarization is a plane of pi's own session manager (dist/core/session-manager.d.ts exports BranchSummaryEntry, dist/core/messages.d.ts carries the `branchSummary` role); pi-durable's dist names no branch summary at all at this pin, and pi's `branchSummary` SETTINGS key is kept honest as an unmapped row by src/settings.mjs rather than folded into pi-durable's compaction policy | demo/settings.test.mjs |
| per-resource opt-out flags | --no-extensions, --no-skills, --no-themes, --no-prompt-templates, --no-context-files, --no-builtin-tools, --no-mcp | unsupported | pi's CLI filters its resource plane at invocation time. DefaultResourceLoaderOptions at this pin carries no per-kind switch (its options are cwd, agentDir, settingsManager, eventBus and the additional*Paths lists), so this harness either loads pi's whole plane or does not load pi's loader at all; tool SELECTION is a different surface and the harness has it under its own names (--tools, --exclude-tools, --no-tools, demo/cli.test.mjs) | demo/packages.test.mjs |
| credential and OAuth commands | --api-key, --approve, --no-approve, --no-browser, --bearer-token-env-var, --oauth-client-id, --oauth-client-secret, --oauth-client-registration, --oauth-client-name, --oauth-callback-port, --min-expiry, --exposure | unsupported | pi's credential commands write pi's own auth files and can run an OAuth browser flow. This harness reads auth STATE through pi's ModelRuntime (src/providers.mjs) and never writes a credential, never runs a browser, and never mints a token - a model whose auth is absent is reported as such, which is what the demo shows | demo/providers.test.mjs |
| model listing | --list-models, --models | shimmed | the harness answers the same question offline through src/providers.mjs, which registers pi's providers and lists what resolves with auth state beside it | demo/providers.test.mjs |
| session identity flags | --session-id | shimmed | pi addresses a session by a file-level id; pi-durable conversations are store-resident, so the harness names one with --conversation and takes the store's latest with --resume/--continue (demo/cli.test.mjs) | demo/cli.test.mjs |
| pi's own rendering flags | --tui-mode, --verbose, --no-refresh | unsupported | these steer pi's own print-mode renderer and package refresh; pi-durable has no renderer plane, and this harness's TUI is a separate surface on pi-tui components whose rules are shown headless (demo/tui.test.mjs) | demo/tui.test.mjs |
| invocation-time resource selection | --prompt-template, --use-theme | unsupported | running a prompt template and picking a theme at invocation are pi UI verbs; the harness injects both kinds as durable pi-durable sections instead (demo/packages.test.mjs), and pi-durable's registry has no theme plane | demo/packages.test.mjs |

Rows: 8 native, 17 shimmed, 30 unsupported.

## What is actually installed on THIS machine, and what loaded from it

Generated by the same script that renders the matrix, from `src/packages/discover.mjs` reading both of
pi's package planes and `src/packages/loader.mjs` handing the found paths to pi's own loader. A row here
that shows `0` loaded extensions is a package that is installed but whose extension modules did not
load, and the loader errors below say why.

| package | plane | manifest kinds | loaded | loader errors |
| --- | --- | --- | --- | --- |
| awesome-pi-themes @ 1.2.19 | user | themes x1, extensions x1 | 1 | 0 |
| pi-deepinfra @ 0.1.4 | user | extensions x1 | 1 | 0 |
| pi-goal-x @ 0.34.1 | user | extensions x1 | 1 | 0 |
| @woksin/pi-context-budget @ 0.10.0 | project | extensions x1 | 1 | 0 |

### Loader failures, named rather than swallowed

| path | error |
| --- | --- |
_none: every extension module that discovery found loaded_

### Declared by a manifest and not on disk, or a kind no layer implements

| package | kind | path | why |
| --- | --- | --- | --- |
| awesome-pi-themes | unknown:image | https://raw.githubusercontent.com/isashi/awesome-pi-themes/main/docs/screenshots/halcyon-rivet.jpg | a manifest kind this file does not know; kept rather than dropped |
| pi-goal-x | unknown:image | https://github.com/tmonk/pi-goal-x/raw/main/pi-goal-x.png | a manifest kind this file does not know; kept rather than dropped |

## How to read an `unsupported` row

An `unsupported` row is not a to-do list. It names what pi-durable does not have at this pin, and the
harness's answer to such a capability is to load the package, keep the registrations it can use, and
report the rest - because a loader that quietly ignored what it cannot map would make a capability claim
impossible to audit. Where a capability is pi's UI plane (commands, shortcuts, renderers, TUI hooks), the
harness's own TUI and CLI own that surface instead: the pi package still loads, and its tools, handlers,
skills, prompts, themes and context files still reach the model, while a pi renderer has nothing to
attach to.

## The package plane, and what is not

Discovery and loading are this harness's, through pi's own library exports: the packages found on disk are
loaded by pi's loader (jiti, against pi's own `ExtensionRuntime`). What is NOT done is installing a package
that is not on disk: `DefaultPackageManager` resolves from npm and git over the network, and every demo in
this repo runs offline. A package that is configured and not installed is reported as absent by discovery -
the honest half - and installing it stays the `pi` CLI's job.

