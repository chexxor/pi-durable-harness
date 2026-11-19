#!/usr/bin/env node
// demo/keybindings.test.mjs - pi's OWN keybinding layer: pi's registry decides WHICH action a typed
// byte is, pi's components decide what that action DOES, and the only thing this harness decides is
// which pi-durable call a finished draft becomes. Every claim below is pi's answer at THIS dock
// (pi's `KeybindingsManager.matches()` and pi's component text), plus CAPTURED PAINT BYTES from one
// real terminal - never a narrator's summary of what the keys are "supposed to do".
//
// PROVENANCE: no Durian-Pi original - Durian-Pi never drove an input component (its
// ~/Git/Durian-Pi/src/tui/client.mjs read whole lines with its own driver) and it has no keybinding
// layer, so pi's keybinding registry, pi's matcher and pi's action ids were never pi's there. What is
// VERIFIED AGAINST PINED packages, read on this machine at pin v1.5.1: pi-tui's exported
// `TUI_KEYBINDINGS`, `getKeybindings()` (the GLOBAL registry pi's `TuiAltScreen` reads) and
// `KeybindingsManager` (`matches`/`getKeys`/`getConflicts`/`getUserBindings`/`getResolvedBindings`,
// dist/keybindings.d.ts - there is no `getAll()`, so ids are enumerated from pi's own tables);
// pi-coding-agent's app-key table, read off dist/core/keybindings.d.ts (pi's app ids are NOT a runtime
// export at this pin); pi-tui's `TuiAltScreen` matching its own ids in dist/tui-alt-screen.js; pi's
// `CustomEditor`/`Editor.handleInput/getText` callbacks (assignments, not constructor options); pi-coding-agent's
// exported `keyText`/`keyHint`/`initTheme` (dist/index.d.ts re-exports them from pi's own modes/interactive code,
// so the hint wording below is pi's and not a hand-written `ctrl+k` string); and
// pi's own config readers behind src/packages/loader.mjs, src/settings.mjs and src/providers.mjs.
// DROPPED on purpose and named in the capability matrix rather than reimplemented: pi's app selector
// dialogs those app ids open, pi's `<agent-dir>/keybindings.json` user bindings, pi's transcript
// search keystroke, pi's MCP plane.
//
// WHY python3 APPEARS BELOW: Node has no pty primitive and no dependency may be added for a test, so
// scripts/ptydrive.mjs allocates the terminal with python3's standard-library `pty` module. The code
// under test is a normal Node child whose stdio is the pty's slave side; a pty is a local kernel object,
// not a socket, so this demo stays inside the offline proof (the run spells `--faux`, so pi-ai's faux
// plane answers and no provider endpoint is contacted).

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TUI_KEYBINDINGS, getKeybindings, TuiAltScreen, stripTerminalSequences } from "@earendil-works/pi-tui";
import { keyHint, keyText, initTheme } from "@earendil-works/pi-coding-agent";
import { piDockOf, entryText, piStatusRows } from "../src/tui/piscreen.mjs";
import { openStore, readEntries, listConversations } from "../src/readapi.mjs";
import { loadPiResources, loadContextFiles } from "../src/packages/loader.mjs";
import { piSettings, agentConfig } from "../src/settings.mjs";
import { machineProviderConfigs } from "../src/providers.mjs";

const ROOT = process.cwd();
const CLI = join(ROOT, "cli.mjs");
const checks = [];
function record(ok, label, detail = "") {
 checks.push({ ok, label });
 console.log(`  ${ok ? "ok " : "NOT"} ${label}${detail ? `: ${detail}` : ""}`);
}

// A no-op terminal for the offline sections: pi's components only need pi's public `Terminal` calls.
function mkui() {
 return new TuiAltScreen({
  start: () => {}, stop: () => {}, write: () => {}, moveBy: () => {}, hideCursor: () => {}, showCursor: () => {},
  clearLine: () => {}, clearFromCursor: () => {}, clearScreen: () => {}, setTitle: () => {}, setProgress: () => {},
  drainInput: async () => [],
 }, false, undefined);
}

const dock = piDockOf(mkui(), {});
const resolved = Object.keys(dock.keybindings.getResolvedBindings());
// pi's matcher is the attribution: an id is what a byte means ONLY if pi says so.
const attributed = (raw) => resolved.filter((id) => dock.keybindings.matches(raw, id));
const piRegistry = getKeybindings();

// 1) the tables: pi's own global registry, this dock's manager, and pi's app table off pi's declaration file.
const tuiIds = Object.keys(TUI_KEYBINDINGS);
const registryIds = Object.keys(piRegistry.getResolvedBindings());
record(tuiIds.length === 47 && registryIds.length === 47 && tuiIds.every((id) => registryIds.includes(id)),
 "pi's exported TUI_KEYBINDINGS and pi's GLOBAL registry are the SAME 47 tui ids (no id was added here)",
 `table=${tuiIds.length} registry=${registryIds.length}`);
