# Tutorial: install the harness and land one committed turn

Kind: tutorial. This page teaches one whole thing end to end: a first run on a machine that has never
seen this repo. It states the numbers this page was written at, and every count below carries the command
that reproduces it.

Measured at tree `0687bc1e8f4f585c2e50d42b18526b51015462c1`, the tree this docs commit was made from, with
pin `v1.5.1` (sha `dd30101cfc5b0609411dd80b6f93adbc14db14cf`, from `pi-main.pin.json`). Re-measure before
quoting any number below again.

## What a first run needs

The harness is a Node program that imports ten `@earendil-works` packages. Check the machine first:

```bash
node -v
```

The machine that wrote this page answers:

```text
v24.22.1
```

No page in this repo states a Node floor, and nothing here proves one. That gap is logged as a claim, not
as a number: read [the claim page](../claims/install-node-floor-undocumented.md).

## Install it

```bash
npm install
```

That command resolves the ten dependencies named in `package.json`, every one of them declared `1.5.1`. It
reaches the registry, so it is the one step in this page that is not offline.

Then read the pin before you run anything. `--offline` keeps the report on the machine:

```bash
node scripts/sync-pi.mjs --offline --report
```

The report ends with the three planes and one drift line:

```text
  @earendil-works/pi-tui           pin=1.5.1 declared=1.5.1 resolved=1.5.1 via=lockfile-released
DRIFT: not measured this run (--offline): https://github.com/earendil-works/pi.git was NOT contacted, so the pin is neither current nor stale on this evidence - run without --offline to measure it
```

The JSON block after it answers `"ok": true` with `"pin": "tag \"v1.5.1\" (dd30101cfc5b)"` and
`"fallback": null`. Reading the pin means: the harness runs against a tag, and `fallback: null` says a
missing dependency is a hard stop, not a silent older release.

## Prove the tree runs offline

```bash
node scripts/suite.mjs
```

The last line of a green run reads:

```text
SUITE pass=24 fail=0 demos+audits=24 (tree=0687bc1e8f4f585c2e50d42b18526b51015462c1)
```

`node scripts/suite.mjs` runs every `demo/*.test.mjs` plus the audits its own list names: read that list
before you read the number, because a green run means those checks and not every check this repo has. At
this commit the list holds four audits and `scripts/audit-doc-claims.mjs` is one of them, so the claim
pages elsewhere in these docs are re-checked by the same run that proves the demos.

## Run one turn that cannot touch a model

`--faux` answers the prompt from pi-ai's scripted plane, so the run needs no key and no network. Quote the
reply: `--faux` takes ONE argument, and an unquoted sentence loses its tail into the prompt words.

```bash
mkdir -p .tmp/first-run
node cli.mjs --store .tmp/first-run/a.sqlite --cwd .tmp/first-run --faux "hello from the first run" -p "hello"
```

That run exits 0 and prints three lines:

```text
plane: packages=4 (@mjakl/pi-kagi-api,awesome-pi-themes,pi-deepinfra,pi-goal-x) extensions=4 loaded=4 bridged=4 commands=19 shortcuts=0 templates=0 skills=0 themes=73 contextFiles=0 theme=starry-night settings=0 unmappedSettings=0 skipped=none
warning [model]: pi's settings name strata-server/qwen3.8-flash-next-iq3_xxs, but this run did not ask for a real model (realModel): pi-ai's faux plane answers it, and the settings model is NOT substituted silently
hello from the first run
```

The first line is this run's own plane inventory: what it loaded, and what it skipped. The second line is
the rule, not a failure: pi's settings name a model for this directory, and a run that did not ask for a
real model does not quietly take it. The third line is the answer on stdout, and print mode keeps stdout to
the answer text alone.

## Read the same turn as records

```bash
node cli.mjs --store .tmp/first-run/b.sqlite --cwd .tmp/first-run --mode json --faux "hello from the first run" -p "hello"
```

