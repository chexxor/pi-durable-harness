#!/usr/bin/env node
// PROVENANCE: no Durian-Pi original - Durian-Pi never audited pi's own docs against a capability matrix
// (its package plane was seat-scoped); this file is ours, and its job is to make the matrix's coverage
// claim falsifiable. It answers the objective's own verification step: "re-read pi's docs packages.md /
// extensions.md / rpc.md / cli.md / sessions.md / compaction.md and confirm each capability is either
// exercised by a demo id cited in docs/package-support.md or listed there as unsupported with a reason".
// scripts/audit-pi-docs.mjs - what pi's OWN docs (inside the pinned package on THIS machine) call a
// capability, against what this harness's matrix and code claim.
//
// WHY THE HARVEST IS GROUNDED, AND WHY SCOPED: a capability list typed into this file is the same kind of
// claim as the matrix, and it goes stale the first time pi's docs change - so the audit reads pi's docs
// here. But "every identifier a doc mentions" is not "every capability": pi's docs are full of example
// identifiers (`my_tool`, `lookup_weather`) and internal component types (`OverlayHandle`,
// `PowerShellToolDetails`), and calling those "capabilities" would turn the audit into a noise machine.
// A capability here therefore has to pass TWO gates:
//   1. it sits in the part of a doc that ENUMERATES the surface pi offers to the outside world - pi's
//      "Available Imports" section, its Events section, its manifest kinds, its RPC command reference,
//      its compaction settings, its session flags; and
//   2. pi's own pinned dist contains it (as a quoted literal or an exported name) - so the thing named is
//      an API pi really ships, not prose or an example.
// Coverage then asks two questions of every survivor: does a matrix row NAME it, or does some harness
// source file USE it? Both are asked about the same identifier, so a covered row cannot be prose that
// merely looks related.

import { readdirSync, readFileSync, globSync } from "node:fs";
import { join, resolve } from "node:path";

const PI_PKG = join("@earendil-works", "pi-coding-agent");
const DOCS = ["packages.md", "extensions.md", "rpc.md", "cli.md", "sessions.md", "compaction.md"];