record(tuiIds.every((id) => JSON.stringify(dock.keybindings.getKeys(id) ?? null) === JSON.stringify(piRegistry.getKeys(id) ?? null)),
 "this dock's manager answers pi's OWN key words for every tui id (getKeys at the dock equals pi's registry answer)",
 `equal=${tuiIds.filter((id) => JSON.stringify(dock.keybindings.getKeys(id) ?? null) === JSON.stringify(piRegistry.getKeys(id) ?? null)).length}/${tuiIds.length}`);
const unbound = tuiIds.filter((id) => !String(dock.keybindings.getKeys(id) ?? "").length);
record(unbound.sort().join(",") === ["tui.editor.historyNext", "tui.editor.historyPrevious", "tui.altScreen.halfPageDown", "tui.altScreen.halfPageUp", "tui.altScreen.lineDown", "tui.altScreen.lineUp"].sort().join(","),
 "pi binds NO default key for exactly 6 tui ids at this pin (pi's own table carries empty defaultKeys there)",
 `unbound=${unbound.join(",")}`);
const appDecl = readFileSync(new URL("./core/keybindings.d.ts", import.meta.resolve("@earendil-works/pi-coding-agent")), "utf8");
const appIds = [...new Set([...appDecl.matchAll(/"(app\.[a-zA-Z.]+)"\s*:/g)].map((match) => match[1]))];
record(appIds.length === 43 && resolved.length === 50,
 "pi's app table names 43 actions; this dock resolves 50 ids (47 tui + pi's interrupt/clear/exit only)",
 `app=${appIds.length} dock=${resolved.length}`);
record(appIds.filter((id) => resolved.includes(id)).sort().join(",") === "app.clear,app.exit,app.interrupt",
 "the ONLY pi app actions bound at this dock are pi's interrupt, clear and exit (the other 40 carry no key here)",
 `bound=${appIds.filter((id) => resolved.includes(id)).sort().join(",")} unbound=${appIds.filter((id) => !resolved.includes(id)).length}`);
record(Object.keys(dock.keybindings.getUserBindings()).length === 0 && dock.keybindings.getConflicts().length === 0,
 "pi's own reports are empty at this dock: no user bindings loaded, no key conflict claimed by pi",
 `userBindings=${JSON.stringify(dock.keybindings.getUserBindings())} conflicts=${dock.keybindings.getConflicts().length}`);
record(attributed("\u0003").sort().join(",") === "app.clear,tui.input.copy,tui.select.cancel",
 "pi's matcher says ctrl+c is THREE actions at once (pi's copy, pi's cancel and pi's clear) - the clash is pi's, named here",
 `ids=${attributed("\u0003").join(",")}`);
record(attributed("\u0003").includes("app.clear") && !attributed("\u0002\u0002").length,
 "pi attributes ONE byte per keystroke: ctrl+b ctrl+b in ONE call answers no action, while ctrl+c claims pi's clear",
 `double=${JSON.stringify(attributed("\u0002\u0002"))} single=${attributed("\u0002").join(",")}`);

// 2) the attribution table: every byte form the sweep fed, and what pi's matcher answers for it.
const FORMS = [
 ["\u0001", ["tui.editor.cursorLineStart"]], ["\u0002", ["tui.editor.cursorLeft"]], ["\u0004", ["tui.editor.deleteCharForward", "app.exit"]],
 ["\u0005", ["tui.editor.cursorLineEnd"]], ["\u0006", ["tui.editor.cursorRight"]], ["\u0007", ["tui.altScreen.searchNext"]],
 ["\u0008", ["tui.editor.deleteCharBackward"]], ["\u0009", ["tui.input.tab"]], ["\u000a", ["tui.input.newLine", "tui.input.submit", "tui.select.confirm", "tui.altScreen.searchNext"]],
 ["\u000b", ["tui.editor.deleteToLineEnd"]], ["\u000d", ["tui.input.submit", "tui.select.confirm", "tui.altScreen.searchNext"]], ["\u0015", ["tui.editor.deleteToLineStart"]],
 ["\u0017", ["tui.editor.deleteWordBackward"]], ["\u0019", ["tui.editor.yank"]], ["\u001b", ["tui.select.cancel", "tui.altScreen.searchClose", "app.interrupt"]],
 ["\u001d", ["tui.editor.jumpForward"]], ["\u001f", ["tui.editor.undo"]], ["\u007f", ["tui.editor.deleteCharBackward"]],
 ["\u001b[D", ["tui.editor.cursorLeft"]], ["\u001b[C", ["tui.editor.cursorRight"]], ["\u001b[A", ["tui.editor.cursorUp", "tui.select.up"]],
 ["\u001b[B", ["tui.editor.cursorDown", "tui.select.down"]], ["\u001b[5~", ["tui.editor.pageUp", "tui.select.pageUp", "tui.altScreen.pageUp"]],
 ["\u001b[6~", ["tui.editor.pageDown", "tui.select.pageDown", "tui.altScreen.pageDown"]], ["\u001b[1~", ["tui.editor.cursorLineStart"]],
 ["\u001b[4~", ["tui.editor.cursorLineEnd"]], ["\u001b[3~", ["tui.editor.deleteCharForward"]], ["\u001b[1;5H", ["tui.altScreen.top"]],
 ["\u001b[1;5F", ["tui.altScreen.bottom"]], ["\u001b[1;5A", ["tui.altScreen.previousPrompt"]], ["\u001b[1;5B", ["tui.altScreen.nextPrompt"]],
 ["\u001b[1;5D", ["tui.editor.cursorWordLeft"]], ["\u001b[1;3D", ["tui.editor.cursorWordLeft"]], ["\u001b[1;5C", ["tui.editor.cursorWordRight"]],
 ["\u001b[1;3C", ["tui.editor.cursorWordRight"]], ["\u001bb", ["tui.editor.cursorWordLeft"]], ["\u001bf", ["tui.editor.cursorWordRight"]],
 ["\u001bd", ["tui.editor.deleteWordForward"]], ["\u001by", ["tui.editor.yankPop"]], ["\u001b\b", ["tui.editor.deleteWordBackward"]],
 ["\u001b[3;3~", ["tui.editor.deleteWordForward"]],
 ["\u0011", []], ["\u0012", []], ["\u0013", []], ["\u0014", []], ["\u0016", []], ["\u0018", []], ["\u001a", []], ["\u001c", []], ["\u001e", []], ["\u000c", []],
 ["\u001b[102;6U", []], ["\u001b[102;5U", []], ["\u001b[102;3U", []], ["\u001b[576U", []], ["\u001bg", []], ["\u001bz", []], ["\u001b[1;2A", []], ["\u001b[1;2B", []],
 ["\u001b[<64;20;10M", []], ["\u001b[<65;20;10M", []],
];
const mismatches = FORMS.filter(([form, expected]) => attributed(form).sort().join(",") !== expected.sort().join(","))
 .map(([form, expected]) => `${JSON.stringify(form)} expected=${expected.join("|")} pi=${attributed(form).join("|") || "NOTHING"}`);
