// src/tui/piscreen.mjs - pi's OWN chat viewport, fed entirely by pi-durable's committed state.
//
// PROVENANCE: no Durian-Pi original - Durian-Pi's TUI (~/Git/Durian-Pi/src/tui/client.mjs) drew its
// own rows and never used pi's components, so there is nothing there to extract. What this file
// follows is the pinned package's own interactive layer, read on THIS machine at pin v1.5.1:
//   node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/chat-viewport.js  (createChatViewport)
//   node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/components/*.js   (message/tool/footer components)
//   node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js    (the theme slot pi's components read)
// plus pi's own docs (themes.md for a theme JSON's `vars`/`colors`, session-format.md for entry shapes).
//
// pi's `createChatViewport` is NOT root-exported at this pin (dist/index.d.ts re-exports the
// components and theme functions, not the viewport), so piScreen() re-derives pi's composition
// literally, quoting the two components pi builds there (one ScrollView + one dock VStack).
//
// What pi's interactive layer has that this harness CANNOT drive at this pin, and so does NOT
// pretend to (each is a row in src/packages/matrix.mjs, not a silent drop): pi's `BuiltInHeader`
// logo/onboarding text, pi's status indicators (`IdleStatus`, `WorkingStatusIndicator`, ...), pi's
// theme-selection dialog, pi's `getEditorTheme()` (the harness re-derives the same object from pi's
// exported `theme` proxy and `getSelectListTheme`), pi's ModelSelector/OAuth/Login dialogs, and
// pi's `AgentSessionRuntime` behind `InteractiveMode`.
//
// Pure: it builds pi components from values handed in (pi-durable's TranscriptItem/EntryRecord,
// LiveState, pi-durable's usage plane, pi's ModelRecord). It never opens storage and never mutates
// a conversation, so a headless demo can paint it without a TTY.

import { AssistantMessageComponent, CompactionSummaryMessageComponent, CustomMessageComponent, CustomEditor, FooterComponent, SkillInvocationMessageComponent, Theme, ToolExecutionComponent, UserMessageComponent, getMarkdownTheme, getSelectListTheme, initTheme, keyHint } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { Box, Container, KeybindingsManager, ScrollView, Spacer, TUI_KEYBINDINGS, Text, VStack } from "@earendil-works/pi-tui";
import { AssistantEntry, CompactionEntry, ResetEntry, SystemEntry, ToolResultEntry, UserEntry } from "@earendil-works/pi-durable";

/** The two global slots pi's theme proxy reads (theme/theme.js `THEME_KEY`, `THEME_KEY_OLD`), so
 * pi's components colour themselves from the palette this harness installs. */
const PI_THEME_KEYS = [Symbol.for("@earendil-works/pi-coding-agent:theme"), Symbol.for("@mariozechner/pi-coding-agent:theme")];

/** pi's `theme` proxy (theme/theme.js) is a getter over the same slot, and it is NOT root-exported
 * at this pin, so colours are read off the slot pi's own proxy reads. */
function piColour(token, text) {
 const installed = globalThis[PI_THEME_KEYS[0]];
 return installed?.fg?.(token, text) ?? text;
}

/** pi's theme JSON resolves `vars` before it colours a token (pi's docs/themes.md: a theme file may
 * define `vars` and let `colors` name them). pi's own resolver is internal at this pin, so the
 * substitution over pi's documented fields is spelled here; the VALUES always come from pi's file. */
