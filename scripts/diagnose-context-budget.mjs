#!/usr/bin/env node
// PROVENANCE: no Durian-Pi original. Durian-Pi never ran pi's context plane inside its own process
// (its seats ran the `pi` CLI as a child), so it has no diagnostic for pi's compaction settings.
//
// WHY THIS FILE EXISTS: the workspace had a complaint that pi's `pi-context-budget` package should HAND
// OFF (its own budget commit at `mode: "enforce"`) instead of pi's native auto-compaction running. The
// answer is not a code change in this harness: it is which settings a pi session loaded, and pi loads
// settings and packages ONCE at `session_start` (docs/packages.md names `session_start` as the point
// where the resource plane is resolved). A session that started before this project's `.pi/settings.json`
// and before the package was installed cannot pick either up later, and its compactions stay native.
// This file reads that evidence with pi's OWN readers - pi's SettingsManager (src/settings.mjs) and
// pi's DefaultResourceLoader (src/packages/loader.mjs) - rather than parsing pi's file formats a second
// time, and it reads pi's session format (docs/session-format.md: a `compaction` entry record carries
// `fromHook`) to say which half of the claim is observed rather than remembered.
//
// OFFLINE: everything here is a local file read; no provider call, no network.
import { piSettings } from "../src/settings.mjs";
import { loadPiResources } from "../src/packages/loader.mjs";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { join, resolve } from "node:path";

/** The session directory name pi uses for a cwd (docs/session-format.md: `--<cwd with / ->>--`). */
function sessionDir(cwd, agentDir = getAgentDir()) {
  const flattened = resolve(cwd).replace(/^\/+/, "").replace(/\//g, "-");
 const name = "--" + flattened + "--";
 const dir = join(agentDir, "sessions", name);
 return { dir, exists: (() => { try { statSync(dir); return true; } catch { return false; } })() };
}

async function main() {
 const cwd = resolve(process.cwd());
 const agentDir = getAgentDir();

 // 1) pi's settings for this cwd, and the compaction switch's own value in each scope.
 const resolved = piSettings({ cwd, agentDir });
 const scopes = resolved?.settings ?? {};
 const errors = resolved?.errors ?? [];
 console.log(`settings [cwd=${cwd}]: compaction.enabled=${JSON.stringify(scopes?.compaction?.enabled ?? "absent")} defaultModel=${scopes?.defaultModel ?? "-"} defaultProvider=${scopes?.defaultProvider ?? "-"} theme=${scopes?.theme ?? "-"} packages=${JSON.stringify(scopes?.packages ?? "absent")}`);
 for (const e of errors) console.log(`settings error: ${String(e?.message ?? e)}`);

 // 2) what pi's loader actually resolves for this cwd: the project package and its extension paths.
 const resources = await loadPiResources(cwd, agentDir, {});
 const extensionPaths = (resources?.extensions?.extensions ?? []).map((row) => row?.resolvedPath ?? row?.path);
 const budgetPaths = extensionPaths.filter((p) => String(p).includes("pi-context-budget"));
 console.log(`pi loader plane: extensions=${extensionPaths.length} context-budget extension paths=${budgetPaths.length}`);
 for (const p of budgetPaths) console.log(`  loaded extension: ${p}`);

 // 3) the package's own config: mode, cwd restriction, and the model keys it would apply.
 try {
  const cfg = JSON.parse(readFileSync(join(agentDir, "context-budget.json"), "utf8"));
  const enforces = cfg?.enforceCwds ?? [];
  const inside = enforces.some((p) => resolve(cwd) === p || resolve(cwd).startsWith(String(p).replace(/\/\*\*$/, "")));
  const models = Object.keys(cfg?.models ?? {});
  console.log(`context-budget.json: mode=${cfg?.mode ?? "-"} enforceCwds=${enforces.length} thisCwdInside=${inside} modelKeys=${models.join(",")}`);
 } catch (err) {
  console.log(`context-budget.json: unreadable (${String(err?.message ?? err)})`);
 }

 // 4) the settings file's own arrival time, and every session for this cwd: when it STARTED, and how
 // many compactions it committed, split by pi's own `fromHook` flag. A hand-off committed by the
 // package is `fromHook: true`; a native auto-compaction is `false`.
 const settingsFile = join(cwd, ".pi", "settings.json");
 let settingsAt = null;
 try { settingsAt = statSync(settingsFile).mtime.toISOString(); } catch { /* no project settings: say so below */ }
 console.log(`project .pi/settings.json exists=${settingsAt !== null} modified=${settingsAt ?? "-"}`);

 const where = sessionDir(cwd, agentDir);
 console.log(`sessions for this cwd: dir=${where.dir} exists=${where.exists}`);
 if (!where.exists) return;
 const rows = [];
 for (const file of readdirSync(where.dir)) {
  if (!file.endsWith(".jsonl")) continue;
  let started = null;
  let native = 0;
  let byHook = 0;
  let models = {};
  for (const line of readFileSync(join(where.dir, file), "utf8").split("\n")) {
   let rec;
   try { rec = JSON.parse(line); } catch { continue; }
   if (started === null && rec?.timestamp) started = rec.timestamp;
   if (rec?.type === "compaction") {
    if (rec.fromHook === true) byHook++; else native++;
   }
   if (rec?.type === "message" && rec?.message?.role === "assistant" && rec.message.model) {
    models[rec.message.model] = (models[rec.message.model] ?? 0) + 1;
   }
  }
  rows.push({ file: file.split("_")[0], started, native, byHook, models });
 }
 rows.sort((a, b) => String(a.started ?? "").localeCompare(String(b.started ?? "")));
 for (const r of rows) {
  const predates = settingsAt !== null && String(r.started ?? "") < settingsAt;
  console.log(`  session ${r.file}: started=${r.started ?? "-"} native compactions=${r.native} by hook=${r.byHook} models=${Object.keys(r.models).join(",")} startedBeforeProjectSettings=${predates}`);
 }
 const stale = rows.filter((r) => settingsAt !== null && String(r.started ?? "") < settingsAt);
 const fresh = rows.filter((r) => settingsAt !== null && String(r.started ?? "") >= settingsAt);
 console.log(`VERDICT: ${stale.length} sessions started before this project's settings/packages landed, so pi resolved the resource plane WITHOUT them and kept native compaction (${stale.reduce((n, r) => n + r.native, 0)} native compactions across them, 0 by hook); ${fresh.length} sessions started after it, and those committed ${fresh.reduce((n, r) => n + r.native, 0)} native compactions.`);
 console.log("VERDICT (what to do): a session that already resolved the plane cannot change mid-flight - start a new session (or --no-session) for a run that must not compact; the project settings and the package apply from the next session_start. This harness' own runs take the same rule: pi's settings cross into Harness.open, and pi-durable's compaction policy follows the settings, so a disabled switch is not overridden here.");
}

main().catch((err) => {
 console.error(String(err?.message ?? err));
 process.exitCode = 1;
});
