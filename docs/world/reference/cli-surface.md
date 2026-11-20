# Reference: the command-line surface this harness honours

Kind: reference. This page states one surface and nothing else: the flags `cli.mjs` answers, and the pi
flags it refuses by name.

Measured at tree `0687bc1e8f4f585c2e50d42b18526b51015462c1`, pin `v1.5.1`
(sha `dd30101cfc5b0609411dd80b6f93adbc14db14cf`). The listings below are copied from runs on that tree, and
the first command regenerates them on any tree.

## The surface as it prints

```bash
node cli.mjs --help
```

That run exits 0 and opens with:

```text
pi-durable-harness [options] [--] [prompt words...]
```

The flag table it prints, verbatim:

```text
  --cwd <dir>             work in <dir> (default: the directory this ran in)
  --store <path>          durable store (default <cwd>/harness.sqlite)
  --mode <text|json|rpc>  output mode (default text)
  -p, --print             run the prompt and exit
  -c, --continue          continue this directory's root conversation
  -r, --resume            same as --continue (one store per directory = one root line)
  --conversation <id>     open a specific conversation id
  --no-session            run in memory; no store file is written
  --model <ref>           provider/model, e.g. deepinfra/llama-3.1-8b or faux/faux-1
  --provider <name>       provider for a bare --model
  --system-prompt <text>  base system prompt
  --append-system-prompt <text>   extra system section
  --tools <list>          comma list of tool names
  --exclude-tools <list>  comma list of tool names to drop
  -t, --tools <list>      comma list of tool names
  -xt, --exclude-tools <list>  comma list of tool names to drop
  --no-tools, -nt         no tools
  --thinking <level>      thinking level for the conversation (pi-durable's Agent.thinkingLevel)
  -e, --extension <path>  load one more pi extension from <path> (repeatable; pi's own loader)
  --skill <path>          load one more pi skill from <path> (repeatable; pi's own loader)
  --prompt-template <path> load one more pi prompt template from <path> (repeatable; pi's own loader)
  --list-models [search]  what pi's model plane offers here (offline), and exit
  --                      end of options; the rest are the prompt words
  --faux <text>           offline scripted reply (demo/CI; no keys, no network)
  --attach                force attach to a running owner as a reader
  --tui                   the harness's flat row surface over this session (this process owns the store)
  --row-view              same as --tui (spelled out, so the row surface stays reachable by name)
  --keystroke-input       feed the TUI keystroke chunks instead of whole lines (what a terminal sends)
  --hold <ms>             stay open after a print turn (so others can attach)
  --width <cols>          TUI width (default: the terminal's)
  --height <rows>         TUI height (default: the terminal's)
  -v, --version           the pinned release this harness resolves, and exit
  --help                  this text
```

## The verbs only this harness spells

pi spells no verb for these, so the row states what the harness adds and which rule it stands on. The
matrix rows in [the package support matrix](../reference/package-support.md) carry the same facts beside
pi's own spellings.

| Verb | What it answers | The rule it stands on |
| --- | --- | --- |
| `--store <path>` | the one SQLite store this conversation lives in | one store per directory; `src/core.mjs` and `src/readapi.mjs` are the only storage openers |
| `--cwd <dir>` | the directory whose pi settings and pi packages the run reads | pi's own settings lookup, global then project |
| `--mode <text\|json\|rpc>` | print text, pi's NDJSON records, or pi's RPC protocol | pi's `docs/json.md` record shapes and pi's rpc entry |
| `--faux <text>` | pi-ai's scripted plane answers, one reply per admission | `src/cli-intent.mjs` sets `realModel = !opened.faux` |
| `--attach` | force the reader path against a live owner | `src/ownership.mjs` and `src/attach.mjs` |
| `--hold <ms>` | keep the owner open after its turn | the ownership lock stays claimed for that window |
| `--tui`, `--row-view` | the flat row surface over this session | the row surface stays reachable by name |
| `--keystroke-input` | one key per chunk, ENTER as `\r` | how a terminal delivers input, so a pipe can speak that way |
| `--width`, `--height` | the row surface's box | the terminal's own size is the default |
| `--no-session` | a run in memory, and no store file | the same admission path, with the store step skipped |

## Values take one argument

Every value-taking verb reads ONE argument. An unquoted sentence splits, and the tail lands in the prompt
words:

```bash
node cli.mjs --store .tmp/surface/a.sqlite --cwd .tmp/surface --faux one two -p "hello"
```

That run answers `one`, and the words `two` and `hello` are the prompt. A value-taking verb with a flag
after it swallows that flag, which is how a flag gets lost silently. The two claims that record this, with
their runs: [faux takes one value](../claims/config-faux-takes-one-value.md) and
[store swallows the next flag](../claims/edge-store-swallows-next-flag.md).

## Pi flags refused by name

The option table this harness reads comes from pi's pinned release, so pi's own words name the flag and
pi's own description words appear in the refusal. `src/piflags.mjs` reads pi's `Options:` block out of
pi's `dist/cli/args.js`, and throws rather than answering from a remembered list.

The last paragraph of `--help` names the set:

```text
A pi flag this harness has no plane for (pi's --api-key, --approve, --no-approve, --offline, --name,
--models, --session-id, --session-dir, --fork, --theme, --use-theme, --no-mcp, --no-builtin-tools,
--tui-mode, --verbose, --export) is refused BY NAME quoting pi's own help words, and docs/world/reference/package-support.md
carries the row that says why - a pi flag is never quietly dropped into the prompt words.
```

Four refusals, copied from runs. Each exits 1:

```text
pi flag --theme <path> Load a theme file or directory (can be used multiple times); this harness does not take it - the capability matrix names it in docs/world/reference/package-support.md
pi flag --api-key <key> API key (defaults to env vars); this harness does not take it - the capability matrix names it in docs/world/reference/package-support.md
pi flag --fork <path|id> Fork a session by file path or full/partial ID into the current directory; this harness does not take it - the capability matrix names it in docs/world/reference/package-support.md
pi flag --no-mcp Disable built-in MCP support: no servers connect and no MCP tools; this harness does not take it - the capability matrix names it in docs/world/reference/package-support.md
```

## Refusals this harness spells itself

A spelling no branch answers, and no pi table row names, gets this line and exits 1:

```text
unknown flag --bogus-flag; run with --help
```

A short spelling pi's table does not name gets pi's own wording for an unknown option:

```text
unknown option -Z; run with --help
```

Three more, each with the condition named:

```text
--thinking needs one of off, minimal, low, medium, high, xhigh, max; got nope
--mode must be text, json, or rpc; got nope
--attach needs a live owner; the store is not claimed
```

## The pin, in one line

```bash
node cli.mjs --version
```

```text
pin v1.5.1 (dd30101cfc5b) - 10 @earendil-works packages declared, 1.5.1/1.5.1/1.5.1/1.5.1/1.5.1/1.5.1/1.5.1/1.5.1/1.5.1/1.5.1
```

`node scripts/sync-pi.mjs --offline --report` states the same three planes plus the drift line; see
[the first-run tutorial](../tutorial/first-run.md) for what the report means.

## Where the rows are proved

The capability matrix rows name pi verbs this harness does not take, and
[the parity sweep](../reference/parity-sweep.md) counts them per pi doc. Both counts come from generators:
`node scripts/render-matrix.mjs` prints the matrix, and `node scripts/audit-pi-docs.mjs` checks that every
capability pi's own docs enumerate is named by a row or called by harness source.