record(mismatches.length === 0,
 `pi's matcher attributes all ${FORMS.length} byte forms exactly as recorded (one action set per form, no invented name)`,
 `mismatches=${mismatches.length} first=${mismatches[0] ?? "none"}`);
const unmatched = FORMS.filter(([, expected]) => !expected.length).map(([form]) => form);
record(unmatched.length === 20,
 "pi answers NO action for 20 forms this sweep fed: 10 spare control bytes, pi's transcript-search CSI-u forms, pi's shift+arrow forms and pi's TWO wheel-gesture forms (a wheel carries no keybinding id - pi's alt screen routes it through its own parseWheelEvent, and demo/scrollwheel.test.mjs measures what that does to pi's view)",
 `none=${unmatched.length} csi=${JSON.stringify(unmatched.filter((form) => form.startsWith("\u001b[")))}`);

// 3) pi's Editor deciding the EFFECT of pi's editor actions (one keystroke per pi call).
const EFFECTS = [
 ["pi's deleteCharBackward (del)", ["\u007f"], "alpha beta gamm"],
 ["pi's deleteWordBackward", ["\u0017"], "alpha beta "],
 ["pi's deleteToLineStart", ["\u0015"], ""],
 ["pi's deleteCharForward at line end", ["\u0004"], "alpha beta gamma"],
 ["pi's cursorLeft then deleteCharForward", ["\u001b[D", "\u0004"], "alpha beta gamm"],
 ["pi's cursorLineStart then deleteCharForward", ["\u0001", "\u0004"], "lpha beta gamma"],
 ["pi's cursorLineEnd then deleteCharForward", ["\u0005", "\u0004"], "alpha beta gamma"],
 ["pi's cursorWordLeft then deleteToLineStart", ["\u001bb", "\u0015"], "gamma"],
 ["pi's yank restores after a delete", ["\u0017", "\u0019"], "alpha beta gamma"],
 ["pi's yankPop", ["\u0017", "\u001by"], "alpha beta "],
 ["pi's deleteWordBackward (alt+backspace)", ["\u001b\b"], "alpha beta "],
 ["pi's undo reverts the typed draft", ["\u001f"], ""],
 ["pi's newLine appends a line", ["\u000a"], "alpha beta gamma\n"],
];
const effectFails = [];
for (const [label, steps, want] of EFFECTS) {
 const editorDock = piDockOf(mkui(), {});
 editorDock.editor.handleInput("alpha beta gamma");
 for (const step of steps) editorDock.editor.handleInput(step);
 const got = editorDock.editor.getText();
 record(got === want, `${label}: pi's Editor left exactly the text recorded`, `after=${JSON.stringify(got)}`);
 if (got !== want) effectFails.push(`${label} want=${JSON.stringify(want)} got=${JSON.stringify(got)}`);
}
// pi's submit action fires pi's OWN callback, which is the seam the dock listens to.
const submitDock = piDockOf(mkui(), {});
const submitted = [];
submitDock.editor.onSubmit = (draft) => submitted.push(draft);
submitDock.editor.handleInput("alpha beta gamma");
submitDock.editor.handleInput("\u000d");
record(submitted.length === 1 && submitted[0] === "alpha beta gamma" && submitDock.editor.getText() === "",
 "pi's `tui.input.submit` empties the draft and fires pi's `onSubmit` with it (the dock submits that draft, no key named here)",
 `fired=${JSON.stringify(submitted)} draft=${JSON.stringify(submitDock.editor.getText())}`);