stdout is NDJSON in pi's own shape. The first records of that run:

```text
{"type":"session","version":3,"id":"1","timestamp":"2026-11-20T01:39:42.921Z","cwd":".tmp/first-run","store":".tmp/first-run/b.sqlite"}
{"type":"agent_start"}
{"type":"message_start","message":{"role":"user","content":"hello","timestamp":1795138782897}}
{"type":"message_end","message":{"role":"user","content":"hello","timestamp":1795138782897}}
{"type":"turn_start"}
```

Run it in your own directory and the `cwd` and `store` fields name your paths. The `usage` block on the
`message_end` record is pi-durable's own count, and `"provider":"faux"`, `"model":"faux-1"` name the plane
that answered.

## Tell that the turn committed

Three checks, all offline:

```bash
ls -a .tmp/first-run
node cli.mjs --store .tmp/first-run/a.sqlite --cwd .tmp/first-run --attach -p "anything"
printf '{"type":"status"}\n' | node cli.mjs --mode rpc --store .tmp/first-run/a.sqlite --cwd .tmp/first-run --faux x
```

1. The directory holds the store and its lock sidecar:

   ```text
   .
   ..
   a.sqlite
   b.sqlite
   .pi-harness
   ```

2. `--attach` refuses, because nothing owns the store any more. The refusal names the condition, and it
   exits 1:

   ```text
   --attach needs a live owner; the store is not claimed
   ```

3. The RPC surface reopens the same store and answers `status`. This store holds the turn above, so `newestEntry`
   names an entry and `usage` names the plane that answered:

   ```text
   {"type":"ready","conversationId":1,"commands":["prompt","steer","follow_up","abort","clear_queue","new_session","get_state","get_messages","set_model","get_available_models","set_thinking_level","get_available_thinking_levels","compact","set_auto_compaction","bash","get_session_stats","switch_session","fork","clone","get_fork_messages","get_entries","get_tree","get_last_assistant_text","get_commands","status","config","read","watch"]}
   {"type":"response","command":"status","success":true,"data":{"pid":2894861,"conversationId":1,"newestEntry":11,"usage":{"models":{"faux/faux-1":{"input":0,"output":6,"cacheRead":0,"cacheWrite":2790,"totalTokens":2796,"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0}}},"tools":{}}}}
   ```

   The `pid` in that record is that run's own process, so it changes on every run; `newestEntry` names the
   entry the print run above committed. A `read` record on the same store answers `{"type":"response","command":"read","success":true,"data":{"items":[…]}}` with
   one item per committed entry, and each item carries the whole message. No CLI verb spells that read-back,
   and [the claim page](../claims/features-no-cli-way-to-inspect-a-store.md) records the gap.

## Let a real model answer

Drop `--faux`. Nothing in this page runs that step, because it leaves the offline proof. What you can check
offline is which model would answer:

```bash
node cli.mjs --list-models
```

```text
plane: models=2 available (offline through pi's model plane; 2 configured by pi's auth plane)
provider       model                       context  max-out  thinking  images  auth
strata         qwen3.8-flash-next-iq3_s    204.8K   32.8K    yes       yes     configured
strata-server  qwen3.8-flash-next-iq3_xxs  131.1K   24.6K    yes       no      configured
```

Then read [the model how-to](../how-to/switch-the-model-for-one-run.md). That page also names the one
spelling that must be refused, with the refusal copied from the run.

## Where to go next

- [The CLI surface](../reference/cli-surface.md) states the flags this harness takes and the pi flags it
  refuses by name.
- [Attach a second process](../how-to/attach-a-second-process.md) runs two processes on one store.
- [Verify a claim offline](../how-to/verify-a-claim-offline.md) re-checks one claim page.
- [What this repo proves](../explanation/what-this-repo-proves.md) says what the tallies are proof of.
- The gaps this reading found live in [docs/world/claims/](../claims/) and in
  [the runbook](../runbooks/next-milestone.md).
