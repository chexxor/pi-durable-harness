// src/agentplane.mjs - the plane an AGENT RUN actually gets: pi's settings, pi's provider plane, pi's
// packages (extensions, skills, prompt templates, themes, context files), and the pi-durable
// extensions built from them, handed to ONE openHarness call.
//
// PROVENANCE: this is the composition Durian-Pi does per seat, with the seat layer dropped. The three
// pieces it joins were separate there: ~/Git/Durian-Pi/src/config.mjs is that composition's config
// half (env wins, then a config file, then built-in defaults, and the resolved plane is what a run
// gets), ~/Git/Durian-Pi/src/seatmodel.mjs is its model half (the "{provider}/{modelId}" prefix rule,
// kept in src/providers.mjs), and ~/Git/Durian-Pi/src/extensions.mjs is its extension half (a list of
// trusted extension paths loaded into a registry, with the explicit note that "a pi *coding-agent*
// extension is a different thing ... and cannot load here"). What changed and why: the seat/rig layer
// around that composition is gone (one store per directory, no seats, no work queue, no broker, no
// genlock, no worktrees, no metrics, no check, no constitution, no selfdev), and pi's package plane
// - which Durian-Pi never read at all, because its seats ran the `pi` CLI as a child process and left
// pi's package plane inside that child - has NO Durian-Pi original: it is reached through pi's own
// exports in src/packages/{discover,loader,adapter}.mjs. The trust rule Durian-Pi states there is kept:
// only packages that are actually installed on pi's two planes are loaded, nothing is fetched.
//
// Symbols checked against the pinned dist of @earendil-works 1.5.1, not assumed:
//   - pi-coding-agent dist/core/settings.d.ts (via src/settings.mjs): SettingsManager reads global +
//     project settings.json;
//   - pi-ai dist/models.d.ts: `MutableModels.setProvider(provider)`, `Models.getModel(provider, id)`;
//   - pi-coding-agent dist/core/model-registry.d.ts: `ModelRegistry.getProvider(name): Provider|undef`;
//   - pi-durable dist/harness/types.d.ts: Harness.open takes `settings`, and the root conversation takes
//     an `agent` record (model, cwd, instructions, tools, thinkingLevel).
//
// WHY THE FAUX PLANE STAYS ARMED: buildModels() registers pi's machine providers into a ModelRegistry
// AND arms pi-ai's faux provider in the Models plane this file hands to Harness.open. A run that asks
// for a model whose provider has no credentials fails at pi-ai's auth layer with a named error, it does
// NOT quietly answer from the faux script - which is why `--faux` is the explicit offline verb rather
// than a fallback the harness performs behind a run's back.

import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { join, resolve } from "node:path";
import { defaultToolExtensions } from "./core.mjs";
import { piSettings, durableSettings, agentConfig, contextSections } from "./settings.mjs";
import { buildModels, resolveModelRef, machineProviderConfigs } from "./providers.mjs";
import { packageRoots, discoverPackages, extensionPaths, discoverLoose } from "./packages/discover.mjs";
import { loadPiResources, loadPiExtensions, loadContextFiles } from "./packages/loader.mjs";
import { adaptPiExtension, skillsExtension, contextFileExtension } from "./packages/adapter.mjs";

