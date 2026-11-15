// src/packages/discover.mjs - find the pi packages that exist on THIS machine, without pi's CLI.
//
// PROVENANCE: no Durian-Pi original. Durian-Pi's seats ran the `pi` CLI (src/seatrun.mjs), so pi's
// package plane lived inside that process and Durian-Pi never read it. This file therefore re-derives
// the plane from pi's OWN documented layout at this pin, read from two agreeing places:
// node_modules/@earendil-works/pi-coding-agent/dist/core/package-manager.d.ts (`ResolvedPaths`,
// `ConfiguredPackage`, `PackageInstallFailure`) and the packages actually installed on this machine,
// whose package.json `pi` manifests were read on 2026-11-15 (`{"pi":{"themes":["./themes"],"extensions":
// ["./extensions"]}}` for awesome-pi-themes, `{"pi":{"extensions":["./index.ts"]}}` for pi-deepinfra,
// `{"pi":{"extensions":["extensions/goal.ts"]}}` for pi-goal-x). A layout remembered rather than
// re-read is exactly the kind of claim this harness refuses to make, which is why the demo, not a
// comment, is what pins the shape.
//
// WHY DISCOVERY IS OURS AND LOADING IS PI'S: pi-durable has no package plane - its registry takes
// extensions, not packages - and pi's package MANAGER resolves from npm, which needs the network, and
// every demo in this repo runs offline. So the harness finds what is ALREADY on disk and hands pi's own
// loader the paths (src/packages/loader.mjs). Installing a package that is not on disk stays pi's job,
// reported as such in docs/package-support.md rather than half-implemented here.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

