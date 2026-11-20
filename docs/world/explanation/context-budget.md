# Explanation: pi's context budget in this workspace

`scripts/diagnose-context-budget.mjs` prints all of this from the tree, offline, using pi's own readers
(`src/settings.mjs` over pi's `SettingsManager`, `src/packages/loader.mjs` over pi's
`DefaultResourceLoader`) and pi's own session format (`docs/session-format.md`: a `compaction` entry
record carries `fromHook`). Run it in this cwd:

```bash
node scripts/diagnose-context-budget.mjs
```

What it measured on this machine (the run is the evidence; these are the numbers it printed):

| read | answer |
| --- | --- |
| pi's merged settings for this cwd | `compaction.enabled=false`, `packages=["npm:@woksin/pi-context-budget"]`, `theme=starry-night`, `defaultProvider=strata-server` |
| pi's loader plane for this cwd | 4 extension modules, 1 of them `@woksin/pi-context-budget/src/extension.ts` |
| `~/.pi/agent/context-budget.json` | `mode=enforce`, `enforceCwds` covers this cwd, model keys `strata/qwen3.8-flash-next-iq3_s`, `strata-server/qwen3.8-flash-next-iq3_xxs` |
| `~/.pi/agent/trust.json` | `/home/chexxor/Git: true`, so the project plane is loaded at all |
| `pi`'s package list | `@woksin/pi-context-budget` installed project-local at `.pi/npm/node_modules/...` |

## Why the long session still auto-compacted, and why the newer ones do not

pi resolves its settings and package plane **once at `session_start`** (pi's own event:
`pi.on("session_start", ...)` in the package's `src/extension.ts`, and `docs/packages.md` on the loader).
Nothing re-reads them mid-session. This cwd's history shows both sides of that line:

- this project's `.pi/settings.json` — and the project-local install of the package — were written at
  `2026-11-15T04:27:40Z`.
- the one session that started **before** that (`2026-11-14T21:13Z`) resolved a plane with neither. Its
  compactions are all **native**: 17 entries with `fromHook` absent/false, last at `2026-11-15T20:40Z`,
  i.e. a whole day after the settings landed and still native, because that session's plane never saw
  them.
- the seven sessions that started **after** it committed **0 native** compactions; the one that hit its
  budget committed **3 compactions with `fromHook: true`** — those are pi-context-budget's own hand-off
  commits, which is the behaviour the user asked for.

So the hand-off does apply in this workspace, and `compaction.enabled:false` does hold — for sessions
that started after the settings and the package were in place. A session that already resolved its plane
cannot change mid-flight; the fix for a run that must not compact is a new session (or `--no-session`),
not a settings edit to a running one.

## The harness's own rule, which is the same one

The harness does not add a second compaction plane: pi's `compaction` block crosses into `Harness.open`
through `src/settings.mjs`, and pi-durable gates **both** automatic paths on the resolved policy —
`dist/harness/compaction.js` `compactionPolicy` answers
`enabled: conversationModel?.enabled ?? (conversation?.enabled === false ? false : field("enabled"))`
(its comment: "turning compaction off for a conversation does not depend on the model"),
`dist/harness/generation.js` gates the threshold path (`thresholdCompaction` returns undefined when
`!policy.enabled`) and the overflow path (that branch requires `compaction?.enabled === true`).
`demo/settings.test.mjs` proves the effect offline: a grown context plus an explicit `compact()` under
the off switch commits **no `pi.compaction` entry**, and a second process reopening the store reads the
same `{"enabled": false}` back out of pi-durable's own agent doc.

The one thing this harness deliberately does NOT do is inherit pi's *session* mechanics: there is no
session file here to compact, the store is a pi-durable transcript, and pi's `export_html`/`set_session_name`
verbs are named unsupported in `docs/world/reference/package-support.md` for that reason.
