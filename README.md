# pi-durable-harness

A single-agent coding harness built on `@earendil-works/pi-durable`. It reuses pi's package ecosystem
(extensions, skills, prompt templates, themes, context files) and pi's CLI surfaces: print, JSON, RPC,
TUI. Durian-Pi's multi-seat orchestration is dropped rather than reimplemented, and
`scripts/audit-orchestration.mjs` checks that no code-level dependency on those concepts survives. Every
source file carries a provenance header naming the file it was extracted from, or saying outright that
there is no original, and `scripts/audit-provenance.mjs` checks that claim against the tree.

Two audiences read different halves of these docs:

- **People who RUN the harness** read the tutorial, the how-to pages, and the reference pages.
- **People who re-VERIFY the parity claims** read the explanation pages, the decisions record, the claim
  pages, and the runbook.

## Install and check the pin

```bash
npm install
node scripts/sync-pi.mjs --offline --report   # pin | declared | resolved, and drift named as NOT MEASURED
node scripts/suite.mjs                        # every offline demo plus the four audits: no keys, no network
```

`npm install` reaches the registry, so it is the one step above that is not offline. Everything else here
runs on the machine. The pin lives in `pi-main.pin.json`, and `--offline` reports it without measuring
upstream, so the pin is neither current nor stale on that evidence.

## The four surfaces

```bash
node cli.mjs -p "hello"                     # print: stdout is the final answer text only
node cli.mjs --mode json -p "hello"         # NDJSON: pi's session header, then its event records
printf '{"type":"status"}\n' | node cli.mjs --mode rpc   # rpc: pi's protocol, one record in, one out
node cli.mjs --tui                          # pi's row surface, with --row-view spelling it out
node cli.mjs --store .tmp/one/a.sqlite --cwd .tmp/one --faux "offline reply" -p "hello"
npm run cli -- --store run.sqlite -p "hi"   # npm swallows its own flags, so harness flags go after --
```

The fifth line is the offline run: `--faux` answers from pi-ai's scripted plane, so it needs no key and
reaches no provider. Quote the reply, because a value-taking flag reads one argument.

## The numbers this page was written at

```bash
node -v
node scripts/suite.mjs | tail -1
node cli.mjs --version
ls docs/world/claims | wc -l
```

```text
v24.22.1
SUITE pass=24 fail=0 demos+audits=24 (tree=0687bc1e8f4f585c2e50d42b18526b51015462c1)
pin v1.5.1 (dd30101cfc5b) - 10 @earendil-works packages declared, 1.5.1/1.5.1/1.5.1/1.5.1/1.5.1/1.5.1/1.5.1/1.5.1/1.5.1/1.5.1
10
```

Read those values off the run, never from memory: the tally names the tree it ran on, and the claim count
names the findings directory. Twenty demos plus four audits make the tally above.

## Where to go next

- Tutorial: [install and land one committed turn](docs/world/tutorial/first-run.md)
- How-to: [run two processes against one store](docs/world/how-to/attach-a-second-process.md),
  [switch the model for one run](docs/world/how-to/switch-the-model-for-one-run.md),
  [verify a claim offline](docs/world/how-to/verify-a-claim-offline.md)
- Reference: [the CLI surface honoured and refused by name](docs/world/reference/cli-surface.md),
  [the settings and policy keys mapped](docs/world/reference/settings-and-policy-keys.md),
  [attach semantics](docs/world/reference/attach.md), [the repo layout](docs/world/reference/harness-layout.md)
- Generated reference (regenerate, never hand-edit):
  [the package support matrix](docs/world/reference/package-support.md) from
  `node scripts/render-matrix.mjs`, and [the provenance table](docs/world/reference/provenance.md) from
  `node scripts/audit-provenance.mjs --markdown`
- Explanation: [what this repo proves](docs/world/explanation/what-this-repo-proves.md),
  [pi's context budget here](docs/world/explanation/context-budget.md),
  [the execution protocol as it ran](docs/world/explanation/execution.md)
- Decisions: [0001: how the docs are split, and the writing rules](docs/world/decisions/0001-docs-kinds-and-style.md)
- Findings: [docs/world/claims/](docs/world/claims/) holds one page per functionality gap, each with the
  command, the output it answered, and the tree and pin it was measured at
- Runbook: [what the next milestone takes](docs/world/runbooks/next-milestone.md) indexes every claim
- Proof: [the parity sweep](docs/world/reference/parity-sweep.md) counts the pi capabilities honoured,
  shimmed, and refused per pi doc

## Before you change anything

[The ADR](docs/world/decisions/0001-docs-kinds-and-style.md) states the rules a change must keep — one
storage opener, one mutation line, ownership claimed and released in `cli.mjs`'s main try and finally, the
pin unmoved, no new dependency, pi's own colours and words — and the reason the docs are split by kind.
A gap you fix goes through [the runbook](docs/world/runbooks/next-milestone.md): re-run the gate, then the
suite, then land one commit.