record(effectFails.length === 0,
 "every pi Editor effect above matched pi's own text",
 `fails=${effectFails.length} first=${effectFails[0] ?? "none"}`);

// 4) pi's alt-screen ids: pi's fullscreen viewport IS this harness's pi-style screen.
const altIds = tuiIds.filter((id) => id.startsWith("tui.altScreen."));
const altSource = readFileSync(new URL("./tui-alt-screen.js", import.meta.resolve("@earendil-works/pi-tui")), "utf8");
record(altIds.length === 14 && altIds.every((id) => altSource.includes(id)),
 "all 14 altScreen ids are pi's own and pi's TuiAltScreen class names them ITSELF (it matches through pi's global registry, not the Editor's manager)",
 `ids=${altIds.length} inSource=${altIds.filter((id) => altSource.includes(id)).length}`);
record(altIds.every((id) => registryIds.includes(id)),
 "pi's GLOBAL registry carries every altScreen id, so pi's screen stays bound without this harness touching it",
 `bound=${altIds.filter((id) => registryIds.includes(id)).length}/${altIds.length}`);

const CWD = mkdtempSync(join(tmpdir(), "dh-altscreen-"));
const STORE = join(CWD, "s.sqlite");
const FEEDS = [
 ["pageUp", "1b5b357e", ["tui.editor.pageUp", "tui.select.pageUp", "tui.altScreen.pageUp"]],
 ["pageDown", "1b5b367e", ["tui.editor.pageDown", "tui.select.pageDown", "tui.altScreen.pageDown"]],
 ["top", "1b5b313b3548", ["tui.altScreen.top"]],
 ["bottom", "1b5b313b3546", ["tui.altScreen.bottom"]],
 ["previousPrompt", "1b5b313b3541", ["tui.altScreen.previousPrompt"]],
];
const TYPED = ["first prompt alpha", "\\r", "second prompt beta", "\\r", "third prompt gamma", "\\r"];
const drive = ["--timeout", "90", "--after", "3", "--gap", "0.9", "--winsize", "70", "30"];
for (const keystroke of TYPED) drive.push("--keystroke", keystroke);
for (const [, hex] of FEEDS) drive.push("--feed-hex", hex);
drive.push("--keystroke", "/quit\\r", "--", "node", CLI, "--store", STORE, "--cwd", CWD, "--width", "70", "--height", "30", "--faux", "probe");
// One helper, used by BOTH terminal runs below: split the helper's stdout into the segment a keystroke's
// OWN paint lives in (that is what the helper's own segment labels say).
function segmentsOf(driveArgs) {
 const segs = [];
 try {
  const out = execFileSync("node", [join(ROOT, "scripts", "ptydrive.mjs"), ...driveArgs], { cwd: ROOT, encoding: "utf8", timeout: 150000 });
  for (const line of out.split("\n")) {
   const head = /^---- (.*) \((\d+) painted bytes\) ----$/.exec(line);
   if (head) { segs.push({ label: head[1], rows: [] }); continue; }
   if (segs.length) {
    const row = stripTerminalSequences(line).replace(/\r/g, "").trim();
    if (row) segs[segs.length - 1].rows.push(row);
   }
  }
 } catch (err) {
  console.log(`  NOT the pty run failed: ${String(err?.stderr ?? err?.message ?? err)}`.slice(0, 300));
 }
 return segs;
}
const segments = segmentsOf(drive);
record(segments.length >= 10,
 "the ONE terminal run answered a segment per keystroke, so a reader can tell WHICH byte produced WHICH paint",
 `segments=${segments.length} feeds=${FEEDS.length} labels=${segments.map((e) => e.label.split(" ")[0]).join(",")}`);
