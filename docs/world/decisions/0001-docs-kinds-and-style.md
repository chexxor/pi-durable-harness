Decision: how the docs are split, and the writing rules every page follows

Written against `git rev-parse HEAD` at the moment this decision was taken up:
`0687bc1e8f4f585c2e50d42b18526b51015462c1`, pin `v1.5.1` (`pi-main.pin.json`: refType `tag`,
sha `dd30101cfc5b0609411dd80b6f93adbc14db14cf`). No pin bump, no new dependency.

The critique below describes the pages as they were at that tree. They now live under
`docs/world/<kind>/`, so a reader who wants the sentences being criticised opens the old tree:

```bash
git show 0687bc1e8f4f585c2e50d42b18526b51015462c1:README.md
git show 0687bc1e8f4f585c2e50d42b18526b51015462c1:"docs/<name>.md"   # <name> = attach, context-budget,
                                                                     # execution, package-support,
                                                                     # parity-sweep, provenance
```

Every number in the critique is that tree's number, and the command beside it reproduces it.

## Why this page exists

The old docs answer a question no reader asks in the order the pages present it: they prove that this
harness matches pi long before they let anyone run the harness. This ADR records that critique, decides
the shape of the replacement tree under `docs/world/`, and commits the writing rules that every page in
that tree follows. A later milestone changes pages; it does not re-decide this shape. If a milestone
wants a different shape, it adds `0002-<title>.md` and says why this one stopped working.

## The two audiences, and who reads what

| Audience | What they want to do | Pages they read |
| --- | --- | --- |
| Operator — runs the harness on a machine that has never seen this repo | install it, start a first run, attach a second process to one store, switch the model for one run, tell whether a run worked | `docs/world/tutorial/`, `docs/world/how-to/`, `docs/world/reference/cli-surface.md`, the README's one command per CLI surface |
| Maintainer — re-verifies the parity claims on a later tree | re-measure every count, find which claim stopped being true, find the demo or audit behind a row | `docs/world/reference/` for the generated or audited tables, `docs/world/explanation/`, `docs/world/claims/` and its gate `scripts/audit-doc-claims.mjs`, this critique |

An operator never needs a proof page to run the harness. A maintainer never needs an operator page to
falsify a claim. The directory split enforces both, and the README links each way.

## The critique of every page that existed before the move

Line counts came from `wc -l README.md docs/*.md` at the tree named above.

### README.md — 446 lines

- Kind it actually is: three kinds in one file — a tutorial (its quick start), a reference (the flag
  listings), and an explanation (the parity prose). It is the tour, the manual, and the background essay
  at once.
- Kind it is missing: how-to. It lists commands but no page states a task with steps and a check, so a
  reader with a task has nothing to follow.
- Style violations, quoted from that tree:
  - its longest block is 6,633 characters, one bullet beginning
    `* **scrolling stays exactly where pi's alt-screen keys put it**: pi's `ScrollView` keeps its own` —
    a whole parity argument inside a list item;
  - heading `## Was the source repo touched?` — a heading phrased as a question;
  - `symlinked in), i.e. the screen exactly as it was BEFORE this goal touched it` — a Latin abbreviation
    and a shout-caps word mid-sentence;
  - `git show 0687bc1e8f4f585c2e50d42b18526b51015462c1:README.md | grep -o 'BY NAME' | wc -l` = 9 shout
    emphases, and the heading `## Pi parity — what is honoured, and what is refused BY NAME` mixes sentence
    case with a shout;
  - `That offline-ness is measured, not asserted:` — passive voice where the run is the actor.

### attach.md at the docs root — 92 lines

- Kind it actually is: reference. Its table is rule → implementation → proof, which is the reference shape
  this tree keeps.
- Kind it is missing: how-to. `## Where the CLI shows it` shows four commands and never states the task, its
  precondition, or what the reader sees when it works.
- Style violations, quoted:
  - `The store in a directory is owned by exactly one process at a time.` — passive voice;
  - `This is what "attach" means here, and it is` — a term defined by quoting it instead of naming the action;
  - six table cells read `same` (`grep -c '| same |' ... | wc -l` = 6), so after the first row the proof column
    names nothing;
  - the refusal block is fenced with no language and holds placeholders (`store already owned: <store> is
    held by pid <pid> since <startedAt>`), so a reader can mistake a template for observed output.

### context-budget.md at the docs root — 58 lines

- Kind it actually is: explanation — why one workspace's sessions behaved differently.
- Kind it is missing: how-to. Nothing states the task "keep compaction off for this run" and its steps, which
  is the sentence a reader of that page wants.
- Style violations, quoted:
  - the title `# pi's context budget in THIS workspace: what applies, and when it stopped applying` — a
    heading that is two clauses plus a shout-caps word;
  - `i.e. a whole day after the settings landed and still native, because that session's plane never saw`
    — a Latin abbreviation;
  - `grep -o '\*\*' ... | wc -l` = 16 `**` markers, used to shout `**before**` and `**after**` in a paragraph
    that already says before and after.