function resolveThemeColor(value, vars) {
 let current = value;
 const trail = new Set();
 while (typeof current === "string" && current !== "" && !String(current).startsWith("#") && !/^ok[a-z]+\(/i.test(String(current))) {
  if (trail.has(current) || !(current in vars)) return "";
  trail.add(current);
  current = vars[current];
 }
 return current;
}

/** Install pi's discovered theme record (a package-provided theme JSON pi's resource loader found)
 * at pi's own global slots, so pi's components - not just the harness's rows - use pi's palette.
 * pi's `initTheme(name)` alone cannot reach a package theme at this pin (its `loadTheme` resolves
 * builtin/registered/dir themes, and registering package themes needs pi's unexported
 * `setRegisteredThemes`), which is why pi's own `Theme` class is built from pi's record instead. */
export function installPiTheme(record) {
 if (!record?.sourcePath) return null;
 const json = JSON.parse(readFileSync(record.sourcePath, "utf8"));
 const vars = json?.vars ?? {};
 const colors = Object.fromEntries(Object.entries(json?.colors ?? {}).map(([token, value]) => [token, resolveThemeColor(value, vars)]));
 const theme = new Theme(colors, {}, record?.mode ?? "truecolor", {
  name: json?.name ?? record?.name, sourcePath: record.sourcePath, appearance: record?.ownAppearance,
 });
 for (const key of PI_THEME_KEYS) globalThis[key] = theme;
 return theme;
}

/** pi's fallback path, kept for a theme pi's own loader can resolve (builtin or a themes dir). */
export function installPiThemeByName(name) {
 initTheme(name ?? undefined);
 return globalThis[PI_THEME_KEYS[0]];
}

/** The markdown palette pi's message components use, from pi's installed theme. */
export function piMarkdownTheme() {
 return getMarkdownTheme();
}

/** pi's editor palette (`getEditorTheme()` is not root-exported at this pin); the object is pi's own
 * two fields, built from pi's exported theme proxy and select-list palette. */
export function piEditorTheme() {
 return { borderColor: (text) => piColour("borderMuted", text), selectList: getSelectListTheme() };
}

/** pi's input dock: pi's `CustomEditor` with pi-tui's own keybindings, so pi draws the caret, the
 * bordered box, the history and the keybinding hints. */
export function piEditorDock(ui, { history = [] } = {}) {
 return new CustomEditor(ui, piEditorTheme(), new KeybindingsManager(TUI_KEYBINDINGS), { history });
}

/** One committed pi-durable entry as pi's own components, oldest-first inside the entry.
 * `pendingTools` is the call-ID bookkeeping the caller shares with the assistant pass, so a tool
 * result updates the ToolExecutionComponent that is already in the transcript (pi correlates by
 * toolCallId, which pi-ai's ToolResultMessage already carries). */
export function piEntryComponents(entry, { ui, cwd = null, markdownTheme = piMarkdownTheme(), pendingTools = {}, outputPad = 1 } = {}) {
 const components = [];
 const messages = Array.isArray(entry?.model) ? entry.model : [];
 const kind = entry?.kind;

 if (kind === SystemEntry.kind) return components; // pi's chat viewport shows no system-prompt row.

 for (const message of messages) {
  if (kind === UserEntry.kind) {
   const text = textOf(message);
   const skill = piSkillBlock(text);
   if (skill) {
    // pi renders a skill invocation as its own box, then the remaining user text.
    components.push(new SkillInvocationMessageComponent({ name: skill.name, content: skill.content }, markdownTheme, outputPad));
    components.push(new UserMessageComponent(text.replace(skill.block, "").trim(), markdownTheme, outputPad));
    continue;
   }
   components.push(new UserMessageComponent(text, markdownTheme, outputPad));
   continue;
  }

  if (kind === AssistantEntry.kind) {
   components.push(new AssistantMessageComponent(message, false, markdownTheme, undefined, outputPad));
   for (const block of message?.content ?? []) {
    if (block?.type !== "toolCall") continue;
    // pi's ToolExecutionComponent takes the call, not the entry; pi-durable's committed assistant
    // entry is the only source of the arguments the model asked for.
    const component = new ToolExecutionComponent(block.name, block.id, block.arguments ?? {}, { outputPad }, undefined, ui, cwd);
    pendingTools[block.id] = component;
    components.push(component);
   }
   continue;
  }

  if (kind === ToolResultEntry.kind) {
   const callId = message?.toolCallId;
   const component = callId ? pendingTools[callId] : null;
   if (component) {
    // pi's own update path: result content, pi-durable's `details`, pi-ai's error flag and timing.
    component.updateResult({ content: message?.content ?? [], details: entry?.data ?? {}, isError: message?.isError ?? false, durationMs: message?.durationMs });
    continue;
   }
   components.push(new CustomMessageComponent({ customType: "tool result", content: textOf(message) }, null, markdownTheme, outputPad));
   continue;
  }

  if (kind === CompactionEntry.kind) {
   components.push(new CompactionSummaryMessageComponent({
    // pi-durable's CompactionEntry stores `head` (the first kept entry) and `data.reason`; the
    // token figure pi's box prints is pi-ai's own context-token total of the newest assistant
    // entry the summary folded, which the caller hands in as `tokensBefore`.
    tokensBefore: entry?.tokensBefore ?? 0,
    summary: piSummaryText(textOf(message)),
   }, markdownTheme, outputPad));
   continue;
  }

  if (kind === ResetEntry.kind) {
   // pi has no component for pi-durable's context reset; pi's CUSTOM message box carries pi-durable's
   // own word for it rather than a harness-invented marker.
   components.push(new CustomMessageComponent({ customType: "context reset", content: textOf(message) || "a new context starts here" }, null, markdownTheme, outputPad));
   continue;
  }

  components.push(new CustomMessageComponent({ customType: entry?.kind ?? "entry", content: textOf(message) }, null, markdownTheme, outputPad));
 }
 return components;
}

/** pi's rows for what pi-durable says is IN FLIGHT (`LiveState`, dist/harness/live.d.ts): the throttled
 * partial answer (`live.generation.message`), one row per `live.tools` slot, and pi-durable's `status`
 * word per slot. Nothing is guessed: a slot whose component is already in the transcript (the assistant
 * entry published the call) gets pi's OWN update paths - `updateArgs` for the arguments a nested slot
 * carries (`NestedToolSlot.arguments`, dist/harness/live.d.ts) and `updateResult` with `isPartial = true`
 * for a running slot's retained `output`. A model-issued call's arguments live in its assistant entry,
 * so those rows are already drawn complete and get no invented partial args. */
export function piLiveRows({ live, pendingTools, ui, cwd = null, outputPad = 1, markdownTheme = piMarkdownTheme() }) {
 const components = [];
 const partial = live?.generation?.message ?? null;
 const partialText = partial ? textOf(partial) : "";
 if (partialText) {
  // pi's own dim streaming row: pi-durable's throttled partial, drawn with pi's theme token.
  components.push(new Text(`${piColour("dim", "thinking")}${partialText ? `: ${partialText}` : ""}`, 0, 0));
 }
 for (const slot of [...(live?.tools ?? []), ...(live?.nestedTools ?? [])]) {
  const callId = slot?.callId;
  let component = callId ? pendingTools[callId] : null;
  if (!component) {
   component = new ToolExecutionComponent(slot?.name ?? "tool", String(callId ?? ""), slot?.arguments ?? {}, { outputPad }, undefined, ui, cwd);
   if (callId) pendingTools[callId] = component;
   components.push(component);
  } else if (slot?.arguments !== undefined) {
   // pi's own in-place argument update, so pi redraws the call line rather than a harness row replacing it.
   component.updateArgs(slot.arguments);
  }
  if (slot?.status === "running" && typeof slot?.output === "string") {
   component.updateResult({ content: [{ type: "text", text: slot.output }], details: slot?.details ?? {}, isError: false }, true);
  }
 }
 return components;
}

/** pi's own summary wrapper: pi-durable stores the summary inside a fixed prefix/suffix (its
 * dist/harness/compaction.js SUMMARY_PREFIX/SUMMARY_SUFFIX). The inner text is recovered by the
 * wrapper pi's own format uses, so no wrapper string is copied out of pi's dist here. */
function piSummaryText(text) {
 const open = text.indexOf("<summary>");
 const close = text.lastIndexOf("</summary>");
 return open >= 0 && close > open ? text.slice(open + "<summary>".length, close).trim() : text.trim();
}

export function entryText(entry) {
 return (Array.isArray(entry?.model) ? entry.model : []).map((message) => textOf(message)).filter((text) => text).join("\n");
}

/** pi's skill block (pi's `<skill name="..." location="...">` form that pi's skill resources and
 * this harness's src/promptplane.mjs emit) as pi's SkillInvocationMessageComponent input. */
function piSkillBlock(text) {
 const match = /<skill name="([^"]+)"[^>]*>([\s\S]*?)<\/skill>/.exec(text);
 if (!match) return null;
 return { name: match[1], content: match[2].trim(), block: match[0] };
}

