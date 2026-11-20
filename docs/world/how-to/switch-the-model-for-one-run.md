# How-to: switch the model for one run

Kind: how-to. One task, its steps, and the check that says it worked.

Measured at tree `0687bc1e8f4f585c2e50d42b18526b51015462c1`, pin `v1.5.1`
(sha `dd30101cfc5b0609411dd80b6f93adbc14db14cf`).

## The task

Name the model one run answers with, without editing any settings file. pi spells the two verbs this page
uses, `--model <ref>` and `--provider <name>`, and this harness resolves them through pi's model plane.

## Ask what this machine offers

The scratch directory in this page's paths needs to exist before a run names it:

```bash
mkdir -p .tmp/switch
node cli.mjs --list-models
```

```text
plane: models=2 available (offline through pi's model plane; 2 configured by pi's auth plane)
provider       model                       context  max-out  thinking  images  auth
strata         qwen3.8-flash-next-iq3_s    204.8K   32.8K    yes       yes     configured
strata-server  qwen3.8-flash-next-iq3_xxs  131.1K   24.6K    yes       no      configured
```

pi's verb supplies the column names and the token shorthand, and pi's fuzzy filter answers the search form
`--list-models <pattern>`, including pi's own wording for no match:

```bash
node cli.mjs --list-models nope
```

```text
No models matching "nope"
```

The `auth` column is this harness's addition beside pi's columns; the row in
[the package support matrix](../reference/package-support.md) states that difference.

## Switch for one run

```bash
node cli.mjs --store .tmp/switch/a.sqlite --cwd .tmp/switch --model strata/qwen3.8-flash-next-iq3_s -p "one run only"
```

That step leaves the offline proof: it asks a real provider, so it needs whatever that provider needs.
Run it where that is what you want. What you can check offline is the resolution, not the answer.

## Check the run answered

The `message_end` record of a json run names both the plane and the model:

```bash
node cli.mjs --store .tmp/switch/b.sqlite --cwd .tmp/switch --mode json --faux "checked" -p "checked"
```

```text
{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"checked"}],"api":"faux:1795124129753:5bgqdeatz5","provider":"faux","model":"faux-1","usage":{"input":0,"output":2,"cacheRead":0,"cacheWrite":3303,"totalTokens":3305,"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0}},"stopReason":"stop","timestamp":1795124129753,"thinkingLevel":"off"}}
```

`"provider":"faux"` there says pi-ai's scripted plane answered, because the command spelled `--faux`.
A run that spelled a provider ref answers with that provider in the same two fields.

## What gets refused, and why

A ref no provider declares is refused, and the run commits nothing:

```bash
node cli.mjs --store .tmp/switch/c.sqlite --model nope/nope -p "hi"
```

```text
warning [model]: nope/nope does not resolve against the providers this machine declares (faux, strata, strata-server)
the run committed no assistant text
```

That run exits 1. The provider list in the sentence is this machine's, not a remembered one.

A provider ref beside `--faux` is refused at open, in one sentence both gates share:

```bash
node cli.mjs --store .tmp/switch/d.sqlite --model strata/qwen3.8-flash-next-iq3_s --faux probe -p "probe"
```

```text
this run spelled --faux, so pi-ai's faux plane answers it; strata/qwen3.8-flash-next-iq3_s would reach pi's provider plane instead
```

That run exits 1 before the store opens, so it leaves no store file and no lock.
[The matrix row](../reference/package-support.md) states that rule where the code lives.

The thinking vocabulary is pi-durable's, and a level outside it is refused by name:

```bash
node cli.mjs --thinking nope -p "hi"
```

```text
--thinking needs one of off, minimal, low, medium, high, xhigh, max; got nope
```

## Checks, in order

| Step | Check |
| --- | --- |
| the plane names candidates | `--list-models` prints one row per candidate with pi's column names |
| the ref resolved | the json run's `message_end` record names `"provider"` and `"model"` |
| an unknown ref refused | exit 1, plus the line `the run committed no assistant text` |
| a faux run kept scripted | exit 1, and the store file is absent afterwards |

## Related

- [Settings and policy keys](../reference/settings-and-policy-keys.md) states what a settings file changes
  between runs, and which keys do not cross.
- [The CLI surface](../reference/cli-surface.md) names `--model`, `--provider`, and `--thinking` in the
  table of verbs this harness answers.