### execution.md at the docs root — 64 lines

- Kind it actually is: explanation of the protocol as it ran, plus a task plan and a commit history. Diátaxis
  would call the task plan and the commit history documentation of the wrong thing; as explanation it only
  serves the maintainer.
- Kind it is missing: anything for an operator, and any tree/pin citation, so a reader cannot tell which
  commit its table describes.
- Style violations, quoted:
  - heading `## The module tasks (siblings after the spine, each owning a disjoint file set, each with its own
    verification contract)` — 120 characters with two parenthesised clauses
    (`git show 0687bc1e8f4f585c2e50d42b18526b51015462c1:"docs/<name>.md" | awk 'NR==15{print length($0)}'`
    with `<name>` = execution, prints 120);
  - `... `cli.mjs`, `src/cli-intent.mjs`, `src/rpc.mjs`, `src/packages/matrix.mjs` and `README.md` were
    extended again by the task-8 agent-plane commit` — passive voice, on a page whose longest line is 836
    characters;
  - its numbers stopped matching the tree: `every source file carries a provenance header (97/97)`,
    `the dropped orchestration concepts (52 files)`, `SUITE pass=14 fail=0`, `pi's OWN docs vs the matrix:
    306 capabilities, 95 rows`. Re-measured at the tree named above they are 127/127, 67 files, pass=23, and
    443 caps over 139 rows. A page may carry numbers without a command or a tree citation; it may not carry
    numbers that were once true and are no longer true.

### package-support.md at the docs root — 208 lines

- Kind it actually is: reference — one row per pi capability, status, reason, evidence.
- Kind it is missing: a pointer to how a reader uses a row and how a maintainer adds one; that rule lives in
  the generator's comment instead of on the page.
