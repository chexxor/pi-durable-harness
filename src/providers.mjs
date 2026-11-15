// src/providers.mjs - the model plane: one registry, every provider this machine can address, and the
// reference rule that decides what a "provider/id" string means.
//
// PROVENANCE: extracted from ~/Git/Durian-Pi/src/providers/local.mjs (local OpenAI-compatible provider
// registration) and ~/Git/Durian-Pi/src/seatmodel.mjs (the "provider/id" disambiguation rule), read
// 2026-11-15 at pin v1.5.1. What changed: seats are gone, so a seat model string is just a model
// reference; the three local prefixes with their env plumbing collapse to one caller-supplied table;
// the rig spec, the D-5015 spend cap, and the price-key environment lookup are dropped (the spend
// ledger lives in src/spend.mjs).
//
// VENDOR DATA AND ITS LICENSE: the deepinfra model rows a harness registers are vendor catalogue data.
// The upstream project does not license that data with a package license here, so this file takes its
// rows from THIS MACHINE's own pi state (~/.pi/agent/models.json, ~/.pi/agent/cache/deepinfra-models.json)
// rather than copying a third-party catalogue into the project tree. Durian-Pi vendored pi-deepinfra's
// catalogue under MIT by puetsua (~/Git/Durian-Pi/src/providers/PROVENANCE.md,
// ~/Git/Durian-Pi/src/providers/LICENSE.pi-deepinfra); that copy stays where it is, and a harness that
// wants it reads it as a dependency, not as a second copy of the bytes.
//
// WHY pi-coding-agent's own composition is used instead of hand-built providers: the pinned
// node_modules/@earendil-works/pi-coding-agent/dist/core/model-runtime.d.ts declares
// `ModelRuntime.create(options)` with `allowModelNetwork` (default false) and `refreshOnCreate`
// ("Skip initial catalog and availability refresh. Static models remain available."), and
// dist/core/model-registry.d.ts declares `class ModelRegistry` with
// `registerProvider(providerName, config: ProviderConfigInput)` and `find(provider, modelId)`.
// That is pi's own models.json composition path, so a harness registers providers the same way pi
// does, and never invents a provider shape.

import { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { createModels, fauxProvider } from "@earendil-works/pi-ai";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";

/**
 * A provider table the caller can hand around: what to register, and which reference is the default.
 *
 * @temp: the local rows come from this machine's own models.json so the harness registers the
 * @temp: endpoints that actually exist here; a table we invented would claim endpoints we never
 * @temp: measured, which is the failure mode local.mjs records (a wrong local id answers with
 * @temp: whatever model the server already loaded, so a made-up id is invisible at the wire).
 */
export function machineProviderConfigs(agentDir = join(homedir(), ".pi", "agent")) {
	const modelsPath = join(agentDir, "models.json");
	const config = JSON.parse(readFileSync(modelsPath, "utf8"));
	const providers = config.providers ?? {};
	// pi's own shape: { name, baseUrl, api, apiKey, models: [{id, ...}], compat }. The harness passes it
	// through as ProviderConfigInput without renaming fields, so the composition rule stays pi's.
	return Object.entries(providers).map(([id, value]) => ({ id, config: value }));
}

/**
 * The deepinfra rows, read from THIS MACHINE's own cached catalogue (~/.pi/agent/cache/<provider>-models.json,
 * which pi's provider extension writes and re-reads offline - the extension's README says the cache exists
 * exactly so that "later startups register the full catalog instantly", with no API key required because
 * the catalogue is public).
 *
 * WHY THIS READS INSTEAD OF COPYING: a copy of pi-deepinfra's catalogue into this repo would be vendored
 * vendor data with its own license obligations - Durian-Pi does exactly that, and documents it
 * (~/Git/Durian-Pi/src/providers/PROVENANCE.md: "copies of files from pi-deepinfra v0.1.3, by puetsua,
 * MIT licensed", plus ~/Git/Durian-Pi/src/providers/LICENSE.pi-deepinfra, and it flags rows added by hand
 * as an undated claim). This harness takes no such copy: the rows come from the machine at runtime, and
 * the only claim made about them is the claim the file itself makes (`fetchedAt`).
 *
 * The row mapping follows pi-deepinfra's own mapping (upstream `models.ts`, whose copy Durian-Pi keeps at
 * ~/Git/Durian-Pi/src/providers/vendor/pi-deepinfra/deepinfra-models.ts): an OpenAI-style catalogue row
 * (`metadata.context_length`, `metadata.max_tokens`, `metadata.pricing`, vision tags) becomes pi's
 * `ProviderChatModelConfig` field names, and nothing here invents a price.
 */
export function cachedProviderConfigs(agentDir = join(homedir(), ".pi", "agent"), cacheName = "deepinfra") {
	const path = join(agentDir, "cache", `${cacheName}-models.json`);
	const cached = JSON.parse(readFileSync(path, "utf8"));
	const rows = cached?.data ?? [];
	const models = rows.map((row) => {
		const meta = row?.metadata ?? {};
		const pricing = meta?.pricing ?? {};
		const tags = meta?.tags ?? [];
		const hasVision = tags.includes("vision") || tags.includes("vlm");
		return {
			id: row.id,
			// @temp: pi-deepinfra falls back to a display name when the catalogue row has none; the row's
			// @temp: `id` is used here so a fallback never looks like a different model than it is.
			name: row?.name ?? row.id,
			api: "openai-completions",
			reasoning: Boolean(meta?.reasoning),
			input: hasVision ? ["text", "image"] : ["text"],
			contextWindow: meta?.context_length ?? 128000,
			maxTokens: meta?.max_tokens ?? 4096,
			// @temp: pi-ai's cost shape is per-million USD keyed input/output/cacheRead/cacheWrite; the
			// @temp: catalogue's own price fields are copied, not rescaled, because pi-ai's table is also
			// @temp: per-million - rescaling here would be a second opinion about the same number.
			cost: {
				input: pricing?.input_price ?? 0,
				output: pricing?.output_price ?? 0,
				cacheRead: pricing?.cache_read_tokens ?? 0,
				cacheWrite: pricing?.cache_write_tokens ?? 0,
			},
		};
	});
	return { id: cacheName, fetchedAt: cached?.fetchedAt ?? null, config: { name: cacheName, baseUrl: "https://api.deepinfra.com/v1/openai", api: "openai-completions", models } };
}

/**
 * Build the model plane: pi's Models runtime plus the faux provider, so an offline demo can answer
 * without credentials while still resolving real provider references.
 *
 * `allowModelNetwork: false` is the offline switch (ModelRuntime.create's own default) and `refreshOnCreate:
 * false` skips the create-time catalog/availability refresh; nothing here checks keys, so a model that the
 * registry knows resolves even unconfigured - which is what "resolves a model reference offline (no key
 * check)" means, and `registry.hasConfiguredAuth(model)` stays available for a caller that wants to know.
 */
export async function buildModels({ extra = [], defaultRef = null, offline = true } = {}) {
	const runtime = await ModelRuntime.create({ allowModelNetwork: false, ...(offline ? { refreshOnCreate: false } : {}) });
	const registry = new ModelRegistry(runtime);
	for (const entry of [...machineProviderConfigs(), ...extra]) registry.registerProvider(entry.id, entry.config);
	const faux = fauxProvider({ models: [{ id: "faux-1" }] });
	// The faux provider is registered as a pi-ai Models plane beside pi's own runtime, so a harness can
	// run a scripted turn without touching a real endpoint while still resolving real references.
	const plain = createModels();
	plain.setProvider(faux.provider);
	return { registry, plain, faux, defaultRef, providers: () => machineProviderConfigs().concat(extra.map((e) => ({ id: e.id, config: e.config }))).map((e) => e.id) };
}

/**
 * Resolve "provider/id" or a bare id, with the rule ~/Git/Durian-Pi/src/seatmodel.mjs records.
 *
 * Quoted from that file: model ids themselves contain slashes (`zai-org/GLM-5.3-Flash`), so a leading
 * segment counts as the provider ONLY when it names a provider actually registered in the registry;
 * otherwise the whole string is a model id under the default provider. Dropping the seat layer does
 * not drop the rule: it is what makes a typo fail by never resolving instead of silently answering
 * from the wrong endpoint.
 */
export function resolveModelRef(models, ref, defaultProvider = "faux", defaultModelId = "faux-1") {
	if (!ref) return { provider: defaultProvider, modelId: defaultModelId };
	const cut = ref.indexOf("/");
	if (cut > 0 && models.registry.getProvider(ref.slice(0, cut))) {
		return { provider: ref.slice(0, cut), modelId: ref.slice(cut + 1) };
	}
	return { provider: defaultProvider, modelId: ref };
}

/**
 * The Model object behind a reference, or `undefined` when the registry does not know it.
 *
 * @temp: this returns `undefined` instead of throwing, because pi-ai's Models plane answers the same
 * @temp: way (`models.getModel(provider, id)`); a caller that wants a hard failure checks the result,
 * @temp: exactly like pi's own resolver does.
 */
export async function lookupModel(models, ref, defaultProvider = "faux", defaultModelId = "faux-1") {
	const where = resolveModelRef(models, ref, defaultProvider, defaultModelId);
	const model = models.registry.find(where.provider, where.modelId) ?? models.plain.getModel(where.provider, where.modelId);
	return model ? { model, where } : undefined;
}
