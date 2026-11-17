// PROVENANCE: no Durian-Pi original - Durian-Pi never drove an input component (its
// ~/Git/Durian-Pi/src/tui/client.mjs read whole lines with its own driver and never handed a keystroke to a
// component), so there is nothing there to extract; the rule below is read off pi's own pinned release instead.
// Symbols VERIFIED AGAINST PINED packages, read on this machine at pin v1.5.1:
//   pi's builtin slash table `BUILTIN_SLASH_COMMANDS` (dist/core/slash-commands.js, declared in dist/core/slash-commands.d.ts)
//   pi's app name `APP_NAME` over `pkg.piConfig?.name` (dist/config.js, over the package's ../package.json)
//   pi's editor submit handler `setupEditorSubmitHandler` (dist/modes/interactive/interactive-mode.js)
//   pi's built-in extension commands `pi.registerCommand(name, { description })` (dist/extensions/{llama,mcp}/index.js)
//   pi-durable's ONE command handler `handle(parts, msg, emit)` (./rpc.mjs, the handler RPC mode and the attach socket call)
// pi's verbs DROPPED from pi's own interactive layer, on purpose and named rather than silently: pi's
// `InteractiveMode` (this harness does not compose it), pi's easter-egg/debug verbs `/debug`, `/arminsayshi`,
// `/dementedelves` (absent from BUILTIN_SLASH_COMMANDS and from pi's docs, so left as pi's fallthrough), and
// every verb pi spells for a command this harness has no plane for, which is refused BY NAME in pi's own
// words. Nothing here is reimplemented: an honoured verb is a call to pi-durable's existing handler.
//
// src/slashplane.mjs - ONE policy for what a typed draft that starts with `/` or `!` MEANS, so the
// surface that draws pi's dock and the surface that draws rows cannot disagree about the same line.
//
// WHY ONE MODULE: pi dispatches slash commands inside its own editor submit handler
// (dist/modes/interactive/interactive-mode.js `setupEditorSubmitHandler`, read at pin v1.5.1 on this
// machine), and that handler is private to pi's InteractiveMode - which this harness does not compose
// (see src/packages/matrix.mjs's row for `InteractiveMode`). What is NOT private is the data pi's own
// release ships for those commands, and the rules below are read off that data rather than retyped:
//   - `dist/core/slash-commands.js` ships `export const BUILTIN_SLASH_COMMANDS = [{name, description,
//     argumentHint?}, ...]`; `dist/core/slash-commands.d.ts` DECLARES the same table
//     (`export declare const BUILTIN_SLASH_COMMANDS: ReadonlyArray<BuiltinSlashCommand>`), which is why
//     the table is read off pi's pinned dist the same way src/tui/piscreen.mjs reads pi's app-key table
//     (`readPiAppKeybindings()`): the package's `exports` map is `{".", "./rpc-entry"}`, so a subpath
//     import of `./core/slash-commands` fails at this pin, and a pin that stops shipping the table THROWS
//     here rather than letting a guessed list pass.
//   - `/quit`'s description is the template literal `` `Quit ${APP_NAME}` `` and `APP_NAME` is
//     `dist/config.js:488-490`: `const piConfigName = pkg.piConfig?.name; export const APP_NAME =
//     piConfigName || "pi";` over pi's own package.json, so the name is read the same way rather than
//     typed here (pi's package declares `piConfig: {configDir: ".pi"}` and no name, so pi says "pi").
//   - which names pi matches as `/name` EXACTLY versus `/name <args>` is derived by LOOKING at pi's own
//     dispatch source for `text === "/name"` and `text.startsWith("/name ")`, so a pin that changes a
//     name's argument rule changes this file's answer instead of silently keeping an old one.
//   - pi's BUILT-IN EXTENSION commands (`/llama`, `/mcp` in docs/slash-commands.md, and nothing else at
//     this pin) are found by scanning pi's own built-in extension modules (`dist/extensions/*/index.js`)
//     for `pi.registerCommand("<name>", { description: "..." })`, so the refusal quotes pi's description
//     and names the module that registers it, both read here.
//
// WHAT THIS FILE DOES NOT DO: it does not admit a plain typed draft (that stays writerSubmit in
// src/tui/writer.mjs, the ONE mutation line), it does not reimplement a command, and it does not open
// storage or claim a lock. A command it honours goes through pi-durable's ONE command handler
// (`handle()` in src/rpc.mjs, already the handler the RPC stdin mode and the attach socket call), so a
// slash verb and an RPC verb cannot drift. A command it cannot honour is REFUSED BY NAME with pi's own
// words; a name pi lists nowhere is either pi-durable's package plane's refusal (src/promptplane.mjs,
// imported through src/cli-intent.mjs' `expandRunInput`, so the wording stays pi-durable's) or pi's own
// "Normal message submission" branch, which is what keeps pi's `/template` and `/skill:name` expansion
// alive at the dock.
//
// pi's own dispatch order is kept for the names this file answers, and pi's own easter-egg/debug verbs
// (`/debug`, `/arminsayshi`, `/dementedelves`) are NOT in BUILTIN_SLASH_COMMANDS and not in pi's docs, so
// this file leaves them as pi's fallthrough (normal submission) rather than honouring an undocumented
// verb.
import { readFileSync, readdirSync } from "node:fs";
import { handle } from "./rpc.mjs";
import { expandRunInput } from "./cli-intent.mjs";

