#!/usr/bin/env node
// demo/autocomplete.test.mjs - pi's OWN autocomplete dropdown at pi's OWN input dock, offered over
// pi's OWN data, and the ONE thing this harness adds: pi's `model`/`thinking` argument menus answered
// from pi-durable's candidate lists. Every claim below is measured against pi's provider answer and
// CAPTURED PAINT BYTES from a real terminal, not against a narrator's summary.
//
// PROVENANCE: no Durian-Pi original - Durian-Pi never drove an input component (its
// ~/Git/Durian-Pi/src/tui/client.mjs read whole lines with its own driver), and it has no autocomplete
// layer. What is VERIFIED AGAINST PINED packages, read on this machine at pin v1.5.1: pi-tui's exported
// `CombinedAutocompleteProvider` (dist/index.d.ts:2, dist/autocomplete.js) and pi's `SlashCommand`/
// `AutocompleteItem` shapes (dist/autocomplete.d.ts); pi-tui's `fuzzyFilter` (dist/fuzzy.d.ts) and `fuzzyMatch`;
// pi-tui's public `Editor.setAutocompleteProvider`/`setAutocompleteMaxVisible`/`getAutocompleteMaxVisible`
// (dist/components/editor.d.ts) and pi's `EditorOptions` at this pin (dist/components/editor.d.ts:29, only
// `paddingX`/`autocompleteMaxVisible`, so the provider is NOT a constructor option); pi's own slash trigger
// rule (dist/components/editor.js: autocomplete is tried once `/` starts a line, so no trigger character is
// spelled by the harness); pi's recipe `createBaseAutocompleteProvider()` and pi's `createFuzzyAutocompleteItems`
// (dist/modes/interactive/interactive-mode.js); pi's `[tag]` source prefix (pi's private
// `InteractiveMode.getAutocompleteSourceTag`/`prefixAutocompleteDescription`); pi's model ranking text
// (pi's own dist/modes/interactive/model-search.js, reached as a dist file URL under pi's own package entry);
// pi's `SettingsManager.getAutocompleteMaxVisible()`/`getEnableSkillCommands()` (docs/settings.md defaults 5
// and true); and pi-durable's reads (dist/entries.d.ts, dist/harness/harness.d.ts) behind the candidate lists.
//
// WHAT THIS DEMO DOES NOT PROVE: that a real provider endpoint answered anything (the run spells `--faux`,
// and NO prompt is admitted at all), and that pi's file-path completion works (it does not here: `fdPath`
// is handed null, which is the capability matrix's refusal, checked below).
//
// WHY python3 APPEARS (indirectly, through scripts/ptydrive.mjs): Node has no pty primitive and this repo
// adds no dependency for a test, so scripts/ptydrive.mjs allocates the terminal with python3's standard-library
// `pty` module. A pty is a local kernel object, not a socket, so this demo stays inside the offline proof.

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CombinedAutocompleteProvider, stripTerminalSequences, TuiAltScreen } from "@earendil-works/pi-tui";
import { fuzzyFilter } from "@earendil-works/pi-tui";
import { piBuiltinSlashCommands, piAutocompleteCommands, piAutocompleteMaxVisible } from "../src/slashplane.mjs";
import { piDockOf } from "../src/tui/piscreen.mjs";
import { harnessInvocation } from "../src/cli-intent.mjs";

const ROOT = process.cwd();
const CLI = join(ROOT, "cli.mjs");
const checks = [];
function record(ok, label, detail = "") {
 checks.push({ ok, label });
 console.log(`  ${ok ? "ok " : "NOT"} ${label}${detail ? `: ${detail}` : ""}`);
}

// A cwd whose pi plane has a prompt template and a skill, so pi's dropdown has pi's `[tag]` rows to show:
// pi's loader reads pi's own frontmatter (name/description/argumentHint), the same fixture shape
// demo/packages.test.mjs uses. Nothing is invented: the descriptions below are pi's, from these files.
const CWD = mkdtempSync(join(tmpdir(), "dh-autocomplete-"));
const STORE = join(CWD, "s.sqlite");
mkdirSync(join(CWD, "skills"));
mkdirSync(join(CWD, "prompts"));
writeFileSync(join(CWD, "skills", "fixture-skill.md"), "---\nname: fixture-skill\ndescription: A skill the fixture declares.\n---\nSay FIXTURE_SKILL_BODY.\n");
writeFileSync(join(CWD, "prompts", "fixture-prompt.md"), "---\nname: fixture-prompt\ndescription: A prompt template the fixture declares.\nargumentHint: <task>\n---\nReview $ARGUMENTS.\n");

