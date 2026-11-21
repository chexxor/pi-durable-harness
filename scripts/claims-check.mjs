// scripts/claims-check.mjs - read every claim block once, run its command on the tree this repo sits on,
// and hand the rows to whoever wants them: the drift gate and the generated claims index read the same rows.
//
// PROVENANCE: no Durian-Pi original - Durian-Pi kept no list of findings measured against a tree and a pin,
// so the rule under this file is this repo's own and says so. What it shares with scripts/audit-doc-claims.mjs
// is the BLOCK SHAPE: a page under docs/world/claims/ states one finding, the one command that showed it,
// the output that command answered, and the tree and pin it was measured at. Both readers parse it the same
// way on purpose; see the note below.
//
// WHY THE READ IS SHARED AND NOT DUPLICATED: docs/world/reference/claims-index.md and scripts/audit-claim-drift.mjs
// both say things about the same blocks - one lists them for the next milestone, the other fails when one
// stops answering. Two parsers of the same block means the index can print "current" while the gate prints
// "stale", and a reader then has no way to tell which half is true. So the rows are built here once, and
// both readers import them rather than reading the markdown again.
import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const CLAIM_DIR = join("docs", "world", "claims");
const AREAS = ["install", "configuration", "features", "edge"];
const STATES = ["open", "fixed"];
const OFFLINE = ["curl", "wget", "npm install", "git ls-remote", "http://", "https:", "ssh://"];
const PIN_FILE = join(ROOT, "pi-main.pin.json");

/** Read-only git lookup. A sha that does not resolve answers null, never a guess. */
function gitReport(args) {
 try {
  return spawnSync("git", args, { cwd: ROOT, encoding: "utf8" }).stdout?.trim() ?? null;
 } catch {
  return null;
 }
}

/** A closure certificate: a tag or commit name, resolved through git or answered null, never guessed at. */
function certificate(ref) {
 const name = String(ref || "").trim();
 if (!name) return null;
 const sha = gitReport(["rev-parse", "--verify", name]);
 if (!sha || !/^[0-9a-f]{40}$/.test(String(sha))) return null;
 const tag = gitReport(["for-each-ref", "--format=%(refname)", `refs/tags/${name}`]);
 return { name, sha: String(sha), kind: tag ? "tag" : "commit" };
}

/** HEAD and the commit under it. A claim cites the tree it was cut from, and the commit that lands a claim is never its own tree. */
function recentTrees() {
 const out = gitReport(["rev-list", "--max-count=2", "HEAD"]);
 if (!out) return [];
 return out.split("\n").filter((line) => /^[0-9a-f]{40}$/.test(line));
}

