// src/promptplane.mjs - pi's INPUT expansion plane: a leading `/name` in typed input becomes the
// prompt template's text, and `/skill:name` becomes the skill's instructions, BEFORE the text enters
// the agent. Pi does this in its editor path; this harness does it on the ONE input seam every surface
// (print, JSON, RPC, attach, TUI) submits through, so an argument typed anywhere expands the same way.
//
// PROVENANCE: no Durian-Pi original. Durian-Pi never typed input into an agent: its seats received
// work items from a rig file and their input was assembled by the seat layer (seats, cross-seat work
// queue, broker/serve, genlock, per-item worktrees, metrics, check, constitution, selfdev - all
// dropped here). What this file re-implements is pi's DOCUMENTED substitution table, read from the
// pinned package on this machine (not remembered):
//   - docs/prompt-templates.md inside @earendil-works/pi-coding-agent 1.5.1 lists the substitutions
//     ($1, $2, $@/$ARGUMENTS, ${1:-default}, ${@:-default}, ${@:N}, ${@:N:L}) and the quoting rule
//     ("a quote only starts quoting at the beginning of an argument", "a quote with no closing match
//     is kept as text", "inside a quoted argument, a backslash before the same quote character keeps
//     it as text");
//   - docs/rpc-commands.md states the boundary: `prompt`/`steer`/`follow_up` queue input whose "Skill
//     commands (/skill:name) and prompt templates (/template) are expanded before sending/queueing",
//     and "Extension commands are not allowed (use prompt instead)" - which is why a pi EXTENSION
//     command is refused by name here instead of being guessed at;
//   - docs/skills.md states what a skill command sends: "Arguments after /skill:name are appended to
//     the loaded instructions as a user request", and docs/prompt-templates.md states that a
//     template "expands the template before the resulting text enters the agent".
// Nothing here invents pi's syntax: an unknown `$`-form is left exactly as typed, which is the same
// answer pi gives for text that is not a substitution.

import { readFileSync } from "node:fs";
// pi's OWN frontmatter stripper, imported rather than re-implemented: dist/core/prompt-templates.js and
// dist/core/agent-session.js strip frontmatter before a skill's body is sent, and the pinned release
// exports this symbol at the package root, so the shim uses pi's answer for that half.
import { stripFrontmatter } from "@earendil-works/pi-coding-agent";

/**
 * pi's shell-like argument split, spelled from the docs' rule rather than from a shell library:
 * quoting starts only at the beginning of an argument, an unmatched quote stays as literal text, and
 * inside a quoted argument a backslash before the SAME quote character yields that quote.
 */
export function splitArgs(text = "") {
	const out = [];
	const source = String(text);
	let rest = 0;
	while (rest < source.length) {
		const ch = source[rest];
		if (ch === " " || ch === "\t" || ch === "\n") { rest++; continue; }
		if (ch === '"' || ch === "'") {
			const quote = ch;
			let at = rest + 1;
			let acc = "";
			let closed = false;
			while (at < source.length) {
				const c = source[at];
				if (c === "\\" && at + 1 < source.length && source[at + 1] === quote) { acc += quote; at += 2; continue; }
				if (c === quote) { closed = true; at++; break; }
				acc += c; at++;
			}
			out.push(closed ? acc : ch + source.slice(rest + 1));
			rest = at;
			continue;
		}
		// A bare word runs to the next whitespace: an apostrophe inside a word is text, per the docs.
		let at = rest;
		while (at < source.length && !/\s/.test(source[at])) at++;
		out.push(source.slice(rest, at));
		rest = at;
	}
	return out;
}

/**
 * pi's substitution table, applied to one template body with the arguments already split.
 *
 * `${...}` forms are replaced before the bare `$1`/`$@` forms, so a default clause is not eaten by a
 * positional match. A missing positional becomes ""; `${n:-default}` answers the default only when
 * that argument is absent.
 */
export function substitute(body, args = []) {
	const at = args ?? [];
	const slice = (start, length) => {
		const from = Number(start) - 1;
		const list = length === undefined || length === null ? at.slice(from) : at.slice(from, from + Number(length));
		return list.join(" ");
	};
	const braced = body.replace(/\$\{(\d+|@)(?::-([^}]*))?(?::(\d+)(?::(\d+))?)?\}/g, (_match, key, fallback, start, length) => {
		if (key === "@") {
			if (start === undefined) return at.length ? at.join(" ") : (fallback ?? "");
			return slice(start, length);
		}
		const value = at[Number(key) - 1];
		if (value === undefined || value === "") return fallback ?? "";
		return value;
	});
	const positional = braced.replace(/\$(\d+)/g, (_match, n) => at[Number(n) - 1] ?? "");
	return positional.replace(/\$(?:@|ARGUMENTS)/g, () => at.join(" "));
}

/**
 * Expand one piece of typed input through pi's package plane.
 *
 * `templates` and `skills` come from pi's own loader (src/packages/loader.mjs), so the names this
 * answers are the ones pi discovered for this cwd rather than a list typed here. A pi EXTENSION
 * command (`/goal`, `/look-pack`, ...) is NOT expanded: pi's own docs say extension commands are not
 * allowed on the queued input verbs, and expanding one would run pi's command dispatch, which this
 * harness does not have - it is refused with the name and the reason, which keeps the refusal from
 * reading like a silently dropped command.
 *
 * Returns `{ text, expansion }`, where `expansion` is "template" | "skill" | "passthrough" or an
 * `{ refused: reason }` record, so a caller can print what happened instead of guessing.
 */
export function expandInput(text, { templates = [], skills = [], commands = [] } = {}) {
	const source = String(text ?? "");
	if (!source.startsWith("/")) return { text: source, expansion: "passthrough" };
	const head = source.slice(1);
	const cut = head.search(/\s/);
	const name = (cut === -1 ? head : head.slice(0, cut)).trim();
	const argText = cut === -1 ? "" : head.slice(cut + 1).trim();
	if (name.startsWith("skill:")) {
		const skillName = name.slice("skill:".length);
		const skill = skills.find((entry) => entry?.name === skillName);
		if (!skill) return { text: source, expansion: { refused: `no skill named ${skillName} was discovered for this cwd` } };
		// pi's OWN skill block, copied from the pinned dist (dist/core/agent-session.js `_expandSkillCommand`):
		// the body is pi's `stripFrontmatter` of the skill's own file, wrapped in a block that NAMES the skill
		// and says where its references are relative to, with the arguments appended as a user request. An
		// unknown `/skill:` name passes through there too, which is what this answers.
		const body = stripFrontmatter(readFileSync(skill.filePath, "utf8")).trim();
		const block = `<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir}.\n\n${body}\n</skill>`;
		return { text: argText ? `${block}\n\n${argText}` : block, expansion: "skill" };
	}
	const template = templates.find((entry) => entry?.name === name);
	if (template) return { text: substitute(template.content, splitArgs(argText)), expansion: "template" };
	// A name a DISCOVERED pi package registers is pi's extension command: pi's own docs refuse one on
	// the queued input verbs ("Extension commands are not allowed (use prompt instead)"), so the
	// refusal names the verb instead of running pi's command dispatch. Any other leading `/` is not a
	// command pi knows about, and pi sends that text literally - the same answer here.
	const known = commands.find((row) => row?.name === name);
	if (known) {
		return {
			text: source,
			expansion: { refused: `/${name} is a command a pi package registers (${known.source}); pi dispatches extension commands inside pi's CLI, which this harness does not run - the verb is listed by get_commands and refused by name` },
		};
	}
	return { text: source, expansion: "passthrough" };
}
