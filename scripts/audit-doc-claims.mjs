#!/usr/bin/env node
// scripts/audit-doc-claims.mjs - re-run every claim recorded under docs/world/claims/ and compare it to
// what the page quotes, so a findings list stays as falsifiable as the capability matrix is.
//
// PROVENANCE: no Durian-Pi original - this checks the rule this repo makes about itself: each page under
// docs/world/claims/ carries one machine-readable block naming a command, the output that command answered,
// and the tree and pin it was measured at. The rule is this repo's rather than Durian-Pi's, so the file
// states that outright; what changed against the audits beside it is the input, because this one reads
// claim blocks in docs/ instead of source headers or matrix rows.
//
// WHY A CHECK AND NOT A PROSE LIST: scripts/audit-pi-docs.mjs keeps the capability map falsifiable by
// re-reading pi's own docs against the rows in src/packages/matrix.mjs. A list of functionality gaps needs
// the same property, or it rots silently the first time a gap is fixed, a refusal is reworded, or a count
// moves. So each gap page holds the block below, and this script re-runs it. A page with no block, a block
// whose command cannot be run offline, an expected output line that stopped appearing, or a tree or pin
// that does not resolve is a FAIL rather than a stale paragraph.
//
// The block, in this repo's own words:
//   id      the file's own basename minus .md
//   area    install, configuration, features, or edge
//   claim   one sentence stating the finding
//   command ONE line, run with bash at the repo root, offline only
//   exit    the exit code that chain answered
//   tree    the 40-hex tree the page was measured at, resolved by git rev-parse --verify
//   pin     the 40-hex pin it was measured at, which must equal pi-main.pin.json's own sha
//   output  lines matched in order as trimmed substring hits over the run's combined output
//   absent  optional regex that must NOT match the docs surface, and absent_in the roots searched
//   closed_by a tag or commit name that landed the close, required of state fixed and resolved by git
import { readdirSync, readFileSync, lstatSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const CLAIM_DIR = join("docs", "world", "claims");
const AREAS = ["install", "configuration", "features", "edge"];
const SKIP_DIRS = new Set(["node_modules", ".git", ".tmp", ".scratch", ".ai-work", ".pi", "vendor"]);
const OFFLINE = ["curl", "wget", "npm install", "git ls-remote", "http://", "https:", "ssh://"];
const PIN_FILE = join(ROOT, "pi-main.pin.json");

function gitReport(args) {
	// A read-only lookup. A sha that does not resolve is reported as null, never guessed at.
	try {
		return spawnSync("git", args, { cwd: ROOT, encoding: "utf8" }).stdout?.trim() ?? null;
	} catch {
		return null;
	}
}

function pinRecord() {
	// The pin this repo runs against lives in one file; a claim that cites another sha cites nothing.
 try {
	 return JSON.parse(readFileSync(PIN_FILE, "utf8"));
 } catch {
	 return null;
 }
}

function claimPages() {
 let names = [];
 try {
	 names = readdirSync(join(ROOT, CLAIM_DIR), { encoding: "utf8" });
 } catch {
	 return [];
 }
	 return names.filter((name) => String(name).endsWith(".md")).sort();
}

function parseBlock(text) {
 const found = /```claim\n([\s\S]*?)\n```/.exec(text);
 if (!found) return null;
 const fields = {};
 const lines = [];
 let open = null;
 for (const raw of found[1].split("\n")) {
	 if (open && /^\s\s+\S/.test(raw)) {
	  lines.push(raw.trim());
	  continue;
	 }
	 const key = /^([a-z_]+):\s*(.*)$/.exec(raw);
	 if (!key) continue;
	 open = key[1] === "output" && !key[2];
	 fields[key[1]] = key[2].trim();
	 if (key[1] !== "output") open = false;
 }
 fields["__lines"] = lines;
 return fields;
}

function docsRoots(list) {
 const roots = [];
 for (const part of String(list || "README.md,docs/world").split(",")) {
	 const name = part.trim();
	 if (name) roots.push(name);
 }
 return roots.length ? roots : ["README.md", "docs/world"];
}

function pagesUnder(root) {
// Every markdown page this repo ships under one root, the findings directory excluded: a claim may not
// be its own evidence, and a regex searching docs/world/claims would match the rule it came from.
 const abs = join(ROOT, root);
 try {
	 if (!lstatSync(abs).isDirectory()) return [root];
 } catch {
	 return [];
 }
 let names = [];
 try {
	 names = readdirSync(abs, { recursive: true, encoding: "utf8" });
 } catch {
	 return [];
 }
 const out = [];
 for (const name of names) {
	 if (!String(name).endsWith(".md")) continue;
	 const path = join(root, name);
	 if (path.split("/").some((part) => SKIP_DIRS.has(part))) continue;
	 out.push(path);
 }
 return out;
}

function runCommand(command) {
// One chain at the repo root, stdout and stderr in the order the run wrote them, and never a network
// step: the suite's whole claim is that a verdict came with no network, so a claim that reaches one
// is refused before it runs rather than passing on whatever the upstream says today.
 for (const token of OFFLINE) {
	 if (command.includes(token)) return { refused: `reaches the network (${token})` };
 }
 const script = `{ ${command.replace(/;+\s*$/, "")}; } 2>&1`;
 const res = spawnSync("bash", ["-c", script], { cwd: ROOT, encoding: "utf8", timeout: 60000, input: "" });
 if (res.error) return { refused: String(res.error) };
 if (res.timedOut) return { refused: "timed out under 60s" };
 return { code: res.status, text: String(res.stdout ?? "") + String(res.stderr ?? "") };
}

function matches(text, expected) {
// The expected strings must appear in the run's combined output, in the quoted order, as substring hits:
// two strings on one line both count, and a busier run that prints extra lines still answers the claim.
 let cursor = 0;
 const misses = [];
 for (const want of expected) {
	 const hit = text.indexOf(want, cursor);
	 if (hit < 0) misses.push(want);
	 else cursor = hit + want.length;
 }
 return misses;
}

const pin = pinRecord();
const pages = claimPages();
const findings = [];
const areas = {};
let pass = 0;
let fail = 0;
let certChecked = 0;
let certResolved = 0;

for (const name of pages) {
 const path = join(ROOT, CLAIM_DIR, name);
 const text = readFileSync(path, "utf8");
 const block = parseBlock(text);
 const id = name.replace(/\.md$/, "");
 if (!block) {
	 findings.push(`${id}: no claim block - the page cites no command, so nothing can re-check it`);
	 fail += 1;
	 continue;
 }
 const area = block.area;
 areas[area] = (areas[area] ?? 0) + 1;
 const problems = [];
 if (block.id !== id) problems.push(`the block's id names ${block.id || "nothing"}, the file is ${name}`);
 if (!AREAS.includes(area)) problems.push(`area ${area || "blank"} is not one of ${AREAS.join(", ")}`);
 if (!block.command) problems.push("no command to run");
 for (const field of ["tree", "pin"]) {
	 const value = String(block[field] ?? "");
	 if (!/^[0-9a-f]{40}$/.test(value)) {
	  problems.push(`${field} ${value || "blank"} is not a full 40-hex sha`);
	  continue;
	 }
	 if (!gitReport(["rev-parse", "--verify", value])) problems.push(`${field} does not resolve in this repo`);
 }
 if (pin && block.pin !== pin.sha) problems.push(`cites a pin other than pi-main.pin.json's ${pin.sha}`);
// A close that names nothing is a claim someone believed rather than one that was checked: the certificate
// has to be a tag or commit this repo can point at, so git resolves it or the claim stays a finding.
 if (String(block.state ?? "open") === "fixed") {
	 certChecked += 1;
	 if (!block.closed_by) problems.push("state fixed with no closed_by certificate: nothing names the tag or commit that landed the close");
	 else if (!gitReport(["rev-parse", "--verify", String(block.closed_by)])) problems.push(`closed_by certificate ${block.closed_by} does not resolve in this repo`);
	 else certResolved += 1;
 }
 if (!block.__lines.length) problems.push("no expected output lines");
 if (block.__lines.length && !/^\d+$/.test(String(block.exit ?? ""))) problems.push("no exit code stated");
 if (!problems.length) {
	 const ran = runCommand(block.command);
	 if (ran.refused) {
	  problems.push(`command refused: ${ran.refused}`);
	 } else {
	  if (String(ran.code) !== String(block.exit)) problems.push(`answered exit ${ran.code}, the page says ${block.exit}`);
	  const missed = matches(String(ran.text), block.__lines);
	  for (const want of missed) problems.push(`no output line answers ${want}`);
	 }
 }
 if (block.absent) {
	 const roots = docsRoots(block.absent_in);
	 const pattern = new RegExp(block.absent);
	 const pages2 = roots.flatMap((root) => pagesUnder(root));
	 for (const rel of pages2) {
	  if (rel === join(CLAIM_DIR, name)) continue;
	  let body = "";
	  try {
	   body = readFileSync(join(ROOT, rel), "utf8");
	  } catch {
	   continue;
	  }
	  if (pattern.test(body)) findings.push(`${id}: ${rel} already answers the absent regex ${block.absent}`);
	 }
 }
 if (problems.length) {
	 for (const problem of problems) findings.push(`${id}: ${problem}`);
	 fail += 1;
 } else {
	 pass += 1;
	 console.log(`claim ${id} answers as quoted (area ${area}, tree ${String(block.tree).slice(0, 12)}, pin ${String(block.pin).slice(0, 12)})`);
 }
}

const counted = Object.entries(areas).map(([area, count]) => `${area}=${count}`).join(" ");
console.log(`claims checked=${pass + fail} pass=${pass} fail=${fail} areas=${counted} (pages under docs/world/claims=${pages.length})`);
console.log(`closure certificates checked=${certChecked} resolved=${certResolved} unresolved=${certChecked - certResolved}`);
for (const finding of findings) console.log(`  ${finding}`);
if (findings.length) {
 console.log(`DOC-CLAIM AUDIT FAIL: ${findings.length} claim findings`);
 process.exit(1);
}
console.log(`DOC-CLAIM AUDIT PASS: every claim page under docs/world/claims re-answers with the output it quotes, at a tree and pin that resolve, and no page on the docs surface states what a claim says is missing`);
