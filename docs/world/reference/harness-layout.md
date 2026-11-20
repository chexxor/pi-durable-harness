# Reference: how this repo is laid out

Kind: reference. This page names one surface: where the code, the demos, the checks, and the docs live,
and what each directory is for. It states no steps to follow and no behaviour rules; those live in the
other reference pages.

Measured at tree `0687bc1e8f4f585c2e50d42b18526b51015462c1`, pin `v1.5.1`
(sha `dd30101cfc5b0609411dd80b6f93adbc14db14cf`). The counts below carry the command that prints them.

## The code

| Path | What it is |
| --- | --- |
| `src/core.mjs` | spine: storage → registry → tools → env → `Harness.open` → root conversation. One of the two storage openers, with `src/readapi.mjs` |
| `src/cli-intent.mjs`, `cli.mjs`, `src/rpc.mjs` | one intent shape, one invocation path: print / JSON / RPC |
| `src/ownership.mjs`, `src/attach.mjs` | store ownership (one writer) and the multiplexer attach path |
| `src/readapi.mjs`, `src/eventfeed.mjs`, `src/viewmodel.mjs` | the single read-only read API, the event feed, and the view model |
| `src/tui/` | the pi-tui view: rows, sync and watch planes, frame and paint, pi's theme palette, the input overlay, the headless driver |
| `src/agentplane.mjs`, `src/promptplane.mjs` | the ONE plane every surface composes before `Harness.open` (pi's settings, providers, packages, skills, prompts, themes, context files), and pi's input expansion |
| `src/settings.mjs`, `src/providers.mjs`, `src/spend.mjs` | settings and policy resolution, the model plane, the money ledger |
| `src/toolsurface.mjs`, `src/executionenv.mjs` | tool guardrails, custom tools, and the execution environment |
| `src/packages/` | pi package discovery, pi's own loader, the extension shim, and the capability matrix |
| `src/piflags.mjs` | pi's own `Options:` block read out of the pinned `dist/cli/args.js`, so a refused pi flag quotes pi |

## The demos and the checks

| Path | What it is |
| --- | --- |
| `demo/` | the offline demo suite. `*.test.mjs` are the checks the suite runs; `*-interactive`, `*-writer`, and `*-reader` are fixtures a demo drives |
| `scripts/suite.mjs` | runs every demo plus the audits its own list names, then prints one provenance line and one tally |
| `scripts/sync-pi.mjs` | the pin discipline: the pin, the declared set, the resolved set, and drift (only without `--offline`) |
| `scripts/render-matrix.mjs` | prints the capability matrix from `src/packages/matrix.mjs`; the generated reference page is its output, never a hand edit |
| `scripts/ptydrive.mjs` | the committed pty driver the terminal proofs run through |
| `scripts/audit-orchestration.mjs` | no code-level dependency on the orchestration concepts this harness dropped |
| `scripts/audit-provenance.mjs` | every source file names where it came from, and `--markdown` prints the generated table |
| `scripts/audit-pi-docs.mjs` | every capability pi's own vendored docs enumerate is named by a matrix row or called by harness source |
| `scripts/audit-doc-claims.mjs` | every claim page under `docs/world/claims/` still answers with the output it quotes |
| `docs/world/` | the docs, split by kind: tutorial, how-to, reference, explanation, decisions, claims, runbooks |

The suite's tally counts both kinds of check. Read the two lists off the run rather than off this page:

```bash
ls demo/*.test.mjs | wc -l
grep 'for (const script of' scripts/suite.mjs
node scripts/suite.mjs | tail -1
```

```text
20
	for (const script of ["audit-orchestration.mjs", "audit-provenance.mjs", "audit-pi-docs.mjs", "audit-doc-claims.mjs"]) {
SUITE pass=24 fail=0 demos+audits=24 (tree=0687bc1e8f4f585c2e50d42b18526b51015462c1)
```

Twenty demos and four audits make that tally. The two generated pages are regenerated, not edited:

```bash
node scripts/render-matrix.mjs | diff - docs/world/reference/package-support.md
node scripts/audit-provenance.mjs --markdown | diff - docs/world/reference/provenance.md
```

Both diffs printed nothing at the tree above. A drift between a generator and its committed page is a
finding, and the runbook is where a finding gets listed.

## The scratch paths

`.tmp/`, `.scratch/`, and `.ai-work/` are gitignored, which is why every command in every page writes its
store under `.tmp/`. A verification run that wrote a store into a tracked path would dirty the tree the
provenance line reports. Each store directory also gains a `.pi-harness` sidecar, which holds the ownership
lock and the sockets readers attach through; [the attach reference](./attach.md) states the rules it stands
on, and [the CLI surface](./cli-surface.md) states which verbs create it.

## Was the source repo touched?

`~/Git/Durian-Pi` is read-only to this harness, and that is checkable rather than asserted:

```bash
rg -l "pi-durable-harness" ~/Git/Durian-Pi            # -> no matches: none of our content landed there
git -C ~/Git/Durian-Pi status --short                  # its own dirty set, which is not ours
```

The dirty files that repo carries are its own work. This repo's session only read that tree, and every
file extracted from it names the source path in its provenance header, which the generated
[provenance page](./provenance.md) lists for all of them.

## Related

- [The package support matrix](./package-support.md) and [the provenance page](./provenance.md) are the two
  generated pages named above.
- [The parity sweep](./parity-sweep.md) counts the refusals per pi doc.
- [What this repo proves](../explanation/what-this-repo-proves.md) states what the tallies prove.
- [The CLI surface](./cli-surface.md) names the verbs the entry points answer.
