// src/attach.mjs - the multiplexer: one owner holds the mutation line, attached clients read and queue.
//
// PROVENANCE: the read/attach idea comes from ~/Git/Durian-Pi/src/brokerread.mjs and
// ~/Git/Durian-Pi/src/readonlystore.mjs (how a second process reads a store one driver owns),
// 2026-11-14. Durian-Pi's broker/serve and the cross-seat work queue are DROPPED - there are no
// seats, so nothing is brokered. What replaces them is a plain JSON-lines unix socket served by the
// owning process: transport only. The durable store stays the only state.
//
// WHY readers do not open the store themselves (measured on the pinned 1.5.1):
//   - openNodeSqliteStorage(path, {mode:"read-only"}) throws "attempt to write a readonly database"
//     because the opener applies its migrations on open;
//   - a reader could open the same opener read-write and use durable.createSession (no Harness, no
//     scheduler, no commits), but then two processes hold the same store while only the owner knows
//     the seq line.
// Routing every read and write through the owner keeps "one storage opener, one mutation line"
// unambiguous, and it is what makes queued inputs land in commit order.
//
// Exactly-once is harness-owned, not bookkept here: pi-durable's SubmissionDraft carries `requestId`
// and admitSubmission() returns the EXISTING submission when a requestId was already admitted
// (node_modules/@earendil-works/pi-durable/dist/harness/submissions.js). Resending a requestId
// cannot create a second input.
import net from "node:net";
import { existsSync, unlinkSync } from "node:fs";
// One command protocol for both the attach socket and the RPC stdin mode: src/rpc.mjs is the single
// definition, so the multiplexer and the CLI speak the same verbs rather than two copies.
import { handle } from "./rpc.mjs";

function send(sock, payload) {
	sock.write(`${JSON.stringify(payload)}\n`);
}

/** Owner side: serve reads and queued writes over a unix socket. */
export function serveOwner(parts, socketPath) {
	// A socket file left behind by a killed owner is not an owner: claimWriter already proved no
	// live process holds the store, so removing the stale transport is safe and lets the new
	// instance listen.
	// @temp: unlink before listen, because EADDRINUSE would otherwise make a free store unusable.
	if (existsSync(socketPath)) {
		try {
			unlinkSync(socketPath);
		} catch {
			/* someone else owns it; the listen below will report the conflict */
		}
	}
	const server = net.createServer((sock) => {
		let buffer = "";
		sock.on("data", async (chunk) => {
			buffer += chunk.toString();
			let idx;
			while ((idx = buffer.indexOf("\n")) >= 0) {
				const line = buffer.slice(0, idx);
				buffer = buffer.slice(idx + 1);
				if (!line.trim()) continue;
				let msg;
				// A malformed line is answered with an error, never a crash: a client's typo must
				// not take down the session everyone else is reading.
				// @temp: the reply names no command because the line could not be parsed at all.
		// @temp: replying instead of throwing keeps every other attached client reading.
				try {
					msg = JSON.parse(line);
				} catch (err) {
					send(sock, { ok: false, error: `invalid command line: ${String(err?.message ?? err)}` });
					continue;
				}
				try {
					send(sock, { ok: true, command: msg.command, ...await handle(parts, msg) });
				} catch (err) {
					send(sock, { ok: false, command: msg.command, error: String(err?.message ?? err) });
				}
			}
		});
		sock.on("error", () => {
			/* a client that vanishes mid-line is not an owner error */
		});
	});
	try {
		server.listen(socketPath);
	} catch (err) {
		server.close();
		throw new Error(`cannot serve the session at ${socketPath}: ${String(err?.message ?? err)}`);
	}
	return {
		server,
		socketPath,
		close() {
			server.close();
			if (existsSync(socketPath)) {
				try {
					unlinkSync(socketPath);
				} catch {
					/* the socket may already be gone */
				}
			}
		},
	};
}

/** One request, one reply. The timeout is a guard, not the detector: readOwner's pid check is
 * what decides whether a lock is stale, and this is the second line of defense. */
export function request(socketPath, command, payload = {}, timeoutMs = 10000) {
	return new Promise((resolve, reject) => {
		const sock = net.connect(socketPath);
		let buffer = "";
		const timer = setTimeout(() => {
			sock.destroy();
			reject(new Error(`the owning harness at ${socketPath} did not answer within ${timeoutMs}ms; it is busy or gone`));
		}, timeoutMs);
		sock.on("error", (err) => {
			clearTimeout(timer);
			reject(new Error(`cannot reach the owning harness at ${socketPath}: ${String(err?.message ?? err)}`));
		});
		sock.on("connect", () => send(sock, { command, ...payload }));
		sock.on("data", (chunk) => {
			buffer += chunk.toString();
			const line = buffer.split("\n")[0];
			if (!line.trim()) return;
			clearTimeout(timer);
			try {
			 resolve(JSON.parse(line));
			} catch (err) {
				reject(new Error(`malformed reply from the owner: ${String(err?.message ?? err)}`));
			} finally {
				sock.end();
			}
		});
	});
}

/** True when a live owner is reachable. A socket that is present but dead is NOT an owner. */
export async function ownerAlive(socketPath) {
	try {
	 return (await request(socketPath, "status", {}, 3000)).ok;
	} catch {
		return false;
	}
}
