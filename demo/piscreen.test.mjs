// demo/piscreen.test.mjs - pi's OWN chat viewport, headless: pi's components, pi's layout, pi's palette,
//
// PROVENANCE: no Durian-Pi original - Durian-Pi's TUI (~/Git/Durian-Pi/src/tui/client.mjs) drew its
// own rows and never used pi's components, so there is nothing there to extract. Symbols VERIFIED AGAINST
// PINED packages, read on this machine at pin v1.5.1: pi-coding-agent's exported components
// (UserMessageComponent, AssistantMessageComponent, ToolExecutionComponent.updateArgs/updateResult,
// CompactionSummaryMessageComponent, SkillInvocationMessageComponent, CustomMessageComponent, FooterComponent),
// pi-coding-agent's `theme` slot (Symbol.for("@earendil-works/pi-coding-agent:theme")), pi-tui's
// `Terminal` interface, `TuiAltScreen.setLayoutRoot`, `ScrollView`, `VStack`, and pi-durable's
// `LiveState`/`entries` reads. Dropped/omitted from pi's own interactive layer here: pi's `InteractiveMode`
// class and `AgentSessionRuntime` (this screen has no pi session to drive); pi's `createChatViewport`
// factory is not exported at this pin so its shape is re-derived from pi-tui's primitives; pi's
// built-in logo header text, `getEditorTheme`, the theme-selection dialog, and pi's extension UI dialogs
// are not drivable here - each is named in the capability matrix instead of silently dropped.
// fed from pi-durable's committed state and nothing else.
//
// WHAT IS ACTUALLY PROVED, and why a weaker claim would be a lie:
//  * The checks run against the PAINTED bytes of pi-tui's own fullscreen screen, not against returned
//    objects. pi-tui's `Terminal` is a PUBLIC interface (dist/terminal.d.ts), so a byte-capturing
//    implementation of it lets pi's screens paint without a TTY. A row that is not in those bytes was
//    not drawn. pi mounts its chat viewport with `setLayoutRoot` (interactive-mode.js), which is what
//    makes pi's row allocation run against the terminal height - `addChild` would only hang the whole
//    document off pi's implicit ScrollView, and the checks below would then be the only "proof" of a
//    layout that never clipped anything.
//  * The screen is painted TWICE: once tall enough to show all of it (so pi's own labels, markdown and
//    borders can be asserted), once short enough to force pi's ScrollView to follow the END (so the
//    clipping claim is about pi's scroll behaviour and not about this harness printing fewer rows).
//  * pi's footer numbers are compared against pi-durable's OWN usage plane read back off disk through
//    src/readapi.mjs (pi-durable's read API, no SQL). Two fixtures are used because the two reads mean
//    different things, and both are named: pi-durable's ledger also counts the summarization attempt
//    (dist/harness/usage.d.ts: "Assistant entries and summarization attempts"), which pi's footer cannot
//    see because pi sums the committed entries' `usage` fields. So the EXACT equality check runs on the
//    store with no compaction, and the compaction store is checked against the committed entries' usage
//    plus the documented ledger relationship.
//
// Offline: pi's settings/skills/themes come from pi's own loader over a fixture cwd; the only model turn
// is pi-ai's faux provider; no key is read and no network is reached.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { tmpdir } from "node:os";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { CURRENT_SESSION_VERSION } from "@earendil-works/pi-coding-agent";
import { calculateContextTokens, getMarkdownTheme } from "@earendil-works/pi-coding-agent";

import { agentPlane } from "../src/agentplane.mjs";
import { openHarness, prompt, scriptTurn, transcript } from "../src/core.mjs";
import { expandInput } from "../src/promptplane.mjs";
import { piSettings } from "../src/settings.mjs";
import { openStore, usage as readUsage } from "../src/readapi.mjs";
import { createSyncState, snapshotSync, openWatch } from "../src/tui/sync.mjs";
import { headerRow, transcriptRows } from "../src/tui/rows.mjs";
import { entryText, installPiTheme, installPiThemeByName, piContextOf, piEditorDock, piFooterOf, piGitBranchOf, piHeaderOf, piLiveRows, piMarkdownTheme, piModelOf, piScreen, piSessionEntriesOf, piStatusRows, piTranscriptDocument } from "../src/tui/piscreen.mjs";
import { Container, TuiAltScreen } from "@earendil-works/pi-tui";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";

const checks = [];
function record(condition, claim, evidence = "") {
 checks.push({ condition, claim });
 console.log(`  ${condition ? "ok " : "NOT"} ${claim}${evidence ? `: ${evidence}` : ""}`);
}

