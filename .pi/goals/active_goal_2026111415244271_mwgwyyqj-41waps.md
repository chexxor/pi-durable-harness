{
  "version": 3,
  "id": "mwgwyyqj-41waps",
  "objective": "Build a standalone single-agent durable coding-agent harness in ~/Git/pi-durable-harness (currently empty), extracted from only the harness-generic code in ~/Git/Durian-Pi, with @earendil-works/pi-durable (pinned v1.5.1, one storage opener) as the session/transcript/state backend, so an agent running this harness can re-use the pi package ecosystem: interactive TUI (pi-tui), print mode, and JSON/RPC mode matching pi's CLI surface as closely as possible, plus a best-effort pi-package compatibility layer that discovers and loads pi packages (extensions, skills, prompt templates, themes, context files) and maps pi's extension API (registerTool, commands/shortcuts, event handlers, renderers, TUI hooks) onto pi-durable's registry (defineExtension/defineTool/hook/section/wrapTool), with every unmappable pi capability named in a documented matrix rather than silently dropped. Durian-Pi's multi-seat orchestration (seats, cross-seat work queue, broker/serve, genlock, per-item worktrees, metrics, check, constitution, selfdev) is explicitly dropped. Execution protocol: a small sequential spine (task-1 pin/deps, task-2 harness core) lands first, then the module tasks (task-3..task-9) are independent siblings and are delegated concurrently to pi-native subagents, each owning disjoint files with its own verification contract (see per-task contracts). HARD RULES: (1) .mjs ESM, \"type\": \"module\", pinned @earendil-works 1.5.1 via pi-main.pin.json + scripts/sync-pi.mjs, no invented APIs - verify every pi-durable/pi-ai/chord symbol against the pinned dist .d.ts before use; (2) never reimplement harness-owned state and never run SQL of our own (one storage opener); (3) every extracted file carries a provenance header naming the Durian-Pi source path and what changed and why; (4) Durian-Pi is read-only - never modify, move, or delete anything under ~/Git/Durian-Pi; (5) GIT DISCIPLINE: the new project is a git repo from the start; commit after every landed task with a message naming the task and evidence, keep the tree clean-committed before starting a parallel subagent branch, and never rely on uncommitted state - assume progress can be lost at any moment and that anything not on disk (committed) may have to be redone; (6) nothing is claimed as working unless a runnable offline demo in the project's demo/ suite proves it. GLOBAL VERIFICATION CONTRACT before goal completion: run the full offline demo suite (0 failures, no API keys, no network); run scripts/sync-pi.mjs --report (PIN == DECLARED == RESOLVED at 1.5.1, no LOUD FALLBACK line); re-read pi's docs packages.md/extensions.md/rpc.md/cli.md/sessions.md/compaction.md and confirm each capability is either exercised by a demo id cited in docs/package-support.md or listed there as unsupported with a reason; rg confirms no dependency on the dropped orchestration concepts; git status clean in ~/Git/pi-durable-harness and unchanged in ~/Git/Durian-Pi.",
  "status": "active",
  "autoContinue": true,
  "usage": {
    "tokensUsed": 420871,
    "activeSeconds": 14044
  },
  "sisyphus": false,
  "createdAt": "2026-11-14T21:24:42.715Z",
  "updatedAt": "2026-11-15T01:25:13.860Z",
  "activePath": ".pi/goals/active_goal_2026111415244271_mwgwyyqj-41waps.md",
  "revision": 88,
  "scheduler": {
    "version": 1,
    "owner": "01a1dbe8-0e5b-709b-9d06-92a2277611c1",
    "generation": "71572b78-9666-4e0a-8f9f-202f08a4178c",
    "used": 3,
    "phase": "running",
    "repairUsed": false,
    "decision": {
      "kind": "ready",
      "purpose": "ready"
    },
    "dispatch": {
      "id": "3ecccb38-7d14-4e23-ae4a-592753c3fbe5",
      "kind": "ready",
      "claimedAt": 1794702845245
    }
  },
  "taskList": {
    "tasks": [
      {
        "id": "task-1",
        "title": "Spine (do first): Git init + pin/dependency spine (package.json, pi-main.pin.json, scripts/sync-pi.mjs)",
        "verificationContract": "git repo initialized at ~/Git/pi-durable-harness with an initial commit; `node scripts/sync-pi.mjs --report` prints PIN == DECLARED == RESOLVED at @earendil-works 1.5.1 with no LOUD FALLBACK line; commit tagged/recorded as a checkpoint.",
        "status": "pending",
        "subtasks": [
          {
            "id": "task-2",
            "title": "Spine (second): Harness core - Harness.open on openNodeSqliteStorage, root conversation, agent config, registry install",
            "verificationContract": "demo/core.test.mjs opens a durable Session over node-sqlite storage, configures the root conversation's agent, installs CodingTools + extension in the registry, and completes one turn offline (MemoryStorage fallback allowed when no store exists); exit 0, no API keys, no network.",
            "status": "pending"
          },
          {
            "id": "task-3",
            "title": "Providers: model registry, deepinfra/local providers, spend/trace accounting (from Durian-Pi src/providers) - PARALLEL sibling, disjoint files",
            "verificationContract": "demo/providers.test.mjs constructs a pi-ai Models registry with deepinfra + local providers and resolves a model ref offline (no key check), and spend/trace records a synthetic usage event; provenance header names the Durian-Pi file and LICENSE handling for any carried vendor data.",
            "status": "pending"
          },
          {
            "id": "task-4",
            "title": "Tool surface + execution env (Durian-Pi src/seattools.mjs, src/seatguard.mjs) on pi-durable CodingTools/defineTool - PARALLEL sibling, disjoint files",
            "verificationContract": "demo/tools.test.mjs exercises read/write/edit/bash through NodeExecutionEnv in a temp cwd, plus one custom defineTool with schema coercion and a beforeTool hook block case; provenance header per file; harness-owned state is not reimplemented.",
            "status": "pending"
          },
          {
            "id": "task-5",
            "title": "One importable read-only read/view API + event feed + in-flight partial rendering (readapi, readclient, viewmodel, eventfeed, livewatch) - PARALLEL sibling, disjoint files",
            "verificationContract": "demo/readapi.test.mjs consumes the store through the single read API (monotonic seq cursor, --since/--follow) and renders the committed partial (pi.live) as a streaming row, never as an entry; provenance header; no direct SQL outside pi-durable's opener.",
            "status": "pending"
          },
          {
            "id": "task-6",
            "title": "Interactive TUI on @earendil-works/pi-tui (from Durian-Pi src/tui/*): transcript view, watch, restore, sync - PARALLEL sibling, disjoint files",
            "verificationContract": "TUI renders the transcript, the in-flight partial, and watch events from a fixture store offline (headless render asserted in a demo, e.g. captured paint frames), with provenance headers mapping each module to its Durian-Pi original.",
            "status": "pending"
          },
          {
            "id": "task-7",
            "title": "CLI surfaces: print mode, JSON mode, RPC mode, session resume/reopen verbs (from cli-seam.mjs, intent.mjs) - PARALLEL sibling, disjoint files",
            "verificationContract": "demo/cli.test.mjs runs each mode against one shared harness invocation path: print returns final answer text, JSON emits agent events as NDJSON, RPC accepts a JSONL command sequence on stdin and answers; reopening the same store resumes without replaying a tool call that has an unsafe replay policy.",
            "status": "pending"
          },
          {
            "id": "task-8",
            "title": "Pi package loader + extension compatibility shim (packages, skills, prompts, themes, context files -> pi-durable registry) - PARALLEL sibling, disjoint files",
            "verificationContract": "demo/packages.test.mjs loads at least one real pi package layout (extensions/ + skills/ + prompts/ + themes/ or a `pi` manifest) from a local path, registers its extension's tool into the pi-durable registry, and its skill/prompt/theme are reachable; every pi extension capability that could not be mapped is listed in docs/package-support.md with the reason; loader failures skip the package and warn, never crash the session.",
            "status": "pending"
          },
          {
            "id": "task-9",
            "title": "Store ownership + attach semantics (multiplexer): joining a cwd whose store is already owned attaches as a reader - PARALLEL sibling, disjoint files",
            "verificationContract": "demo/attach.test.mjs proves the multiplexer contract offline with two processes in one cwd: instance A opens the store as the owning writer and runs its session; instance B launched in the same cwd exits 0 and ATTACHES as a reader (same conversation id, sees A's commits via the read API/watch, never opens a second mutation line); a second writer open on an owned store fails LOUDLY naming the holder (pid + startedAt + store path) rather than double-owning; inputs submitted by two attached clients land on the one mutation line in commit order, each exactly-once by requestId; when the owning writer exits (cleanly or killed) the store is marked free and the next invocation may become the writer; readers never mutate state directly (no SQL outside pi-durable's opener).",
            "status": "pending"
          },
          {
            "id": "task-10",
            "title": "Settings/config + system-prompt sections + compaction/restart policy (from config.mjs, context.mjs, compacteval.mjs) - PARALLEL sibling, disjoint files",
            "verificationContract": "demo/settings.test.mjs resolves settings.json + model choice + context files (AGENTS.md-style discovery) into system-prompt sections, and compaction/restart/retry policy is asserted offline against pi-durable settings types; provenance header.",
            "status": "pending"
          },
          {
            "id": "task-11",
            "title": "Package-support matrix + README + provenance doc (native / shimmed / unsupported, each with evidence) - after the parallel siblings land",
            "verificationContract": "docs/package-support.md has one row per pi capability (tools, commands/shortcuts, event handlers, renderers, TUI hooks, skills, prompts, themes, context files, packages install/discovery, sessions/attach+multiplexer semantics, compaction, RPC), each citing a demo id as evidence or stating unsupported with a reason; README documents quick start (including attach behavior) and the pi-durable-vs-pi mapping; every extracted file carries a provenance header.",
            "status": "pending"
          },
          {
            "id": "task-12",
            "title": "Final: offline demo suite green + git checkpoint + no-orchestration audit",
            "verificationContract": "One command runs all demos with 0 failures, no API keys, no network; rg confirms no dependency on the dropped orchestration concepts (seats/queue/broker/genlock/worktree/metrics/constitution); git status clean in ~/Git/pi-durable-harness and unchanged in ~/Git/Durian-Pi; a checkpoint commit exists after each landed task.",
            "status": "pending"
          }
        ]
      }
    ],
    "blockCompletion": true,
    "proposedAt": "2026-11-14T21:46:41.566Z"
  },
  "currentTaskId": "task-1"
}

