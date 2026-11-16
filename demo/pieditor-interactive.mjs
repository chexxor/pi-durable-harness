#!/usr/bin/env node
// demo/pieditor-interactive.mjs - the pi-style dock as a REAL interactive program: it opens the store
// it owns, draws pi's screen over the terminal it is running in, and reads terminal keystrokes.
// demo/pieditor.test.mjs drives it inside an allocated pty, which is what proves `isTTY` is really true,
// that raw mode is what a terminal hands the dock, and that the exit path releases ownership.
//
// PROVENANCE: no Durian-Pi original - Durian-Pi ran the `pi` CLI as a child process for its seats
// (~/Git/Durian-Pi/src/seats/run.mjs) and never drew an input surface itself, so there is nothing there
// to extract. VERIFIED AGAINST PINED packages at this pin v1.5.1: pi-tui's `TuiAltScreen` and `ProcessTerminal`
// (dist/alt-screen.d.ts, dist/terminal.d.ts), pi-coding-agent's `CustomEditor` callbacks, pi-durable's
// `Harness.open`/`Conversation.submit` admission (dist/harness/*.d.ts), and this harness's own
// src/tui/pidockloop.mjs, src/ownership.mjs and src/cli-intent.mjs. DROPPED here on the same terms as
// the capability matrix names: pi's `InteractiveMode`, pi's model/thinking cycling, pi's autocomplete
// provider, pi's extension widgets.
// WHAT THIS PROVES: the driver is a normal Node child process; the pty allocation in
// demo/pieditor.test.mjs (python3 stdlib `pty`) is what makes `isTTY` true and raw mode real.
import { claimWriter, releaseWriter } from "../src/ownership.mjs";
import { harnessInvocation, settleInvocation } from "../src/cli-intent.mjs";
import { piDockLoop } from "../src/tui/pidockloop.mjs";
import { TuiAltScreen, ProcessTerminal } from "@earendil-works/pi-tui";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { join } from "node:path";

const argv = process.argv.slice(2);
const opts = { store: null, cwd: process.cwd(), faux: null, width: null, height: null };
for (let i = 0; i < argv.length; i += 1) {
 if (argv[i] === "--store") { opts.store = argv[++i]; }
 else if (argv[i] === "--cwd") { opts.cwd = argv[++i]; }
 else if (argv[i] === "--faux") { opts.faux = argv[++i]; }
 else if (argv[i] === "--width") { opts.width = Number(argv[++i]); }
 else if (argv[i] === "--height") { opts.height = Number(argv[++i]); }
 else throw new Error(`unknown flag ${argv[i]}`);
}
const store = opts.store ?? join(opts.cwd, "harness.sqlite");

/** HOW KEYSTROKES ARRIVE: this driver does NOT read stdin. pi-tui's `ProcessTerminal.start()` owns the
 * terminal (raw mode, escape-sequence parsing) and `tui.js handleTerminalInput` delivers each keystroke
 * to `this.focusedComponent.handleInput` - piDockLoop sets the focus to pi's Editor. That is pi's own
 * input path, so the raw bytes a terminal hands the process are parsed by pi, not by this file. */

// A signal runs the SAME ordinary cleanup a quit runs: the claim is released and the Harness closed,
// never a hard kill that leaves a stale lock behind.
let openParts = null;
const closeOpen = async (reason) => {
 if (openParts) await openParts.harness.close(BACKGROUND_CONTEXT);
 releaseWriter(store);
 console.error(`session: left by ${reason}`);
};
for (const signal of ["SIGINT", "SIGTERM"]) {
 process.on(signal, () => { closeOpen(signal.toLowerCase()); process.exit(0); });
}

async function main() {
 const claim = claimWriter(store);
 const parts = await harnessInvocation({ store, cwd: opts.cwd, faux: opts.faux, messages: [] }, { context: BACKGROUND_CONTEXT });
 openParts = parts;
 const resources = parts.resources ?? {};
 console.error(`plane: packages=${(resources.packages ?? []).length} extensions=${(resources.extensionPaths ?? []).length} mapped=${(resources.durableExtensions ?? []).length} skills=${(resources.skills ?? []).length} templates=${(resources.promptTemplates ?? []).length} themes=${(resources.themes ?? []).length} contextFiles=${(resources.contextFiles ?? []).length} skipped=${(resources.skipped ?? []).map((kind) => kind?.kind ?? kind).join(",")}`);
 console.error(`theme: ${resources.themeName ?? "pi's default"}`);

 const ui = new TuiAltScreen(new ProcessTerminal(), false, undefined);
 ui.start();
 const size = () => ({ columns: process.stdout.columns ?? opts.width ?? 80, rows: process.stdout.rows ?? opts.height ?? 24 });
 const tally = await piDockLoop({
  parts,
  ui,
  size,
  context: BACKGROUND_CONTEXT,
  keystrokes: true,
  reader: null,
  report: (line) => console.error(line),
 });
 ui.clear();
 ui.requestRender();
 ui.stop();

 await settleInvocation(parts);
 await parts.harness.close(BACKGROUND_CONTEXT);
 releaseWriter(store);
 console.error(`session: submitted=${tally.submitted} cancelled=${tally.cancelled} quit=${tally.quit ?? "-"} paints=${tally.paints} theme=${tally.theme ?? "-"}`);
}

try {
 await main();
} catch (err) {
 console.error(`pieditor-interactive: ${String(err?.message ?? err)}`);
 releaseWriter(store);
 process.exitCode = 1;
}