const BORDER = "\u2503";
// The helper labels a segment with the keystroke whose OWN paint it holds (`response to keystroke3 b'...'`),
// so a reader matches a feed to the paint that feed produced, not to the write that closed the window.
function feedRepr(hex) {
 const bytes = Buffer.from(hex, "hex").toString("latin1");
 return `b'${bytes.replace("\u001b", "\\x1b")}'`;
}
const TOP_ROW = "pi-durable session";
const END_ROW = "third prompt gamma";
// Which end of the document each feed's OWN response shows: pi's header row is at the DOCUMENT TOP, pi's
// newest prompt row is at the CONTENT END. A feed whose response shows the header row but not the newest
// prompt row left the view at the top; one whose response shows the newest prompt row left it at the end.
// This is the honest shape at this pin: pi's `follow: "end"` rule is that the view sticks to the content end
// WHILE it sits at that end, so a scroll feed that moves away from the end stays moved.
const SHOWS = {
 pageUp: "top",
 pageDown: "end",
 top: "top",
 bottom: "end",
 previousPrompt: "end",
};
for (const [name, hex, ids] of FEEDS) {
 const segment = segments.find((entry) => entry.label.includes(feedRepr(hex)));
 const top = segment?.rows.filter((row) => row.includes(TOP_ROW)).length ?? -1;
 const end = segment?.rows.filter((row) => row.includes(END_ROW)).length ?? -1;
 const box = segment?.rows.filter((row) => row.includes(BORDER)).length ?? -1;
 const want = SHOWS[name];
 const atTop = want === "top" ? top >= 1 && end === 0 : top === 0 && end >= 1;
 const where = want === "top" ? "DOCUMENT TOP (pi's header row on screen, pi's newest prompt row off it)" : "CONTENT END (pi's newest prompt row on screen, pi's header row off it)";
 record(atTop,
  `pi's ${name} feed answers pi's ${ids.join(",")} ids and its OWN response segment sits at the ${where}`,
  `bytes=${hex} ids=${ids.join(",")} top=${top} end=${end} box=${box} label=${segment?.label ?? "no segment"}`);
}
const fresh = segments.find((entry) => entry.label.includes(`response to keystroke${TYPED.length} `));
const freshTop = (fresh?.rows ?? []).filter((row) => row.includes(TOP_ROW)).length;
const freshEnd = (fresh?.rows ?? []).filter((row) => row.includes(END_ROW)).length;
record(freshEnd >= 1,
 "pi's fresh view is AT THE CONTENT END (pi's newest prompt row is on screen in the segment answering pi's last ENTER), and pi's pageUp response segment leaves pi's newest prompt row off the screen instead",
 `freshTop=${freshTop} freshEnd=${freshEnd} label=${fresh?.label ?? "no segment"}`);
const feedSegments = FEEDS.map(([, hex]) => segments.find((entry) => entry.label.includes(feedRepr(hex))));
const topSegments = feedSegments.filter((entry) => (entry?.rows ?? []).some((row) => row.includes(TOP_ROW))).length;
const endSegments = feedSegments.filter((entry) => (entry?.rows ?? []).some((row) => row.includes(END_ROW))).length;
record(topSegments === 2 && endSegments === 3,
 "EXACTLY pi's pageUp and pi's ctrl+home responses show pi's document-top header row, and EXACTLY pi's pageDown, pi's ctrl+end and pi's previousPrompt responses show pi's newest prompt row (pi's pageDown pages pi's view BACK to the content end; pi's follow-end alone does not do that)",
 `topSegments=${topSegments} endSegments=${endSegments} total=${segments.length}`);

// 4b) pi's ctrl+k AT A REAL PTY, seen as the PAINT it produces and as what the store actually admits. This
// is the SECOND terminal run in this file, and it is here because pi's own rule for the delete pair is CARET
// TO END OF LINE, not "clear the draft": a draft whose caret sits mid-row keeps the words BEFORE the caret,
// and a draft pi leaves EMPTY admits NOTHING. Every row checked below comes from the segment answering pi's
// OWN ctrl+k write, and the store is read back through src/readapi.mjs' ONE opener (not through a second one).
const KDIR = mkdtempSync(join(tmpdir(), "dh-ctrlk-"));
const KSTORE = join(KDIR, "kstore.sqlite");
const kbDrive = ["--timeout", "90", "--after", "3", "--gap", "0.9", "--winsize", "70", "30", "--keystroke", "keep drop"];
for (let i = 0; i < 5; i += 1) kbDrive.push("--feed-hex", "02");
kbDrive.push("--feed-hex", "0b", "--keystroke", "\\r");
kbDrive.push("--keystroke", "draft hello world", "--feed-hex", "01", "--feed-hex", "0b", "--keystroke", "\\r");
kbDrive.push("--keystroke", "/quit\\r", "--", "node", CLI, "--store", KSTORE, "--cwd", KDIR, "--width", "70", "--height", "30", "--faux", "probe");
const kbSegments = segmentsOf(kbDrive);
// pi's ctrl+k write is the ONE byte `0x0b`; its label is `response to keystrokeN b'\\x0b'`, so the run answers
// with one segment per ctrl+k, in the order the bytes were typed (partial delete first, whole-line second).
const kbCtrlK = kbSegments.filter((entry) => entry.label.includes("b'\\x0b'"));
const [partialPaint, wholePaint] = kbCtrlK;
const partialNext = kbSegments[kbSegments.indexOf(partialPaint) + 1] ?? {};
const wholeNext = kbSegments[kbSegments.indexOf(wholePaint) + 1] ?? {};
record(kbCtrlK.length === 2 && kbSegments.length >= 14,
 "the ctrl+k run answers a segment per keystroke and pi's TWO ctrl+k bytes each get their OWN segment, so a reader knows which paint pi's delete produced",
 `segments=${kbSegments.length} ctrlk=${kbCtrlK.length} labels=${kbSegments.map((entry) => entry.label.split(" ")[0]).join(",")}`);
record(partialPaint?.rows.some((row) => row.includes("keep")) && partialPaint?.rows.every((row) => !row.includes("drop")),
 "pi's ctrl+k after FIVE pi cursorLeft keystrokes paints a row carrying pi's `keep` and NO row carries pi's `drop` (pi deleted CARET->EOL, it did NOT clear the draft and it did not keep the whole row)",
 `bytes=0b ids=${attributed("\u000b").join(",")} painted=${JSON.stringify(partialPaint?.rows ?? [])}`);
