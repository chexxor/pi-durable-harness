// scripts/invariants-check.mjs - the structural rules this repo says it keeps, read off the tracked source
// surface ONCE, into rows. The gate (`scripts/audit-invariants.mjs`) fails on them; the generated page
// (`scripts/render-invariants.mjs` > docs/world/reference/invariants.md) prints them. Run this file directly
// to see the rows: `node scripts/invariants-check.mjs`.
//
// PROVENANCE: no Durian-Pi original - Durian-Pi kept no read of a source tree against the structural rules
// it claims, so this read is this repo's own. The rules themselves are the ones this repo states out loud
// (one storage opener, one mutation line, the ownership claim released in `cli.mjs`' main finally, no raw
// SQL, the pin unmoved, no dependency added): README.md names them in "Before you change anything", and
// this file is what turns that paragraph into something a run can falsify rather than believe.
//
// WHY THE READ IS SHARED AND NOT DUPLICATED: the gate and the generated page answer one question - does
// the source surface still keep these rules - the gate as a hard exit code, the page as the table a reader
// opens. Two readers that each grep the tree can disagree about a hit, and then the page says "kept" while
// the gate says "violated", with nothing to tell a reader which half is true. So every rule is evaluated
// here once, and both readers import the rows: the same shape scripts/claims-check.mjs gives the claims
// gate and the claims index.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { reportLines } from "./sync-pi.mjs";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");

// What the rules are bound to hold at, spelled out in code rather than remembered in prose: the pin the
// README's install section checks, and the two files the storage rule names.
const PIN_SHA = "dd30101cfc5b0609411dd80b6f93adbc14db14cf";
const OPENER_FILES = ["src/core.mjs", "src/readapi.mjs"];
const WRITER_FILE = join("src", "tui", "writer.mjs");
const CLI_FILE = "cli.mjs";
const OWNERSHIP_FILE = join("src", "ownership.mjs");

// The matrix is DATA: its rows are prose ABOUT these rules, so a reason cell that names the opener or the
// mutation line is a sentence, not a second opener. It is named here so the gate can say it skipped it.
const DATA_FILES = [join("src", "packages", "matrix.mjs")];

/** The tracked source the structural rules read: cli.mjs and src/, minus the data files named above. */
function trackedSources() {
 const res = spawnSync("git", ["ls-files", "-z", "--", CLI_FILE, "src"], { cwd: ROOT, encoding: "utf8" });
 if (res.error || !res.stdout) return [];
 return String(res.stdout)
  .split("\0")
  .filter((path) => String(path).endsWith(".mjs") && !DATA_FILES.includes(path))
  .sort();
}

/** The tracked source these rules do NOT read, so the printed verdict names what was skipped. */
function exemptSources() {
 const read = new Set(trackedSources());
 const res = spawnSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" });
 if (res.error || !res.stdout) return [];
 return String(res.stdout)
  .split("\0")
  .filter((path) => String(path).endsWith(".mjs") && !read.has(path))
  .sort();
}

/** The part of a line that is code. Same split scripts/audit-orchestration.mjs applies: a comment line is
 * prose, and so is the text after `//`. Prose names rules; code is what could break one. */
function codeOf(line) {
 const text = line.trim();
 if (!text || text.startsWith("//") || text.startsWith("/*") || text.startsWith("*")) return "";
 const cut = text.indexOf("//");
 return (cut >= 0 ? text.slice(0, cut) : text).trim();
}

/** One tracked file, read once per pass rather than re-read per predicate. */
function readSource(path) {
 try {
  return { lines: readFileSync(join(ROOT, path), "utf8").split("\n") };
 } catch {
  return { lines: [] };
 }
}

/** Every code line in `paths` whose text answers `test`, as { path, line, text }. */
function scan(paths, test) {
 const hits = [];
 for (const path of paths) {
  const source = readSource(path);
  for (let i = 0; i < source.lines.length; i += 1) {
   const code = codeOf(source.lines[i]);
   if (code && test(code)) hits.push({ path, line: i + 1, text: code });
  }
 }
 return hits;
}

/** A site spelled as `file:line`, the shape both the gate and the page print. */
const at = (hit) => `${hit.path}:${hit.line}`;
const siteOf = (paths) => [...new Set(paths.map(at))].sort();

/**
 * The body of `async function main()` in cli.mjs, as line numbers, by indentation rather than by a
 * JavaScript parser: this repo's files close a top-level function with a brace back at column 0, and the
 * span that matters is main's own lines. A parser would answer the same span; what matters is that the span
 * is measured from the file instead of remembered from a prose claim.
 */