// pi-tui's public `Terminal` interface, captured rather than sent to a TTY.
function captureTerminal(columns, rows, sink) {
 const terminal = {
  start: (onInput, onResize) => {},
  stop: () => {},
  write: (data) => { sink.push(data); },
  moveBy: (lines) => {},
  hideCursor: () => {},
  showCursor: () => {},
  clearLine: () => {},
  clearFromCursor: () => {},
  clearScreen: () => {},
  setTitle: (title) => {},
  setProgress: (active) => {},
  drainInput: async () => {},
 };
 Object.defineProperty(terminal, "columns", { get: () => columns });
 Object.defineProperty(terminal, "rows", { get: () => rows });
 Object.defineProperty(terminal, "kittyProtocolActive", { get: () => false });
 return terminal;
}

// pi-tui's fullscreen frame positions each row with a cursor move, so the row boundaries in the bytes
// are those sequences, not newlines.
function splitPaintedRows(raw) {
 return raw.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "\n").split("\n").map((row) => stripTerminalSequences(row).trim()).filter((row) => row);
}

async function main() {
 const root = mkdtempSync(join(tmpdir(), "dh-piscreen-"));
 const cwd = join(root, "cwd");
 mkdirSync(join(cwd, ".pi", "skills", "note-skill"), { recursive: true });
 // pi's project settings turn compaction ON for THIS fixture, so a pi.compaction entry exists to render;
 // the user's own workspace says the opposite, and that read is asserted separately below.
 writeFileSync(join(cwd, ".pi", "settings.json"), JSON.stringify({ compaction: { enabled: true, reserveTokens: 1, keepRecentTokens: 1 } }) + "\n");
 // pi's footer appends ` (${branch})` from its own getGitBranch() probe, whose shipped reader in this
 // harness is piGitBranchOf() over the RUN CWD's `.git/HEAD`. The fixture cwd is a temp dir, so it gets
 // its own `.git/HEAD`: the assertion below then runs through the shipped reader rather than a string the
 // test handed to pi's footer.
 mkdirSync(join(cwd, ".git"), { recursive: true });
 writeFileSync(join(cwd, ".git", "HEAD"), "ref: refs/heads/fixture-branch\n");
 writeFileSync(join(cwd, ".pi", "skills", "note-skill", "SKILL.md"), "---\nname: note-skill\ndescription: leave a note\n---\nSay NOTES when asked.\n");

 // 1) pi's palette: pi's components read pi's theme from pi's global slots, so install first.
 const plane = await agentPlane({ cwd, offline: true });
 const themeRecord = (plane.resources?.themes ?? []).find((row) => row?.name === plane.themeName);
 const installed = themeRecord ? installPiTheme(themeRecord) : installPiThemeByName(plane.themeName);
 record(!!installed && (!themeRecord || installed?.name === plane.themeName),
  "pi's discovered theme record installs pi's palette under pi's own theme name",
  `theme=${plane.themeName} installed=${installed?.name} via=${themeRecord ? "discovered record" : "initTheme"}`);
 record(installed === globalThis[Symbol.for("@earendil-works/pi-coding-agent:theme")],
  "the install reaches pi's own theme slot (theme/theme.js THEME_KEY, which pi's components read)",
  `slot identity=${installed === globalThis[Symbol.for("@earendil-works/pi-coding-agent:theme")]}`);
 record(themeRecord ? installed?.sourcePath === themeRecord.sourcePath : true,
  "the installed palette names pi's own theme file, not a palette this harness made up",
  `sourcePath=${installed?.sourcePath}`);
 const paletteTokens = ["accent", "userMessageText", "customMessageLabel"];
 const paletteAgreement = paletteTokens.map((token) => {
  const recordColor = themeRecord?.concreteColors?.[token] ?? null;
  const installedColor = installed?.concreteColors?.[token] ?? null;
  return { token, recordColor, installedColor, same: !!recordColor && !!installedColor
   && recordColor.r === installedColor.r && recordColor.g === installedColor.g && recordColor.b === installedColor.b };
 });
 record(paletteAgreement.every((row) => row.same),
  "the installed palette resolves pi's discovered-record colours identically for the tokens pi's components paint",
  JSON.stringify(paletteAgreement));
 const themeEscapes = paletteTokens.map((token) => {
  const escape = installed?.fg?.(token, "Q") ?? "";
  return { token, escape, open: escape.split("Q")[0] };
});
 record(themeEscapes.every((row) => /\u001b\[[0-9;]*m/.test(row.open)),
  "each installed colour is a real SGR sequence pi produced, not a plain string",
  JSON.stringify(themeEscapes.map((row) => row.escape)));

 const markdownTheme = piMarkdownTheme();

 // 2) a session holding every entry kind the screen must render.
 const storePath = join(root, "screen.sqlite");
 const parts = await openHarness({
  cwd, storePath, settings: plane.settings, models: plane.models, faux: plane.modelFaux,
  agent: plane.agent, extraExtensions: plane.durableExtensions,
 });
 const conversation = parts.conversation;
 const context = parts.context;

 const skillInput = expandInput("/skill:note-skill now", { skills: plane.resources.skills, templates: plane.resources?.prompts ?? [], commands: plane.registrations?.commands ?? [] });
 await prompt(conversation, skillInput.text, context);
 scriptTurn(parts.faux, [{ tool: "read", args: { path: "notes.md" } }, "the notes were read"]);
 const oldestMarker = "read the OLDEST marker that has to scroll out";
 await prompt(conversation, oldestMarker, context);
 scriptTurn(parts.faux, ["first grown answer", "second grown answer", "third grown answer", "fourth grown answer"]);
 await prompt(conversation, "grow one more line of transcript so the viewport has to scroll", context);
 await prompt(conversation, "grow a second line of transcript so the viewport has to scroll", context);
 // pi-durable selects a cut by walking back until `keepRecentTokens` are kept, and returns complete()
 // when selectCut finds none, so the conversation's own settings are what make a summary exist at all.
 await conversation.configure({ compaction: { enabled: true, reserveTokens: 1, keepRecentTokens: 0 } }, context);
 const compactTask = await conversation.compact("keep the durable facts", context);
 await parts.harness.waitForTask(compactTask, context);
 // The plain turns come AFTER the compaction so the newest committed rows are text pi prints verbatim;
 // pi-durable's compaction entry is the newest entry otherwise, and pi renders it as its own summary box.
 const newestMarker = "the FINAL plain marker row";
 await prompt(conversation, newestMarker, context);
 scriptTurn(parts.faux, ["the FINAL plain answer row"]);

 const entries = await transcript(conversation, context, 200);
 const kinds = entries.map((entry) => entry.kind);
 console.log("READ ORDER:", JSON.stringify(entries.map((entry) => ({ kind: entry.kind, id: entry?.id, head: entry?.head }))));
 record(kinds.includes("pi.user") && kinds.includes("pi.assistant") && kinds.includes("pi.tool-result") && kinds.includes("pi.compaction"),
  "the store holds user, assistant, tool-result and compaction entries for pi's components to render",
  `kinds=${JSON.stringify(kinds)}`);

 // 3a) the tall pass: everything fits, so pi's own words and borders can be asserted.
 // pi's footer BEFORE the paint: pi's FooterComponent totals pi's OWN entry shapes, so pi-durable's
 // committed entries travel through the shipped piSessionEntriesOf() (pi's `{type:"message"}` rows
// carrying pi-durable's own `usage` records, oldest-first like pi's session file), and the branch comes
// from the shipped piGitBranchOf() over this fixture cwd's `.git/HEAD`.
 const WIDTH = 72;
 const TALL = 64;
 const modelOfFooter = piModelOf(plane);
 const contextUsage = piContextOf(entries, plane.models, modelOfFooter);
 const tallFooter = footerFor({ entries, plane, conversationId: conversation.id, cwd, model: modelOfFooter });
 const tallFooterText = (tallFooter.render(WIDTH) ?? []).map((line) => stripTerminalSequences(line)).join("\n");
 const tallSink = [];
 const tallUi = new TuiAltScreen(captureTerminal(WIDTH, TALL, tallSink), false, undefined);
 tallUi.start();
 const tall = await paintPiScreen({ entries, ui: tallUi, sink: tallSink, cwd, markdownTheme, footer: tallFooter });
 const shortSink = [];
 const shortUi = new TuiAltScreen(captureTerminal(WIDTH, 12, shortSink), false, undefined);
 shortUi.start();
 const short = await paintPiScreen({ entries, ui: shortUi, sink: shortSink, cwd, markdownTheme, footer: tallFooter });
 const tallRows = splitPaintedRows(tall.paintedRaw);
const tallPainted = stripTerminalSequences(tall.paintedRaw);
const shortPainted = stripTerminalSequences(short.paintedRaw);
const shortRows = splitPaintedRows(short.paintedRaw);

 record(tallRows.length > 0, "pi-tui's fullscreen screen painted into the captured terminal", `writes=${tallSink.length} rows=${tallRows.length}`);
 record(shortRows.length > 0 && shortRows.length <= 12,
  "the SAME screen painted into a 12-row terminal draws at most 12 rows, i.e. pi's viewport clips",
  `rows=${shortRows.length} terminal rows=12`);

 record(Object.keys(tall.classOf).length >= 5,
  "the transcript is built from pi's components, one per committed entry kind",
  `components=${JSON.stringify(tall.classOf)}`);
 record(["UserMessageComponent", "AssistantMessageComponent", "ToolExecutionComponent", "CompactionSummaryMessageComponent", "SkillInvocationMessageComponent"].every((name) => tall.classOf[name] > 0),
  "pi's user, assistant, tool-execution, compaction-summary and skill-invocation components all got built and mounted",
  `classOf=${JSON.stringify(tall.classOf)}`);
 record(tall.screen.transcript.constructor?.name === "ScrollView" && tall.screen.root.constructor?.name === "VStack",
  "the layout is pi-tui's ScrollView + VStack, i.e. pi's createChatViewport shape re-derived at this pin",
  `transcript=${tall.screen.transcript.constructor?.name} root=${tall.screen.root.constructor?.name}`);
 record(short.transcript.followEnd && short.transcript.viewportHeight <= 12,
  "pi's ScrollView follows the END of the transcript and reports the terminal's viewport height",
  `followEnd=${short.transcript.followEnd} viewportHeight=${short.transcript.viewportHeight} scrollTop=${shortUi.viewportTop}`);
 record(tall.spacers >= 1 && short.spacers >= 1,
  "pi separates its chat rows with pi-tui's Spacer (a row before each compaction box, and before a user row once the chat has rows), so the transcript has blank rows between entries",
  `spacers=${JSON.stringify({ tall: tall.spacers, short: short.spacers})}`);
 record(tallRows.some((row) => row.includes("(fixture-branch)")) && tallPainted.includes("(fixture-branch)"),
  "the PAINTED footer carries pi's pwd + branch line, with the branch piGitBranchOf() read off this cwd's .git/HEAD (pi appends ` (${branch})`)",
  `branchRow=${JSON.stringify((tallRows.filter((row) => row.includes("(fixture-branch)"))[0] ?? "").slice(0, 90))}`);
 record(shortRows.some((row) => row.includes("(fixture-branch)")),
  "the footer survives the CLIPPED 12-row paint as well, so pi's dock keeps the footer row while the transcript scrolls",
  `rows=${shortRows.length}`);

 record(tallPainted.includes("[compaction]") && tallPainted.includes("Compacted from"),
  "pi's CompactionSummaryMessageComponent label and header are in the painted frame");
 record(tallPainted.includes("[skill]"),
  "pi's SkillInvocationMessageComponent label is in the painted frame");
 record(/\u2500{8,}/.test(tall.paintedRaw),
  "pi's bordered boxes (Box/DynamicBorder rules) are drawn, not flat text rows");
 for (const row of themeEscapes) {
  record(row.open && tall.paintedRaw.includes(row.open),
   `pi's installed colour for ${row.token} reaches the painted frame`,
   `open SGR=${JSON.stringify(row.open)}`);
 }

 // 3b) the live pass: pi's rows for what pi-durable says is IN FLIGHT, painted while the tool runs.
 // The fixture's own marker text, echoed by a real tool round so the SAME string is what the store
 // commits and what pi's component must paint once that entry exists.
 const notesText = "the live notes body pi must paint";
 writeFileSync(join(cwd, "notes.md"), notesText + "\n");
 // The marker text is NOT in the command, so a live frame can only show the tool's call line, never the
 // committed body: the body appears once pi-durable commits the result entry.
 scriptTurn(parts.faux, [{ tool: "bash", args: { command: "sleep 2; cat notes.md" } }, "the live answer row"]);
 const liveSubmission = await conversation.submit({ type: "input", content: "read the notes while a tool runs", requestId: "piscreen-live-1" }, context);
 const liveSync = createSyncState(conversation.id);
 const liveWatch = await openWatch({ harness: parts.harness, storePath }, conversation.id, { state: liveSync, context });
 let liveSnap = null;
 for (let attempt = 0; attempt < 40 && liveSnap === null; attempt += 1) {
  const snap = snapshotSync(liveSync, { conversationId: conversation.id });
  if (snap.live && (snap.live.tools ?? []).some((slot) => slot?.status === "running")) liveSnap = snap;
  else await new Promise((sleep) => setTimeout(sleep, 50));
 }
 record(liveSnap !== null && (liveSnap?.live?.tools ?? []).length > 0,
  "pi-durable's LiveState was captured WHILE a tool slot was RUNNING (its own live doc, not a spinner)",
  `tools=${JSON.stringify((liveSnap?.live?.tools ?? []).map((slot) => ({ name: slot?.name, status: slot?.status, output: slot?.output === undefined ? null : "present" })))}`);
 const livePaintEntries = await transcript(conversation, context, 200);
 const liveSink = [];
 const liveUi = new TuiAltScreen(captureTerminal(WIDTH, 16, liveSink), false, undefined);
 liveUi.start();
 const livePending = {};
 const liveBuilt = piTranscriptDocument({ entries: livePaintEntries, ui: liveUi, cwd, markdownTheme, pendingTools: livePending });
 const liveDoc = liveBuilt.document;
 for (const component of piLiveRows({ live: liveSnap?.live, pendingTools: livePending, ui: liveUi, cwd })) liveDoc.addChild(component);
 const liveStatus = new Container();
 for (const row of piStatusRows(liveSnap?.live)) liveStatus.addChild(row);
 const liveScreen = piScreen({ document: liveDoc, editor: piEditorDock(liveUi), status: liveStatus, footer: footerFor({ entries: livePaintEntries, plane, conversationId: conversation.id, cwd, model: modelOfFooter }), scrollbar: "auto" });
 liveUi.setLayoutRoot(liveScreen.root);
 liveUi.invalidate();
 liveUi.requestRender();
 await new Promise((done) => setTimeout(done, 200));
 const livePainted = stripTerminalSequences(liveSink.join(""));
 const liveRows = splitPaintedRows(liveSink.join(""));
 const inFlight = (liveSnap?.live?.tools ?? []).map((slot) => slot?.name);
 record(inFlight.length > 0 && inFlight.every((name) => livePainted.includes(name)),
  "an in-flight tool call from pi-durable's LiveState is drawn by pi's ToolExecutionComponent, not by a harness row",
  `names=${JSON.stringify(inFlight)} rows=${liveRows.length}`);
 const liveStatusLabel = (piStatusRows(liveSnap?.live)[0]?.render(WIDTH) ?? [""])[0]
  .replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "").trim();
 record(liveStatusLabel && livePainted.includes(liveStatusLabel),
  "pi's status row for the live frame is the row pi-durable's LiveState produced, painted by pi-tui",
  `statusRow=${JSON.stringify(liveStatusLabel)} liveFields=${JSON.stringify({ run: !!liveSnap?.live?.run, tools: (liveSnap?.live?.tools ?? []).length })}`);
 await liveWatch.stop();
 await liveSubmission.wait(context);

 const flatMarkers = [headerRow("flat"), ...transcriptRows([{ kind: "earlier" }])].map((row) => stripTerminalSequences(row).trim());
 record(flatMarkers.every((marker) => !tallPainted.includes(marker)) && flatMarkers.every((marker) => !shortPainted.includes(marker)),
  "the row-based view's own words (its header and its earlier-window row) are absent from the pi screen",
  `markers=${JSON.stringify(flatMarkers)}`);

 // pi-durable's `entries` read returns NEWEST first, and pi's ScrollView follows the end of the document,
 // so the last line of the newest entry is the last row pi can draw above its dock.
 // The marker words are the fixture's own, handed to the session and asserted against the paint, so neither
 // side of the check is a remembered string. The newest marker is a plain USER turn, because pi re-renders
 // a compaction entry with its own header and a faux answer can be an error row, neither of which prints
 // the committed text verbatim.
 const oldestText = entryText(entries.at(-1));
 const hiddenOlder = entries.map((entry) => entryText(entry)).filter((text) => text.length > 10 && !shortPainted.includes(text));
 record(shortPainted.includes(newestMarker) && oldestText.length > 10 && !shortPainted.includes(oldestText) && hiddenOlder.length > 0,
  "pi's ScrollView follows the END of the transcript: the newest committed text is painted, older committed text is not",
  `rows=${shortRows.length} hidden=${hiddenOlder.length} oldest=${JSON.stringify(oldestText.slice(0, 30))} scrollTop=${shortUi.viewportTop} followEnd=${short.transcript.followEnd}`);

 // 4) pi's footer, in pi's shape, with pi-durable's numbers. The component the paint above used is the
 // one asserted against here, so the word-level checks and the painted rows are the same footer.
 const committedUsage = sumEntryUsage(entries);
 const footerComponent = tallFooter;
 const footerText = tallFooterText;
 const viewer = await openStore(storePath);
 const ledger = await readUsage(viewer);
 const ledgerTotals = sumLedger(ledger);
 const settledEntries = await transcript(conversation, context, 200);
 const settledBuilt = piTranscriptDocument({ entries: settledEntries, ui: tallUi, cwd, markdownTheme, pendingTools: {} });
 const settledSink = [];
 const settledUi = new TuiAltScreen(captureTerminal(WIDTH, TALL, settledSink), false, undefined);
 settledUi.start();
 const settledScreen = piScreen({ document: settledBuilt.document, editor: piEditorDock(settledUi), status: new Container(), footer: footerFor({ entries: settledEntries, plane, conversationId: conversation.id, cwd, model: modelOfFooter }), scrollbar: "auto" });
 settledUi.setLayoutRoot(settledScreen.root);
 settledUi.invalidate();
 settledUi.requestRender();
 await new Promise((done) => setTimeout(done, 200));
 const settledPainted = stripTerminalSequences(settledSink.join(""));
 record(settledPainted.includes(notesText) && settledPainted.includes("the live answer row"),
  "once the run settles, pi's ToolExecutionComponent box shows pi-durable's committed tool output (its updateResult path), and pi's answer row is painted",
  `notes=${settledPainted.includes(notesText)} answer=${settledPainted.includes("the live answer row")}`);
 const runningSlots = (liveSnap?.live?.tools ?? []).filter((slot) => slot?.status === "running");
 const slotOutputSeen = runningSlots.filter((slot) => typeof slot?.output === "string").length;
 record(runningSlots.length > 0 && !livePainted.includes(notesText) && settledPainted.includes(notesText) && settledPainted.includes("the live answer row"),
  "a RUNNING tool slot from pi-durable's LiveState reaches pi's OWN ToolExecutionComponent box, and the committed body only appears once pi-durable commits the result entry",
  `running=${JSON.stringify(runningSlots.map((slot) => ({ name: slot.name, status: slot.status, output: typeof slot?.output === "string" })))} live=${livePainted.includes(notesText)} settled=${settledPainted.includes(notesText)}`);
 record(piTranscriptDocument({ entries: settledEntries, ui: settledUi, cwd, markdownTheme, pendingTools: {} }).classOf["ToolExecutionComponent"] >= 1,
  "the settled pass still builds pi's ToolExecutionComponent for the committed call",
  `components=${JSON.stringify(piTranscriptDocument({ entries: settledEntries, ui: settledUi, cwd, markdownTheme, pendingTools: {} }).classOf)}`);
 record(!!ledger && Object.keys(ledger?.models ?? {}).length > 0,
  "the usage plane read back off disk is pi-durable's, keyed by the model that answered",
  `buckets=${JSON.stringify(Object.keys(ledger?.models ?? {}))}`);
 const tokenFields = [["input", "\u2191"], ["output", "\u2193"], ["cacheRead", "R"], ["cacheWrite", "W"]];
 const expectedParts = tokenFields.filter(([field,]) => committedUsage[field] !== 0).map(([field, marker]) => ({ field, marker, part: `${marker}${piTokenText(committedUsage[field])}` }));
 const skippedParts = tokenFields.filter(([field,]) => committedUsage[field] === 0).map(([, marker]) => marker);
 record(expectedParts.length > 0 && expectedParts.every((row) => footerText.includes(row.part)),
  "pi's footer prints pi-durable's committed entries' usage, formatted with pi's own token thresholds",
  `parts=${JSON.stringify(expectedParts.map((row) => row.part))}`);
 record(skippedParts.every((marker) => !footerText.includes(marker)),
  "pi's footer omits exactly the token parts pi-durable's committed entries report as zero (footer.js prints a part only when it is non-zero)",
  `omitted=${JSON.stringify(skippedParts)}`);
 record(ledgerTotals.input >= committedUsage.input && ledgerTotals.output >= committedUsage.output,
  "pi-durable's ledger is at least the committed entries' usage - it also counts the summarization attempt, which pi's footer cannot see",
  `ledger=${JSON.stringify(ledgerTotals)} committed=${JSON.stringify(committedUsage)}`);
 record(!footerText.includes("$") && ledgerTotals.cost === 0 && committedUsage.cost === 0,
  "pi prints no cost part because pi-durable's own cost total is zero for the faux plane (pi's footer prints `$${cost}` only when non-zero)",
  `cost ledger=${ledgerTotals.cost} committed=${committedUsage.cost}`);
 record(Object.keys(ledger?.models ?? {}).some((key) => key === `${modelOfFooter.provider}/${modelOfFooter.id}`),
  "the model pi's footer names is the key pi-durable filed its spend under",
  `key=${modelOfFooter.provider}/${modelOfFooter.id}`);
 record(footerText.includes(`${contextUsage.percent.toFixed(1)}%/${piTokenText(contextUsage.contextWindow)}`),
  "pi's footer shows the context percent and context window pi-durable's committed entries and pi's model record produced",
  `percent=${contextUsage.percent.toFixed(1)} window=${contextUsage.contextWindow} tokens=${contextUsage.tokens}`);
 record(footerText.includes(modelOfFooter.id),
  "pi's footer names the model pi-durable's conversation agent recorded",
  `model=${modelOfFooter.id} provider=${modelOfFooter.provider}`);
 const home = process.env.HOME ?? "";
 const expectedPwd = home && cwd.startsWith(home) ? `~${sep}${homeTail(cwd)}` : cwd;
 record(footerText.split("\n")[0].includes(expectedPwd),
  "pi's footer prints the cwd the way pi does (home replaced by ~), with pi's own formatCwdForFooter rule",
  `pwd part=${JSON.stringify(footerText.split("\n")[0] ?? "")}`);
 const offFooter = piFooterOf({
  entries: piSessionEntriesOf(entries), conversationId: conversation.id, leafId: null, entryCount: entries.length, cwd,
  model: modelOfFooter, providers: 1, contextUsage, thinkingLevel: plane.settings?.thinkingLevel ?? null,
  autoCompactEnabled: false, gitBranch: piGitBranchOf(cwd),
 });
 const offText = (offFooter.render(WIDTH) ?? []).map((line) => stripTerminalSequences(line)).join("\n");
 record(piGitBranchOf(cwd) === "fixture-branch" && offText.includes("(fixture-branch)") && tallPainted.includes("(fixture-branch)"),
  "pi's branch word comes from the shipped piGitBranchOf() over the run cwd's .git/HEAD, not from a value the test typed into pi's footer",
  `branch=${JSON.stringify(piGitBranchOf(cwd))} off=${offText.includes("(fixture-branch)")}`);
 record(!offText.includes("(auto)") && footerText.includes("(auto)"),
  "pi's '(auto)' marker follows pi's compaction setting: shown while it is ON, absent when the setting says OFF",
  `on=${footerText.includes("(auto)")} off=${offText.includes("(auto)")}`);
 const realSettings = await piSettings({ cwd: process.cwd() });
 record(realSettings.settings?.compaction?.enabled === false,
  "the REAL workspace says pi's compaction is off, so the real surface draws no '(auto)' marker",
  `cwd=${process.cwd()} compaction=${JSON.stringify(realSettings.settings?.compaction)}`);

 // 4b) the EXACT store read-back equality, on a session with no compaction at all: there pi's footer
 // numbers and pi-durable's own ledger have to agree to the unit, because nothing was summarized.
 const quietStore = join(root, "quiet.sqlite");
 const quiet = await openHarness({ cwd, storePath: quietStore, settings: plane.settings, models: plane.models, faux: plane.modelFaux, agent: plane.agent, extraExtensions: plane.durableExtensions });
 await prompt(quiet.conversation, "a question with no compaction", quiet.context);
 scriptTurn(quiet.faux, ["an answer with no compaction"]);
 await prompt(quiet.conversation, "another question with no compaction", quiet.context);
 scriptTurn(quiet.faux, ["another answer with no compaction"]);
 const quietEntries = await transcript(quiet.conversation, quiet.context, 50);
 const quietContextUsage = piContextOf(quietEntries, plane.models, modelOfFooter);
 const quietFooter = piFooterOf({
  entries: piSessionEntriesOf(quietEntries),
  conversationId: quiet.conversation.id, leafId: quietEntries.at(-1)?.id ?? null, entryCount: quietEntries.length,
  cwd, sessionName: null, model: modelOfFooter, providers: 1, contextUsage: quietContextUsage,
  thinkingLevel: plane.settings?.thinkingLevel ?? null, autoCompactEnabled: true, gitBranch: piGitBranchOf(cwd),
 });
 const quietFooterText = (quietFooter.render(WIDTH) ?? []).map((line) => stripTerminalSequences(line)).join("\n");
 const quietViewer = await openStore(quietStore);
const quietLedger = await readUsage(quietViewer);
const quietCommitted = sumEntryUsage(quietEntries);
const quietTotals = sumLedger(quietLedger);
record(quietCommitted.input === quietTotals.input && quietCommitted.output === quietTotals.output
 && quietCommitted.cacheRead === quietTotals.cacheRead && quietCommitted.cacheWrite === quietTotals.cacheWrite,
  "with no compaction, pi's footer numbers equal pi-durable's ledger read back off disk, to the unit",
  `pi sees=${JSON.stringify(quietCommitted)} store says=${JSON.stringify(quietTotals)}`);
 record(tokenFields.filter(([field,]) => quietTotals[field] !== 0).every(([field, marker]) => quietFooterText.includes(`${marker}${piTokenText(quietTotals[field])}`)),
  "pi's footer prints pi-durable's read-back numbers for the quiet session in pi's own format",
  `footer=${JSON.stringify(quietFooterText.split("\n"))}`);
 record(quietFooterText.includes("(fixture-branch)") && quietFooterText.includes(`${quietContextUsage.percent.toFixed(1)}%/${piTokenText(quietContextUsage.contextWindow)}`) && quietFooterText.includes("(auto)"),
  "the quiet session's footer names the branch, pi's context%/contextWindow pair over pi-durable's committed usage, and pi's (auto) marker because THIS fixture asked for auto-compaction",
  `percent=${quietContextUsage.percent.toFixed(1)} window=${quietContextUsage.contextWindow} branch=${JSON.stringify(piGitBranchOf(cwd))}`);

 // 5) pi's startup header pieces.
 const header = piHeaderOf({ version: CURRENT_SESSION_VERSION, modelLine: `${modelOfFooter.provider}/${modelOfFooter.id}`, resources: [`${plane.packages?.found?.length ?? 0} pi packages`] });
 const headerText = header.map((component) => (component.render(WIDTH) ?? []).map((line) => stripTerminalSequences(line)).join("\n")).join("\n");
 record(headerText.includes(`pi-durable harness ${CURRENT_SESSION_VERSION}`),
  "the header names pi's own version constant rather than a version typed here",
  `version=${CURRENT_SESSION_VERSION}`);
 record(headerText.includes("enter to send the draft") && headerText.includes("shift+enter"),
  "the header's key hints come from pi-tui's own keybinding names through pi's keyHint",
  `hints=${JSON.stringify(headerText.split("\n").filter((line) => line.includes("to ")).slice(0, 3))}`);

 await parts.harness.close(context);
 await quiet.harness.close(quiet.context);
 await viewer.harness.close(BACKGROUND_CONTEXT);
 await quietViewer.harness.close(BACKGROUND_CONTEXT);

 const failed = checks.filter((c) => !c.condition);
 console.log(`piscreen: ${checks.length - failed.length}/${checks.length} checks passed`);
 process.exitCode = failed.length ? 1 : 0;
}

