#!/usr/bin/env node
// PROVENANCE: no Durian-Pi original - Durian-Pi never re-read pi's own docs against a capability matrix
// (its seats ran the `pi` CLI, so pi's capability surface belonged to pi's own process and was never
// enumerated); this file is ours, and its job is to make docs/package-support.md's coverage claim falsifiable.
// It answers the objective's own verification step: "re-read pi's docs packages.md / extensions.md / rpc.md
// / cli.md / sessions.md / compaction.md and confirm each capability is either exercised by a demo id cited
// in docs/package-support.md or listed there as unsupported with a reason".
// scripts/audit-pi-docs.mjs - what pi's OWN docs (inside the pinned package on THIS machine) enumerate as a
// capability, against what this harness's matrix and code claim.
//
// WHY THE HARVEST IS GROUNDED, AND WHY THE SCOPE IS WHAT IT IS: a capability list typed into this file is
// the same kind of claim as the matrix, and it goes stale the first time pi's docs grow - so the audit reads
// pi's docs here, and it reads every pi doc that enumerates a surface this harness claims to re-use: the
// extension API and packages (extensions.md, packages.md), the CLI (cli.md), the sessions and their entry
// kinds (sessions.md, session-format.md), compaction (compaction.md), and the modes this harness rebuilds
// - pi's RPC verbs (rpc.md AND rpc-commands.md, whose 34 `###` headings are pi's own command list), the
// JSON event stream (json.md), pi-ai's message types (message-types.md), the TUI (tui.md) and extension
// dialogs (rpc-extension-ui.md). But "capability" has to mean something, and the two wrong meanings are
// visible in pi's docs: (a) "every identifier a doc mentions" turns example names (`my_tool`, `lookup_weather`)
// and internal component types into requirements, and (b) a scope chosen to fit the matrix is unfalsifiable.
// So a capability here passes TWO gates: it sits in a part of a doc that ENUMERATES the surface pi offers
// (a heading pi writes as a name, an event/record name in an events section, a manifest kind, a documented
// CLI flag, an entry kind compaction writes), and pi's own pinned dist ships the name (a quoted literal, an
// exported name, or a member/method/object-key in the dist sources) - except documented verbs and flags,
// which are verbs rather than symbols, so their shape is the gate. Payload FIELDS inside a documented record
// (`disposition`, `leafId`, `exitCode`) are deliberately not capabilities: they are parts of a record, and
// the record's verb is the capability - which is why the `prompt` row has to cover them and a field name
// cannot silently become a row of its own.
// (a) "every identifier a doc mentions" turns example names (`my_tool`, `lookup_weather`) and internal types
// into requirements, and (b) a scope chosen to fit the matrix is unfalsifiable. So a capability here passes
// TWO gates: it sits in a part of a doc that ENUMERATES the surface pi offers an extension (pi's "Available
// Imports", the sub-headings of its "ExtensionContext"/"ExtensionCommandContext"/"ExtensionAPI Methods"/
// "Custom UI"/"MCP Servers" sections, its Events section, its manifest kinds, its RPC reference, its CLI flag
// tables), and pi's own pinned dist ships the name (a quoted literal or an exported name) - except for CLI
// flags, which are a documented verb rather than a symbol, so their shape is the gate.
//
// COVERAGE IS ASKED HONESTLY: a capability counts as exercised only when harness code CALLS it (`.name(` as a
// member, or the symbol appears in an import list) - not when the word merely shows up in prose. Otherwise a
// reason sentence mentioning `sendMessage` would count as exercising pi's sendMessage.
import { readdirSync, readFileSync, globSync } from "node:fs";
import { capabilityMatrix } from "../src/packages/matrix.mjs";
import { join } from "node:path";

const PI_PKG = join("@earendil-works", "pi-coding-agent");
const DOCS = ["packages.md", "extensions.md", "rpc.md", "rpc-commands.md", "json.md", "message-types.md", "tui.md",
	"rpc-extension-ui.md", "session-format.md", "cli.md", "sessions.md", "compaction.md"];