- Style violations, quoted:
  - one row is one line of 3,555 characters (the page's longest), and its `why` cell is a paragraph of six
    sentences inside a table cell;
  - `i.e. a run that asked for the scripted plane could still reach an endpoint` — a Latin abbreviation inside
    generated prose, which no hand edit may fix;
  - `grep -o 'BY NAME' ... | wc -l` = 10 shout emphases.

### parity-sweep.md at the docs root — 225 lines

- Kind it actually is: the maintainer's explanation (how each parity decision was made) carrying reference
  tables.
- Kind it is missing: everything an operator needs, and a citation that names a tree.
- Style violations, quoted:
  - title `# Pi parity sweep — what this harness honours from pi, and what it refuses BY NAME` — title caps
    and a shout in a heading;
  - `at \`git rev-parse HEAD\` = the commit this page was written on, pin \`v1.5.1\` / sha` — the citation
    placeholder was never filled with the sha, so the page cites nothing;
  - `is \`.ai-work/pi-tui-parity-goal/pi-parity-sweep.md\` (gitignored state, same numbers)` — the evidence a
    maintainer needs sits in a gitignored path that a clone cannot open;
  - `grep -o '\*\*' ... | wc -l` = 168 `**` markers (84 bold spans) and `grep -o 'BY NAME' ... | wc -l` = 41
    shout emphases on one page.

### provenance.md at the docs root — 104 lines

- Kind it actually is: reference — the audit's table of file → provenance line → what changed.
- Kind it is missing: a heading, an audience, and a tree citation. `grep -c '^#'` on that page = 0: it opens
  with a count.
- Style violations, quoted:
  - line 1 is `headers found in 97/97 source files` — no title, and a count that stopped being true:
    `node scripts/audit-provenance.mjs` printed `headers found in 127/127 source files`, and
    `node scripts/audit-provenance.mjs --markdown | diff - <new path>` reported 54 lines of drift;
  - that page holds 99 table rows against 51 unique ones, so every file is listed twice — the generator walks
    `src`, `demo`, `scripts` and then `.` again, so the count it prints double-counts and the table repeats
    (this is a finding, and `docs/world/claims/` carries it);
  - the page names no tree, so nothing on it can be pinned to a commit.

## The restructure map

Basenames stay; only the directory changes, so a link fix is mechanical. The dominant kind of each page
decides its directory, and the critique above is the reason for each row. The old paths were the six
`<name>.md` files at the docs root.

| Old (docs root) | New | Kind it actually is |
| --- | --- | --- |
| `attach.md` | `docs/world/reference/attach.md` | reference |
| `context-budget.md` | `docs/world/explanation/context-budget.md` | explanation |
| `execution.md` | `docs/world/explanation/execution.md` | explanation, honestly labelled a process log |
| `package-support.md` | `docs/world/reference/package-support.md` | reference, generated |
| `provenance.md` | `docs/world/reference/provenance.md` | reference, generated |
| `parity-sweep.md` | `docs/world/reference/parity-sweep.md` | reference (the maintainer's tables) |

New pages fill the quadrants the critique shows are missing:

- `docs/world/tutorial/first-run.md` — the one tutorial: install, first run, first committed turn, how to
  tell it worked.
- `docs/world/how-to/attach-a-second-process.md`, `docs/world/how-to/switch-the-model-for-one-run.md`,
  `docs/world/how-to/verify-a-claim-offline.md`.
- `docs/world/reference/cli-surface.md` — what the CLI honours and what it refuses, by name.
  `docs/world/reference/settings-and-policy-keys.md` — the settings and policy keys it maps.
- `docs/world/explanation/what-this-repo-proves.md` — the maintainer's entry point: what the audits prove and
  how to read a verdict.
- `docs/world/decisions/` — this page and its successors.
  `docs/world/claims/` — one file per functionality gap the docs reveal, each falsified by
  `scripts/audit-doc-claims.mjs`.
  `docs/world/runbooks/next-milestone.md` — exactly one, indexing every claim for the next milestone.

## The rule for generated pages

A generated page moves by moving its generator's output path. Nobody hand-edits a generated page: a hand-edited
copy cannot be checked against the data it came from, and the matrix's whole point is that a drift between
data and page is a finding rather than a shrug. The three commands, at the new paths:

```bash
node scripts/render-matrix.mjs > docs/world/reference/package-support.md
node scripts/audit-provenance.mjs --markdown > docs/world/reference/provenance.md
node scripts/render-claims.mjs > docs/world/reference/claims-index.md
node scripts/render-matrix.mjs | diff - docs/world/reference/package-support.md   # must print nothing
node scripts/audit-provenance.mjs --markdown | diff - docs/world/reference/provenance.md   # must print nothing
node scripts/render-claims.mjs | diff - docs/world/reference/claims-index.md   # must print nothing
```

All three generators write to stdout only; the redirect lives in the prose and in the suite. Prose inside a
generated page is fixed at its source — a matrix row in `src/packages/matrix.mjs`, or a file's own provenance
header — never in the rendered file. `scripts/render-matrix.mjs`, `scripts/render-claims.mjs`, and
`scripts/audit-pi-docs.mjs` name the new output path in their own header comments, so the rule is visible where
the generator lives. `scripts/audit-claim-drift.mjs` diff-checks all three generated pages against their
generators on every suite run, so a hand-edit to any of them fails the suite rather than shipping.

## The style rules committed to

1. One page, one kind. A page's first line names its kind: `Tutorial:`, `How-to:`, `Reference:`,
   `Explanation:`, `Decision:`, `Claim:`, `Runbook:`.
2. Diátaxis quadrants. A tutorial teaches one whole thing end to end on a real machine. A how-to names one
   task, its steps, and the check that says it worked. A reference states one surface and nothing else. An
   explanation answers why something is the way it is.
3. Plain language. Active voice with a named subject. Headings in sentence case, no trailing punctuation, no
   parenthesised clauses, at most 8 words. No Latin abbreviations — write `for example` or `that is`. Bold marks
   a term once, never a shout: prose says `refused by name`, and the shout stays only inside quoted program
   output.
4. Every number carries its command or its tree. A count appears beside the command that produces it, or the
   page states the tree it was measured at as a full 40-hex sha plus the pin. A number with neither belongs in
   `docs/world/claims/`.
5. A command a reader runs is fenced as `bash`, one command per line, and every path in it either exists in
   this repo or is created by an earlier line.
6. Links point at tracked files. A page never cites a gitignored path as its evidence; it names the command that
   regenerates that evidence.
7. Pi's words stay pi's words. Program output, refusal wording, and keybinding names are copied and fenced, not
   paraphrased. This repo adds no theme colour and no invented hint.

## Examples that already pass

- `docs/world/reference/attach.md` heading `## The rules, and where each is proven` — sentence case, four
  words, and it promises the table below it.
- `docs/world/reference/attach.md` heading `## Why a reader cannot just open the store read-only` — sentence
  case, names the subject, states the question the section answers.
- `docs/world/reference/attach.md` heading `## Where the CLI shows it` — sentence case, four words.
- The rules table in `docs/world/reference/attach.md`: rule → implementation → proof. That is the reference
  shape this tree keeps, and the shape `docs/world/reference/cli-surface.md` follows.
- A matrix row reason in `src/packages/matrix.mjs`: one sentence naming the pi-durable concept that is
  missing, which is what makes the row falsifiable at a later pin.
- `docs/world/reference/attach.md` line `Measured, not assumed, at this pin:` followed by one fenced command and
  its one-line answer — the number-with-a-command rule, already in use.

## What this ADR does not decide

It changes no pi-durable ownership or admission rule, no storage opener, no mutation line, no pin, no matrix
data, and no pi word or theme colour. It fixes no functionality gap: gaps live in `docs/world/claims/` and the
runbook lists them without fixing them. It does not promise that the counts on any page stay true — it requires
the command or the tree citation that makes them checkable.