record(wholePaint?.rows.every((row) => !row.includes("draft") && !row.includes("hello") && !row.includes("world")) && wholeNext?.rows.some((row) => row.includes("status=nothing")) && wholeNext?.rows.some((row) => row.includes("was typed")),
 "pi's ctrl+line-start then pi's ctrl+k leaves pi's draft EMPTY (no painted row in that segment carries pi's typed words), and pi's ENTER on it answers `status=nothing`/`was typed` rather than admitting a turn",
 `bytes=01 then 0b painted=${JSON.stringify(wholePaint?.rows ?? [])} enter=${JSON.stringify(wholeNext?.rows ?? [])}`);
record(partialNext?.rows.some((row) => row.includes("status=placed")),
 "pi's ENTER after the PARTIAL delete DOES admit pi's kept draft (that segment carries pi's `status=placed`), so pi's ctrl+k leaves a real draft behind rather than nothing",
 `enter=${JSON.stringify(partialNext?.rows ?? [])}`);
const kbViewer = await openStore(KSTORE);
const kbConversations = await listConversations(kbViewer);
const kbTexts = [];
for (const row of kbConversations) {
 const page = await readEntries(kbViewer, row.id, { limit: 50 });
 kbTexts.push(...page.items.filter((entry) => entry?.kind === "pi.user").map((entry) => entryText(entry)).filter((text) => text));
}
record(kbTexts.join("\u001e") === "keep",
 "what the store admits for the WHOLE run is pi's `keep` alone: pi's ctrl+k left pi's `draft hello world` empty and pi's ONE mutation line received NOTHING for it (no pi.user row, no invented refusal)",
 `conversations=${kbConversations.length} piUserTexts=${JSON.stringify(kbTexts)}`);

// 4c) an action pi binds NO key to contributes NO hint row. The code guard (`if (!keyText(keybinding)) continue`)
// in src/tui/piscreen.mjs is only honest if it is MEASURED: pi's own `keyText` reads the key back out of pi's
// keybinding table and answers "" for an id pi binds nothing to, and the rows that DO paint are pi's own
// `keyHint` output. pi's own descriptions below are pi's (pi's docs/keybindings.md rows for those ids).
const UNBOUND_HINTS = [
 ["tui.editor.historyPrevious", "Select the previous prompt history entry"],
 ["tui.altScreen.lineUp", "Scroll the transcript up by one line"],
];
// pi's hint rows carry pi's palette, so pi's theme has to be installed before they paint (pi's own
// `initTheme`, which pi-coding-agent exports alongside keyText/keyHint).
initTheme();
const paintRows = (hints) => {
 const rows = [];
 for (const row of piStatusRows(null, { hints })) rows.push(...(row.render(200) ?? []));
 return rows.map((line) => stripTerminalSequences(line).trim()).filter((line) => line);
};
const noHints = paintRows([]);
const boundHints = paintRows([["tui.editor.deleteToLineEnd", "to delete to end"]]);
const unboundHints = paintRows(UNBOUND_HINTS);
const mixedHints = paintRows([["tui.editor.deleteToLineEnd", "to delete to end"], ...UNBOUND_HINTS]);
record(keyText("tui.editor.deleteToLineEnd") === "ctrl+k" && UNBOUND_HINTS.every(([id]) => keyText(id) === ""),
 "pi's OWN keyText answers pi's key words for a BOUND id and \"\" for pi's TWO unbound ids (pi's table carries empty defaultKeys there)",
 `bound=${JSON.stringify(keyText("tui.editor.deleteToLineEnd"))} unbound=${UNBOUND_HINTS.map(([id]) => `${id}=${JSON.stringify(keyText(id))}`).join(",")}`);
record(boundHints.length === noHints.length + 1 && boundHints.some((line) => line === stripTerminalSequences(keyHint("tui.editor.deleteToLineEnd", "to delete to end"))),
 "for the BOUND id piStatusRows adds EXACTLY pi's OWN `keyHint` row (pi spells `ctrl+k to delete to end` from pi's table, no hand-written key here)",
 `rows=${JSON.stringify(boundHints)} pi=${JSON.stringify(stripTerminalSequences(keyHint("tui.editor.deleteToLineEnd", "to delete to end")))}`);
record(unboundHints.length === noHints.length && mixedHints.length === boundHints.length && mixedHints.every((line) => boundHints.includes(line)),
 "for pi's UNBOUND ids piStatusRows adds NOTHING: the painted rows for [bound + 2 unbound] are EXACTLY the rows for [bound], so an action pi handles no key for contributes no hint rather than a false one",
 `unboundRows=${JSON.stringify(unboundHints)} mixed=${JSON.stringify(mixedHints)} noHintRows=${JSON.stringify(noHints)}`);

