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
| event handler | before_provider_request | shimmed | pi's handler returns the replacement request payload and pi-durable's beforeProviderRequest hook accepts the same shape, so the payload is forwarded in both directions | demo/settings.test.mjs (pending: that demo is not in the tree yet) |
| event handler | after_provider_response | shimmed | pi's handler sees pi-ai's AssistantMessage and pi-durable's afterResponse hook hands the same object, so the bridge is a call forwarding with no shape change | demo/settings.test.mjs (pending: that demo is not in the tree yet) |
| event handler | session_before_compact | shimmed | pi's {cancel} | {compaction} result is narrowed to pi-durable's {decline: true} | {summary}: a pi extension that returns a richer CompactionResult loses the parts pi-durable's compaction task does not take | demo/settings.test.mjs (pending: that demo is not in the tree yet) |
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
| prompt template | prompts, prompt templates | shimmed | pi's loader reads .md prompt templates and pi's substituteArgs expands them; the harness exposes the templates as data on its read API and expands them when a caller submits one | demo/cli.test.mjs (pending: that demo is not in the tree yet) |
| theme | themes | shimmed | pi's theme files are loaded as data and applied to the harness's own TUI, which is built on @earendil-works/pi-tui - the same library pi draws with | demo/tui.test.mjs (pending: that demo is not in the tree yet) |
| context file | agentsFiles, AGENTS.md | shimmed | pi's own loadProjectContextFiles content is installed as pi-durable system-prompt sections, one per file, keyed by path | demo/packages.test.mjs |
| package | pi manifest, package.json pi | shimmed | src/packages/discover.mjs reads pi's manifest kinds and both package planes on disk, and an unknown kind becomes an explicit row rather than a silent drop | demo/packages.test.mjs |
| package install | npm install, git clone, DefaultPackageManager.install | unsupported | installing resolves from npm/git over the network, and every demo in this repo runs offline; the harness loads packages that are already on disk and reports the rest as absent | - |
| session | session, resume, attach | native | pi-durable owns the session plane: one Session holds the transcript and state, and reopening a store re-opens the same conversation | demo/core.test.mjs |
| read-only attach | multiplexer, attach, reader | native | one writer owns the store and readers attach through pi-durable's own reads; a second writer is refused by name, and queued writes land once by requestId | demo/attach.test.mjs |
| transcript view | transcript, read API | native | the read API walks pi-durable's committed entries; a reader never mutates durable state | demo/readapi.test.mjs |
| print mode | print, final answer | native | the harness's CLI runs one shared harness invocation path and prints the final answer entry | demo/cli.test.mjs (pending: that demo is not in the tree yet) |
| json mode | NDJSON, json | native | pi-durable's ConversationStream/watch events are emitted as NDJSON records | demo/cli.test.mjs (pending: that demo is not in the tree yet) |
| rpc mode | RPC, JSONL commands | native | the harness's RPC loop takes a JSONL command sequence on stdin and answers with pi-durable's own committed events | demo/cli.test.mjs (pending: that demo is not in the tree yet) |
| tui | pi-tui, interactive | native | the harness's TUI is built directly on @earendil-works/pi-tui, the same library pi draws with | demo/tui.test.mjs (pending: that demo is not in the tree yet) |
| compaction | compaction policy | native | pi-durable owns compaction (DEFAULT_COMPACTION_POLICY, the compaction task, CompactionSettings); the harness configures it rather than reimplementing it | demo/settings.test.mjs (pending: that demo is not in the tree yet) |

Rows: 8 native, 12 shimmed, 20 unsupported.

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