/**
* Compose the plane one run gets. `opts.offline` keeps pi's model runtime from refreshing (no network);
* a real provider still RESOLVES from pi's machine plane, it just cannot answer without credentials.
*
* `opts.packages` is pi's own opt-out vocabulary: `--no-extensions`, `--no-skills`, `--no-themes`,
* `--no-prompt-templates`, `--no-context-files` each stop one kind from being loaded, and every kind
* that was not loaded is reported in `skipped` so the run's own inventory names what it did not get
* rather than pretending the plane is empty.
*/
export async function agentPlane(opts = {}) {
	const cwd = resolve(opts.cwd ?? process.cwd());
	const agentDir = opts.agentDir ?? getAgentDir();
	const offline = opts.offline ?? true;
	const warnings = [];

	// pi's settings for this cwd: global then project, project winning (pi's OWN merge, via src/settings.mjs).
	const resolvedSettings = opts.settings === false ? null : piSettings({ cwd, agentDir });
	const mappedSettings = resolvedSettings
	? durableSettings(resolvedSettings.settings)
	: { settings: {}, unmapped: [] };
	warnings.push(...(resolvedSettings?.errors ?? []).map((e) => ({ scope: "settings", message: String(e?.message ?? e) })));

	// pi's provider plane: pi's machine configs (agent-dir providers + cached catalogs) registered into a
	// ModelRegistry, then copied into the pi-ai `Models` collection Harness.open drives, because that
	// collection is what answers a `ModelRef`. Copying is pi's own `ModelRegistry.getProvider` ->
	// `MutableModels.setProvider` pair, not a re-implementation of a provider.
	const runtime = await buildModels({ offline, defaultRef: opts.modelRef ?? null });
	const models = runtime.plain;
	for (const config of [...machineProviderConfigs(), ...(opts.extraProviders ?? [])]) {
		const provider = runtime.registry.getProvider(config.id);
		if (provider) models.setProvider(provider);
	}
	// Who names the model: an explicit `--model` always wins; pi's settings default applies only when the
	// caller says a REAL model may answer (opts.realModel), because an offline run that quietly took
	// pi's settings model would reach pi's provider endpoints - and the offline proof would be a lie.
	const settingsRef = resolvedSettings?.settings?.defaultProvider && resolvedSettings?.settings?.defaultModel
	? [resolvedSettings.settings.defaultProvider, resolvedSettings.settings.defaultModel].join("/")
	: null;
	const wantedRef = opts.modelRef ?? (opts.realModel ? settingsRef : null);
	const resolvedRef = wantedRef
	? resolveModelRef(runtime, wantedRef, opts.defaultProvider ?? "faux", opts.defaultModelId ?? "faux-1")
	: null;
	if (resolvedRef && !models.getModel(resolvedRef.provider, resolvedRef.modelId)) {
		// A ref that does not resolve is REPORTED, and the run keeps the ref it asked for: pi-ai's auth/generation
		// layer then says why it cannot answer. Silently substituting faux here is what makes a typo look like
		// a working session.
		warnings.push({ scope: "model", message: `${wantedRef} does not resolve against the providers this machine declares (${models.getProviders().map((p) => p.id).join(", ")})` });
	}
	if (!wantedRef && settingsRef) {
		warnings.push({ scope: "model", message: `pi's settings name ${settingsRef}, but this run did not ask for a real model (realModel): pi-ai's faux plane answers it, and the settings model is NOT substituted silently` });
	}

	// pi's resource plane: extensions, skills, prompt templates, themes, AGENTS.md-style context files.
	const kindsOff = opts.kindsOff ?? [];
	// pi's OWN opt-out vocabulary, in pi's own names (dist/core/resource-loader.d.ts
	// `DefaultResourceLoaderOptions`: noExtensions / noSkills / noPromptTemplates / noThemes /
	// noContextFiles). Telling the loader is not the same as filtering its answer afterwards: a kind the
	// loader was told to skip never enters the plane, so the run's inventory reports a kind pi did not
	// load rather than a harness-side filter hiding a kind pi did load.
	const loaderOff = {
		...(kindsOff.includes("extensions") || kindsOff.includes("all") ? { noExtensions: true } : {}),
		...(kindsOff.includes("skills") || kindsOff.includes("all") ? { noSkills: true } : {}),
		...(kindsOff.includes("prompts") || kindsOff.includes("all") ? { noPromptTemplates: true } : {}),
		...(kindsOff.includes("themes") || kindsOff.includes("all") ? { noThemes: true } : {}),
		...(kindsOff.includes("context") || kindsOff.includes("all") ? { noContextFiles: true } : {}),
	};
	const resources = await loadPiResources(cwd, agentDir, { ...(opts.additionalResourcePaths ?? {}), ...loaderOff });

	// pi's extension MODULES, loaded by pi's own loader and mapped onto pi-durable's registry by the
	// adapter. `offered`/`existingOf` come from the default tool extensions so a pi package that overrides
	// `bash` lands in pi-durable's wrap slot instead of replacing pi-durable's shell.
	const extensionLoad = { extensions: [], errors: [], paths: [], packages: [] };
	const piExtensionRecords = resources?.extensions?.extensions ?? [];
	const packagePlane = discoverPackages(packageRoots(cwd, agentDir, opts.extraRoots ?? []));
	extensionLoad.packages = packagePlane;
	if (piExtensionRecords.length && !kindsOff.includes("extensions")) {
		// pi's OWN loader already decided WHICH extension modules its packages carry (and reported a
		// per-kind diagnostic for the ones it could not read); this file only asks pi's module loader to
		// turn those same paths into loaded extensions, so no second discovery rule is invented here.
		const paths = piExtensionRecords.map((entry) => entry.resolvedPath ?? entry.path).filter(Boolean);
		extensionLoad.paths = paths;
		const loaded = await loadPiExtensions(paths, cwd, agentDir);
		extensionLoad.extensions = loaded.extensions;
		extensionLoad.errors = loaded.errors;
	}

	const defaults = await defaultToolExtensions(opts.toolOptions ?? {});
	const offeredOf = {};
	for (const extension of defaults) for (const tool of extension.tools ?? []) offeredOf[tool.name] = tool;

	const inventory = [];
	const registrationRows = piRegistrationsOf(extensionLoad.extensions);
	const durableExtensions = [];
	for (const extension of extensionLoad.extensions) {
		const adapted = adaptPiExtension(extension, {
				// pi packages are namespaced by path: two packages naming their extension the same way must not
				// replace each other inside pi-durable's registry (install replaces by extension name).
				name: `pi:${extension.path}`,
				inventory,
				offered: Object.keys(offeredOf),
				existingOf: (name) => offeredOf[name],
			});
		durableExtensions.push(adapted.extension);
		inventory.push(...adapted.inventory);
	}
	if (resources.skills?.length) durableExtensions.push(skillsExtension(resources.skills));
	// pi's context files (AGENTS.md and its project variants) are one kind the loader can be told to skip,
	// and the SAME skip reaches the system-prompt side; loading them regardless would make --no-context-files
	// a lie.
	const contextFiles = loaderOff.noContextFiles ? [] : loadContextFiles(cwd, agentDir);
	if (contextFiles.length) durableExtensions.push(contextFileExtension(contextFiles, cwd));

	// The AGENT record pi's settings + the CLI's --model spell for pi-durable's root conversation.
	// pi's settings keys that NAME a model reach agentConfig only when a real model may answer;
	// the rest of pi's settings (thinking level, tools, compaction) always apply.
	const settingsForAgent = {
		...(resolvedSettings?.settings ?? {}),
		...(!opts.realModel && !opts.modelRef ? { defaultProvider: undefined, defaultModel: undefined } : {}),
	};
	const agentConfigured = agentConfig(settingsForAgent, {
			cwd,
			models: runtime,
			...(opts.instructions ? { instructions: opts.instructions } : {}),
		});
	const agentRecord = {
		...agentConfigured.agent,
		...(agentConfigured.agent?.model ? {} : { model: { provider: "faux", modelId: "faux-1" } }),
	};


	return {
		cwd,
		agentDir,
		settings: mappedSettings.settings,
		settingsUnmapped: mappedSettings.unmapped,
		settingsRaw: resolvedSettings?.settings ?? {},
		// pi's `theme` setting (docs/themes.md: "The selection is saved as the `theme` setting"),
		// so the surface that paints can colour its rows with pi's palette rather than its own.
		themeName: resolvedSettings?.settings?.theme ?? null,
		settingsPaths: resolvedSettings?.paths ?? null,
		models,
		modelRuntime: runtime,
		// pi-ai's faux provider this plane armed, handed on so the surface that SCRIPTS an
		// offline turn (cli.mjs, src/cli-intent.mjs) scripts against the SAME provider this plane holds.
		modelFaux: runtime.faux,
		modelRef: resolvedRef,
		agent: agentRecord,
		agentRefused: agentConfigured.refused,
		resources,
		contextFiles,
		durableExtensions,
		inventory,
		registrations: splitRegistrations(registrationRows),
	piCommands: registrationRows,
		packages: extensionLoad.packages,
		extensionPaths: extensionLoad.paths,
		extensionErrors: extensionLoad.errors,
		offered: Object.keys(offeredOf),
		skipped: kindsOff,
		warnings,
	};
}