/** The text a pi-ai `Message` carries (its string content or its text blocks). */
function textOf(message) {
 const content = message?.content;
 if (typeof content === "string") return content;
 if (!Array.isArray(content)) return "";
 return content.filter((block) => block?.type === "text").map((block) => String(block.text ?? "")).join("\n");
}

/** pi's transcript document: pi's ScrollView follows the END of its document, so the rows must be
 * appended OLDEST first, while pi-durable's `entries` read returns NEWEST first (dist/entries.d.ts
 * pages are newest-first). One place owns that reversal so every surface gets the same order. */
export function piTranscriptDocument({ entries, ui, cwd = null, markdownTheme = piMarkdownTheme(), pendingTools = {}, outputPad = 1 }) {
 const document = new Container();
 const classOf = {};
 for (const entry of [...entries].reverse()) {
  for (const component of piEntryComponents(entry, { ui, cwd, markdownTheme, pendingTools, outputPad })) {
   const name = component.constructor?.name ?? "?";
   classOf[name] = (classOf[name] ?? 0) + 1;
   document.addChild(component);
  }
 }
 return { document, classOf };
}

/** pi's chat viewport: pi's `createChatViewport` (chat-viewport.js) re-derived at this pin. */
export function piScreen({ document, editor, status = null, footer = null, pendingMessages = null, scrollbar = "auto" }) {
 const transcript = new ScrollView(document, { follow: "end", primary: true, overscroll: "chain", ...(scrollbar ? { scrollbar } : {}) });
 const dock = new VStack([
  { component: pendingMessages ?? new Container(), shrink: 1, minSize: 0 },
  { component: status ?? new Container(), shrink: 1, minSize: 0 },
  { component: editor, shrink: 1, minSize: 3 },
  { component: footer ?? new Container(), shrink: 1, minSize: 0 },
 ]);
 return {
  transcript,
  root: new VStack([
   { component: transcript, basis: 0, grow: 1, shrink: 1, minSize: 1 },
   { component: dock, basis: "auto", grow: 0, shrink: 1, minSize: 1 },
  ]),
 };
}

