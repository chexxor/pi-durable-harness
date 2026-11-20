# Reference: one store, one writer, many readers

The store in a directory is owned by exactly one process at a time. Everything else - a second
harness, a viewer, a client on a socket - is a reader. This is what "attach" means here, and it is
enforced in code, not by convention: `src/ownership.mjs` and `src/attach.mjs`, both with provenance
headers, and proven offline by `demo/attach.test.mjs`.

The lock is a **transport** artifact. It says who may open a mutation line; the durable store stays
the only source of truth, and no part of this doc's behaviour is reconstructed from the lock.

## The rules, and where each is proven

| Rule | Implementation | Proven by |
| --- | --- | --- |
| One store path is one identity, whatever the spelling | `canonicalStorePath` (realpath, forward slashes, Windows case-fold) + `instanceKey` | `demo/attach.test.mjs` |
| The first invocation in a directory claims the store as the writer | `claimWriter` writes `owner-<instanceKey>.json` next to the store | same |
| A second writer on an owned store fails loudly, naming the holder | `claimWriter` throws before writing | same |
| A reader never opens a mutation line | `createSession(storage)` - a Session with no Harness, hence no scheduler | same |
| Queued inputs land on the one mutation line exactly once | pi-durable's `SubmissionDraft.requestId` admission | same |
| Clean exit frees the store | `releaseWriter` unlinks the lock it holds | same |
| `SIGKILL` leaves a stale lock, and the store is still reclaimable | liveness is `process.kill(pid, 0)`, not "the file exists" | same |

## The loud refusal, in its own words

```
store already owned: <store> is held by pid <pid> since <startedAt> (socket <sock>).
Run again without a writer claim to ATTACH as a reader, or stop that process.
Claiming anyway writes a second mutation line into one store.
```

It names the holder (pid, `startedAt`, the canonical store path) rather than double-owning, which is
what makes it debuggable: the reader can find the process, and the writer can find the socket.

## Why a reader cannot just open the store read-only

Measured, not assumed, at this pin:

```
openNodeSqliteStorage(path, { mode: "read-only" }) -> "attempt to write a readonly database"
```

pi-durable's opener applies its migrations on open, so a read-only connection cannot reach the
store at all. A reader therefore opens the normal connection and uses `durable.createSession(storage)`
- one Session, no Harness, no scheduler, no mutation line - and never calls `commit`. `demo/readapi.test.mjs`
shows the other half of the same guarantee: a `Harness.open(..., { readOnly: true })` viewer rejects
`resume`, `submit`, and a raw `tx.appendEntry` with `ReadOnlySession`.

Both halves are needed. One of them reads as "it happens to work", and neither of them is the rule.

## The socket is transport, the store is state

The owner serves a JSON-lines unix socket next to the lock (`agent-<instanceKey>.sock`). Clients
send one JSON object per line and get one JSON answer per line; the commands are exactly
`src/rpc.mjs`'s `commandNames()`:

```
status  config  read  prompt  watch  abort  compact
```

RPC mode (`node cli.mjs --mode rpc`) and the socket speak the SAME handler, so an attached client
and an in-process caller cannot drift apart. A `prompt` carries a `requestId`; two clients that
submit the same `requestId` produce one input entry on the mutation line, because pi-durable's
admission returns the existing submission rather than writing a second one. Retrying a submission
is therefore safe, which is the property a client needs when it does not know whether its write
arrived.

`watch` is the event feed: a reader advances a cursor over committed entries and sees the in-flight
partial (`pi.live`) as a streaming row, never as an entry.

## Stale lock, and what "free" means

A killed owner never runs `releaseWriter`, so the lock file survives. "Free" is therefore not "the
lock file is gone": `readOwner` reports `owned: false` when the recorded `pid` is dead, and the next
invocation may become the writer. The store's committed state is untouched by either outcome -
which is the whole point of pi-durable being the backend rather than the lock being the truth.

## Where the CLI shows it

```bash
node cli.mjs -p "first"          # claims, runs, releases
node cli.mjs --mode rpc          # same store: this process is the writer again
# while a writer is running in the directory:
node cli.mjs -p "as a reader"    # attaches; it reads the owner's committed state
```

`demo/attach-writer.mjs` and `demo/attach-reader.mjs` are the two-process fixture the suite runs.

The same transport is how the TUI gets a turn: `demo/tui-interactive.mjs --writer-socket <path>` is a
READER (it holds a readOnly store), and a submitted line goes to the owner's `prompt` command, where
pi-durable's `SubmissionDraft.requestId` makes a resend land exactly once. `demo/tui.test.mjs` proves the
whole round trip headless - typed line -> overlay submit -> socket -> one committed submission -> the
view the TUI paints gains that `pi.user` row on the next paint.
