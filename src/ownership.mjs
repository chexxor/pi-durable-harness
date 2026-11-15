// src/ownership.mjs - which process owns the store in this directory, and what "attach" means.
//
// PROVENANCE: the identity rule is extracted from ~/Git/Durian-Pi/src/instance.mjs ("ONE STORE <=>
// ONE DRIVER <=> ONE INSTANCE KEY", canonicalStorePath: realpath, forward slashes, Windows
// case-fold; a `--instance` label never changes the derived key), 2026-11-14. What changed: Durian-Pi
// used the key to name OS artifacts (Job Objects, triggers, log paths) for its broker/seat driver -
// there is no broker here, so only the key and the lock survive. The lock is a transport lock, NOT
// harness state: the durable store remains the only source of truth.
//
// VERIFIED AGAINST PINED 1.5.1 (measured, not assumed):
//   - openNodeSqliteStorage(path, {mode:"read-only"}) throws "attempt to write a readonly database":
//     the opener applies migrations on open, so a reader cannot use a read-only connection.
//   - A reader therefore opens the same opener (read-write connection) but uses
//     durable.createSession(storage) - a Session with no Harness, hence no scheduler and no
//     mutation line - and never calls commit.
//   - Two Harness.open() on one store is double ownership; that is what this module refuses.
import { existsSync, mkdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";

/** The store path canonicalized for identity: two spellings of one file are one store. */
export function canonicalStorePath(storePath) {
	if (typeof storePath !== "string" || storePath.trim() === "") {
		throw new TypeError("canonicalStorePath needs a non-empty store path");
	}
	const absolute = resolve(storePath);
	let real = absolute;
	try {
		// A store that does not exist yet cannot be realpath'd; identity must still be computable,
		// so the textual absolute path is the fallback.
		real = realpathSync(absolute);
	} catch {
		/* not on disk yet: the textual path is the best answer */
	}
	const key = real.replace(/\\/g, "/");
	return process.platform === "win32" ? key.toLowerCase() : key;
}

export function instanceKey(storePath) {
	return createHash("sha256").update(canonicalStorePath(storePath)).digest("hex").slice(0, 16);
}

function lockPath(storePath) {
	return join(dirname(resolve(storePath)), ".pi-harness", `owner-${instanceKey(storePath)}.json`);
}

function pidAlive(pid) {
	// process.kill(pid, 0) is the signal-0 liveness test: it does not send a signal, it reports
	// whether the process exists. EPERM means "exists, not mine to signal" - still alive.
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		return err?.code === "EPERM";
	}
}

/** Read the lock. A lock whose pid is gone is STALE: a killed owner leaves no release, so the
 * lock must be judged by liveness, not by its existence. */
export function readOwner(storePath) {
	const path = lockPath(storePath);
	if (!existsSync(path)) return { owned: false, lock: null, path };
	let lock;
	try {
		lock = JSON.parse(readFileSync(path, "utf8"));
	} catch (err) {
		// A lock we cannot parse is not a claim: report it, do not trust it, and let the caller
		// decide. Silently treating it as free would let two writers share one store.
		return { owned: true, corrupt: true, lock: null, path, reason: `lock at ${path} is not readable JSON: ${String(err?.message ?? err)}` };
	}
	if (!lock.pid || !pidAlive(lock.pid)) {
		return { owned: false, stale: true, lock, path, reason: `lock names pid ${lock.pid} (started ${lock.startedAt ?? "?"}) which is not running` };
	}
	return { owned: true, lock, path };
}

/** Claim the store as the writer. Refuses LOUDLY when a live owner exists. */
export function claimWriter(storePath, { force = false } = {}) {
	const state = readOwner(storePath);
	if (state.owned && !force) {
		throw new Error(
			`store already owned: ${canonicalStorePath(storePath)} is held by pid ${state.lock.pid} since ${state.lock.startedAt} (socket ${state.lock.socket}). ` +
			`Run again without a writer claim to ATTACH as a reader, or stop that process. Claiming anyway writes a second mutation line into one store.`
		);
	}
	if (state.corrupt) throw new Error(state.reason);
	const path = lockPath(storePath);
	mkdirSync(dirname(path), { recursive: true });
	const lock = {
		pid: process.pid,
		storePath: canonicalStorePath(storePath),
		instanceKey: instanceKey(storePath),
		startedAt: new Date().toISOString(),
		socket: join(dirname(path), `agent-${instanceKey(storePath)}.sock`),
	};
	writeFileSync(path, JSON.stringify(lock, null, 2) + "\n");
	return { mode: "writer", lock, path };
}

/** Release the claim. Idempotent, and only releases a lock this process actually holds. */
export function releaseWriter(storePath) {
	const path = lockPath(storePath);
	if (!existsSync(path)) return false;
	let lock = null;
	try {
		lock = JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return false;
	}
	if (lock.pid !== process.pid) return false;
	try {
		unlinkSync(path);
		return true;
	} catch {
		return false;
	}
}

/** Heartbeat so a long-running owner's lock stays auditable; the pid check is the real gate. */
export function touchOwner(storePath) {
	const state = readOwner(storePath);
	if (!state.owned || state.lock?.pid !== process.pid) return false;
	writeFileSync(state.path, JSON.stringify({ ...state.lock, heartbeatAt: new Date().toISOString() }, null, 2) + "\n");
	return true;
}