/** pi's FooterComponent, driven by pi-durable's numbers instead of pi's AgentSession. pi's footer
 * reads exactly these fields (footer.js): `state.model`, `state.thinkingLevel`, `sessionManager.
 * {getEntryCount,getSessionId,getLeafId,getEntries,getCwd,getSessionName}`, `getContextUsage()`,
 * `modelRuntime.isUsingSubscription`, `routedModel`, and footerData's `getGitBranch()`/
 * `getAvailableProviderCount()`. Every value below is pi-durable's or pi's own plane's. */
export function piFooterOf({ entries, conversationId, leafId, entryCount, cwd, sessionName = null, model = null, routedModel = null, providers = 1, contextUsage = null, thinkingLevel = null, autoCompactEnabled = true, extensionStatuses = new Map(), gitBranch = null, isUsingSubscription = () => false }) {
 const session = {
  state: { model, thinkingLevel },
  sessionManager: {
   getEntryCount: () => entryCount,
   getSessionId: () => conversationId,
   getLeafId: () => leafId,
   getEntries: () => entries,
   getCwd: () => cwd,
   // pi-durable keeps no session name, so pi's footer omits that part rather than inventing one.
   getSessionName: () => sessionName,
  },
  getContextUsage: () => contextUsage,
  model,
  routedModel,
  modelRuntime: { isUsingSubscription: () => isUsingSubscription() },
 };
 const footerData = {
  getGitBranch: () => gitBranch,
  getAvailableProviderCount: () => providers,
  // pi's footer shows per-extension status lines only when pi's own extension plane reports statuses;
  // this harness's plane reports none, so pi draws nothing rather than a made-up line.
  getExtensionStatuses: () => extensionStatuses,
 };
 // pi's footer marks the context percentage with "(auto)" only while auto-compaction is enabled;
 // pi's setting says it is off in this workspace, so the marker must not appear.
 const footer = new FooterComponent(session, footerData);
 footer.setAutoCompactEnabled(autoCompactEnabled === true);
 return footer;
}