/** One line per plane element, for a run's own status output and for a demo's evidence block. */
export function describePlane(plane = {}) {
	const r = plane?.resources ?? {};
	return [
		`settings: ${Object.keys(plane?.settingsRaw ?? {}).join(",") || "none"}`,
		`providers: ${plane?.models?.getProviders()?.map((p) => p.id)?.join(",") || "faux only"}`,
		`extensions: ${r.extensions?.length ?? 0} pi module(s), errors ${plane?.extensionErrors?.length ?? 0}`,
		`skills: ${r.skills?.length ?? 0} themes: ${r.themes?.length ?? 0} prompt templates: ${r.prompts?.length ?? 0}`,
		`context files: ${plane?.contextFiles?.length ?? 0} -> pi-durable sections`,
		`installed pi-durable extensions: ${(plane?.durableExtensions ?? []).map((e) => e.name).join(",")}`,
	];
}

/** Does a discovered pi package answer one of pi\'s documented verbs (a command/shortcut/flag)?
 * One row per registration, with pi\'s own reason for why this harness lists it instead of running it:
 * pi\'s command/shortcut/flag verbs belong to pi\'s CLI surface, which this harness\'s own CLI does not
 * share - the row is what makes the inventory honest rather than a quiet drop.
 */
export function piRegistrationsOf(extensions = []) {
	const rows = [];
	for (const extension of extensions) {
		for (const [field, why] of [
			["commands", "pi invokes this command inside pi\'s CLI (a slash command with pi\'s argument parsing); this harness has no command plane, so the verb is listed and refused by name"],
			["shortcuts", "pi binds keyboard shortcuts to its own TUI input loop; this harness reads pi-tui components for its TUI and does not re-implement pi\'s shortcut table"],
			["flags", "pi reads CLI flags in pi\'s arg parser; a pi package flag would be a second parser, so the flag is listed and refused by name"],
		]) {
			const value = extension[field];
			const names = value instanceof Map ? [...value.keys()] : Array.isArray(value) ? value.map((entry) => entry?.name ?? String(entry)) : [];
			for (const name of names) rows.push({ field, name, source: extension.path, reason: why });
		}
	}
	return rows;
}

/** Split one flat inventory of pi registrations into the per-kind lists a run reports. */
export function splitRegistrations(rows = []) {
	return {
		commands: rows.filter((row) => row.field === "commands"),
		shortcuts: rows.filter((row) => row.field === "shortcuts"),
		flags: rows.filter((row) => row.field === "flags"),
	};
}
