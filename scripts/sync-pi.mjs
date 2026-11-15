#!/usr/bin/env node
/* scripts/sync-pi.mjs - extract, not a copy.
 * Source: ~/Git/Durian-Pi/scripts/sync-pi.mjs (943 lines) at pin v1.5.1, 2026-11-10.
 * Taken: pin-a-TAG policy, resolveRef that refuses unknown refs, the PIN|DECLARED|RESOLVED report,
 * drift on every run, dependencySet classification, --link/--unlink.
 * Dropped: the vendored-build plumbing (Durian-Pi floats on main between tags; here the pin IS an
 * npm release) and every durig_* seat/worktree concept.
 */
import { existsSync, readFileSync, writeFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(import.meta.url);
const ROOT = resolve(join(dirname(HERE), ".."));
const PIN_PATH = join(ROOT, "pi-main.pin.json");
const VENDOR = join(ROOT, "vendor", "pi-main");
const FLAGS = ["--report", "--sync", "--update", "--observe", "--link", "--unlink", "--offline"];

// --offline is a REPORT mode: no verb that reaches upstream runs in it. Module-level because
// upstreamRefs() is called by driftReport and by --update/--observe, and all of them have to answer
// the same question - "did this run contact upstream?" - without threading a flag through each call.
let offline = false;

function sh(cmd, args, cwd) {
	// @temp: read-only inspection; a failure is data so a report can still answer without upstream.
	// @temp: the shape {status, stdout, stderr} is the only shape sh gives, so callers ask two things.
	try {
		return { status: 0, stdout: execFileSync(cmd, args, { cwd, encoding: "utf8" }).trim(), stderr: "" };
	} catch (err) {
		// @temp: status 1 means "the tool said no", and every caller names what it could not do.
		return { status: err?.code ?? 1, stdout: String(err?.stdout ?? ""), stderr: String(err?.stderr ?? err?.message ?? err) };
	}
}

export function readPin() {
	if (!existsSync(PIN_PATH)) throw new Error(`no pi-main.pin.json at ${PIN_PATH}`);
	const pin = JSON.parse(readFileSync(PIN_PATH, "utf8"));
	for (const key of ["repo", "sha", "packages"]) {
		if (!pin[key]) throw new Error(`pi-main.pin.json names no ${key}`);
	}
	// PIN POLICY (Durian-Pi #5093/#5094): we pin a TAG, we do not float on main.
	// A sha-only pin cannot be aged or argued with, so it is a finding, not a pass.
	if (pin.refType !== "tag" || !pin.ref) {
		throw new Error(`pi-main.pin.json must pin a TAG; it says ref=${pin.ref ?? "none"} refType=${pin.refType ?? "none"}`);
	}
	for (const pkg of pin.packages) {
		if (!pkg.name || !pkg.dir) throw new Error(`pi-main.pin.json names a package with no name/dir (${JSON.stringify(pkg)})`);
	}
	// @temp: readPin is called by every verb except --unlink, which restores code without a pin.
	return pin;
}

function parseArgs(argv) {
	const args = { ref: null };
	for (const a of argv) {
		// Unknown flags throw rather than becoming refs, so a typo cannot move a validated pin.
		if (a.startsWith("--")) {
			if (!FLAGS.includes(a)) throw new Error(`unknown flag ${a}; the verbs are ${FLAGS.join(" ")}`);
			args[a.slice(2)] = true;
			continue;
		}
		// --update and --observe take at most one ref, and nothing else takes a positional.
		// @temp: a second positional is refused rather than ignored, so a stray word cannot hide.
		if (args.ref) throw new Error(`--update takes at most one ref; got ${JSON.stringify([args.ref, a])}`);
		args.ref = a;
	}
	// @temp: --report with a ref leaves the ref unused, which is honest: report reads the pin only.
	// @temp: the pin is read back from disk after any write, so the report never sees memory.
	// @temp: no remembered state is the file's rule, and it is why drift is re-derived each run.
	// @temp: re-derived drift cannot be stale, which was the 16-day silence's whole cause.
	// @temp: the cause was a surface nobody had to look at, so the default verb prints drift too.
	return args;
}

/** Upstream's refs from `git ls-remote`: tags as {kind:"tag"}, branches as {kind:"head"}. */
export function parseRefs(stdout) {
	const out = [];
	for (const line of String(stdout).split("\n")) {
		if (!line.trim()) continue;
		const [sha, ref] = line.split("\t");
		if (ref === "HEAD") out.push({ sha, kind: "head", name: "main" });
		// Annotated tags publish refs/tags/X and refs/tags/X^{}; both stay, so resolveRef can
		// tell a tag object from the commit behind it, and a pin's sha is the commit.
		else if (ref.startsWith("refs/tags/")) out.push({ sha, kind: "tag", name: ref.slice(10) });
		// Pull refs and fork heads cannot become pins, so they are not offered as alternatives:
		// a name a user picks from the list has to work when typed back.
		// @temp: only refs/heads/ and refs/tags/ can be a pin here, which is the whole offer.
		else if (ref.startsWith("refs/heads/")) out.push({ sha, kind: "head", name: ref.slice(11) });
	}
	// @temp: an empty list is a fact about the query; the caller prints unknown, never zero.
	return out;
}

/** Upstream's ref list, or null when upstream is unreachable - the caller decides what null means. */
export function upstreamRefs(pin) {
	// No branch means no ref to measure against. Inventing "main" would guess upstream's default,
	// so the answer is null and the drift line says what to fix (`--update <tag>`).
	if (!pin.branch) return null;
	// --offline means upstream was NOT contacted: the same null answer as an unreachable upstream,
	// and driftReport says which of the two nulls this is, so an offline report never reads as "current".
	if (offline) return null;
	const res = sh("git", ["ls-remote", pin.repo], ROOT);
	// A failed ls-remote means "cannot compare". Reporting no drift here would claim the pin is
	// current on the day upstream is hundreds of commits ahead - the silence this rig exists to
	// make impossible, so null is the only honest answer.
	if (res.status !== 0) return null;
	// @temp: status 0 with no lines is also unknown, since nothing can be counted against it.
	// @temp: one network call per report is the design: --report must not fetch more than this.
	// @temp: must not fetch more, so a demo asserting offline-ness can assert zero calls too.
	return parseRefs(res.stdout);
}

export function resolveRef(entries, ref, repoLabel = "the pinned repo") {
 const wanted = String(ref).trim();
 if (!wanted) throw new Error("resolveRef takes a ref; got empty");
 if (/^[0-9a-f]{40}$/i.test(wanted)) return { sha: wanted.toLowerCase(), refType: "sha", ref: null };
 const matches = entries.filter((r) => r.name === wanted);
 if (matches.length > 1) {
  const shas = matches.map((r) => r.sha);
  throw new Error(`${repoLabel} has both a tag and a branch ${JSON.stringify(wanted)} (shas ${shas.join(" / ")}); pin the sha you mean`);
 }
 if (matches.length === 1) return { sha: matches[0].sha, refType: matches[0].kind, ref: wanted };
 const tags = entries.filter((r) => r.kind === "tag").map((r) => r.name).filter((n) => !n.includes("^{"));
 // Branch heads are bounded too: upstream has ~100 of them, and an unbounded list would bury
 // the one typo the message exists to fix. Only the pinned branch is a useful head here.
 const pinned = entries.filter((r) => r.kind === "head").map((r) => r.name).slice(0, 3);
 const known = [...new Set([...tags.slice(-12).reverse(), ...pinned])].join(", ");
 throw new Error(`resolveRef cannot find ${JSON.stringify(wanted)} in ${repoLabel}; the refs it knows are ${known} - a ref that does not exist fails here rather than pinning the branch tip`);
}

function applyTagPin(pin, resolved) {
 const next = { ...pin, sha: resolved.sha, ref: resolved.ref, refType: resolved.refType };
 return next;
}

export function describePinRef(pin) {
 if (pin.refType === "tag") return `tag ${JSON.stringify(pin.ref)} (${String(pin.sha).slice(0, 12)})`;
 if (pin.refType === "head") return `branch ${JSON.stringify(pin.ref)} (${String(pin.sha).slice(0, 12)})`;
 return `sha ${String(pin.sha).slice(0, 12)}`;
}

export function pinVersion(pin) {
 const m = String(pin?.ref ?? "").match(/^v?(\d+\.\d+\.\d+)/);
 return m ? m[1] : null;
}

export function dependencySet(pin) {
 const linked = [];
 for (const pkg of pin.packages) {
  const entry = join(ROOT, "node_modules", ...pkg.name.split("/"));
  let real;
  try { real = realpathSync(entry); } catch { continue; }
  if (real !== join(VENDOR, pkg.dir)) continue;
  linked.push(pkg.name);
 }
 if (linked.length === pin.packages.length) return { set: "built-pin", linked };
 if (linked.length > 0) return { set: "mixed", linked };
 const installed = pin.packages.some((pkg) => existsSync(join(ROOT, "node_modules", ...pkg.name.split("/"))));
 return { set: installed ? "lockfile-released" : "not-installed", linked };
}

export function declaredPlane(pin) {
 const expected = pinVersion(pin);
 const pkgPath = join(ROOT, "package.json");
 const lockPath = join(ROOT, "package-lock.json");
 const deps = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, "utf8")).dependencies ?? {} : {};
 const lock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, "utf8")).packages ?? {} : {};
 const rows = pin.packages.map((pkg) => ({
  name: pkg.name,
  declared: deps[pkg.name] ?? null,
  resolved: lock[`node_modules/${pkg.name}`]?.version ?? null,
 }));
 const mismatches = expected
  ? rows.filter((r) => (r.declared !== null && r.declared !== expected) || (r.resolved !== null && r.resolved !== expected))
  : [];
 const verdict = mismatches.length
  ? `PLANE DRIFT: the pin is ${pin.ref}, so these must resolve ${expected}, but ${mismatches.map((m) => `${m.name}: declared ${m.declared ?? "(undeclared)"}, lock resolves ${m.resolved ?? "(nothing)"}`).join("; ")} - declare them at ${expected} and npm install to refresh the lock`
  : expected
   ? `the declared plane agrees with the pin: ${rows.length} packages, all resolving ${expected}`
   : `the pin names no version ref (${pin.sha}), so the declared plane cannot be compared with it`;
 return { expected, checked: rows.length, mismatches, rows, verdict };
}