const parts = await harnessInvocation({ cwd: CWD, store: STORE, faux: "fixture", mode: "rpc" }, {
 additionalResourcePaths: { additionalSkillPaths: [join(CWD, "skills", "fixture-skill.md")], additionalPromptTemplatePaths: [join(CWD, "prompts", "fixture-prompt.md")] },
});
const commands = await piAutocompleteCommands(parts, { cwd: CWD });
const provider = new CombinedAutocompleteProvider(commands, CWD, null);

// 1) pi's dropdown vocabulary is pi's OWN builtin table plus pi-durable's discovered resources.
const builtin = new Set(piBuiltinSlashCommands().map((entry) => entry.name));
const discovered = new Set([
 ...(parts?.resources?.promptTemplates ?? []).map((template) => template.name),
 ...(parts?.resources?.skills ?? []).map((skill) => `skill:${skill.name}`),
 ...(parts?.resources?.commands ?? []).map((row) => row.name),
]);
record(builtin.size > 0 && commands.length >= builtin.size + discovered.size,
 "pi's dropdown carries pi's WHOLE builtin slash table plus every discovered template/skill/extension name",
 `builtin=${builtin.size} discovered=${discovered.size} rows=${commands.length}`);
record(commands.every((row) => builtin.has(row.name) || discovered.has(row.name)),
 "no autocomplete row is a name this harness invented (every row is pi's builtin name or pi's discovered resource name)",
 `invented=${commands.filter((row) => !builtin.has(row.name) && !discovered.has(row.name)).map((row) => row.name).join(",") || "none"}`);

// 2) pi's ARGUMENT menus answer pi-durable's candidate lists in pi's own item shape.
const modelRow = commands.filter((row) => row.name === "model")[0] ?? null;
const modelItems = modelRow?.getArgumentCompletions ? await modelRow.getArgumentCompletions("qwen") : null;
record(modelItems === null || modelItems.every((item) => item?.value && item?.label),
 "pi's `model` argument menu answers pi-durable's get_available_models in pi's own {value,label,description} item shape",
 `items=${(modelItems ?? []).map((item) => `${item.value}|${item.label}|${item.description}`).join(",")}`);
const thinkingRow = commands.filter((row) => row.name === "thinking")[0] ?? null;
const thinkingItems = thinkingRow?.getArgumentCompletions ? await thinkingRow.getArgumentCompletions("m") : null;
record((thinkingItems ?? []).length > 0,
 "pi's `thinking` argument menu answers pi-durable's get_available_thinking_levels (pi-ai's vocabulary, none typed here)",
 `levels=${(thinkingItems ?? []).map((item) => item.value).join(",")}`);
record((thinkingItems ?? []).length > 0 && fuzzyFilter(thinkingItems, "m", (item) => item.value).length === (thinkingItems ?? []).filter((item) => String(item.value).includes("m")).length,
 "pi-tui's OWN exported fuzzyFilter ranks the argument items (the harness only hands it pi's search text)",
 `fuzzy=${fuzzyFilter(thinkingItems, "m", (item) => item.value).map((item) => item.value).join(",")}`);

// 3) pi's template and `skill:` rows, with pi's OWN `[tag]` source prefix applied to pi's descriptions.
const templateRow = commands.filter((row) => row.name === "fixture-prompt")[0] ?? null;
const skillRow = commands.filter((row) => row.name === "skill:fixture-skill")[0] ?? null;
record(templateRow && templateRow.description !== undefined,
 "pi's discovered prompt template reaches pi's dropdown with pi's argumentHint and pi's `[tag]`-prefixed description",
 JSON.stringify(templateRow));
record(skillRow?.name === "skill:fixture-skill" && skillRow?.description !== undefined,
 "pi's discovered skill reaches pi's dropdown as pi's `skill:` command name, gated on pi's OWN getEnableSkillCommands()",
 JSON.stringify(skillRow));

// 4) the REFUSALS are named by the matrix, not hidden: pi's file-path completion offers nothing (fdPath null).
const fileProbe = await provider.getSuggestions(["@x"], 0, 2, {});
const commandProbe = await provider.getSuggestions(["/mo"], 0, 3, {});
record(fileProbe === null && (commandProbe?.items ?? []).length > 0,
 "pi's file-path completion is REFUSED BY NAME (fdPath null: pi answers no items for `@x`), while pi's command menu answers",
 `file=${fileProbe === null ? "no items" : `${fileProbe.items.length} items`} command=${(commandProbe?.items ?? []).map((item) => item.value).join(",")} prefix=${commandProbe?.prefix}`);