// 5) the config plane: which of pi's own configuration files pi's OWN readers actually read for this run.
const CFGROOT = mkdtempSync(join(tmpdir(), "dh-config-"));
const CFGCWD = join(CFGROOT, "proj");
const AGENT = join(CFGROOT, "agentdir");
mkdirSync(join(AGENT, "themes"), { recursive: true });
mkdirSync(join(CFGCWD, ".pi", "themes"), { recursive: true });
mkdirSync(join(CFGCWD, ".pi", "skills", "pj-only"), { recursive: true });
mkdirSync(join(AGENT, "skills", "ag-only"), { recursive: true });
mkdirSync(join(CFGCWD, ".pi", "prompts"), { recursive: true });
mkdirSync(join(AGENT, "prompts"), { recursive: true });
writeFileSync(join(CFGCWD, ".pi", "skills", "pj-only", "SKILL.md"), "---\nname: pj-only\ndescription: project skill.\n---\nSay PROJECT_SKILL.\n");
writeFileSync(join(AGENT, "skills", "ag-only", "SKILL.md"), "---\nname: ag-only\ndescription: agent skill.\n---\nSay AGENT_SKILL.\n");
writeFileSync(join(CFGCWD, ".pi", "prompts", "p-only.md"), "---\nname: p-only\ndescription: project prompt.\nargumentHint: <task>\n---\nReview $ARGUMENTS.\n");
writeFileSync(join(AGENT, "prompts", "a-only.md"), "---\nname: a-only\ndescription: agent prompt.\n---\nReview everything.\n");
const piTheme = JSON.parse(readFileSync(new URL("./modes/interactive/theme/dark.json", import.meta.resolve("@earendil-works/pi-coding-agent")), "utf8"));
writeFileSync(join(AGENT, "themes", "agtheme.json"), JSON.stringify({ ...piTheme, name: "agtheme" }) + "\n");
writeFileSync(join(CFGCWD, ".pi", "themes", "pjtheme.json"), JSON.stringify({ ...piTheme, name: "pjtheme" }) + "\n");
writeFileSync(join(CFGCWD, ".pi", "SYSTEM.md"), "PROJECT_SYSTEM_MARKER\n");
writeFileSync(join(AGENT, "SYSTEM.md"), "AGENT_SYSTEM_MARKER\n");
writeFileSync(join(CFGCWD, ".pi", "APPEND_SYSTEM.md"), "PROJECT_APPEND_SYSTEM_MARKER\n");
writeFileSync(join(AGENT, "APPEND_SYSTEM.md"), "AGENT_APPEND_SYSTEM_MARKER\n");
writeFileSync(join(CFGCWD, ".pi", "settings.json"), JSON.stringify({ defaultThinkingLevel: "high" }) + "\n");
writeFileSync(join(AGENT, "settings.json"), JSON.stringify({ defaultThinkingLevel: "low" }) + "\n");
writeFileSync(join(CFGCWD, ".pi", "mcp.json"), JSON.stringify({ mcpServers: { projectserver: { command: "PROJECT_MCP_MARKER" } } }) + "\n");
writeFileSync(join(AGENT, "mcp.json"), JSON.stringify({ mcpServers: { fixtureserver: { command: "AGENT_MCP_MARKER" } } }) + "\n");
writeFileSync(join(AGENT, "keybindings.json"), JSON.stringify({ entries: [{ keybinding: "ctrl+q", id: "app.exit" }] }) + "\n");
writeFileSync(join(AGENT, "models.json"), JSON.stringify({ providers: {
 fxnode: { baseUrl: "https://fixture.invalid/v1", api: "openai-completions", models: [{ id: "fx-model", name: "Fixture model", contextWindow: 4096 }] },
 fxkeyed: { baseUrl: "https://fixture.invalid/v2", api: "openai-completions", apiKey: "INLINE_ONLY_MARKER", models: [{ id: "fx-model-2", name: "Fixture model two" }] },
 fxboth: { baseUrl: "https://fixture.invalid/v3", api: "openai-completions", apiKey: "INLINE_BOTH_MARKER", models: [{ id: "fx-model-3", name: "Fixture model three" }] },
} }) + "\n");
writeFileSync(join(AGENT, "auth.json"), JSON.stringify({
 fxnode: { type: "api_key", key: "STORED_NODE_MARKER" },
 fxboth: { type: "api_key", key: "STORED_BOTH_MARKER" },
}) + "\n");
writeFileSync(join(AGENT, "AGENTS.override.md"), "The fixture agent directory overrides the project instructions.\n");
writeFileSync(join(CFGCWD, "AGENTS.md"), "The fixture project instructions.\n");

const res = await loadPiResources(CFGCWD, AGENT, {});
const settings = piSettings({ cwd: CFGCWD, agentDir: AGENT });
record((res?.skills ?? []).map((skill) => skill.name).sort().join(",") === "ag-only,pj-only"
 && (res?.prompts ?? []).map((prompt) => prompt.name).sort().join(",") === "a-only,p-only"
 && (res?.themes ?? []).map((theme) => theme.name).sort().join(",") === "agtheme,pjtheme",
 "pi's own resource loader reads skills, prompt templates and themes from BOTH the fixture agent dir and the fixture .pi",
 `skills=${(res?.skills ?? []).map((skill) => skill.name).join(",")} prompts=${(res?.prompts ?? []).map((prompt) => prompt.name).join(",")} themes=${(res?.themes ?? []).map((theme) => theme.name).join(",")}`);