/** One pass of pi's screen: pi's components over pi-durable's entries, inside pi's layout, painted,
 * WITH pi's footer row (the shipped path draws it, so the painted bytes have to carry it). */
async function paintPiScreen({ entries, ui, sink, cwd, markdownTheme, footer = null }) {
 const pendingTools = {};
 const built = piTranscriptDocument({ entries, ui, cwd, markdownTheme, pendingTools });
 const document = built.document;
 const classOf = built.classOf;
 const status = new Container();
 for (const row of piStatusRows(null)) status.addChild(row);
 const editor = piEditorDock(ui);
 const screen = piScreen({ document, editor, status, footer, scrollbar: "auto" });
 // pi mounts its chat viewport with setLayoutRoot (interactive-mode.js), not addChild: that is what makes
 // pi-tui's layout engine allocate rows against the terminal height.
 ui.setLayoutRoot(screen.root);
 ui.invalidate();
 ui.requestRender();
 await new Promise((done) => setTimeout(done, 200));
 return {
  paintedRaw: sink.join(""),
  classOf,
  spacers: built.spacers,
  document,
  screen,
  transcript: screen.transcript,
 };
}

/** pi's footer over pi-durable's committed entries, through the SHIPPED mapper and reader: pi's totals
 * come from pi's own entry shapes (piSessionEntriesOf), pi's context numbers from pi-ai's calculateContextTokens
 * over pi-durable's usage records against pi's ModelRecord window, and pi's branch word from piGitBranchOf()
 * over the run cwd. `autoCompactEnabled` defaults to what the fixture's own pi settings say. */