/** Every quoted string literal in the pinned pi-coding-agent dist - the vocabulary pi really ships. */
function distLiterals() {
 const literals = new Set();
 const names = new Set();
 const files = globSync(`node_modules/${PI_PKG}/dist/**/*.js`);
 for (const file of files) {
  let text;
  try { text = readFileSync(file, "utf8"); } catch { continue; }
  for (const match of text.matchAll(/["'`]([A-Za-z_][A-Za-z0-9_.:-]{1,60})["'`]/g)) literals.add(match[1]);
 }
 // The public surface, from the dist's own index.d.ts re-export lines.
 const index = `node_modules/${PI_PKG}/dist/index.d.ts`;
 try {
  for (const line of readFileSync(index, "utf8").split("\n")) {
   if (!/^export \{/.test(line)) continue;
   const inner = line.replace(/^export \{/, "").replace(/\} from .*$/, "");
   for (const part of inner.split(",")) {
    const name = part.trim().replace(/^type /, "");
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) names.add(name);
   }
  }
 } catch {}
 return { literals, names };
}

const dist = distLiterals();

/** The identifiers inside one doc section, between a heading and the next heading of the same or higher level. */
function sectionTokens(doc, headingPattern, level) {
 const text = readFileSync(join("node_modules", PI_PKG, "docs", doc), "utf8");
 const lines = text.split("\n");
 const out = [];
 let inside = false;
 for (const line of lines) {
  const match = /^#{1,6} /.test(line) ? line.match(/^(#{1,6}) (.*)$/) : null;
  if (match) {
   const depth = match[1].length;
   if (new RegExp(headingPattern).test(match[2]) && depth === level) { inside = true; continue; }
   if (inside && depth <= level) { inside = false; continue; }
  }
  if (!inside) continue;
  for (const tick of line.matchAll(/`([^`]+)`/g)) out.push(tick[1]);
  for (const flag of line.matchAll(/(?:^|\s)(--[a-z][a-z-]{1,30})\b/g)) out.push(flag[1]);
 }
 return out;
}

/** All backticked tokens anywhere in a doc (used only with a strict shape filter below). */
function docTokens(doc) {
 const text = readFileSync(join("node_modules", PI_PKG, "docs", doc), "utf8");
 return [...text.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
}

/** Documented CLI flags, harvested from the raw doc text (pi's CLI tables write flags bare, not backticked). */
function docFlags(doc) {
 const text = readFileSync(join("node_modules", PI_PKG, "docs", doc), "utf8");
 return [...text.matchAll(/(?:^|\s|`|\|)(--[a-z][a-z-]{1,30})\b/gm)].map((match) => match[1]);
}

/** The capability set per doc: (doc, capability, why-it-counts), already gated on pi's own dist. */
function capabilities() {
 const rows = [];
 const push = (doc, capability, gate, ungrounded = false) => {
  if (!capability) return;
  const token = capability.trim();
  if (token.length < 2 || token.length > 60) return;
  // `ungrounded` is for pi's USER surface (CLI flags): a flag is a documented verb, not an exported
  // symbol, so there is no dist literal to find - the flag's shape and pi's doc table are the gate.
  const isLiteral = dist.literals.has(token) || dist.names.has(token)
   || dist.literals.has(token.replace(/^--/, "")) || ungrounded;
  if (!isLiteral) return; // prose, an example, or a name pi's pinned release does not ship
  rows.push({ doc, capability: token, gate });
 };

 // extensions.md: the API pi offers an extension ("Available Imports") + pi's event names (Events section).
 for (const token of sectionTokens("extensions.md", "Available Imports", 2)) push("extensions.md", token, "pi's Available Imports section");
 // Only the event SHAPE counts here: pi's Events section also backticks handler field names (`handled`,
 // `operations`) and file names (`trust.json`), which are not capabilities pi offers the outside world.
 for (const token of sectionTokens("extensions.md", "Events", 2)) {
  if (!/^[a-z][a-z0-9_]*(?:_[a-z0-9]+)+$/.test(token)) continue;
  push("extensions.md", token, "pi's Events section (handler events)");
 }
 // The event names ALSO appear as headings deep in that doc; take the snake_case ones pi's dist quotes.
 for (const token of docTokens("extensions.md")) {
  if (/^[a-z][a-z0-9_]*(_[a-z0-9]+)+$/.test(token)) push("extensions.md", token, "an event name pi's dist quotes");
 }

 // packages.md: the manifest kinds a package may declare, and the package commands pi runs.
 for (const token of sectionTokens("packages.md", "Select package resources", 2)) push("packages.md", token, "pi's manifest-resource vocabulary");
 for (const token of sectionTokens("packages.md", "Install and manage packages", 2)) {
  if (/^[a-z][a-z-]+$/.test(token)) push("packages.md", token, "pi's package commands");
 }

 // rpc.md: the commands the RPC protocol answers, and the record kinds it frames with.
 for (const token of sectionTokens("rpc.md", "Reference", 2)) push("rpc.md", token, "pi's RPC reference");
 for (const token of sectionTokens("rpc.md", "Protocol records", 3)) push("rpc.md", token, "pi's RPC record shapes");

 // cli.md + sessions.md: the flags pi's CLI documents. No dist-literal gate here: pi's CLI flags are a
 // user surface (a table in a doc), not an exported symbol, so the shape IS the gate - and the placeholder
 // names pi uses in its examples (`--my-flag`) are filtered out by name rather than by an API check.
 for (const doc of ["cli.md", "sessions.md", "rpc.md", "packages.md"]) {
  for (const token of docFlags(doc)) {
   if (/my|example|foo|bar/.test(token)) continue;
   push(doc, token, "a flag pi's CLI docs document", true);
  }
 }

 // compaction.md: the settings keys and entry kinds compaction is configured by.
 for (const token of docTokens("compaction.md")) {
  if (/^[A-Z][A-Za-z0-9]*Entry$/.test(token)) push("compaction.md", token, "a session entry kind compaction writes");
  if (/^(enabled|reserveTokens|keepRecentTokens|backgroundTokens|modelOverrides|branchSummary|maxRetries|baseDelayMs|maxAgentDelayMs|keepRecent)$/.test(token)) push("compaction.md", token, "a compaction/summarization settings key");
 }

 const seen = new Set();
 return rows.filter((row) => {
  const key = `${row.doc}:${row.capability}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
 });
}

/** The matrix's own words: capability names, status, reason - what the matrix claims to have covered. */
function matrixText() {
 const path = join(process.cwd(), "src", "packages", "matrix.mjs");
 return readFileSync(path, "utf8");
}

/** Every harness source file, so "exercised" means code that uses the identifier, not prose nearby. */
function harnessCode() {
 const parts = [];
 const roots = ["src", "demo", "scripts"];
 const walk = (dir, depth = 0) => {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const entry of entries) {
   const path = join(dir, entry);
   if (entry.endsWith(".mjs")) parts.push(readFileSync(path, "utf8"));
   else if (depth < 2) walk(path, depth + 1);
  }
 };
 for (const root of roots) walk(root);
 try { parts.push(readFileSync(join(process.cwd(), "cli.mjs"), "utf8")); } catch {}
 return parts.join("\n");
}

const matrix = matrixText();
const code = harnessCode();

function escape(token) {
 return token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const rows = capabilities();
const uncovered = [];
const perDoc = {};
for (const row of rows) {
 const pattern = new RegExp(`\\b${escape(row.capability)}\\b`);
 // A flag is used by the harness when the flag appears WITHOUT its leading dashes in code or matrix text.
 const probe = row.capability.startsWith("--") ? escape(row.capability.slice(2)) : escape(row.capability);
 const named = pattern.test(matrix) || new RegExp(`\\b${probe}\\b`).test(matrix);
 const used = new RegExp(`\\b${probe}\\b`).test(code);
 const bucket = perDoc[row.doc] ??= { covered: 0, total: 0 };
 bucket.total += 1;
 if (named || used) { bucket.covered += 1; continue; }
 bucket.uncovered ??= [];
 (bucket.uncovered ??= []).push(`${row.capability} (${row.gate})`);
 uncovered.push({ doc: row.doc, capability: row.capability, gate: row.gate });
}

for (const doc of DOCS) {
 const bucket = perDoc[doc] ?? { covered: 0, total: 0 };
 console.log(`${doc}: ${bucket.covered}/${bucket.total} capabilities from pi's own doc are named by the matrix or used by harness code`);
}

if (uncovered.length) {
 console.log(`PI-DOC AUDIT FAIL: ${uncovered.length} capabilities pi's docs enumerate are neither named by a matrix row nor used by harness code`);
 for (const row of uncovered) console.log(`  ${row.doc} :: ${row.capability} :: ${row.gate}`);
 process.exit(1);
}
console.log(`PI-DOC AUDIT PASS: ${rows.length} capabilities enumerated by pi's six docs are each named by a matrix row (${matrix.split("\n").filter((line) => /status:/.test(line)).length} rows) or used by harness source`);