// pi's extension docs import across four packages, so the grounding vocabulary does too: a name pi's pinned
// release ships anywhere in these packages is a real API, and a name it ships nowhere is prose or an example.
const DIST_PKGS = ["pi-coding-agent", "pi-ai", "pi-tui", "chord"];

/** Every name the pinned pi packages export, harvested from the dist .d.ts `export { ... } from "./x.ts"` lines. */
function exportedNames() {
 const names = new Set();
 for (const pkg of DIST_PKGS) {
  const index = join("node_modules", "@earendil-works", pkg, "dist", "index.d.ts");
  let text;
  try { text = readFileSync(index, "utf8"); } catch { continue; }
  for (const line of text.split("\n")) {
   if (!/^export \{/.test(line)) continue;
   const inner = line.replace(/^export \{/, "").replace(/\} from .*$/, "");
   for (const part of inner.split(",")) {
    const name = part.trim().replace(/^type /, "");
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) names.add(name);
   }
  }
 }
 return names;
}

/** Every name pi's pinned dist SHIPS as an API surface, in three shapes:
 *  - quoted literals (how pi spells its own events, entry kinds and settings keys),
 *  - exported names (the public symbol list in each dist index.d.ts),
 *  - member calls / method declarations / object keys inside the dist sources - which is where an
 *    ExtensionAPI METHOD like `sendMessage` lives: it is a member of pi's ExtensionAPI object, not an
 *    exported symbol, so a gate on exports alone quietly drops half of pi's documented methods.
 */
