# Reference: the settings and policy keys this harness maps

Kind: reference. This page states one surface: the settings keys pi spells at this pin, and which of them
cross into pi-durable's names. It states no task and no proof history.

Measured at tree `0687bc1e8f4f585c2e50d42b18526b51015462c1`, pin `v1.5.1`
(sha `dd30101cfc5b0609411dd80b6f93adbc14db14cf`, read from `pi-main.pin.json`). Every listing below is
copied from a run on that tree, and the command above it regenerates the listing on any tree.

## Where the two scopes come from

```bash
node scripts/diagnose-context-budget.mjs
```

That run's first line names pi's resolved settings for this directory, and a later line names the project
file it read:

```text
settings [cwd=/home/chexxor/Git/pi-durable-harness]: compaction.enabled=false defaultModel=qwen3.8-flash-next-iq3_xxs defaultProvider=strata-server theme=starry-night packages=["npm:@woksin/pi-context-budget"]
project .pi/settings.json exists=true modified=2026-11-15T04:27:40.836Z
```

`src/settings.mjs` resolves both scopes through pi's own `SettingsManager`: global first, then project
winning, resource lists combined. This repo reads the file once, in pi's vocabulary, because a second
parser would be a second vocabulary for one file. [The context-budget explanation](../explanation/context-budget.md)
states what the file's timing did to sessions that started before it landed.

## The key names, as the pinned schema spells them

```bash
grep -n 'const PI_POLICY_KEYS\|const PI_AGENT_KEYS\|const PI_OTHER_KEYS' src/settings.mjs
```

That command prints three lines, verbatim:

```js
const PI_POLICY_KEYS = ["compaction", "retry", "steeringMode", "followUpMode"];
const PI_AGENT_KEYS = ["defaultProvider", "defaultModel", "defaultThinkingLevel", "modelThinkingLevels", "defaultTools", "enabledModels"];
const PI_OTHER_KEYS = ["sessionDir", "branchSummary", "cacheWarming", "terminal", "images", "markdown", "thinkingBudgets", "transport", "tuiMode", "warning", "quietStartup", "fullscreenExitOutput", "mermaid", "packageSource", "defaultProjectTrust", "sessionShareDestination"];
```

The three groups are pi's own key names sorted by what pi-durable does with them: the policy keys become
a policy the store carries, the agent keys describe one run's agent, and the other keys belong to pi's
display and session concerns. `src/settings.mjs` names them as constants rather than scattering them, so
a key pi spells and pi-durable has no counterpart for is a refusal the docs can show, not a silent skip.

## What crosses into pi-durable's names

| pi's key | pi-durable's name | Where the run applies it |
| --- | --- | --- |
| `compaction` | `CompactionSettings`: `enabled`, `reserveTokens`, `keepRecentTokens`, `modelOverrides` | `src/agentplane.mjs:60` hands it to `Harness.open`, and pi-durable's `CompactionPolicy` fills any knob pi leaves unset |
| `retry` | `ConversationRetryPolicy`: `enabled`, `maxRetries`, `baseDelayMs`, `maxAgentDelayMs` | the same call site; pi-durable merges pi's values over `DEFAULT_RETRY_POLICY` |
| `steeringMode` | `HarnessSettings.steeringMode` | the queue that answers a typed `/` |
| `followUpMode` | `HarnessSettings.followUpMode` | the queue that answers what follows a turn |
| `defaultProvider` + `defaultModel` | one `ModelRef` in `Agent.model` | `src/providers.mjs`' prefix rule: a `provider/model` spelling, or a bare id against the default provider |
| `defaultThinkingLevel` | `Agent.thinkingLevel` | one level for the whole conversation |
| `defaultTools` | `Agent.tools` | plain names only, and the refusal below states why |

`Agent.tools` and `Agent.model` reach the store in the agent document, so a process that reopens the store
reads the same policy back. `node demo/settings.test.mjs` proves that reopen case and the merge order above
it; see its check count under the checks heading.

## What is named instead of folded away

`durableSettings` returns `unmapped` rows, each naming one key and one reason. The four reasons it can
give, copied from the source:

```bash
grep -n 'unmapped.push' src/settings.mjs
```

```js
unmapped.push({ key: `retry.${key}`, reason: "pi-durable's retry policy is about model attempts (ConversationRetryPolicy); provider transport retry has no field there" });
unmapped.push({ key: `compaction.${key}`, reason: "no field in pi-durable's CompactionSettings at this pin" });
unmapped.push({ key, reason: "no pi-durable counterpart at this pin" });
unmapped.push({ key, reason: "pi's display/session concern; this harness keeps its own surface for it (store path is core.mjs's --store, TUI is src/tui/)" });
```

The same discipline as the matrix: a key both sides spell is carried, and a key only one side spells is
reported. pi-durable's side of the gap is the mirror image — `backgroundTokens`, `progress`, `restartLimit`,
`contextRetentionMs`, `documentRetentionMs`, `afterFailedRun`, `toolExecution` — pi's settings schema names
no key for any of them at this pin.

## What the agent shape refuses

`agentConfig` refuses two spellings rather than guessing at them:

```bash
grep -n 'refused.push' src/settings.mjs
```

```js
refused.push({ key: "defaultTools (+name/-name entries)", reason: "pi edits the inherited selection with its own applyToolModifiers; this harness names the offered set instead (Agent.tools)" });
refused.push({ key: "modelThinkingLevels without defaultThinkingLevel", reason: "pi-durable's Agent carries ONE thinkingLevel for the conversation; per-model levels would be a second resolution here" });
```

The demo run proves the first refusal, and quotes pi's own words for the rule that makes it a refusal:

```text
  ok  a +name/-name defaultTools entry is refused with a reason instead of guessed: entry=+codemode refused=["defaultTools (+name/-name entries)"]
  ok  pi's shipped docs name the +name/-name edit rule, which is why the refusal is a refusal and not a guess: quoted=This replaces `bash` with `powershell` and enables `grep`: `["-bash", "+powershell", "+grep"]`. Project settings apply on top of user settin
```

## What pi-durable supplies when pi names nothing

The defaults are pi-durable's exported constants, never a copy of a number. Quoted from the same demo run:

```text
  ok  the retry default IS pi-durable's DEFAULT_RETRY_POLICY: {"enabled":true,"maxRetries":3,"baseDelayMs":2000,"maxAgentDelayMs":60000}
  ok  the compaction default IS pi-durable's DEFAULT_COMPACTION_POLICY (pi's docs name the same numbers): {"enabled":true,"reserveTokens":16384,"keepRecentTokens":20000,"backgroundTokens":32768}
  ok  the progress default IS pi-durable's DEFAULT_PROGRESS_POLICY: {"partialIntervalMs":100,"outputIntervalMs":100,"persistWithinMs":1000}
  ok  the restart default is pi-durable's DEFAULT_RESTART_LIMIT: DEFAULT_RESTART_LIMIT=5
```

## What one run shows about the settings it read

Every run opens with an inventory line on stderr, and the settings columns of that line at this tree:

```text
plane: packages=4 (@mjakl/pi-kagi-api,awesome-pi-themes,pi-deepinfra,pi-goal-x) extensions=4 loaded=4 bridged=4 commands=19 shortcuts=0 templates=0 skills=0 themes=73 contextFiles=0 theme=starry-night settings=0 unmappedSettings=0 skipped=none
```

That line names pi's theme for the run and counts nothing for the two settings columns, even though the
scope files above hold keys. [The claim page](../claims/config-settings-inventory-counts-nothing.md)
records that gap with the commands and the two source lines it comes from.

## Checks

```bash
node demo/settings.test.mjs
```

The last line of that run:

```text
settings: 28/28 checks passed
```

## Related

- [The model how-to](../how-to/switch-the-model-for-one-run.md) names what changes for one run instead of
  for every run.
- [The CLI surface](../reference/cli-surface.md) states the flags that override a settings value.
- [The package support matrix](../reference/package-support.md) carries the same mapping as one row per
  pi capability, generated from `src/packages/matrix.mjs`.
- [What this repo proves](../explanation/what-this-repo-proves.md) says what a check count is proof of.
