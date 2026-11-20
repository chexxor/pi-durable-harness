// scripts/audit-invariants.mjs - the sixth suite audit: the structural rules this repo says it keeps are
// checked against the tracked source, and a violation is a hard exit rather than a paragraph a reader
// skims. Run: `node scripts/audit-invariants.mjs`.
//
// PROVENANCE: no Durian-Pi original - Durian-Pi never gated a source tree against the structural rules it
// claims to keep, so this gate is this repo's own. The rules it reads are the ones README.md's "Before you
// change anything" paragraph and the [ADR](../decisions/0001-docs-kinds-and-style.md) already state in
// prose; what this file adds is the run that answers them, in the same shape as the other suite audits.
//
// WHY THE RULES ARE GATED AND NOT ONLY WRITTEN DOWN: a paragraph that says "exactly one storage opener"
// stays true for a year and then stops being true the first time a second opener lands, and nothing notices.
// The demos prove behaviour a caller can see; none of them proves the SHAPE of the code - an added opener
// in an unused file passes every demo. So the shape gets the same treatment the claims pages got: read once
// through scripts/invariants-check.mjs, printed here as counted lines, and failed with file and line named.
import { ruleRows, surface } from "./invariants-check.mjs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");

/** The tree this run is a verdict about. `unknown` rather than a guess when git cannot answer. */
function tree() {
 try {
  return spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).stdout?.trim() || "unknown";
 } catch {
  return "unknown";
 }
}

const rows = ruleRows();
const counts = surface();
const findings = [];

console.log(`source surface read=${counts.read} tracked .mjs (cli.mjs + src/, ${counts.data.join(", ")} held out as DATA prose); not read=${counts.exempt} .mjs (demo/ fixtures measure the rules rather than extend them, scripts/ auditors read the rules to check them)`);

for (const row of rows) {
 console.log(`${row.id}: ${row.verdict}`);
 for (const problem of row.problems) findings.push(`${row.id} ${problem}`);
}

const rules = rows.length;
const kept = rows.filter((row) => !row.problems.length).length;
const head = tree();
for (const finding of findings) console.log(`  ${finding}`);

if (findings.length) {
 console.log(`INVARIANTS AUDIT FAIL: ${kept} of ${rules} rules kept on this source surface at tree ${head}`);
 process.exit(1);
}
console.log(`INVARIANTS AUDIT PASS: ${rules}/${rules} rules kept on ${counts.read} tracked .mjs at tree ${head} - one storage opener in the two files it names, one mutation line, the ownership claim released in cli.mjs' main finally, no raw SQL, the pin unmoved, no dependency added`);
