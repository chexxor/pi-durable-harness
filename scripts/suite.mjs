#!/usr/bin/env node
// scripts/suite.mjs - run every offline demo, print one provenance line, then one line per demo.
//
// PROVENANCE: the "one format" idea is taken from ~/Git/Durian-Pi/src/provenance.mjs
// (`formatDependencyProvenance`: "Anything that reports a suite verdict prints this line, so a number
// can always be traced to the tree and dependency set that produced it"), 2026-11-14. What changed:
// the seat/worktree half of that provenance (item worktrees, per-seat locks) is dropped because this
// harness has no seats; the git revision, pin and dependency-set classification are kept, because a
// verdict from an unlinked tree is still not a verdict about the pin.
import { readdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { release } from "node:os";

const ROOT = resolve(join(fileURLToPath(import.meta.url), "..", ".."));
const DEMO_DIR = join(ROOT, "demo");

function git(args) {
	// A read-only report must not crash because git is unavailable or the tree has no commits.
	// @temp: null is the answer, and the provenance line prints "unknown" rather than a guess.
	// @temp: the exit code of the suite is the tally, never the git status.
	try {
		return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
	} catch {
		return null;
	}
}

function pinSummary() {
	try {
	 const pin = JSON.parse(readFileSync(join(ROOT, "pi-main.pin.json"), "utf8"));
	 return `pin=${pin.ref ?? String(pin.sha).slice(0, 12)}`;
	} catch (err) {
		// No pin file means the spine is missing, and a verdict without a pin is not comparable:
		// say so in the line rather than printing a bare tally.
		return `pin=missing(${String(err?.message ?? err)})`;
	}
}

function provenanceLine() {
	const tree = git(["rev-parse", "HEAD"]) ?? "unknown";
	const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]) ?? "unknown";
	const dirty = git(["status", "--porcelain", "--", "."])?.split("\n").filter((l) => l.trim()).length ?? null;
	// dependencySet comes from sync-pi's classification, so "built" cannot mean two things.
	let set = "unknown";
	try {
		// The suite runs the pin report OFFLINE, and says so in the provenance line: the suite's whole claim
		// is that a verdict came without a network, and a report that reached upstream would make that
		// claim unprovable. `--offline` prints the same PIN/DECLARED/RESOLVED planes and an honest DRIFT line.
		const out = execFileSync("node", [join(ROOT, "scripts", "sync-pi.mjs"), "--offline", "--report"], { cwd: ROOT, encoding: "utf8" });
		const match = /via=(\S+)/.exec(out);
		set = match ? match[1] : "unknown";
	} catch {
		set = "report-failed";
	}
	return `PROVENANCE tree=${tree} branch=${branch} uncommitted=${dirty ?? "unknown"} node=${process.version} host=${process.platform} ${release()} ${pinSummary()} dependencySet=${set} pinReport=offline`;
}

function demos() {
	return readdirSync(DEMO_DIR).filter((f) => f.endsWith(".test.mjs")).sort();
}

function runScript(argv) {
	try {
		const out = execFileSync("node", argv, { cwd: ROOT, encoding: "utf8", timeout: 180000 });
		return { ok: true, out };
	} catch (err) {
		return { ok: false, out: String(err?.stdout ?? "") + String(err?.stderr ?? err?.message ?? err) };
	}
}

function run(file) {
	return runScript([join(DEMO_DIR, file)]);
}

const line = provenanceLine();
console.log(line);
let pass = 0;
let fail = 0;
for (const file of demos()) {
	const r = run(file);
	if (r.ok) {
		pass++;
		console.log(`PASS ${file}`);
		for (const l of r.out.split("\n")) if (l.trim()) console.log(`  ${l}`);
	} else {
		fail++;
		console.log(`FAIL ${file}`);
		for (const l of r.out.split("\n")) if (l.trim()) console.log(`  ${l}`);
	}
}
// The four audits run in the same command as the demos, so "the suite is green" means one thing every
	// time: the demos pass, the tree has no code-level dependency on the dropped orchestration layer,
	// every source file still names where it came from, and every claim page under docs/world/claims/
	// still answers with the output it quotes. Each is a check rather than a prose claim, and a
	// suite that ran only the demos would be green on a tree that violated any of them.
	for (const script of ["audit-orchestration.mjs", "audit-provenance.mjs", "audit-pi-docs.mjs", "audit-doc-claims.mjs"]) {
	 const audit = runScript([join(ROOT, "scripts", script)]);
	 if (audit.ok) {
	 pass++;
	 console.log(`PASS ${script}`);
	 for (const l of audit.out.split("\n")) if (l.trim()) console.log(` ${l.trim()}`);
	 } else {
	 fail++;
	 console.log(`FAIL ${script}`);
	 for (const l of audit.out.split("\n")) if (l.trim()) console.log(` ${l.trim()}`);
	 }
 }
console.log(`SUITE pass=${pass} fail=${fail} demos+audits=${pass + fail} (${line.split(" ")[1]})`);
process.exitCode = fail ? 1 : 0;
