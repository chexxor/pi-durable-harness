// PROVENANCE: no Durian-Pi original - Durian-Pi ran the `pi` CLI through its seats, so pi's flag parser was
// always pi's own process and there was nothing in ~/Git/Durian-Pi to extract; the table below is read off
// pi's own pinned release instead. Symbols VERIFIED AGAINST PINED packages, read on this machine at pin v1.5.1:
//   pi's CLI flag parser `parseArgs` (dist/cli/args.js) and its `--help` `Options:` block in the same file
//   pi's CLI docs' flag tables (docs/cli.md), which the capability matrix's rows name the same flags in
//   pi's built-in extension registrations and app name (read by src/slashplane.mjs, not here)
// pi's flags DROPPED from pi's own CLI, on purpose and NAMED rather than silently: every flag this harness
// has no plane for is refused BY NAME in pi's own help words (see cli.mjs' refusal, and the rows in
// src/packages/matrix.mjs that name it), and pi's package subcommands (`pi install/remove/update/list/config`)
// stay pi's because this harness loads packages itself (src/packages/loader.mjs).
//
// src/piflags.mjs - pi's OWN command-line option table, read off pi's pinned release, so cli.mjs can say
// WHICH pi flag it answers and quote pi's own words for the ones it does not.
//
// WHY THIS IS READ RATHER THAN TYPED: a flag list typed into cli.mjs is the same kind of claim as the
// capability matrix, and it goes stale the first time pi grows an option - a flag pi adds would be silently
// swallowed as a message, which is exactly the failure the user reports at the dock. pi ships its option
// help as one template literal inside `dist/cli/args.js` (the block after `${chalk.bold("Options:")}`), so
// the spellings, the value shapes and the description WORDS are all pi's, and a pin that changes an option
// changes what this file answers. The block is guarded: if pi's release stops shipping it in the shape this
// file reads, piCliFlagRows() THROWS rather than answering from a remembered list.
//
// WHAT THIS FILE DOES NOT DO: it does not parse argv (that stays cli.mjs' parseArgs, whose unknown-flag
// rejection is unchanged) and it does not decide which harness surface a flag opens. It answers two
// questions: is this spelling one of pi's options, and what does pi call it.
import { readFileSync } from "node:fs";

/** pi's own pinned dist, addressed the way src/tui/piscreen.mjs and src/slashplane.mjs address it:
 * `import.meta.resolve` answers the package's entry file, and the dist path is RELATIVE to it. */
function piDist(rel) {
 return new URL(rel, import.meta.resolve("@earendil-works/pi-coding-agent"));
}

/** pi's `--help` `Options:` block, cut out of pi's CLI help template literal in dist/cli/args.js.
 * The guards are the shape check: pi's block has to name its own mode option, its own print option and
 * its own end-of-options marker, and it has to be a table of option lines. */
function piOptionBlock() {
 const src = readFileSync(piDist("./cli/args.js"), "utf8");
 const from = src.indexOf('Options:"') < 0 ? src.indexOf("Options:") : src.indexOf('Options:"');
 if (from < 0) throw new Error(`pi's CLI help names no "Options:" block in dist/cli/args.js at this pin`);
 const lines = src.slice(from).split("\n").slice(1);
 // pi's block runs from its `Options:` heading to its own note about extension flags.
 const stop = lines.findIndex((line) => /^Extensions can register additional flags/.test(line));
 if (stop < 0) throw new Error(`pi's Options block has no end (its extension-flag note is missing) at this pin`);
 const block = lines.slice(0, stop);
 for (const must of ["--mode", "--print", "--"]) {
  if (!block.some((line) => new RegExp(`(^|\\s)${must}(\\s|,|$)`).test(line))) throw new Error(`pi's Options block names no ${must} at this pin`);
 }
 return block;
}

/** pi's option rows: each spelling (long and short), pi's own value shape, and pi's own description words
 * (continuation lines included, so a multi-line description stays whole). */
export function piCliFlagRows() {
 const lines = piOptionBlock();
 const rows = [];
 for (const line of lines) {
  const head = line.replace(/^\s+/, "");
  // pi spells an option row as `--long, -s <value>` (or `[value]`), two-or-more spaces, then pi's own
  // words; a continuation row is pi's words only, indented further.
  if (/^(-{1,2}[a-z]|--)/.test(head) && head.includes("  ")) {
   const flagPart = head.slice(0, head.search(/\s{2,}/));
   const words = head.slice(head.search(/\s{2,}/)).trim();
   const spellings = flagPart.split(/,\s*/).map((part) => /^(-{1,2}[A-Za-z][A-Za-z-]*|--)/.exec(part)?.[1]).filter(Boolean);
   if (!spellings.length) continue;
   rows.push({
    spellings,
    long: spellings.filter((s) => s.startsWith("--"))[0] ?? spellings[0],
    shape: /(<[^\s<>]+>|\[[^\s\]]+\])/.exec(flagPart)?.[1] ?? null,
    words,
    line: head.replace(/\s+/g, " ").trim(),
   });
   continue;
  }
  // A continuation row belongs to the option row above it (pi splits long descriptions across lines).
  if (rows.length && head) {
   rows[rows.length - 1].words = `${rows[rows.length - 1].words} ${head}`.replace(/\s+/g, " ").trim();
   rows[rows.length - 1].line = `${rows[rows.length - 1].line} ${head}`.replace(/\s+/g, " ").trim();
  }
 }
 // The shape guard again: pi's block is a table of `--flag` rows, so a parse that loses a known flag is a
 // parse bug, not a pi change.
 for (const must of ["--mode", "--print", "--provider", "--model", "--thinking", "--tools", "--help", "--version", "--"]) {
  if (!rows.some((row) => row.spellings.includes(must))) throw new Error(`pi's Options block lost ${must} at this pin`);
 }
 return rows;
}

/** Which row of pi's option table spells this flag? null when pi spells it nowhere. */
export function piCliFlagOf(flag) {
 return piCliFlagRows().filter((row) => row.spellings.includes(flag))[0] ?? null;
}

/** pi's own words for one flag, spelled the way pi spells it in its help (`--theme <path>   words...`). */
export function piCliFlagText(flag) {
 const row = piCliFlagOf(flag);
 return row?.line ?? flag;
}