export function tagVersion(name) {
 const m = String(name).match(/^v?(\d+)\.(\d+)\.(\d+)/);
 return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function cmpVersion(a, b) {
 for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
 return 0;
}

export function driftReport(pin) {
 // --offline is its own answer, not "cannot compare": a report that said "no drift" here would claim the pin
 // is current on evidence that was never gathered, and "cannot compare" would read like a broken rig.
 if (offline) {
 return { lines: [`DRIFT: not measured this run (--offline): ${pin.repo} was NOT contacted, so the pin is neither current nor stale on this evidence - run without --offline to measure it`], unknown: true, offline: true };
 }
 const refs = upstreamRefs(pin);
 if (refs === null) return { lines: [`DRIFT: cannot compare against ${pin.repo} - the pin is UNVERIFIED against upstream, not current`], unknown: true };
 if (!pin.branch) return { lines: ["DRIFT: cannot compare - pi-main.pin.json names no branch; `--update <tag>` adds one"], unknown: true };
 const tip = refs.find((r) => r.kind === "head" && r.name === pin.branch);
 if (!tip) return { lines: [`DRIFT: cannot compare - ${pin.repo} has no branch ${JSON.stringify(pin.branch)}`], unknown: true };
 // Counts are tags, not commits: this tree has no upstream history, and a commit count here
// would be a number a reader cannot check.
 const pinV = tagVersion(pin.ref);
 const names = refs.filter((r) => r.kind === "tag" && !r.name.includes("^{")).map((r) => r.name);
 const newer = pinV ? names.filter((t) => tagVersion(t) && cmpVersion(tagVersion(t), pinV) > 0) : [];
 const newest = newer.sort((a, b) => cmpVersion(tagVersion(a), tagVersion(b)));
 const days = pin.pinnedAt ? Math.max(0, Math.floor((Date.now() - new Date(pin.pinnedAt).getTime()) / 86400000)) : 0;
 if (tip.sha === pin.sha) return { lines: [`DRIFT: pin ${describePinRef(pin)} is upstream's tip ${pin.branch} ${tip.sha}; the pin is ${days} day(s) old`], unknown: false };
 return {
  lines: [
   `DRIFT: pin ${describePinRef(pin)} is ${newest.length} published tag(s) behind upstream's tip ${pin.branch} ${tip.sha}; the pin is ${days} day(s) old`,
   `DRIFT: tags since the pin: ${newest.slice(-6).join(", ") || "(none)"} - pinning "the tip" would be an unreviewed checkpoint, so name one: --update ${newest.length ? newest[newest.length - 1] : tip.sha}`,
  ],
  unknown: false,
 };
}

export function reportLines(pin) {
 const plane = declaredPlane(pin);
 const dep = dependencySet(pin);
 const bad = plane.rows.filter((r) => r.resolved !== plane.expected);
 const fallback = plane.expected && (plane.mismatches.length || dep.set === "not-installed")
  ? `LOUD FALLBACK: node_modules does not resolve ${plane.expected} for every pinned package (${bad.map((r) => `${r.name}=${r.resolved ?? "absent"}`).join(", ")}) while the pin is ${describePinRef(pin)} - a suite verdict from here is not a verdict about the pin`
  : null;
 const allAt = plane.expected && plane.rows.every((r) => r.resolved === plane.expected);
 const lines = [
  `PIN ${describePinRef(pin)} (pinned ${pin.pinnedAt ?? "?"})`,
  `DECLARED ${plane.verdict}`,
  `RESOLVED ${allAt ? `all ${plane.rows.length} pinned packages at the pin's release ${plane.expected}` : "the pinned packages do not all resolve one version"}`,
  ...plane.rows.map((r) => `  ${r.name.padEnd(32)} pin=${plane.expected ?? "-"} declared=${r.declared ?? "-"} resolved=${r.resolved ?? "absent"} via=${dep.set}`),
  ...(fallback ? [fallback] : []),
 ];
 return { plane, dep, fallback, lines };
}

function out(payload) {
 console.log(JSON.stringify(payload, null, 2));
}

function main(argv) {
 const args = parseArgs(argv);
 offline = Boolean(args.offline);
 if (args.offline && (args.sync || args.update || args.observe || args.link)) {
  throw new Error("--offline refuses the verbs that reach upstream (--sync/--update/--observe/--link); offline is a report mode only");
 }
 if (args.unlink) {
  const r = sh("npm", ["install"], ROOT);
  out({ ok: r.status === 0, command: "sync-pi", action: "unlink", dependencies: "released packages", warning: "--unlink is NOT a rollback: it restores the RELEASED packages, and a released pi-durable cannot open a store migrated past the schema it understands. Rollback = restore a backup." });
  return;
 }
 let pin = readPin();
 if (args.update) {
  if (!args.ref) throw new Error("--update needs a ref (prefer a TAG): the branch tip is not a reviewed checkpoint");
  const refs = upstreamRefs(pin);
  if (!refs) throw new Error(`cannot reach ${pin.repo} to resolve ${JSON.stringify(args.ref)}; sync-pi moves a pin only to a ref it actually read`);
  const resolved = resolveRef(refs, args.ref, pin.repo);
  if (resolved.refType !== "tag") throw new Error(`--update refuses a ${resolved.refType} pin (${describePinRef(resolved)}); the policy is pin a TAG, so name one of the tags ls-remote lists`);
  pin = applyTagPin(pin, resolved);
  writeFileSync(PIN_PATH, `${JSON.stringify(pin, null, 2)}\n`);
 }
 if (args.observe) {
  const refs = upstreamRefs(pin);
  if (!refs) throw new Error(`cannot reach ${pin.repo} to observe ${JSON.stringify(args.ref ?? pin.branch)}; --observe records an observation it actually made`);
  const observed = args.ref ? resolveRef(refs, args.ref, pin.repo) : refs.find((r) => r.kind === "head" && r.name === pin.branch);
  if (!observed) throw new Error(`cannot observe upstream's tip: ${pin.repo} has no branch ${JSON.stringify(pin.branch)}`);
  pin = { ...pin, observedUpstream: { sha: observed.sha, ref: observed.ref, refType: observed.refType, observedAt: new Date().toISOString() } };
  writeFileSync(PIN_PATH, `${JSON.stringify(pin, null, 2)}\n`);
 }
 if (args.sync && !existsSync(join(VENDOR, ".git"))) {
  const r = sh("git", ["clone", "--depth", "1", "--branch", pin.ref, pin.repo, VENDOR], ROOT);
  if (r.status !== 0) throw new Error(`--sync could not clone ${pin.ref} from ${pin.repo}: ${r.stderr}`);
 }
 if (args.link) {
  if (!existsSync(join(VENDOR, ".git"))) throw new Error(`--link needs the vendored build; run --sync first`);
  const specs = pin.packages.map((pkg) => `${pkg.name}@file:${join(VENDOR, pkg.dir)}`);
  const r = sh("npm", ["install", "--no-save", ...specs], ROOT);
  if (r.status !== 0) throw new Error(`--link could not point node_modules at the build: ${r.stderr}`);
 }
 // The pin is read back from disk after any write, so "built" cannot mean two different things.
 pin = readPin();
 const rep = reportLines(pin);
 const drift = driftReport(pin);
 for (const line of rep.lines) console.log(line);
 for (const line of drift.lines) console.log(line);
 out({ ok: true, command: "sync-pi", pin: describePinRef(pin), pinSha: pin.sha, ref: pin.ref, refType: pin.refType, declared: rep.plane.verdict, resolved: rep.dep.set, fallback: rep.fallback, drift: drift.offline ? "offline" : drift.unknown ? "unknown" : "measured" });
 process.exitCode = rep.plane.mismatches.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
 try {
  main(process.argv.slice(2));
 } catch (err) {
  console.log(JSON.stringify({ ok: false, command: "sync-pi", error: String(err?.message ?? err) }, null, 2));
  process.exitCode = 1;
 }
}