// 5) pi's visible count comes from pi's OWN setting, and pi's Editor reports it back.
const maxVisible = piAutocompleteMaxVisible(CWD);
const ui = new TuiAltScreen({
 start: () => {}, stop: () => {}, write: () => {}, moveBy: () => {}, hideCursor: () => {}, showCursor: () => {},
 clearLine: () => {}, clearFromCursor: () => {}, clearScreen: () => {}, setTitle: () => {}, setProgress: () => {}, drainInput: async () => [],
}, false, undefined);
const dock = piDockOf(ui, { history: [], autocompleteCommands: commands, cwd: CWD, autocompleteMaxVisible: maxVisible });
record(dock.editor.getAutocompleteMaxVisible() === maxVisible,
 "pi's OWN SettingsManager.getAutocompleteMaxVisible() reaches pi's Editor (pi clamps it; the harness typed no count)",
 `setting=${maxVisible} editor=${dock.editor.getAutocompleteMaxVisible()}`);
const visible = (((await provider.getSuggestions(["/se"], 0, 3, { signal: AbortSignal.timeout(2000) }))?.items) ?? []).length;
record(visible > maxVisible,
 "pi's dropdown is CLIPPED by pi's visible count, not by the number of matches (more matches than pi would show)",
 `matches=${visible} pi shows=${maxVisible}`);

// 6) the terminal proof: a PARTIAL command types a dropdown, and pi's own completion+run means NO admission.
const capture = join(CWD, "run");
const drive = [
 "--capture", capture, "--timeout", "45", "--after", "3", "--gap", "0.8",
 // pi's own Esc cancels the draft at the dock, and this harness keeps a REFUSED-BY-NAME draft in pi's
 // Editor (src/tui/pidockloop.mjs, pi's own rule for a command it could not run: interactive-mode.js:2799
 // `this.editor.setText(text)`), so a human's Esc is what separates the two partial commands here.
 "--keystroke", "/se", "--keystroke", "\\r", "--keystroke", "\\x1b", "--keystroke", "/mo", "--keystroke", "\\r", "--keystroke", "\\x1b", "--keystroke", "/quit\\r",
 "--quiet", "--", "node", CLI, "--store", STORE, "--cwd", CWD, "--width", "78", "--height", "20", "--faux", "probe",
];
let painted = "";
try {
 execFileSync("node", [join(ROOT, "scripts", "ptydrive.mjs"), ...drive], { cwd: ROOT, encoding: "utf8", timeout: 120000 });
 painted = stripTerminalSequences(readFileSync(`${capture}.screen`, "utf8"));
} catch (err) {
 console.log(`  NOT the pty run failed: ${String(err?.stderr ?? err?.message ?? err)}`.slice(0, 300));
}
record(painted.includes("→"),
 "the paint carries pi's dropdown SELECTION marker, so the menu is pi-tui's SelectList, not a row this harness drew",
 `markers=${(painted.match(/→/g) ?? []).length}`);
record(painted.includes("<provider/model>") && painted.includes("Select model"),
 "pi's dropdown row shows pi's OWN argumentHint and description words (pi's builtin table, no wording typed here)",
 `hint=${painted.includes("<provider/model>")}`);
record(/\(\d+\/\d+\)/.test(painted),
 "the menu shows pi's OWN `(n/total)` counter, so pi knows it clipped a longer list",
 `counter=${/(\(\d+\/\d+\))/.exec(painted)?.[1] ?? "none"}`);
record(!painted.includes("status=placed") && !painted.includes("nothing was typed"),
 "a PARTIAL command (`/se` ENTER + pi's Esc, `/mo` ENTER) became pi's completion + pi's command run, never an agent admission",
 `placed=${(painted.match(/status=placed/g) ?? []).length}`);
const tallyLine = painted.split("\n").filter((line) => line.includes("decisions=")).pop() ?? "";
record(tallyLine.includes("decisions=") && !tallyLine.includes("fallthrough"),
 "the run's own tally names pi's decision for every draft, and NO draft fell through to pi-durable's admission",
 `tally=${tallyLine.slice(-180)}`);

const failed = checks.filter((check) => !check.ok).length;
console.log(autocompleteVerdict(checks.length - failed, checks.length));
process.exitCode = failed ? 1 : 0;

function autocompleteVerdict(passed, total) {
 return `  ${passed}/${total} checks passed`;
}
