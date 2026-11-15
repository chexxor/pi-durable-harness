# The execution protocol, as it ran

Every claim in this table is re-derivable on this machine; the command that prints it is in the last line,
so a reader who doubts a row re-runs it rather than trusting this file.

## The spine, first (sequential, one commit each, each with its own checkpoint tag)

| step | what landed | proof that ran |
| --- | --- | --- |
| task-1 | `pi-main.pin.json` (tag pin `v1.5.1`, sha `dd30101cfc5b`), `package.json` with the ten `@earendil-works` deps, `scripts/sync-pi.mjs` pin discipline, `.gitignore`, first commit | `scripts/sync-pi.mjs --report` prints `PIN == DECLARED == RESOLVED` for 10 packages, no `LOUD FALLBACK`; `--update v1.4.1` exits 1 naming the refs it actually knows |
| task-2 | `src/core.mjs` (storage → registry → tools → env → `Harness.open` → root conversation), `demo/core.test.mjs`, `scripts/suite.mjs` | `demo/core.test.mjs` 21/21 over BOTH backends (node-sqlite and in-memory) |

The spine lands before any sibling, because every sibling imports `src/core.mjs` and the suite runner.

## The module tasks (siblings after the spine, each owning a disjoint file set, each with its own verification contract)

| task | files that task owns (from its checkpoint tag) | verification contract (the demo/audit that must exit 0) |
| --- | --- | --- |
| task-3 model plane + spend ledger | `src/providers.mjs` `src/spend.mjs` `demo/providers.test.mjs` | 22 checks: provider registration from the machine's agent dirs, ref resolution by the prefix rule, endpoint-class spend (loopback free, LAN/local not free) through pi-ai's `calculateCost` |
| task-4 tool surface + execution env | `src/toolsurface.mjs` `src/executionenv.mjs` `cli.mjs` `demo/tools.test.mjs` | 14 checks: read/write/edit/bash settle through pi-durable, an unoffered tool settles `tool_unavailable`, guard rules narrow, env is built per call |
| task-5 store read API | `src/readapi.mjs` `demo/readapi.test.mjs` | 20 checks: `Harness.open(..., {readOnly: true})` and the storage scans only, no raw SQL, parentage printed |
| task-6 interactive TUI on pi-tui | `src/tui/rows.mjs` `src/tui/sync.mjs` `src/tui/frame.mjs` `src/tui/viewmode.mjs` `src/tui/driver.mjs` `demo/tui.test.mjs` `demo/tui-interactive.mjs` | 27 checks: rows per committed entry, in-flight partial, clipping, overlay remembers the frame underneath, headless driver rules, and the round trip (typed line → owner's socket → one committed submission → the reader's view gains that `pi.user` row) |
| task-7 CLI surfaces | `src/cli-intent.mjs` `cli.mjs` `demo/cli-open.mjs` `demo/cli.test.mjs` | 31 checks: print/JSON/RPC share ONE invocation path, unknown flag refused, reopen verbs reopen the SAME store, replay rule |
| task-8 pi package compatibility | `src/packages/discover.mjs` `src/packages/loader.mjs` `src/packages/adapter.mjs` `src/packages/matrix.mjs` `demo/packages.test.mjs` `scripts/render-matrix.mjs` | 35 checks: five real pi packages loaded (three user-plane, one project-plane, one fixture), pi handlers bridged at pi-durable hook points, matrix invariants |
| task-9 ownership + multiplexer | `src/ownership.mjs` `src/attach.mjs` `demo/attach-writer.mjs` `demo/attach-reader.mjs` `demo/attach.test.mjs` | 14 checks: one writer claims, second writer refused naming the holder, reader reads without a second mutation line, queued write lands exactly once by `requestId`, clean exit releases, SIGKILL reclaims, stale lock = free |
| task-10 settings + policy | `src/settings.mjs` `demo/settings.test.mjs` | 27 checks: pi's SettingsManager resolution, system-prompt sections, compaction/restart/retry policies from pi-durable's exported defaults, read back by a SECOND process |
| task-11 docs/provenance | `scripts/audit-provenance.mjs` `scripts/audit-orchestration.mjs` `docs/provenance.md` `docs/package-support.md` `README.md` | every source file carries a provenance header (81/81), no code-level dependency on the dropped orchestration concepts (44 files), docs generated from the matrix data |
| task-12 suite + offline proof | `scripts/suite.mjs` `scripts/audit-pi-docs.mjs` | `SUITE pass=12 fail=0`, exit 0; `strace -f -e trace=connect` over the suite: 0 `AF_INET` connects |

The file sets are disjoint by construction — no file appears in two rows — which is what makes the sibling
tasks parallel rather than sequential: task-3 never edits a file task-4 owns, and so on. The checkpoint tag
per task is the machine-checkable half of that claim:

```
git log --reverse --format="%H %s" | while read hash rest; do
  tags=$(git tag --points-at "$hash" | tr '\n' ','); [ -n "$tags" ] || continue
  files=$(git diff --name-only "$hash^" "$hash" | tr '\n' ' ')
  echo "${tags%,} | ${rest:0:50} | ${files:0:150}"
done
```

## Re-running the harness's own checks

```
node scripts/suite.mjs                 # 12 demos+audits, exit 0, no keys, no network
node scripts/sync-pi.mjs --offline --report   # PIN == DECLARED == RESOLVED, fallback null, drift "offline"
node scripts/audit-pi-docs.mjs         # pi's OWN docs vs the matrix: 213 capabilities, 82 rows
```

## Where the work was handed to pi-native sub-agents

The sub-agent route that worked in this workspace was `pi --no-extensions -p --mode json --model
"strata/qwen3.8-flash-next-iq3_s" --thinking low`, and it needed `PI_CODING_AGENT_DIR` pointed at an
isolated directory: on the default provider plane a sub-agent's turn went to a billed endpoint, which both
made the proof depend on the network and made it cost money. With the isolated agent dir the same probe
returned `OK`. The durable state behind each sibling task above is the goal harness's own task tree
(verification contract per task, checkpoint tag per task); the file-disjointness rule is what let those
siblings be taken in parallel rather than one after another.