/** pi's ModelRecord fields pi's footer prints, read off pi's own model plane. */
export function piModelRecordOf(models, ref) {
 if (!ref) return null;
 const record = models?.getModel?.(ref.provider, ref.model) ?? null;
 if (!record) return null;
 return { id: `${ref.provider}/${record?.id ?? ref.model}`, provider: ref.provider, contextWindow: record?.contextWindow, reasoning: Array.isArray(record?.thinkingLevels) ? true : record?.reasoning };
}

/** pi's status rows from pi-durable's `LiveState` (nothing is guessed: no run means an idle row, and
 * the partial text is pi-durable's throttled `generation.message`, its tool rows are `ToolSlot`s). */
export function piStatusRows(live, { width = Infinity } = {}) {
 const rows = [];
 const partial = textOf(live?.generation?.message);
 const tools = Array.isArray(live?.tools) ? live.tools : [];
 const label = live?.run ? "running" : partial || tools.length ? "settling" : "idle";
 const accent = (text) => piColour("accent", text);
 const dim = (text) => piColour("dim", text);
 rows.push(new Text(`${accent(label)}${partial ? ` ${partial}` : ""}`, 0, 0));
 if (tools.length) {
  rows.push(new Text(dim(tools.map((slot) => `${slot?.name ?? "tool"} ${slot?.status ?? "?"}`).join("; ")), 0, 0));
 }
 // pi's own hint that interrupting is possible, spelled with pi-tui's keybinding name (pi's app-level
 	// names such as `app.interrupt` are not importable at this pin, so their text is left out).
 rows.push(new Text(keyHint("tui.editor.deleteToLineEnd", "to clear the draft"), 0, 0));
 return rows;
}

/** pi's startup header, built from pi's exported pieces only (pi's `BuiltInHeader` logo/onboarding
 * text is not exported at this pin - a row in src/packages/matrix.mjs says so). pi's own version
 * constant, pi's `Box` border piece, and pi-tui's own keybinding names through pi's `keyHint` are pi's;
 * the colours are pi's installed palette, and no hue is invented here. */
export function piHeaderOf({ version, modelLine = null, resources = [], hints = [["tui.input.submit", "to send the draft"], ["tui.input.newLine", "to add a line"], ["tui.editor.undo", "to undo"]] }) {
 const lines = [];
 const title = new Box(1, 1, (text) => piColour("accent", text));
 title.addChild(new Text(`pi-durable harness ${version}`, 0, 0));
 lines.push(title);
 lines.push(new Text(piColour("muted", `model ${modelLine ?? "no model"}`), 0, 0));
 for (const resource of resources) lines.push(new Text(piColour("dim", resource), 0, 0));
 for (const [keybinding, description] of hints) lines.push(new Text(piColour("dim", keyHint(keybinding, description)), 0, 0));
 return lines;
}