function span(lines, openLine, closeLine) {
 const from = lines.findIndex((line) => openLine(line));
 if (from < 0) return null;
 for (let i = from + 1; i < lines.length; i += 1) {
  if (closeLine(lines[i])) return { start: from + 1, end: i + 1 };
 }
 return { start: from + 1, end: lines.length };
}

/** The finally block of the try/finally inside main, at the indentation main's body sits at. */
function finallyBlock(lines, from, to) {
 for (let i = from; i < to; i += 1) {
  const opener = /^(\s*)\}\s*finally\s*\{/.exec(lines[i]);
  if (!opener) continue;
  const indent = " ".repeat(opener[1].length);
  for (let j = i + 1; j < to; j += 1) {
   if (lines[j] === `${indent}}`) return { start: i + 2, end: j + 1, opener: i + 1 };
  }
 }
 return null;
}

/** The rows: one per rule, each with the files it matched, the lines it matched them at, and what broke. */
function buildRows() {
 const sources = trackedSources();
 const rows = [];

 // ---- rule 1: one storage opener, in exactly the two files the rule names ----
 const openCall = (code) => /openNodeSqliteStorage\s*\(/.test(code);
 const openImport = (code) => /openNodeSqliteStorage/.test(code) && /storage\/sqlite\/node/.test(code);
 const harnessOpen = (code) => /[Hh]arness\.open\s*\(/.test(code);
 const openerCalls = scan(sources, openCall);
 const openerImports = scan(sources, openImport);
 const openerOpens = scan(sources, harnessOpen);
 const openerFiles = [...new Set(openerCalls.map((hit) => hit.path))].sort();
 const openerProblems = [];
 for (const hit of openerCalls) {
  if (!OPENER_FILES.includes(hit.path)) openerProblems.push(`${at(hit)} opens the durable storage outside the two files the rule names (${OPENER_FILES.join(", ")})`);
 }
 for (const file of OPENER_FILES) {
  if (!openerFiles.includes(file)) openerProblems.push(`${file} no longer opens the storage, so the opener the rule names is gone from ${file}`);
  const own = openerCalls.filter((hit) => hit.path === file);
  if (own.length > 1) openerProblems.push(`${file} opens the storage ${own.length} times at ${own.map(at).join(", ")} - two opens of one store are two mutation lines`);
  if (!openerImports.some((hit) => hit.path === file)) openerProblems.push(`${file} calls the opener with no import of pi-durable's opener in it`);
 }
 for (const hit of openerOpens) {
  if (!OPENER_FILES.includes(hit.path)) openerProblems.push(`${at(hit)} opens a Harness outside the two opener files, so a reader would gain a mutation line`);
 }
 rows.push({
  id: "storage_opener",
  files: openerFiles,
  lines: siteOf([...openerCalls, ...openerImports, ...openerOpens]),
  verdict: `opener calls=${openerCalls.length} in ${openerFiles.length} file(s) (${openerFiles.join(", ") || "none"}), opener imports=${openerImports.length}, harness opens=${openerOpens.length}`,
  problems: openerProblems,
 });

 // ---- rule 2: one mutation line: writerSubmit, defined once, in src/tui/writer.mjs ----
 const submitDef = (code) => /^\s*(export\s+)?(async\s+)?function\s+\w*[Ss]ubmit\b/.test(code);
 const submitCall = (code) => /writerSubmit\s*\(/.test(code);
 const submitDefs = scan(sources, submitDef);
 const submitCalls = scan(sources, submitCall).filter((hit) => !submitDefs.some((def) => def.path === hit.path && def.line === hit.line));
 const mutationFiles = [...new Set([...submitDefs, ...submitCalls].map((hit) => hit.path))].sort();
 const mutationProblems = [];
 if (submitDefs.length !== 1) mutationProblems.push(`${submitDefs.length} mutation lines instead of one: ${submitDefs.map(at).join(", ") || "none at all"}`);
 for (const hit of submitDefs) {
  if (hit.path !== WRITER_FILE) mutationProblems.push(`${at(hit)} defines a mutation line outside ${WRITER_FILE}, so the store gains a second write path`);
 }
 rows.push({
  id: "mutation_line",
  files: mutationFiles,
  lines: siteOf([...submitDefs, ...submitCalls]),
  verdict: `definitions=${submitDefs.length} (${submitDefs.map(at).join(", ") || "none"}), call sites=${submitCalls.length} in ${mutationFiles.length} file(s)`,
  problems: mutationProblems,
 });

 // ---- rule 3: the ownership lifecycle lives in cli.mjs' main try/finally ----
 const ownershipVerb = (code) => /\b(claimWriter|releaseWriter|readOwner|touchOwner)\s*\(/.test(code);
 const ownershipDef = (code) => /^\s*export\s+function\s+(claimWriter|releaseWriter|readOwner|touchOwner)\b/.test(code);
 const ownDefs = scan(sources, ownershipDef);
 const ownCalls = scan(sources.filter((path) => path !== OWNERSHIP_FILE), ownershipVerb);
 const main = span(readSource(CLI_FILE).lines, (line) => /^\s*(async\s+)?function\s+main\b/.test(line), (line) => /^}/.test(line));
 const block = main ? finallyBlock(readSource(CLI_FILE).lines, main.start, main.end) : null;
 const inside = ownCalls.filter((hit) => hit.path === CLI_FILE);
 const claim = inside.filter((hit) => /claimWriter\s*\(/.test(hit.text));
 const release = inside.filter((hit) => /releaseWriter\s*\(/.test(hit.text));
 const reads = inside.filter((hit) => /readOwner\s*\(/.test(hit.text));
 const runClose = scan([CLI_FILE], (code) => /harness\.close\s*\(/.test(code));
 const ownershipProblems = [];
 for (const hit of ownCalls) {
  if (hit.path !== CLI_FILE) ownershipProblems.push(`${at(hit)} claims or releases the store outside ${CLI_FILE}, so the lock lifecycle lives in more than one process entry point`);
 }
 if (!main) ownershipProblems.push(`${CLI_FILE}: main is gone, so the ownership lifecycle has no main try/finally to sit in`);
 for (const hit of inside) {
  if (!main || hit.line < main.start || hit.line > main.end) ownershipProblems.push(`${at(hit)} claims or releases the store outside ${CLI_FILE}'s main (${main ? `${main.start}..${main.end}` : "none"}), where nothing releases it`);
 }
 if (claim.length !== 1) ownershipProblems.push(`${CLI_FILE} claims the lock ${claim.length} times, and the rule is one claim per run`);
 if (release.length !== 1) ownershipProblems.push(`${CLI_FILE} releases the lock ${release.length} times, and the rule is one release that answers the claim`);
 for (const hit of release) {
  if (!block || hit.line < block.start || hit.line > block.end) {
   ownershipProblems.push(`${at(hit)} releases the lock outside main's finally block (${block ? `${block.start}..${block.end}` : "no finally found in main"}), so a thrown run leaves the store claimed`);
  }
 }
 for (const hit of runClose) {
  if (!main || hit.line < main.start || hit.line > main.end) ownershipProblems.push(`${at(hit)} closes the run outside main, so a run can end without closing`);
 }
 for (const hit of ownDefs) {
  if (hit.path !== OWNERSHIP_FILE) ownershipProblems.push(`${at(hit)} defines an ownership verb outside ${OWNERSHIP_FILE}`);
 }
 if (ownDefs.length !== 4) ownershipProblems.push(`${OWNERSHIP_FILE} exports ${ownDefs.length} ownership verbs, and the lifecycle names four (claim, release, read, heartbeat)`);
 rows.push({
  id: "ownership_sites",
  files: [...new Set([...ownCalls, ...ownDefs, ...runClose].map((hit) => hit.path))].sort(),
  lines: [...new Set([
   ...ownCalls.map(at),
   ...ownDefs.map(at),
   ...runClose.map(at),
   ...(main ? [`${CLI_FILE}:${main.start}`, `${CLI_FILE}:${main.end}`] : []),
   ...(block ? [`${CLI_FILE}:${block.opener}`, `${CLI_FILE}:${block.start}`, `${CLI_FILE}:${block.end}`] : []),
  ])].sort(),
  verdict: `claims=${claim.length}, releases=${release.length}, owner reads=${reads.length}, ownership verbs defined=${ownDefs.length} in ${OWNERSHIP_FILE}, main=${main ? `${main.start}..${main.end}` : "none"}, release inside finally=${block ? "yes" : "no"}`,
  problems: ownershipProblems,
 });

 // ---- rule 4: no raw SQL, and no sqlite module other than pi-durable's opener ----
 const sqlLiteral = (code) => {
  const literals = code.match(/(["'`])([^"'`]*)\1/g) ?? [];
  for (const literal of literals) {
   const body = literal.slice(1, -1);
   if (/^\s*(select|insert|update|delete|create\s+table|drop\s+\w+|alter\s+\w+)\b/i.test(body) && /\b(from|into|where|values|set|table)\b/i.test(body)) return true;
  }
  return false;
 };
 const foreignSqlite = (code) => {
  const imports = code.match(/from\s+["']([^"']+)["']/g) ?? [];
  return imports.some((literal) => {
   const name = literal.replace(/^from\s+["']|["']$/g, "");
   return /sqlite/i.test(name) && !name.startsWith("@earendil-works/pi-durable/storage/sqlite/node");
  });
 };
 const sqlHits = scan(sources, sqlLiteral);
 const sqliteHits = scan(sources, foreignSqlite);
 rows.push({
  id: "raw_sql",
  files: [...new Set([...sqlHits, ...sqliteHits].map((hit) => hit.path))].sort(),
  lines: siteOf([...sqlHits, ...sqliteHits]),
  verdict: `sql statement literals=${sqlHits.length}, foreign sqlite imports=${sqliteHits.length}`,
  problems: [
   ...sqlHits.map((hit) => `${at(hit)} carries an SQL statement in the source, so a rule this repo does not own runs outside pi-durable`),
   ...sqliteHits.map((hit) => `${at(hit)} imports a sqlite module other than pi-durable's opener, so a second storage path exists`),
  ],
 });

 // ---- rule 5: the pin is unmoved, and sync-pi's own classifier needs no fallback ----
 let pin = null;
 try {
  pin = JSON.parse(readFileSync(join(ROOT, "pi-main.pin.json"), "utf8"));
 } catch {
  pin = null;
 }
 let pinReport = null;
 try {
  pinReport = reportLines(pin);
 } catch {
  pinReport = null;
 }
 const pinProblems = [];
 if (!pin) pinProblems.push("pi-main.pin.json:1 pi-main.pin.json does not parse at this root, so the pin cannot be compared");
 if (pin) {
  if (pin.sha !== PIN_SHA) pinProblems.push(`pi-main.pin.json:1 the pin moved - the file says ${pin.sha}, the rule is bound to ${PIN_SHA}`);
  if (pin.refType !== "tag") pinProblems.push(`pi-main.pin.json:1 the pin is not a TAG (refType=${pin.refType ?? "none"}), and a branch tip is not a reviewed checkpoint`);
  if (!pinReport) pinProblems.push("pi-main.pin.json:1 sync-pi's classifier could not run on this pin, so the pin discipline was never measured");
  else if (pinReport.fallback) pinProblems.push(`pi-main.pin.json:1 sync-pi's classifier needs a fallback (${String(pinReport.fallback).slice(0, 160)}), so a verdict here is not a verdict about the pin`);
 }
 rows.push({
  id: "pin_unmoved",
  files: ["pi-main.pin.json"],
  lines: ["pi-main.pin.json:1"],
  verdict: `pin sha=${String(pin?.sha ?? "none").slice(0, 12)} ref=${pin?.ref ?? "none"} refType=${pin?.refType ?? "none"} fallback=${pinReport ? String(pinReport.fallback) : "report unavailable"}`,
  problems: pinProblems,
 });

 // ---- rule 6: no dependency added, the declared set beside the pinned set ----
 let declared = [];
 try {
  declared = Object.keys(JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).dependencies ?? {});
 } catch {
  declared = null;
 }
 const pinned = pin?.packages?.map((pkg) => pkg.name) ?? [];
 const added = Array.isArray(declared) ? declared.filter((name) => !pinned.includes(name)) : [];
 const missing = pinned.filter((name) => !Array.isArray(declared) || !declared.includes(name));
 rows.push({
  id: "dependencies_added",
  files: ["package.json", "pi-main.pin.json"],
  lines: ["package.json:1", "pi-main.pin.json:1"],
  verdict: `declared=${declared?.length ?? "unreadable"} pinned=${pinned.length} added=${added.length} missing=${missing.length}`,
  problems: [
   ...(declared === null ? ["package.json:1 package.json does not parse, so the declared set cannot be compared with the pin"] : []),
   ...added.map((name) => `package.json:1 ${name} is declared and not in the pinned set, so the dependency set grew`),
   ...missing.map((name) => `package.json:1 ${name} is pinned and not declared, so the pinned set no longer matches the package.json that answers it`),
  ],
 });

 return rows;
}

/** The file sets the rules read and skipped, so the printed verdict says what a reader cannot see. */
export function surface() {
 return { read: trackedSources().length, exempt: exemptSources().length, data: DATA_FILES };
}

export function ruleRows() {
 return buildRows();
}

if (import.meta.main) {
 const counts = surface();
 console.log(`source surface read=${counts.read} .mjs (cli.mjs + src/, ${counts.data.join(", ")} held out as DATA); exempt=${counts.exempt} .mjs (demo/ fixtures and scripts/ auditors)`);
 for (const row of ruleRows()) {
  console.log(`${row.id}: ${row.verdict}`);
  for (const line of row.lines) console.log(`  ${line}`);
  for (const problem of row.problems) console.log(`  PROBLEM ${problem}`);
 }
}