const skill0 = (res?.skills ?? [])[0] ?? {};
const prompt0 = (res?.prompts ?? [])[0] ?? {};
const theme0 = (res?.themes ?? [])[0] ?? {};
record(String(skill0.filePath ?? "").startsWith(CFGROOT) && String(prompt0.filePath ?? "").startsWith(CFGROOT) && String(theme0.sourcePath ?? "").startsWith(CFGROOT),
 "pi's records name the FILE they came from (skills/prompts carry `filePath`, themes carry `sourcePath`) - the fixture path, not a guess",
 `skill=${skill0.filePath} prompt=${prompt0.filePath} theme=${theme0.sourcePath}`);
record((res?.systemPrompt ?? "") === "PROJECT_SYSTEM_MARKER\n" && (res?.appendSystemPrompt ?? []).join("") === "PROJECT_APPEND_SYSTEM_MARKER\n",
 "pi's loader DOES carry pi's SYSTEM.md and APPEND_SYSTEM.md (the project level wins), so the loader is not the refusal",
 `system=${JSON.stringify(res?.systemPrompt)} append=${JSON.stringify(res?.appendSystemPrompt)} agentLevel=${JSON.stringify(res?.agentDir === AGENT)}`);
const agentRecord = agentConfig(settings.settings, { cwd: CFGCWD }).agent;
record(!Object.keys(agentRecord).includes("instructions"),
 "but pi's SYSTEM.md/APPEND_SYSTEM.md never reach this run's agent record: src/cli-intent.mjs takes `instructions` only from pi's --system-prompt words",
 `keys=${Object.keys(agentRecord).join(",")}`);
const contextFiles = loadContextFiles(CFGCWD, AGENT);
record(contextFiles.some((file) => String(file.path ?? file).endsWith("AGENTS.override.md")) && contextFiles.some((file) => String(file.path ?? file) === join(CFGCWD, "AGENTS.md")),
 "pi's OWN context-file discovery reads the fixture agent dir's AGENTS.override.md and the fixture cwd's AGENTS.md (honoured)",
 `files=${contextFiles.map((file) => file.path ?? file).join(",")}`);
record(settings.settings?.defaultThinkingLevel === "high" && settings.global?.defaultThinkingLevel === "low" && settings.project?.defaultThinkingLevel === "high",
 "pi's SettingsManager reads BOTH settings.json files and pi's own merge makes the PROJECT value effective (no merge typed here)",
 `effective=${settings.settings?.defaultThinkingLevel} global=${settings.global?.defaultThinkingLevel} project=${settings.project?.defaultThinkingLevel} errors=${settings.errors.length}`);
const providers = machineProviderConfigs(AGENT);
record(providers.length === 3 && providers.every((row) => row.id === "fxnode" || row.id === "fxkeyed" || row.id === "fxboth")
 && providers.find((row) => row.id === "fxboth")?.credential === "stored credential"
 && providers.find((row) => row.id === "fxboth")?.config?.apiKey === "STORED_BOTH_MARKER",
 "pi's credential precedence, measured: an agent that has BOTH an inline models.json key AND an auth-file key answers pi's `stored credential` (the auth key wins)",
 `rows=${providers.map((row) => `${row.id}=${row.credential}`).join(",")}`);
record(providers.find((row) => row.id === "fxkeyed")?.credential === "models_json_key" && providers.find((row) => row.id === "fxkeyed")?.config?.apiKey === "INLINE_ONLY_MARKER",
 "the fallback pi names is `models_json_key`, only when pi's auth file answers no key for that provider",
 `fxkeyed=${providers.find((row) => row.id === "fxkeyed")?.credential}`);
const cfgDock = piDockOf(mkui(), {});
record(Object.keys(cfgDock.keybindings.getUserBindings()).length === 0 && !Object.keys(cfgDock.keybindings.getResolvedBindings()).some((id) => cfgDock.keybindings.matches("\u0011", id)),
 "pi's <agent-dir>/keybindings.json changes NOTHING here: pi's user bindings stay empty and pi's ctrl+q (the fixture key) answers no action",
 `userBindings=${JSON.stringify(cfgDock.keybindings.getUserBindings())} ctrlq=${JSON.stringify(Object.keys(cfgDock.keybindings.getResolvedBindings()).filter((id) => cfgDock.keybindings.matches("\u0011", id)))}`);
const cfgBlob = JSON.stringify(res ?? {});
record(!cfgBlob.includes("PROJECT_MCP_MARKER") && !cfgBlob.includes("AGENT_MCP_MARKER")
 && !Object.keys(cfgDock.keybindings.getUserBindings()).length,
 "pi's mcp.json files reach nothing either: no marker appears in pi's resource answer, and this harness has no MCP plane to receive one",
 `markers=none resourceKeys=${Object.keys(res ?? {}).join(",")}`);

const failed = checks.filter((check) => !check.ok);
console.log(`keybindings: ${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) {
 for (const check of failed) console.log(`  FAILED ${check.label}`);
 process.exitCode = 1;
}