# Goal Prompt

Build a standalone single-agent durable coding-agent harness in ~/Git/pi-durable-harness (currently empty), extracted from only the harness-generic code in ~/Git/Durian-Pi, with @earendil-works/pi-durable (pinned v1.5.1, one storage opener) as the session/transcript/state backend, so an agent running this harness can re-use the pi package ecosystem: interactive TUI (pi-tui), print mode, and JSON/RPC mode matching pi's CLI surface as closely as possible, plus a best-effort pi-package compatibility layer that discovers and loads pi packages (extensions, skills, prompt templates, themes, context files) and maps pi's extension API (registerTool, commands/shortcuts, event handlers, renderers, TUI hooks) onto pi-durable's registry (defineExtension/defineTool/hook/section/wrapTool), with every unmappable pi capability named in a documented matrix rather than silently dropped. Durian-Pi's multi-seat orchestration (seats, cross-seat work queue, broker/serve, genlock, per-item worktrees, metrics, check, constitution, selfdev) is explicitly dropped. Execution protocol: a small sequential spine (task-1 pin/deps, task-2 harness core) lands first, then the module tasks (task-3..task-9) are independent siblings and are delegated concurrently to pi-native subagents, each owning disjoint files with its own verification contract (see per-task contracts). HARD RULES: (1) .mjs ESM, "type": "module", pinned @earendil-works 1.5.1 via pi-main.pin.json + scripts/sync-pi.mjs, no invented APIs - verify every pi-durable/pi-ai/chord symbol against the pinned dist .d.ts before use; (2) never reimplement harness-owned state and never run SQL of our own (one storage opener); (3) every extracted file carries a provenance header naming the Durian-Pi source path and what changed and why; (4) Durian-Pi is read-only - never modify, move, or delete anything under ~/Git/Durian-Pi; (5) GIT DISCIPLINE: the new project is a git repo from the start; commit after every landed task with a message naming the task and evidence, keep the tree clean-committed before starting a parallel subagent branch, and never rely on uncommitted state - assume progress can be lost at any moment and that anything not on disk (committed) may have to be redone; (6) nothing is claimed as working unless a runnable offline demo in the project's demo/ suite proves it. GLOBAL VERIFICATION CONTRACT before goal completion: run the full offline demo suite (0 failures, no API keys, no network); run scripts/sync-pi.mjs --report (PIN == DECLARED == RESOLVED at 1.5.1, no LOUD FALLBACK line); re-read pi's docs packages.md/extensions.md/rpc.md/cli.md/sessions.md/compaction.md and confirm each capability is either exercised by a demo id cited in docs/package-support.md or listed there as unsupported with a reason; rg confirms no dependency on the dropped orchestration concepts; git status clean in ~/Git/pi-durable-harness and unchanged in ~/Git/Durian-Pi.

## Progress

- Status: running
- Auto-continue: on
- Sisyphus mode: no
- Time spent: 3h54m04s
- Tokens used: 421K (420,871) tokens
## Tasks

<!-- blockCompletion: true -->
- [ ] task-1: Spine (do first): Git init + pin/dependency spine (package.json, pi-main.pin.json, scripts/sync-pi.mjs) — contract: git repo initialized at ~/Git/pi-durable-harness with an initial commit; `node scripts/sync-pi.mjs --report` prints PIN == DECLARED == RESOLVED at @earendil-works 1.5.1 with no LOUD FALLBACK line; commit tagged/recorded as a checkpoint.