/** pi's own pinned dist, addressed the way src/tui/piscreen.mjs addresses it: `import.meta.resolve`
 * answers the package's entry file, and the dist path is RELATIVE to it (`../package.json` is the
 * package manifest, one level up). */
function piDist(rel) {
 return new URL(rel, import.meta.resolve("@earendil-works/pi-coding-agent"));
}

/** pi's own app name (`APP_NAME` in dist/config.js), so `/quit`'s description renders as pi renders it. */
export function piAppName() {
 const pkg = JSON.parse(readFileSync(piDist("../package.json"), "utf8"));
 return pkg?.piConfig?.name || "pi";
}

/** pi's built-in slash commands, read off pi's pinned `dist/core/slash-commands.js`, guarded by the
 * declaration file that ships beside it. Entries are `{name, description, argumentHint?}` and a
 * description may be a template literal (`Quit ${APP_NAME}`), which is interpolated here with pi's own
 * `APP_NAME` rather than with a name typed here. */
export function piBuiltinSlashCommands() {
 const declaration = piDist("./core/slash-commands.d.ts");
 if (!readFileSync(declaration, "utf8").includes("declare const BUILTIN_SLASH_COMMANDS")) {
  throw new Error(`pi's builtin slash table is not declared in ${declaration} - the pin changed shape, and a guessed command list would be a lie`);
 }
 const source = piDist("./core/slash-commands.js");
 const text = readFileSync(source, "utf8");
 const at = text.indexOf("export const BUILTIN_SLASH_COMMANDS = [");
 if (at < 0) throw new Error(`pi's builtin slash table is not spelled in ${source} - the pin changed shape`);
 // The array is walked by bracket depth so a `]` inside a description cannot end it early.
 let end = -1;
 let depth = 0;
 for (let i = text.indexOf("[", at); i < text.length; i += 1) {
  if (text[i] === "[") depth += 1;
  if (text[i] === "]") {
   depth -= 1;
   if (depth === 0) { end = i; break; }
  }
 }
 const block = text.slice(at, end + 1);
 const appName = piAppName();
 const entries = [...block.matchAll(/\{\s*name:\s*"([^"]+)"\s*,\s*description:\s*(?:"([^"]*)"|`([^`]*)`)(?:\s*,\s*argumentHint:\s*"([^"]*)")?\s*,?\s*\}/g)]
  .map((match) => ({
   name: match[1],
   description: (match[2] ?? match[3] ?? "").replace("${APP_NAME}", appName),
   ...(match[4] ? { argumentHint: match[4] } : {}),
  }));
 if (!entries.length) throw new Error(`no builtin slash command parsed out of ${source} - the entry shape changed at this pin`);
 return entries;
}

/** Which names pi's editor matches EXACTLY (`text === "/name"`) and which take arguments
 * (`text === "/name" || text.startsWith("/name "`), DERIVED from pi's own submit handler so the rule
 * is pi's rather than a list remembered here. A name pi's builtin table lists but whose dispatch this
 * file cannot find THROWS: claiming an argument rule for a command pi stopped dispatching is a lie. */
export function piSlashMatchRules() {
 const url = piDist("./modes/interactive/interactive-mode.js");
 const text = readFileSync(url, "utf8");
 const rules = {};
 for (const { name } of piBuiltinSlashCommands()) {
  const takesArgs = text.includes(`text.startsWith("/${name} ")`);
  const exact = text.includes(`text === "/${name}"`);
  if (!takesArgs && !exact) throw new Error(`pi's builtin ${name} is in ${url} but its dispatch pattern is not - the match rule cannot be derived`);
  rules[name] = takesArgs ? "prefix" : "exact";
 }
 return rules;
}

/** pi's BUILT-IN EXTENSION commands: the commands pi's own built-in extension modules register, with
 * pi's own `description`. These are pi's BUILT-IN extensions (dist/extensions/{llama,mcp,codemode,
 * tool-search}/index.js), which this harness loads NONE of, so their commands are refused by name with
 * the module that registers them named in the reason. */
export function piBuiltinExtensionCommands() {
 const dir = piDist("./extensions");
 const out = [];
 let names;
 try { names = readdirSync(dir); } catch { return out; }
 for (const entry of names) {
  const file = new URL(`./extensions/${entry}/index.js`, import.meta.resolve("@earendil-works/pi-coding-agent"));
  let text;
  try { text = readFileSync(file, "utf8"); } catch { continue; }
  for (const match of text.matchAll(/registerCommand\(\s*"([^"]+)"\s*,\s*\{[\s\S]{0,200}?description:\s*"([^"]*)"/g)) {
   out.push({ name: match[1], description: match[2], module: `dist/extensions/${entry}/index.js` });
  }
 }
 return out;
}

/** pi's own parse of a typed draft, in pi's own rules: trim, `/name` head, an EXACT or `/name <args>`
 * match against pi's builtin table (so an unknown `/foo` is NOT a command and pi submits it), and pi's
 * `!cmd` / `!!cmd` bash rule (an empty command falls through, as pi's own `if (command)` guard shows).
 * Returns `null` for "not a command", `{ kind: "command", name, args, entry }`, or `{ kind: "bash" }`. */
export function piSlashOf(text, { builtins = piBuiltinSlashCommands(), rules = piSlashMatchRules() } = {}) {
 const trimmed = String(text ?? "").trim();
 if (!trimmed) return null;
 if (trimmed.startsWith("!")) {
  const excluded = trimmed.startsWith("!!");
  const command = (excluded ? trimmed.slice(2) : trimmed.slice(1)).trim();
  if (!command) return null;
  return { kind: "bash", command, excluded };
 }
 if (!trimmed.startsWith("/")) return null;
 const head = trimmed.slice(1);
 const cut = head.search(/\s/);
 const name = (cut === -1 ? head : head.slice(0, cut)).trim();
 const args = cut === -1 ? "" : head.slice(cut + 1).trim();
 for (const entry of builtins) {
  if (entry.name !== name) continue;
  if (rules[name] === "exact" && trimmed !== `/${name}`) continue;
  return { kind: "command", name, args, entry };
 }
 return { kind: "unknown", name, args };
}

/** What pi-durable's ONE command handler says, as lines a caller prints: pi-durable's own record field
 * names as the labels, so the report is pi-durable's answer rather than prose written here. */
function renderResponse(command, response, keys = []) {
 if (!response?.success) return [`${command}: ${response?.error ?? "refused"}`];
 const data = response?.data ?? {};
 const show = (value) => {
  if (Array.isArray(value)) return value.map((item) => Object.values(item ?? {}).join("/")).join(" ");
  // MEASURED at this pin: /session's `tokens` and /model's `model` are RECORDS, and a bare
  // `${value}` prints "[object Object]", which throws away the one thing those records carry that
  // a reader needs - pi-durable's actual numbers. pi-durable's own field names spell them.
  if (typeof value === "object") return JSON.stringify(value);
  return value;
 };
 const shown = keys.filter((key) => data[key] !== undefined && data[key] !== null)
  .map((key) => `${key}=${show(data[key])}`);
 const label = Object.keys(data).length && !shown.length ? Object.keys(data).join(",") : null;
 return [...(shown.length ? [`${command}: ${shown.join(" ")}`] : []), ...(label ? [`${command} fields: ${label}`] : [])];
}

/** The verbs this harness answers for a slash command, in pi's own naming: each row is one pi command
 * onto pi-durable's documented verbs, which `handle()` in src/rpc.mjs already answers for RPC mode.
 * `needs` says which argument pi's own command needs before it can run here. */
const PI_SLASH_VERBS = [
 { name: "new", verbs: [{ type: "new_session" }], keys: ["conversationId", "parentSession"] },
 { name: "model", verbs: (args) => args.includes("/") ? [{ type: "set_model", provider: args.slice(0, args.indexOf("/")), modelId: args.slice(args.indexOf("/") + 1) }] : [{ type: "set_model", modelId: args }], needs: "an argument", keys: ["provider", "id"] },
 { name: "thinking", verbs: (args) => [{ type: "set_thinking_level", level: args }], needs: "an argument", keys: ["level"] },
 { name: "compact", verbs: (args) => [{ type: "compact", customInstructions: args || null }], keys: ["taskId", "settled"] },
 { name: "session", verbs: [{ type: "get_session_stats" }, { type: "get_state" }], keys: ["sessionFile", "sessionId", "userMessages", "assistantMessages", "toolCalls", "toolResults", "totalMessages", "tokens", "cost", "model", "thinkingLevel", "messageCount"] },
 { name: "copy", verbs: [{ type: "get_last_assistant_text" }], keys: [], text: "text" },
 { name: "tree", verbs: [{ type: "get_tree" }], keys: ["leafId"], branch: "branch" },
 { name: "clone", verbs: [{ type: "clone" }], keys: ["conversationId", "at"] },
];

/** pi's built-in commands whose dock answer is pi's OWN selector UI rather than a value spelled on the
 * line, which this harness does not compose. MEASURED at this pin from pi's own submit handler: pi
 * matches `/fork` EXACTLY ONLY (`text === "/fork"`, and `/fork 2` is not a command at pi's dock but an
 * ordinary submitted message), and the EXACT form opens pi's message selector. So this harness cannot
 * honour `/fork` at the dock the way it honours `/clone`: it refuses it BY NAME in pi's own words, and
 * prints pi-durable's candidate EntryIds through pi-durable's existing `get_fork_messages` verb so the
 * refusal is actionable. A pin whose dock gives `/fork` an argument rule makes this row's claim false,
 * so it THROWS rather than honouring a shape pi stopped shipping. */
const PI_SLASH_SELECTOR_REFUSALS = [
 { name: "fork", needs: "one message chosen from pi's own message selector", candidates: { type: "get_fork_messages" }, shown: "messages", at: "entryId" },
];

/**
 * Decide one typed draft, and run it through pi-durable's command plane when this harness can.
 *
 * `{ handled, lines, settlements, quit }`:
 *   - `fallthrough` - pi's own "Normal message submission": the caller submits the draft exactly as
 *     before, which is what keeps pi's prompt-template and `/skill:name` expansion working (src/promptplane
 *     mjs expands at the seam) and what pi does for a name it does not list;
 *   - `ran` - the verbs above were answered by `handle()`, and any input `handle()` queued (pi's bash verb
 *     queues its output as a follow-up input) is pushed onto `parts.settlements`, the same list the
 *     caller's `settleInvocation` waits on;
 *   - `refused` - pi's own words for that command, plus the reason this harness has no plane for it;
 *   - `quit` - pi's `/quit` rule: clear the draft and leave, so the caller's ordinary cleanup
 *     (settle, close the Harness, release the claim) runs. Nothing is submitted.
 */
export async function dispatchLine(text, parts, { context = parts.context, report = (line) => process.stderr.write(`${line}\n`) } = {}) {
 const parsed = piSlashOf(text);
 if (!parsed) return { handled: "fallthrough", lines: [], settlements: [] };

 const settle = (response) => {
  for (const id of response?.settlements ?? []) parts.settlements.push(id);
 };

 if (parsed.kind === "bash") {
  const response = await handle(parts, { type: "bash", command: parsed.command, excludeFromContext: parsed.excluded }, null);
  settle(response);
  const lines = [
   ...renderResponse("bash", response, ["exitCode", "truncated"]),
   ...(parsed.excluded || typeof response?.data?.output !== "string" ? [] : String(response.data.output).split("\n").map((line) => `${parsed.command} output: ${line}`)),
  ];
  return { handled: "ran", name: parsed.command, kind: "bash", lines, settlements: [] };
 }

 if (parsed.kind === "unknown") {
  // pi-durable's package plane already refuses a command a DISCOVERED pi package registers, in its own
  // words (src/promptplane.mjs), so the refusal stays that file's wording rather than a paraphrase;
  // anything else is pi's own fallthrough branch.
  // `/help` is NOT one of pi's builtin names at this pin - pi's own builtin table (BUILTIN_SLASH_COMMANDS,
  // read above) does not list it, and pi's command menu is its editor autocomplete dropdown, which this
  // harness does not compose - so answering it is a HARNESS ADDITION the capability matrix labels as such.
  // What it prints is pi's own data rather than prose written here: pi's builtin table, pi's built-in
  // extension commands and pi's discovered package commands, each row labelled with what THIS harness does
  // with it, which is exactly the set the rows below claim.
  if (parsed.name === "help") {
   const menu = await piCommandMenu(parts);
   return {
    handled: "ran",
    name: "help",
    kind: "command",
    lines: menu.lines.map((row) => `${row.name} - ${row.description} (${row.state})`),
    settlements: [],
   };
  }
  // pi's OWN dock order (docs/extensions.md: "When input starts with /, the system checks for extension
  // commands first, then skill commands, then prompt templates"), measured at this pin: a registered
  // built-in EXTENSION command is matched BEFORE the draft is submitted, so `/llama` and `/mcp` are
  // refused here rather than falling through and becoming agent admissions.
  const extensionCommand = piBuiltinExtensionCommands().find((row) => row.name === parsed.name);
  if (extensionCommand) {
   return {
    handled: "refused",
    name: parsed.name,
    lines: [`refused: /${parsed.name} - ${extensionCommand.description}; pi registers it in ${extensionCommand.module}, a built-in extension this harness does not load`],
    settlements: [],
   };
  }
  const expansion = expandRunInput(parts, `/${parsed.name}${parsed.args ? ` ${parsed.args}` : ""}`);
  if (expansion?.expansion?.refused) {
   return { handled: "refused", name: parsed.name, lines: [`refused: ${expansion.expansion.refused}`], settlements: [] };
  }
  return { handled: "fallthrough", lines: [], settlements: [] };
 }

 const name = parsed.name;
 const entry = parsed.entry;
 const verbs = PI_SLASH_VERBS.find((row) => row.name === name);

 if (name === "quit") {
  // MEASURED: cli.mjs' `screen:` line prints each decision as `<handled>:<name>`, and a decision with
  // no name printed `quit:undefined` - the one thing the screen line must say for `/quit` is WHICH name
  // left, in pi's own spelling. pi's builtin table spells the name `quit`, so it is read from there.
  return { handled: "quit", name: parsed.name, kind: parsed.name, quit: "quit", lines: [], settlements: [] };
 }

 if (!verbs) {
  const selector = PI_SLASH_SELECTOR_REFUSALS.find((row) => row.name === name);
  if (selector) {
   // pi matches this name EXACTLY only, so any argument at all is pi's fallthrough and never reaches
   // here; a pin that gives the name an argument rule makes this row's claim false, and that is a
   // THROW rather than a refusal printed for a command pi now runs differently.
   if (piSlashMatchRules()[name] !== "exact") throw new Error(`pi's dock now matches /${name} with arguments - the selector-refusal row in this file names the wrong shape for it`);
   const response = await handle(parts, selector.candidates, null);
   settle(response);
   const shown = (response?.data?.[selector.shown] ?? []).map((row) => row?.[selector.at]).filter((id) => id !== undefined && id !== null);
   return {
    handled: "refused",
    name,
    lines: [`refused: /${name} - ${entry.description}; pi asks for ${selector.needs}${shown.length ? ` (pi-durable's candidates: ${shown.join(", ")})` : ""}`],
    settlements: [],
   };
  }
  // pi's built-in command that this harness has no plane for: pi's own description is pi's words for
  // what the command does in pi, and the reason names the plane it would need.
  const builtin = piBuiltinExtensionCommands().find((row) => row.name === name);
  if (builtin) {
   return {
    handled: "refused",
    name,
    lines: [`refused: /${name} - ${builtin.description}; pi registers it in ${builtin.module}, a built-in extension this harness does not load`],
    settlements: [],
   };
  }
  return {
   handled: "refused",
   name,
   lines: [`refused: /${name} - ${entry.description}; pi runs this built-in command inside its own InteractiveMode, which this harness does not compose - the capability matrix names it`],
   settlements: [],
  };
 }

 if (verbs.needs && !parsed.args) {
  // pi opens a selector for these; this harness needs the value spelled, and pi-durable's own
  // candidates are printed so the refusal is actionable rather than a dead end.
  const candidates = name === "thinking"
   ? (await handle(parts, { type: "get_available_thinking_levels" }, null))
   : null;
  settle(candidates);
  const shown = candidates?.data?.messages?.map((row) => row?.entryId) ?? candidates?.data?.levels ?? [];
  return {
   handled: "refused",
   name,
   lines: [`refused: /${name} - ${entry.description}; pi asks for ${verbs.needs}${shown.length ? ` (pi-durable's candidates: ${shown.join(", ")})` : ""}`],
   settlements: [],
  };
 }

 const calls = typeof verbs.verbs === "function" ? verbs.verbs(parsed.args) : verbs.verbs;
 const lines = [];
 for (const call of calls) {
  const response = await handle(parts, call, null);
  settle(response);
  if (verbs.text && typeof response?.data?.[verbs.text] === "string") {
   lines.push(`${name}: ${JSON.stringify(response.data[verbs.text])}`);
  }
  else lines.push(...renderResponse(call.type, response, verbs.keys));
  if (verbs.branch) {
   const branch = response?.data?.branch ?? [];
   lines.push(`get_tree branch: ${branch.map((row) => `${row.id} ${row.kind}`).join(" ")}`);
  }
 }
 return { handled: "ran", name, kind: "command", lines, settlements: [] };
}

/** The command menu this harness answers: pi's own builtin list at this pin, each row labelled with
 * what THIS file does with it, plus pi's built-in extension commands and pi's own resource commands.
 * `/help` is a HARNESS ADDITION (pi's own command menu is its editor autocomplete dropdown, which is
 * not composed here) and this is what it prints, so the addition is stated in pi's own data rather than
 * in prose written beside it. */
export async function piCommandMenu(parts) {
 const builtins = piBuiltinSlashCommands();
 const rules = piSlashMatchRules();
 const verbs = Object.fromEntries(PI_SLASH_VERBS.map((row) => [row.name, row]));
 const extension = piBuiltinExtensionCommands();
 const lines = [];
 for (const entry of builtins) {
  const honours = verbs[entry.name];
  const selector = PI_SLASH_SELECTOR_REFUSALS.find((row) => row.name === entry.name);
  const hint = entry.argumentHint ? ` ${entry.argumentHint}` : "";
  const args = rules[entry.name] === "prefix" ? hint : "";
  const state = entry.name === "quit" ? "honoured: leave through the ordinary cleanup"
   : honours ? "honoured: pi-durable's verbs"
    : selector ? `refused by name: pi asks for ${selector.needs}`
     : "refused by name: pi's own InteractiveMode";
  lines.push({ name: `/${entry.name}${args}`, description: entry.description, state });
 }
 for (const row of extension) {
  lines.push({ name: `/${row.name}`, description: row.description, state: `refused by name: built-in extension ${row.module}` });
 }
 const commands = (await handle(parts, { type: "get_commands" }, null))?.data?.commands ?? [];
 for (const row of commands) {
  lines.push({ name: `/${row.name}`, description: row.description, state: row.source === "extension" ? "refused by name: pi dispatches package commands inside pi's CLI" : "expanded at the input seam (pi-durable's promptplane)" });
 }
 return { builtins, extension, lines };
}
