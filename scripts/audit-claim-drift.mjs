// scripts/audit-claim-drift.mjs - the claim set is current at the tree this repo sits on, and every generated
// page still matches what generates it. Hard failure: any finding exits 1, so the suite's verdict means more
// than "the demos pass".
//
// PROVENANCE: no Durian-Pi original - Durian-Pi never recorded findings against a tree and a pin, and never
// diffed a generated page against its generator, so both rules under this gate are this repo's own and the
// file says so. What it shares with scripts/audit-doc-claims.mjs is the block reading, imported from
// scripts/claims-check.mjs rather than parsed a second time.
//
// WHY A SECOND CLAIMS GATE: scripts/audit-doc-claims.mjs answers "does this claim still reproduce?" against
// the block's own words. That is half of what a findings list needs. The other half is currency, and a list
// of gaps that is quietly a release behind is not a list the next milestone can work from. This gate adds the
// checks that gate does not make: the tree a claim cites must be this tree or the commit under it, the
// generated pages must still equal their generators, and a claim's `absent:` regex must not appear anywhere on
// the tracked docs surface - which is how a documented fix closes a claim rather than hiding beside it.
import { claimRows, pinSha, docsSurface } from "./claims-check.mjs";
import { indexLines } from "./render-claims.mjs";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

/** Run a generator and hand back its stdout, or the reason it could not run. */
function generate(argv) {
 const res = spawnSync("node", argv, { maxBuffer: 32 << 20, encoding: "utf8" });
 if (res.error) return { error: String(res.error) };
 if (res.timedOut) return { error: "timed out" };
 if (res.status !== 0) return { error: `generator exited ${res.status}` };
 return { text: String(res.stdout ?? "") + String(res.stderr ?? "") };
}

/** The page as it stands on disk, or the reason it is not there. */
function onPage(page) {
 try {
  return { text: readFileSync(page, "utf8") };
 } catch (err) {
  return { error: String(err?.message ?? err) };
 }
}

const findings = [];
const rows = claimRows();
const pin = pinSha();
const docs = docsSurface();

let current = 0;
for (const row of rows) {
 if (row.status === "current") {
  current += 1;
  console.log(`claim ${row.id} answers as quoted (area ${row.area}, state ${row.state}, tree ${row.tree.slice(0, 12)}, pin ${row.pin.slice(0, 12)})`);
 } else {
  for (const problem of row.problems) findings.push(`${row.id}: ${problem}`);
 }
}

const generated = [
 { page: "docs/world/reference/package-support.md", argv: ["scripts/render-matrix.mjs"] },
 { page: "docs/world/reference/provenance.md", argv: ["scripts/audit-provenance.mjs", "--markdown"] },
 { page: "docs/world/reference/claims-index.md", argv: null },
 { page: "docs/world/reference/invariants.md", argv: ["scripts/render-invariants.mjs"] },
];
let inSync = 0;
for (const entry of generated) {
 const want = entry.argv ? generate(entry.argv) : { text: `${indexLines().join("\n")}\n` };
 const have = onPage(entry.page);
 if (want.error || have.error) {
  findings.push(`${entry.page}: cannot be compared (${want.error ?? have.error})`);
  continue;
 }
 if (String(want.text) === String(have.text)) inSync += 1;
 else findings.push(`${entry.page}: drifted from what generates it (run the generator and rewrite the page, never edit it)`);
}

let rules = 0;
for (const row of rows) {
 if (!row.absent) continue;
 rules += 1;
 let pattern = null;
 try {
  pattern = new RegExp(row.absent);
 } catch (err) {
  findings.push(`${row.id}: the absent regex ${row.absent} does not compile (${err?.message ?? err})`);
  continue;
 }
 let hit = 0;
 for (const entry of docs) {
  const name = entry.path;
  if (name === row.page) continue;
   const body = docs.find((entry) => entry.path === name)?.text ?? "";
  if (!pattern.test(body)) continue;
  hit += 1;
  findings.push(`${row.id}: ${name} already answers the absent regex ${row.absent}, so the gap is documented and the claim is still open`);
 }
 if (!hit) console.log(`absent rule ${row.id} (${row.absent}) still missing from ${docs.length - 1} other tracked pages`);
}

const areas = {};
const states = {};
for (const row of rows) {
 areas[row.area || "?"] = (areas[row.area || "?"] ?? 0) + 1;
 states[row.state] = (states[row.state] ?? 0) + 1;
}
const counted = (obj) => Object.entries(obj).map(([key, value]) => `${key}=${value}`).sort().join(" ");

console.log(`claims checked=${rows.length} current=${current} stale=${rows.length - current} areas=${counted(areas)} states=${counted(states)}`);
console.log(`generated pages checked=${generated.length} in sync=${inSync} drift=${generated.length - inSync}`);
console.log(`absent rules checked=${rules} over ${docs.length} tracked pages`);
for (const finding of findings) console.log(`  ${finding}`);
if (findings.length) {
 console.log(`CLAIM-DRIFT AUDIT FAIL: ${findings.length} findings against this tree`);
 process.exit(1);
}
console.log("CLAIM-DRIFT AUDIT PASS: every claim answers on this tree and cites a tree and pin that still hold, every generated page equals its generator, and no tracked page states a gap the claims say is open");
