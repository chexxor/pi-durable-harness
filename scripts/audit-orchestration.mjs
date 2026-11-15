// scripts/audit-orchestration.mjs - the "no dependency on the dropped orchestration layer" check, as a
// command rather than a remembered grep.
//
// WHY A SCRIPT AND NOT A PROSE CLAIM: task-12's contract says the audit confirms "no dependency on the
// dropped orchestration concepts". A plain grep of the tree proves nothing, because every extracted file
// carries a PROVENANCE header that NAMES the Durian-Pi concepts it dropped - naming them is the point of
// the extraction policy, so a reader can trace what changed. What must be absent is a DEPENDENCY: an
// import of one of those modules, or a call into one of those mechanisms. This script therefore separates
// prose from code and reports only code, and it prints the rule it applied rather than a bare count.
//
// The tokens are the user's own list of what Durian-Pi's orchestration layer is (seats, the cross-seat
// work queue, broker/serve, genlock, per-item worktrees, metrics, check, constitution, selfdev), plus the
// module names that layer holds under ~/Git/Durian-Pi/src.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SKIP = new Set(["node_modules", ".git", ".scratch", "vendor", ".pi", ".ai-work", "docs"]);

const TOKENS = [
 "seat", "seats", "seatrun", "seatguard", "seatmodel", "seattools", "seatenv",
 "broker", "serve", "crossSeat", "cross-seat", "queue", "queueAdmission",
 "genlock", "worktree", "worktrees", "metrics", "constitution", "selfdev",
];

/** The part of a line that is code: a line comment is prose, and so is everything after `//`. */
function codePart(line) {
 const text = line.trim();
 if (!text || text.startsWith("//") || text.startsWith("/*") || text.startsWith("*")) return "";
 const cut = text.indexOf("//");
 return (cut >= 0 ? text.slice(0, cut) : text).trim();
}

// This file is the auditor, so it must not audit its own rule strings - the alternative is an audit that
// can only pass by excluding the rule it checks, and a reader cannot tell which rule was dropped.
const SELF = join("scripts", "audit-orchestration.mjs");
const files = [];
for (const dir of ["src", "demo", "scripts"]) {
 for (const kind of [".", "packages"]) {
 const base = join(dir, kind);
 let names = null;
 try {
 names = readdirSync(base, { recursive: true, encoding: "utf8" });
 } catch {
 continue;
 }
 for (const name of names) {
 const path = join(base, name);
 if (path.endsWith(".mjs") && path !== SELF) files.push(path);
 }
 }
}

const findings = [];
for (const path of files) {
 let text = "";
 try {
 text = readFileSync(path, "utf8");
 } catch {
 continue;
 }
 const lines = text.split("\n");
 for (let index = 0; index < lines.length; index += 1) {
 const code = codePart(lines[index]);
 if (!code) continue;
 // Any reference at all to the Durian-Pi checkout inside CODE (not a provenance comment) is a
 // dependency risk: this harness must import nothing from there.
 if (code.includes("Durian-Pi")) {
 findings.push({ path, line: index + 1, token: "durian-pi-path-in-code", text: code.slice(0, 100) });
 continue;
 }
 for (const token of TOKENS) {
 const pattern = new RegExp(`(^|[^\\w.$])\\b${token}\\b\\s*[.(=]`);
 if (pattern.test(code)) findings.push({ path, line: index + 1, token, text: code.slice(0, 100) });
 }
 }
}

console.log(`audited ${files.length} .mjs files under src/, demo/, scripts/ (prose and comments excluded)`);
for (const finding of findings) console.log(`  ${finding.path}:${finding.line} [${finding.token}] ${finding.text}`);
if (findings.length) {
 console.log(`AUDIT FAIL: ${findings.length} code-level references to the dropped orchestration layer`);
 process.exit(1);
}
console.log("AUDIT PASS: no code-level dependency on seats / queue / broker / genlock / worktrees / metrics / constitution / selfdev");