// pi owns these two names: `getAgentDir()` is where the user plane lives (and honors PI_CODING_AGENT_DIR,
// which is what lets a demo point at an isolated agent directory), and `CONFIG_DIR_NAME` is the project
// plane's directory (".pi"). Importing them rather than hardcoding ".pi" keeps this scan on the same two
// planes pi's own package manager reads.
import { getAgentDir, CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";

// The manifest kinds this file knows. A kind pi adds later is NOT silently dropped: it lands in
// `unknownKinds` and becomes a row in the capability inventory, which is what keeps a new pi kind from
// reading as "unsupported forever, because this file was never updated".
const KNOWN_KINDS = ["extensions", "skills", "prompts", "themes"];

/**
 * Where pi looks for installed packages: its two planes, plus anything a caller points at.
 *
 * pi keeps installed packages under `<dir>/npm/node_modules` on BOTH planes - the user plane (the agent
 * directory) and the project plane (`<cwd>/.pi/npm/node_modules`). The project plane is where this
 * workspace's own `.pi/settings.json` packages installed, so a harness run sees the packages the `pi`
 * CLI already installed for it: the point of a compatibility layer is the user's existing ecosystem,
 * not a copy of it.
 */
export function packageRoots(cwd = process.cwd(), agentDir = getAgentDir(), extraRoots = []) {
 // The plane is decided by WHICH root this is, not by a substring of the path: pi's user plane is
 // `<agentDir>/npm/node_modules`, and the default agentDir is `~/.pi/agent` - which CONTAINS ".pi", so
 // a substring test on CONFIG_DIR_NAME would call every user package a project package.
 const projectRoot = join(cwd, CONFIG_DIR_NAME, "npm", "node_modules");
 const roots = [{ root: join(agentDir, "npm", "node_modules"), plane: "user" }, { root: projectRoot, plane: "project" },
...extraRoots.map((root) => ({ root, plane: "extra" }))];
 return roots.filter((entry) => existsSync(entry.root));
}

/**
 * One directory's package.json, or undefined if it is not a package.
 *
 * Returning undefined rather than throwing is the whole function: pi's own node_modules trees hold `.bin`,
 * `.package-lock.json`, and a README beside the packages, and calling those "broken packages" would turn
 * every scan into a wall of noise. A directory that HAS a package.json that cannot be parsed is different,
 * and that difference is what the `error` row below is for.
 */
function readManifest(dir) {
 const manifestPath = join(dir, "package.json");
 if (!existsSync(manifestPath)) return undefined;
 try {
 return JSON.parse(readFileSync(manifestPath, "utf8"));
 } catch (err) {
 return { error: `unreadable package manifest: ${err?.message ?? err}` };
 }
}

/**
 * Every package under those roots, with its declared kinds resolved to absolute paths.
 *
 * Two levels deep, not one: npm scopes a name, so `pi-goal-x` and `@woksin/pi-context-budget` sit at
 * different depths under the SAME root, and a one-level scan would call the scope directory a package.
 * A declared path that is not on disk stays a `missing` row rather than being dropped, because "this
 * capability is not here" is a claim the matrix must not make on evidence that an install failure, not
 * an absent package, is what produced it.
 */
export function discoverPackages(roots = packageRoots()) {
 const found = [];
 const missing = [];
 for (const plane_root of roots) {
 let read = [];
 try {
 read = readdirSync(plane_root.root);
 } catch (err) {
 // @temp: "no packages" and "we could not look" are different answers, and only one of them is safe
 // @temp: to build a capability claim on - so a root that cannot be read is a row, not an empty list.
 missing.push({ package: plane_root.root, kind: "root", path: plane_root.root, reason: `unreadable package root: ${err?.message ?? err}` });
 continue;
 }
 // A root can BE a package (a package tree a caller pointed at directly), in which case there is
 // nothing to enumerate. pi's node_modules layout is the other case: each entry is a package, or a
 // scope directory (`@scope/name`) one level deeper - and a one-level scan would call the scope
 // directory itself a package, which is what the "@"/readdir branch below is for.
 const asPackage = readManifest(plane_root.root);
 const dirs = asPackage ? [plane_root.root] : read.flatMap((name) => name.startsWith("@") ? readdirSync(join(plane_root.root, name)).map((scope) => join(plane_root.root, name, scope)) : [join(plane_root.root, name)]);
 for (const dir of dirs) {
 const manifest = readManifest(dir);
 // A directory with no package.json is not a package, and pi's own trees prove that is normal: the
 // same roots hold `.bin`, `.package-lock.json`, and README files beside the packages.
 if (!manifest) continue;
 if (manifest.error) {
 missing.push({ package: dir.split("/").pop(), kind: "manifest", path: dir, reason: manifest.error });
 continue;
 }
 const kinds = manifest.pi ?? {};
 const row = {
 package: manifest.name ?? dir.split("/").pop(),
 version: manifest.version,
 root: dir,
 plane: plane_root.plane,
 declared: kinds,
 resolved: {},
 };
 for (const [kind, value] of Object.entries(kinds)) {
 const paths = (Array.isArray(value) ? value : [value]).filter((v) => typeof v === "string");
 if (!KNOWN_KINDS.includes(kind)) {
 missing.push({ package: row.package, kind: `unknown:${kind}`, path: paths.join(", "), reason: "a manifest kind this file does not know; kept rather than dropped" });
 continue;
 }
 row.resolved[kind] = paths.map((rel) => {
 const absolute = resolve(dir, rel);
 // A kind the manifest declares that is not on disk stays a row: "this capability is absent" must
 // not be concluded from an install failure that left the directory out.
 if (!existsSync(absolute)) missing.push({ package: row.package, kind, path: absolute, reason: "declared by the manifest, not on disk" });
 return { rel, absolute };
 }).filter((entry) => existsSync(entry.absolute));
 }
 found.push(row);
 }
 }
 return { found, missing };
}

/**
 * The extension MODULE paths a scan can hand pi's loader, flattened across packages and planes.
 *
 * A declared extension path may be a directory (awesome-pi-themes declares `./extensions`) or a single
 * module (pi-deepinfra declares `./index.ts`, pi-goal-x `extensions/goal.ts`) - both appear on this
 * machine, so both are expanded here and pi's loader decides which files are extensions. A directory is
 * expanded one level deep only, which is the depth the real layouts use.
 */
export function extensionPaths(discovered = discoverPackages()) {
 const paths = [];
 for (const row of discovered.found) {
 for (const entry of row.resolved.extensions ?? []) {
 if (existsSync(join(entry.absolute, "package.json"))) continue;
 if (entry.absolute.endsWith(".ts") || entry.absolute.endsWith(".js") || entry.absolute.endsWith(".mjs")) {
 paths.push(entry.absolute);
 continue;
 }
 try {
 const files = readdirSync(entry.absolute);
 for (const file of files) {
 const candidate = join(entry.absolute, file);
 if (candidate.endsWith(".ts") || candidate.endsWith(".js") || candidate.endsWith(".mjs")) paths.push(candidate);
 }
 } catch (err) {
 discovered.missing.push({ package: row.package, kind: "extensions", path: entry.absolute, reason: `unreadable extension directory: ${err?.message ?? err}` });
 }
 }
 }
 return paths;
}

/**
 * The bare (non-package) pi resource directories, which pi accepts on both planes.
 *
 * This is not a courtesy: pi's `pi` CLI honors a hand-written `extensions/` or `themes/` directory under
 * `.pi/` with no package manifest at all, so a user's loose extension folder works there and must work
 * here. `loadProjectContextFiles` covers the context-file half of the same question, and it is pi's own
 * (src/packages/loader.mjs re-exports the call), so context files are read once, by pi, not twice here.
 */
export function discoverLoose(cwd = process.cwd(), agentDir = getAgentDir()) {
 const scan = (dir, plane) => KNOWN_KINDS
		.map((kind) => ({ plane: plane_root.plane, kind, path: join(dir, kind) }))
		.filter((row) => existsSync(row.path));
 return [...scan(cwd, "project"), ...scan(agentDir, "user")];
}