function pinRecord() {
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

/** The fenced block, in the shape scripts/audit-doc-claims.mjs documents: `output:` holds the indented lines under it. */
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

/** One chain at the repo root, stdout and stderr in the order written, and never a network step. */
function runCommand(command) {
 for (const token of OFFLINE) {
  if (command.includes(token)) return { refused: `reaches the network (${token})` };
 }
 const script = `{ ${command.replace(/;+\s*$/, "")}; } 2>&1`;
 const res = spawnSync("bash", ["-c", script], { cwd: ROOT, encoding: "utf8", timeout: 60000, input: "" });
 if (res.error) return { refused: String(res.error) };
 if (res.timedOut) return { refused: "timed out under 60s" };
 return { code: res.status, text: String(res.stdout ?? "") + String(res.stderr ?? "") };
}

/** Expected strings must appear in the run's output, in the quoted order, as substring hits. */
function matches(text, expected) {
 let cursor = 0;
 const misses = [];
 for (const want of expected) {
  const hit = text.indexOf(want, cursor);
  if (hit < 0) misses.push(want);
  else cursor = hit + want.length;
 }
 return misses;
}

/** The markdown this repo tracks, as it stands now: a claim's `absent:` regex is searched over these pages. */
function trackedDocs() {
 const res = spawnSync("git", ["ls-files", "-z", "--", "README.md", "docs/world"], { cwd: ROOT });
 if (res.error || !res.stdout) return [];
 return String(res.stdout).split("\0").filter((path) => String(path).endsWith(".md"));
}

/**
 * One row per claim page: what the page says, and whether that still answers on this tree.
 *
 * The status is the whole point of the row. `current` means the command ran here, answered the
 * exit code and the output lines the page quotes, and cites a tree and a pin that still hold.
 * `stale` means the page quoted something this tree no longer answers - which is the drift a
 * findings list rots into, and the reason the list is gated rather than read.
 */
export function claimRows() {
 const pin = pinRecord();
 const recent = recentTrees();
 const rows = [];
 for (const name of claimPages()) {
  const page = join(CLAIM_DIR, name);
  const id = name.replace(/\.md$/, "");
  const block = parseBlock(readFileSync(join(ROOT, page), "utf8"));
  const row = {
   id,
   page,
   area: String(block?.area ?? ""),
   claim: String(block?.claim ?? ""),
   state: String(block?.state ?? "open"),
   tree: String(block?.tree ?? ""),
   pin: String(block?.pin ?? ""),
   absent: String(block?.absent ?? ""),
   closedBy: String(block?.closed_by ?? ""),
   closedSha: "",
   closedKind: "",
   command: String(block?.command ?? ""),
   exit: String(block?.exit ?? ""),
   output: block?.__lines ?? [],
   problems: [],
  };
  if (!block) {
   row.problems.push("no claim block: the page cites no command, so nothing can re-check it");
   rows.push(row);
   continue;
  }
  if (String(block.id) !== id) row.problems.push(`the block's id names ${block.id || "nothing"}, the file is ${name}`);
  if (!AREAS.includes(row.area)) row.problems.push(`area ${row.area || "blank"} is not one of ${AREAS.join(", ")}`);
  if (!STATES.includes(row.state)) row.problems.push(`state ${row.state} is not one of ${STATES.join(", ")}`);
  if (!block.command) row.problems.push("no command to run");
  if (!/^\d+$/.test(row.exit)) row.problems.push("no exit code stated");
  if (!row.output.length) row.problems.push("no expected output lines");
  if (!/^[0-9a-f]{40}$/.test(row.tree)) row.problems.push(`tree ${row.tree || "blank"} is not a full 40-hex sha`);
  else if (!recent.includes(row.tree)) row.problems.push(`cites a tree older than HEAD and the commit under it (the trees that can be cited: ${recent.join(", ") || "none"})`);
  if (!/^[0-9a-f]{40}$/.test(row.pin)) row.problems.push(`pin ${row.pin || "blank"} is not a full 40-hex sha`);
  else if (pin && row.pin !== pin.sha) row.problems.push(`cites a pin other than pi-main.pin.json's ${pin.sha}`);
  if (row.state === "fixed" && !row.closedBy) row.problems.push("state fixed with no closed_by certificate: nothing names the tag or commit that landed the close");
  if (row.state !== "fixed" && row.closedBy) row.problems.push(`state ${row.state} carries a closed_by certificate ${row.closedBy}, so the close is recorded beside a claim that says it is still open`);
  if (row.state === "fixed" && row.closedBy) {
   const cert = certificate(row.closedBy);
   if (!cert) row.problems.push(`closed_by certificate ${row.closedBy} does not resolve through git to a commit in this repo`);
   else {
    row.closedSha = cert.sha;
    row.closedKind = cert.kind;
   }
  }
  if (!row.problems.length && block.command) {
   const ran = runCommand(block.command);
   if (ran.refused) {
    row.problems.push(`command refused: ${ran.refused}`);
   } else {
    if (String(ran.code) !== row.exit) row.problems.push(`answered exit ${ran.code}, the page says ${row.exit}`);
    for (const want of matches(ran.text, row.output)) row.problems.push(`no output line answers ${want}`);
   }
  }
  rows.push(row);
 }
 for (const row of rows) row.status = row.problems.length ? "stale" : "current";
 return rows;
}

export function pinSha() {
 const pin = pinRecord();
 return pin?.sha ?? null;
}

export function docsSurface() {
 const out = [];
 for (const path of trackedDocs()) {
  try {
   out.push({ path, text: readFileSync(join(ROOT, path), "utf8") });
  } catch {
   continue;
  }
 }
 return out;
}