function footerFor({ entries, plane, conversationId, cwd, model, autoCompactEnabled = true }) {
 return piFooterOf({
  entries: piSessionEntriesOf(entries),
  conversationId,
  leafId: entries[0]?.id ?? null,
  entryCount: entries.length,
  cwd,
  sessionName: null,
  model,
  routedModel: null,
  providers: (plane.models?.getProviders?.() ?? []).length,
  contextUsage: piContextOf(entries, plane.models, model),
  thinkingLevel: plane.settings?.thinkingLevel ?? null,
  autoCompactEnabled,
  extensionStatuses: new Map(),
  isUsingSubscription: () => false,
  gitBranch: piGitBranchOf(cwd),
 });
}

function piTokenText(count) {
 // pi's footer thresholds (components/footer.js formatTokens), spelled out so the assertion compares
 // pi-durable's numbers against pi's RENDERED numbers rather than the other way round.
 if (count < 1000) return String(count);
 if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
 if (count < 1000000) return `${Math.round(count / 1000)}k`;
 if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
 return `${Math.round(count / 1000000)}M`;
}

/** The usage pi-durable's committed entries carry, summed with pi-ai's field names. */
function sumEntryUsage(entries) {
 const total = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
 for (const entry of entries) for (const message of Array.isArray(entry?.model) ? entry.model : []) {
  const usageRecord = message?.usage;
  if (!usageRecord) continue;
  for (const field of ["input", "output", "cacheRead", "cacheWrite"]) total[field] += Number(usageRecord[field] ?? 0);
  total.cost += Number(usageRecord?.cost?.total ?? 0);
 }
 return total;
}

/** pi-durable's own usage plane (dist/harness/usage.d.ts UsageState: models + tools buckets). */
function sumLedger(ledger) {
 const total = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
 for (const bucket of [...Object.values(ledger?.models ?? {}), ...Object.values(ledger?.tools ?? {})]) {
  for (const field of ["input", "output", "cacheRead", "cacheWrite"]) total[field] += Number(bucket?.[field] ?? 0);
  total.cost += Number(bucket?.cost?.total ?? 0);
 }
 return total;
}

/** pi's context numbers and pi's model answer come from the SHIPPED piContextOf()/piModelOf() in
 * src/tui/piscreen.mjs (imported above) - a fixture-local copy would prove the fixture, not the surface.
 * pi's OWN context-token arithmetic (calculateContextTokens, exported by pi-coding-agent) is what turns
 * a pi-ai Usage into context tokens, so nothing here re-derives what a context token is. */

function homeTail(cwd) {
 const home = process.env.HOME ?? "";
 return home && cwd.startsWith(home) ? cwd.slice(home.length + 1) : cwd;
}

main().catch((error) => {
 console.error(String(error?.message ?? error));
 process.exitCode = 1;
});