function distVocab() {
 const literals = new Set();
 const members = new Set();
 const declared = new Set();
 for (const pkg of DIST_PKGS) {
  const dir = join("node_modules", "@earendil-works", pkg, "dist");
  const files = [...globSync(`${dir}/**/*.js`), ...globSync(`${dir}/**/*.d.ts`)];
  for (const file of files) {
   let text;
   try { text = readFileSync(file, "utf8"); } catch { continue; }
   for (const match of text.matchAll(/["'`]([A-Za-z_][A-Za-z0-9_.:-]{1,60})["'`]/g)) literals.add(match[1]);
   for (const match of text.matchAll(/\.([a-z_$][A-Za-z0-9_]*)\s*[[(\(/]/g)) members.add(match[1]);
   for (const match of text.matchAll(/^\s{2,}([a-z_$][A-Za-z0-9_]*)\s*[[(\(/:]/gm)) members.add(match[1]);
   for (const match of text.matchAll(/^export (?:interface|class|type|const|declare const|declare)\s+([A-Za-z_$][A-Za-z0-9_]*)/gm)) declared.add(match[1]);
  }
 }
 return { literals, members, declared };
}

const NAMES = exportedNames();
const VOCAB = distVocab();
const LITERALS = VOCAB.literals;
const MEMBERS = VOCAB.members;
const DECLARED = VOCAB.declared;



/** The lines of one doc section: from a heading of `level` to the next heading of that level or higher. */
function sectionLines(doc, headingPattern, level) {
 const text = readFileSync(join("node_modules", PI_PKG, "docs", doc), "utf8");
 const lines = text.split("\n");
 const out = [];
 let inside = false;
 for (const line of lines) {
  const match = /^#{1,6} /.test(line) ? line.match(/^(#{1,6}) (.*)$/) : null;
  if (match) {
   const depth = match[1].length;
   if (depth === level && new RegExp(headingPattern).test(match[2])) { inside = true; continue; }
   if (inside && depth <= level) inside = false;
  }
  if (inside) out.push(line);
 }
 return out;
}

/** Sub-headings inside a section, as pi writes them (`pi.sendMessage(content, options?)`, `ctx.ui`). */
function sectionHeadings(doc, headingPattern, level) {
 return sectionLines(doc, headingPattern, level).filter((line) => /^#{1,6} /.test(line)).map((line) => line.replace(/^#{1,6} /, ""));
}

/** All backticked tokens in a doc. */
function docTokens(doc) {
 return [...readFileSync(join("node_modules", PI_PKG, "docs", doc), "utf8").matchAll(/`([^`]+)`/g)].map((match) => match[1]);
}

/** Documented CLI flags (pi's CLI tables write flags bare, not backticked). */
function docFlags(doc) {
 const text = readFileSync(join("node_modules", PI_PKG, "docs", doc), "utf8");
 return [...text.matchAll(/(?:^|\s|`|\|)(--[a-z][a-z-]{1,30})\b/gm)].map((match) => match[1]);
}

const rows = [];
const seenRow = new Set();
const rejected = [];
const push = (doc, capability, gate, ungrounded = false, viaCode = false) => {
 if (!capability) return;
 const token = capability.trim();
 if (token.length < 3 || token.length > 60) return;
 if (seenRow.has(`${doc}:${token}`)) return; // pi's docs repeat a name; a capability is counted once
 seenRow.add(`${doc}:${token}`);
 const bare = token.replace(/^(pi|ctx)\./, "").split(".").pop();
 const grounded = LITERALS.has(token) || LITERALS.has(bare) || NAMES.has(bare) || MEMBERS.has(bare) || DECLARED.has(bare) || DECLARED.has(token) || ungrounded;
 if (!grounded) return; // prose, an example, or a name pi's pinned release does not ship
 rows.push({ doc, capability: token, gate, viaCode });
};

/** A pi method name as written in a heading: `pi.sendMessage(content, options?)` -> `sendMessage`. */
function methodNames(headings) {
 const out = [];
 for (const heading of headings) {
  for (const piece of heading.split("/")) {
   const trimmed = piece.trim();
   const dotted = trimmed.match(/^(?:pi|ctx)\.([a-zA-Z][A-Za-z0-9_.]*)/);
   if (dotted) { out.push(dotted[1]); continue; }
   const bare = trimmed.match(/^([a-z][A-Za-z0-9_]*)\(/);
   if (bare) out.push(bare[1]);
  }
 }
 return out;
}

// ---- extensions.md: the surface pi offers an extension ----
// pi's own import list, its handler events, and the method surfaces its sections enumerate by heading.
for (const section of ["Events", "ExtensionContext", "ExtensionCommandContext", "ExtensionAPI Methods", "MCP Servers", "Custom Tools", "State Management"]) {
 for (const heading of sectionHeadings("extensions.md", section, 2)) {
  for (const name of methodNames([heading])) push("extensions.md", name, `pi's ${section} section (a documented method)`);
 }
}
// The dotted calls pi's own examples write (`ctx.ui.select(...)`, `pi.sendUserMessage(...)`) - this is how
// pi's Custom UI and dialog API is spelled, where the headings are prose ("Dialogs", "Widgets, Status, and
// Footer") and only the code says the name.
for (const section of ["ExtensionContext", "ExtensionCommandContext", "Custom UI", "Custom Tools", "MCP Servers", "Dynamic Tool Loading"]) {
 for (const line of sectionLines("extensions.md", section, 2)) {
  for (const match of line.matchAll(/\b(?:pi|ctx)\.([a-z][A-Za-z0-9_]*(?:\.[a-z][A-Za-z0-9_]*)+)\s*\(/g)) push("extensions.md", match[1], `a dotted call pi writes in its ${section} section`);
 }
}
// pi's event names, by shape and grounded on pi's dist quoting them.
for (const token of docTokens("extensions.md")) {
 if (/^[a-z][a-z0-9_]*(_[a-z0-9]+)+$/.test(token)) push("extensions.md", token, "an event name pi's dist quotes");
}
for (const token of sectionLines("extensions.md", "Events", 2)) {
 const heading = /^#{1,6} /.test(token) ? token.replace(/^#{1,6} /, "") : null;
 if (!heading) continue;
 for (const name of heading.split("/")) if (/^[a-z][a-z0-9_]*(_[a-z0-9]+)+$/.test(name.trim())) push("extensions.md", name.trim(), "pi's Events section (a documented handler event)", true, false);
}

// ---- packages.md: manifest kinds and package commands ----
for (const token of sectionHeadings("packages.md", "Select package resources", 2)) push("packages.md", token, "pi's manifest-resource vocabulary", true, true);
for (const token of docTokens("packages.md")) {
 if (/^[a-z]+$/.test(token) && LITERALS.has(token) && ["extensions", "skills", "prompts", "themes", "image"].includes(token)) push("packages.md", token, "a manifest kind pi reads", true, true);
}
for (const token of docFlags("packages.md")) push("packages.md", token, "a flag pi's package docs document", true);

// ---- rpc.md: the protocol's records and commands ----
for (const token of sectionHeadings("rpc.md", "Reference", 2)) push("rpc.md", token, "pi's RPC reference", true, true);
for (const token of sectionHeadings("rpc.md", "Protocol records", 3)) push("rpc.md", token, "pi's RPC record shapes", true, true);
for (const token of docFlags("rpc.md")) push("rpc.md", token, "a flag pi's RPC docs document", true, true);

// ---- cli.md / sessions.md / packages.md: pi's user surface ----
for (const doc of ["cli.md", "sessions.md", "rpc.md", "packages.md"]) {
 for (const token of docFlags(doc)) {
  if (/my|example|foo|bar/.test(token)) continue;
  push(doc, token, "a flag pi's CLI docs document", true, true);
 }
}

// ---- compaction.md: the knobs and entry kinds compaction is configured by ----
for (const token of docTokens("compaction.md")) {
 if (/^[A-Z][A-Za-z0-9]*Entry$/.test(token)) {
  push("compaction.md", token, "a session entry kind compaction writes");
 }
 if (/^(enabled|reserveTokens|keepRecentTokens|backgroundTokens|modelOverrides|branchSummary|maxRetries|baseDelayMs|maxAgentDelayMs|keepRecent)$/.test(token)) push("compaction.md", token, "a compaction/summarization settings key");
}

// ---- the modes and formats this harness claims, harvested the same way ----
// pi's RPC reference (rpc.md) states the protocol; rpc-commands.md ENUMERATES the verbs, so its
// `### prompt`-style headings are capabilities, not prose. json.md's event records, message-types.md's
// message types, tui.md's components and rpc-extension-ui.md's dialogs are named the same way: a heading
// that IS a name, a snake_case record/event name, a PascalCase type pi exports, or a documented flag.
for (const doc of ["rpc-commands.md", "json.md", "message-types.md", "tui.md", "rpc-extension-ui.md", "session-format.md"]) {
	const text = readFileSync(join("node_modules", PI_PKG, "docs", doc), "utf8");
	for (const line of text.split("\n")) {
		if (!/^#{1,6} /.test(line)) continue;
		const title = line.replace(/^#{1,6} /, "").trim();
		// `### prompt` - the heading IS the verb; `### get_state` likewise.
		if (/^[a-z][a-z0-9_]*$/.test(title)) {
			push(doc, title, `a verb pi enumerates as a heading in its ${doc}`, true, true);
			continue;
		}
		// `### TextContent` - a type pi NAMES as a heading. A single capitalised word is prose in these
		// docs (`## Bash`, `## Retry`, `## Input`), so the gate is that pi's pinned dist DECLARES or EXPORTS
		// the name: prose words are not capabilities.
		if (/^[A-Z][A-Za-z0-9]*$/.test(title) && (DECLARED.has(title) || NAMES.has(title))) {
			push(doc, title, `a type pi names as a heading in its ${doc}`);
			continue;
		}
		// `### The `prompt` record` - the name is inside the heading.
		for (const token of [...title.matchAll(/`([^`]+)`/g)].map((match) => match[1])) {
			if (/^[a-z][a-z0-9_]*$/.test(token)) push(doc, token, `a verb pi spells in a heading of its ${doc}`, true, true);
			if (/^[A-Z][A-Za-z0-9]*$/.test(token) && token.length > 4 && (DECLARED.has(token) || NAMES.has(token))) push(doc, token, `a type pi spells in a heading of its ${doc}`);
		}
	}
	for (const token of docTokens(doc)) {
		// pi's event and record names are snake_case and its dist quotes them.
		if (/^[a-z][a-z0-9_]*(_[a-z0-9]+)+$/.test(token)) push(doc, token, `an event/record name pi's ${doc} spells`);
		// Only types pi's dist DECLARES or EXPORTS count: `Markdown`/`Image`/`Input` are capabilities ONLY
		// because pi-tui really ships those components, while `Retry`/`Bash`/`Messages` are prose headings.
		if (/^[A-Z][A-Za-z0-9]*$/.test(token) && token.length > 4 && (DECLARED.has(token) || NAMES.has(token))) push(doc, token, `a type pi's ${doc} names`);
	}
	for (const token of docFlags(doc)) push(doc, token, `a flag pi's ${doc} documents`, true, true);
}

// ---- what the harness actually claims ----
function matrixText() {
 return readFileSync(join(process.cwd(), "src", "packages", "matrix.mjs"), "utf8");
}

/** Harness source, so "exercised" can be tested as a CALL, not a mention.
 *
 * Two rules keep the claim honest, and both exist because a previous completion audit called the
 * old version "a gameable proxy":
 *   - comments and prose are NOT code. The corpus has /* ... *\/ and // comments removed, so a header
 *     that mentions pi's verb cannot make that verb look exercised. (A URL inside a string literal can
 *     lose text here; that only ever makes a claim harder, never easier.)
 *   - src/packages/matrix.mjs is EXCLUDED from the corpus. Its rows are what the matrix bucket already
 *     reads; leaving it in the code bucket too would let a reason sentence stand in for a call.
 */
function codeFiles() {
 const files = [];
 const walk = (dir, depth = 0) => {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const entry of entries) {
   const path = join(dir, entry);
   if (entry.endsWith(".mjs") && !path.includes(join("packages", "matrix.mjs"))) files.push(path);
   else if (depth < 2) walk(path, depth + 1);
  }
 };
 for (const root of ["src", "demo", "scripts"]) walk(root);
 const cli = join(process.cwd(), "cli.mjs");
 try {
  readFileSync(cli, "utf8");
  files.push(cli);
 } catch {
  /* no CLI in this tree: nothing to add */
 }
 return files;
}

function stripComments(text) {
 return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:]):\/\/[^\n]*/g, "$1");
}

const matrix = matrixText();
const FILES = codeFiles().map((path) => ({ path, text: readFileSync(path, "utf8") }));
const code = FILES.map((file) => stripComments(file.text)).join("\n");

/** Which flags does THIS harness actually take? Only a quoted flag literal inside a file that parses
 * argv counts - parseArgs(, a process.argv scan, or an option table compared against tokens. A flag
 * merely written in a docstring or a matrix reason does not. */
const PARSED_FLAGS = (() => {
 const out = new Set();
 for (const file of FILES) {
  const isParser = /\bparseArgs\(|process\.argv|argv\[/.test(file.text);
  if (!isParser) continue;
  const stripped = stripComments(file.text); // a flag spelled only in a header comment is not a flag this takes
  for (const match of stripped.matchAll(/["'](-{1,2}[A-Za-z][A-Za-z0-9-]*)["']/g)) out.add(match[1]);
  // A table that compares a stripped name: `if (name === "store")` inside a `startsWith("--")` branch.
  // The flag is the harness's own there, exactly like the quoted "--store" spelling would be.
  if (/startsWith\("-{1,2}/.test(file.text)) {
   for (const match of stripped.matchAll(/(?:===|==|case)\s*\(?"([a-z][a-z0-9-]*)"/g)) out.add("--" + match[1]);
  }
  for (const match of stripped.matchAll(/["'](-[A-Za-z])["']/g)) out.add(match[1]);
 }
 return out;
})();

const matrixNamesList = (() => {
 const s = new Set();
 for (const m of matrix.matchAll(/names:\s*\[([\s\S]*?)\]/g)) {
  for (const q of m[1].matchAll(/"([^"]+)"|'([^']+)'|`([^`]+)`/g)) {
   const v = q[1] ?? q[2] ?? q[3];
   if (v) s.add(v.trim());
  }
 }
 return s;
})();


function escape(token) {
 return token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Does harness code USE this name: called as a member, or imported/declared as a symbol? A flag is
    * used when the harness's own option parser names that flag, which is a literal, not a member call. */
function usedInCode(name) {
 if (name.startsWith("-")) return PARSED_FLAGS.has(name);
 const bare = name.replace(/^(pi|ctx)\./, "").split(".").pop();
 if (new RegExp(`\\.\\s*${escape(bare)}\\s*\\(`).test(code)) return true;
 if (new RegExp(`\\b${escape(bare)}\\b[,}]`).test(code)) return true; // an import/re-export list
 if (new RegExp(`\\b(?:const|let|class|function)\\s+${escape(bare)}\\b`).test(code)) return true;
 return false;
}

/** Does a matrix row NAME it? Only the rows' `names:` arrays count, so a reason sentence that merely
 * mentions pi's verb is not coverage - the claim has to be the claim the row makes. */
function matrixNames() {
 const out = new Set();
 for (const match of matrix.matchAll(/names:\s*\[([\s\S]*?)\]/g)) {
  for (const quoted of match[1].matchAll(/"([^"]+)"|'([^']+)'|`([^`]+)`/g)) {
   const value = quoted[1] ?? quoted[2] ?? quoted[3];
   if (value) out.add(value.trim());
  }
 }
 return out;
}

const MATRIX_NAMES = matrixNames();

function namedInMatrix(name) {
 const bare = name.replace(/^(pi|ctx)\./, "").split(".").pop();
 return MATRIX_NAMES.has(name) || MATRIX_NAMES.has(bare) || MATRIX_NAMES.has(`--${bare}`);
}

/** `--list` prints the scope that was checked, so a reader can see what the tally is a tally OF. */
if (process.argv.includes("--list")) {
 for (const row of rows) console.log(`SCOPE ${row.doc} :: ${row.capability} :: ${row.gate}`);
}

const uncovered = [];
const perDoc = {};
for (const row of rows) {
 const bucket = perDoc[row.doc] ??= { covered: 0, total: 0 };
 bucket.total += 1;
 if (namedInMatrix(row.capability)) { bucket.covered += 1; continue; }
 if (row.viaCode && usedInCode(row.capability)) { bucket.covered += 1; continue; }
 (bucket.uncovered ??= []).push(`${row.capability} (${row.gate})`);
 uncovered.push(row);
}

for (const doc of DOCS) {
 const bucket = perDoc[doc] ?? { covered: 0, total: 0, uncovered: [] };
 console.log(`${doc}: ${bucket.covered}/${bucket.total} capabilities from pi's own doc are named by the matrix or called by harness code`);
}

if (uncovered.length) {
 console.log(`PI-DOC AUDIT FAIL: ${uncovered.length} capabilities pi's docs enumerate are neither named by a matrix row nor called by harness code`);
 for (const row of uncovered) console.log(`  ${row.doc} :: ${row.capability} :: ${row.gate}`);
 process.exit(1);
}
const tally = capabilityMatrix(null).reduce((acc, row) => { acc[row.status] = (acc[row.status] ?? 0) + 1; return acc; }, {});
const rowSummary = `${Object.values(tally).reduce((a, b) => a + b, 0)} rows (${Object.entries(tally).map(([k, v]) => `${v} ${k}`).join(" / ")})`;
console.log(`PI-DOC AUDIT PASS: ${rows.length} capabilities enumerated by pi's ${DOCS.length} docs are each named by a matrix row (${rowSummary}) or called by harness source`);
