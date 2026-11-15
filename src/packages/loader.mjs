// src/packages/loader.mjs - load the pi packages that src/packages/discover.mjs found, using PI's own
// loader, and never a loader of ours.
//
// PROVENANCE: no Durian-Pi original for reaching pi's package plane as DATA. Durian-Pi's seats spawned
// the `pi` CLI as a child process (~/Git/Durian-Pi/src/job-object.mjs owns that spawn, `spawnInJob`), so
// pi's package plane lived inside that process and Durian-Pi never read it. The nearest thing Durian-Pi
// has is its pi-DURABLE extension loader (~/Git/Durian-Pi/src/extensions.mjs), which states the boundary
// this file crosses: a pi *coding-agent* extension 'is a different thing (slash commands, a TUI,
// project-trust prompts) and cannot load here'. This harness loads exactly that different thing, and the
// rows in src/packages/matrix.mjs name what does not map. This harness has no pi CLI, so the plane is reached through pi's own
// library exports instead - the same pinned package the CLI runs on. The three entry points used
// below are re-verified at this pin by `demo/packages.test.mjs` (which is why the demo, not a comment,
// is what names them); what is NOT used is pi's package MANAGER (`DefaultPackageManager.install`),
// which resolves packages from npm: installing needs the network, and every demo in this repo runs
// offline. A package already on disk is loaded; a package that is not is reported as absent by
// discover.mjs, which is the honest half of that contract.
//
// WHY PI'S LOADER AND NOT OURS: pi loads extension modules with jiti (its own `loader.ts`: "loads
// TypeScript extension modules using jiti"), against its own `ExtensionRuntime` whose action methods
// "are throwing stubs until runner.initialize()". Re-implementing either would mean pi extensions
// seeing a runtime that behaves differently from the one the `pi` CLI hands them - and the promise of
// a compatibility layer is that an extension cannot tell the difference at the boundary it was written
// against. What this harness adds is therefore only the mapping onto pi-durable's registry
// (src/packages/adapter.mjs) and the honesty about what cannot map.
import { DefaultResourceLoader, discoverAndLoadExtensions, loadProjectContextFiles, getAgentDir } from "@earendil-works/pi-coding-agent";

/**
 * pi's whole resource plane for one cwd: extensions, skills, prompt templates, themes, context files.
 *
 * `DefaultResourceLoader` is pi's own loader of the four kinds plus AGENTS.md-style context files
 * (`getExtensions/getSkills/getPrompts/getThemes/getAgentsFiles`), and it reports per-kind diagnostics
 * - which is where pi's own "a bad package warns and is skipped, it does not crash the session" rule
 * lives. A throw out of `reload()` is folded into the SAME shape as a per-kind failure rather than
 * propagating, because a session that refuses to start when one package is broken is exactly what the
 * contract forbids.
 */
export async function loadPiResources(cwd = process.cwd(), agentDir = getAgentDir(), additional = {}) {
 const warnings = [];
 // pi's own loader of the four kinds plus AGENTS.md-style context files, and the SAME instance answers
 // all of them: constructing one loader per kind would read the same package plane four times under four
 // different trust decisions, and pi's diagnostics would then disagree with each other.
 // `additional` carries pi's own option names (additionalExtensionPaths / additionalSkillPaths /
 // additionalPromptTemplatePaths / additionalThemePaths), which is how a harness points pi's loader at a
 // package layout that is not on either of pi's two planes - a fixture, or a vendored package tree.
 const loader = new DefaultResourceLoader({ cwd, agentDir, ...additional });
 let reloaded;
 try {
 reloaded = await loader.reload();
 } catch (err) {
 // @temp: pi's reload can throw on an unreadable settings file; folding it into the SAME warning shape
 // @temp: as a per-kind failure keeps a broken settings file from reading as "no packages installed" -
 // @temp: and keeps a broken package from reading as "no session", which the contract forbids.
 warnings.push({ path: agentDir, warning: `resource plane reload failed: ${err?.message ?? err}` });
 }
 const skills = loader.getSkills();
 const prompts = loader.getPrompts();
 const themes = loader.getThemes();
 return {
 cwd,
 agentDir,
 extensions: loader.getExtensions(),
 skills: skills.skills,
 skillDiagnostics: skills.diagnostics,
 prompts: prompts.prompts,
 promptDiagnostics: prompts.diagnostics,
 themes: themes.themes,
 themeDiagnostics: themes.diagnostics,
 agentsFiles: loader.getAgentsFiles().agentsFiles,
 systemPrompt: loader.getSystemPrompt(),
 appendSystemPrompt: loader.getAppendSystemPrompt(),
 warnings,
 };
}

/**
 * Load pi extension MODULES at explicit paths - what src/packages/discover.mjs found, narrowed to the
 * kind pi's loader takes.
 *
 * pi's `discoverAndLoadExtensions(configuredPaths, cwd, agentDir?)` loads through jiti against pi's own
 * ExtensionRuntime, and its result separates `errors` (a module that could not load) from `extensions`
 * (the ones that did). That separation is the contract: a bad package is a row the harness reports, not
 * an exception that closes the session. The `runtime` is returned too because an extension that needs
 * pi's runner actions would need them bound - and binding them is pi's runner's job, not ours.
 */
export async function loadPiExtensions(paths, cwd = process.cwd(), agentDir = getAgentDir()) {
 const result = await discoverAndLoadExtensions(paths, cwd, agentDir);
 return { extensions: result.extensions, errors: result.errors, warnings: result.warnings ?? [], runtime: result.runtime };
}

/**
 * Context files (AGENTS.md and its project variants) as pi reads them.
 *
 * Kept separate from `loadPiResources` because the harness needs these contents on the SYSTEM-PROMPT
 * side (src/packages/adapter.mjs renders them into a pi-durable `section`), while the resource loader
 * also reports them for its own UI - two consumers, one file read per call, and the option shape
 * ({cwd, agentDir}) is pi's own.
 */
export function loadContextFiles(cwd = process.cwd(), agentDir = getAgentDir()) {
 return loadProjectContextFiles({ cwd, agentDir });
}
