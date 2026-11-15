// src/tui/theme.mjs - pi's THEME palette painted onto the harness's own TUI rows.
//
// PROVENANCE: no Durian-Pi original. Durian-Pi owned its terminal bytes (src/tui/paint.mjs' `composeFrame`
// and src/tui/restore.mjs' ENTER_ALT/HIDE_CURSOR pair) but never carried pi's palette: its seats ran the
// `pi` binary in a terminal of their own, so pi's theme files belonged to pi's process and were never read
// here. What this module does with pi's data is read from the pinned package on this machine, not remembered:
//   - docs/themes.md inside node_modules/@earendil-works/pi-coding-agent 1.5.1 states what a theme IS -
//     "Themes control the colors Pi uses in interactive mode and HTML exports" - and that the selection is
//     the `theme` setting ("Without a `theme` setting, Pi uses `system`.");
//   - pi's own resource loader hands a discovered theme as a RECORD whose fields the pinned dist declares:
//     getThemes() answers {name, sourcePath, mode, fgAnsi, bgAnsi, concreteColors, defaultForegroundTokens,
//     defaultBackgroundTokens, dimTokens, resolvedColors}, where `concreteColors` maps pi's OWN colour tokens
//     (`accent`, `border`, `borderMuted`, ...) to {kind: "rgb", r, g, b} for truecolour terminals and `fgAnsi`
//     maps the same tokens to ready-made SGR numbers for terminals that report only palette slots.
//
// What is deliberately NOT claimed, and is a row of its own in docs/package-support.md: pi's theme SELECTION
// dialog (`/settings` -> Theme), pi's light/dark auto-detection from the terminal's reported background, and
// pi's renderer swap (`setTheme`). What IS mapped here is the palette itself: pi's colours on the rows this
// harness's TUI already draws through @earendil-works/pi-tui.

/** pi's colour token -> an SGR foreground code, from whichever half of the record the terminal answers. */
export function themeForeground(theme = null, token = "accent") {
	if (!theme) return null;
	const concrete = theme.concreteColors?.[token] ?? theme.resolvedColors?.[token];
	if (concrete?.kind === "rgb" && [concrete.r, concrete.g, concrete.b].every(Number.isFinite)) {
		return `38;2;${concrete.r};${concrete.g};${concrete.b}`;
	}
	// A terminal that reports only palette slots answers fgAnsi, pi's own map of token -> SGR number.
	const ansi = theme.fgAnsi?.[token];
	return Number.isFinite(ansi) ? `38;5;${ansi}` : null;
}

/**
* Wrap one row in an SGR foreground, so pi's palette - and nothing else - is what colours the TUI.
*
* A row that already carries an escape introducer is left alone: pi-tui's components build their own
* coloured text (a `ThemedText` keeps the colours its string was built with), and a second wrapper would
* nest codes and mis-measure the row.
*/
export function colorRow(row, sgr) {
	const text = String(row ?? "");
	if (!sgr) return text;
	if (text.includes("\x1b")) return text;
	return `\x1b[${sgr}m${text}\x1b[0m`;
}

/**
* Paint a frame of rows with pi's palette. Which token colours which row is spelled from the marks this
* harness's own frame carries: src/tui/frame.mjs' INPUT_MARK row is the line being typed, so it takes pi's
* `accent`, and every other row - the transcript gutter, the gap and "load earlier" rows - takes pi's
* `borderMuted`. A theme that does not carry that token leaves those rows uncoloured rather than guessing
* a hue, which is why the answer reports HOW MANY rows were coloured.
*/
export function applyThemeToRows(rows = [], theme = null, { inputMark = "> ", inputToken = "accent", rowToken = "borderMuted" } = {}) {
	const accent = themeForeground(theme, inputToken);
	const muted = themeForeground(theme, rowToken);
	const lines = (Array.isArray(rows) ? rows : Array.isArray(rows?.lines) ? rows.lines : [rows]).map(String);
	const pick = (line) => (line.startsWith(inputMark) ? accent : muted);
	return {
		lines: lines.map((line) => colorRow(line, pick(line))),
		coloured: lines.filter((line) => pick(line) !== null).length,
		// The SGR codes pi's palette actually contributed, so a demo can name pi's numbers
		// (the theme file's rgb triple) rather than trusting that "something" was coloured.
		codes: [...new Set(lines.map((line) => pick(line)).filter((sgr) => sgr !== null))],
		tokens: { input: inputToken, row: rowToken },
		theme: theme?.name ?? null,
	};
}

/** The tokens a discovered pi theme actually carries, so a demo can name what was applied vs skipped. */
export function themeTokens(theme = null) {
	return [...Object.keys(theme?.concreteColors ?? {})];
}
