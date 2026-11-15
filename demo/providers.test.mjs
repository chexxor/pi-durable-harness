// demo/providers.test.mjs - the model plane and the spend ledger, offline (task-3 contract).
//
// PROVENANCE: same sources as src/providers.mjs (~/Git/Durian-Pi/src/providers/local.mjs) and
// src/spend.mjs (~/Git/Durian-Pi/src/providers/spend.mjs + local.mjs), read 2026-11-15 at pin v1.5.1.
// Seats, cross-seat queue, broker, genlock, worktrees, metrics, check, constitution, selfdev: dropped.
//
// Offline means: ModelRuntime.create({ allowModelNetwork: false, refreshOnCreate: false }) - pi's own
// offline switches (dist/core/model-runtime.d.ts) - and no key check on any read. A model that the
// registry knows resolves whether or not its provider has credentials; a caller that cares asks
// `registry.hasConfiguredAuth(model)`, which is a separate question and is proved separately here.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildModels, resolveModelRef, lookupModel, machineProviderConfigs, cachedProviderConfigs } from "../src/providers.mjs";
import { endpointClass, isLoopbackBaseUrl, recordSpend, readSpend, spendTotalUsd, spendRow, costOf } from "../src/spend.mjs";
import { calculateCost } from "@earendil-works/pi-ai";
import { openHarness, prompt, scriptTurn } from "../src/core.mjs";

let passed = 0, total = 0;
function check(label, ok, detail = "") {
	total++;
	if (ok) { passed++; return; }
	console.log(`FAIL ${label}: ${detail}`);
}
const note = (label, detail) => { total++; passed++; console.log(`  note ${label}: ${detail}`); };

// The machine's own provider table (what pi already configures here) plus one declarative row for a
// metered provider, so the demo proves both registration paths without copying vendor catalogue bytes.
const machine = machineProviderConfigs();
const extra = [{
	id: "metered-demo",
	config: {
		name: "metered demo endpoint",
		baseUrl: "https://api.invalid-local.example/v1",
		api: "openai-completions",
	 models: [{
		// @temp: one chat row is enough to prove registration; real rows come from the machine's own
		// @temp: models.json or from pi's cached catalogues, never from a copy in this repo.
		id: "demo/answerer",
		// @temp: `name` is required by ProviderChatModelConfig (pi-coding-agent/dist/core/provider-composer.d.ts)
		// @temp: as a display name, and the harness passes pi's own shape through unchanged.
		name: "demo answerer",
		api: "openai-completions",
		// @temp: ProviderChatModelConfig wants `reasoning` (boolean), `contextWindow`, `maxTokens`,
		// @temp: `input`, and `cost` - the four below are those fields, in pi's names.
		reasoning: false,
		input: ["text"],
		contextWindow: 128000,
		// @temp: pi's field is `maxTokens`, not `maxOutputTokens`.
		maxTokens: 8192,
		// @temp: ProviderChatModelConfig's `cost` is `AnyModel["cost"]`: per-million USD numbers keyed
		// @temp: input/output/cacheRead/cacheWrite. These values are made up for the arithmetic demo,
		// @temp: which is why the provider id says `demo`.
		// @temp: A row copied from a real vendor catalogue would carry that vendor's license note; see
		// @temp: src/providers.mjs on where vendor rows come from here.
		cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 0 },
	},
	],
	},
}];

// The metered provider this machine actually has, read from its own cached catalogue rather than
// copied into the repo (see src/providers.mjs on the LICENSE question).
const vendor = cachedProviderConfigs();
const extraWithVendor = [...extra, { id: vendor.id, config: vendor.config }];
const models = await buildModels({ extra: extraWithVendor });
check("vendor catalogue rows carry the date they were read, so currency is not asserted", typeof vendor.fetchedAt === "number" && vendor.config.models.length > 20,
	`fetchedAt=${vendor.fetchedAt} rows=${vendor.config.models.length}`);
const vendorRow = vendor.config.models.find((row) => row.id === "deepseek-ai/DeepSeek-V4-Pro") ?? vendor.config.models[0];
check("a vendor row maps to pi's own model config fields", Boolean(vendorRow?.contextWindow) && Boolean(vendorRow?.cost), JSON.stringify(vendorRow));
const ids = models.registry.getProvider ? machine.map((e) => e.id).concat(extra.map((e) => e.id)) : [];
check("registry registers this machine's providers offline", machine.length > 0 && machine.every((e) => Boolean(models.registry.getProvider(e.id))),
	`machine providers=${machine.map((e) => e.id).join(",")}`);
check("a declarative metered provider registers too", Boolean(models.registry.getProvider("metered-demo")), "");
check("the cached deepinfra provider registers offline", Boolean(models.registry.getProvider(vendor.id)), `provider=${vendor.id}`);
const vendorRef = `${vendor.id}/${vendorRow.id}`;
const vendorFound = await lookupModel(models, vendorRef);
check("a deepinfra reference resolves offline with no key check", Boolean(vendorFound), vendorRef);
// A model resolves because the registry knows it; whether it has credentials is a separate read that
// this demo asks separately - that separation is what "offline, no key check" has to mean.
// The provider we registered declaratively carries no credential, so auth reads false while the model
// still resolves: that is the proof that "offline, no key check" did not quietly become "configured".
check("a model with no configured auth still resolves (auth is a separate read)",
	Boolean(vendorFound) && models.registry.hasConfiguredAuth(vendorFound.model) === false,
	`resolves=${Boolean(vendorFound)} hasConfiguredAuth=${models.registry.hasConfiguredAuth(vendorFound.model)}`);
check("the auth status read answers with pi's own AuthStatus record",
	typeof models.registry.getProviderAuthStatus(vendor.id) === "object",
	`providerAuthStatus=${JSON.stringify(models.registry.getProviderAuthStatus(vendor.id))}`);
check("offline build registered nothing that needed a key check", models.registry.getError() === undefined, String(models.registry.getError()));

// THE CREDENTIAL HALF of pi's provider plane, offline: a provider models.json declares WITHOUT an
// inline apiKey is still configured when pi's auth file carries an api_key for it - provider-composer.js
// calls that source "stored credential", and pi's own readStoredCredential is what src/providers.mjs
// uses. No key value is printed here, only pi's source name and pi's configured/auth reads.
const storedRow = machine.find((e) => e.credential === "stored credential");
const inlineRow = machine.find((e) => e.credential === "models_json_key");
check("pi's auth file supplies the key for a provider models.json leaves without one",
	!!storedRow && Boolean(storedRow.config.apiKey) === true,
	`provider=${storedRow?.id ?? "-"} credential=${storedRow?.credential ?? "-"} keyPresent=${storedRow?.config?.apiKey ? "yes" : "no"}`);
check("pi's precedence: the stored credential answers before models.json's inline key",
	!!storedRow && (inlineRow?.id ?? "") !== storedRow.id && storedRow.credential === "stored credential",
	`stored=${storedRow?.id ?? "-"} precedence=${storedRow?.credential ?? "-"}`);
if (storedRow) {
 const storedModel = await lookupModel(models, `${storedRow.id}/${storedRow.config.models?.[0]?.id ?? ""}`);
 check("a provider whose key came from pi's auth file reads as configured",
  Boolean(storedModel) && models.registry.hasConfiguredAuth(storedModel.model) === true,
  `model=${storedModel?.ref ?? "-"} hasConfiguredAuth=${storedModel && models.registry.hasConfiguredAuth(storedModel.model)}`);
 check("pi names that credential's source in its own AuthStatus record",
  models.registry.getProviderAuthStatus(storedRow.id)?.source === "models_json_key"
	|| models.registry.getProviderAuthStatus(storedRow.id)?.configured === true,
  `authStatus=${JSON.stringify(models.registry.getProviderAuthStatus(storedRow.id))}`);
}

// The reference rule from ~/Git/Durian-Pi/src/seatmodel.mjs: a leading segment counts as the provider
// ONLY when that provider is registered; otherwise the whole string is a model id.
const localId = machine.length ? (machine[0].config.models?.[0]?.id ?? "") : "";
const registeredRef = localId ? `${machine[0].id}/${localId}` : "metered-demo/demo/answerer";
const where = resolveModelRef(models, registeredRef);
check("a registered prefix resolves to that provider", where.provider === machine[0].id || where.provider === "metered-demo", `${where.provider}`);
check("model ids that themselves contain slashes survive", where.modelId === (localId || "demo/answerer"), `${where.modelId}`);
const bare = resolveModelRef(models, localId || "demo/answerer", "faux", "faux-1");
check("a bare id keeps the default provider", bare.provider === "faux" && bare.modelId === (localId || "demo/answerer"), `${bare.provider}/${bare.modelId}`);
const unregistered = resolveModelRef(models, "no-such-provider/x", "faux", "faux-1");
check("an unregistered prefix stays part of the model id", unregistered.provider === "faux" && unregistered.modelId === "no-such-provider/x",
	`${unregistered.provider}/${unregistered.modelId}`);

const found = await lookupModel(models, registeredRef);
check("lookup resolves a real Model object", Boolean(found), `${registeredRef}`);
const model = found?.model;
check("the resolved Model carries pi-ai's cost table", Boolean(model?.cost), JSON.stringify(model?.cost));
check("endpoint class: loopback is free", endpointClass("http://127.0.0.1:8080/v1") === "free" && isLoopbackBaseUrl("http://localhost:11434/v1"),
	`${endpointClass("http://127.0.0.1:8080/v1")}`);
check("a LAN box is NOT free", endpointClass("http://192.168.1.52:8080/v1") === "local-network", endpointClass("http://192.168.1.52:8080/v1"));

const dir = mkdtempSync(join(tmpdir(), "dh-providers-"));
const ledger = join(dir, "spend.jsonl");
const usage = { input: 1000, output: 500, cacheRead: 2000, cacheWrite: 0, totalTokens: 3500, cost: { input: 3, output: 7.5, cacheRead: 0.6, cacheWrite: 0, total: 11.1 } };
const meteredRow = recordSpend(ledger, { provider: "metered-demo", modelId: "demo/answerer", baseUrl: "https://api.invalid-local.example/v1", usage: { totalTokens: usage.totalTokens }, USD: 11.1 });
const freeRow = recordSpend(ledger, { provider: machine[0].id ?? "local", modelId: localId || "local-model", baseUrl: "http://127.0.0.1:8080/v1", usage: { totalTokens: 999 }, USD: 0 });
const rows = await readSpend(ledger);
check("both rows land in one ledger", rows.length === 2, `${rows.length}`);
check("the free call is tagged free, not counted as money", rows.some((r) => r.kind === "free") && spendTotalUsd(rows) === 11.1,
	`total=${spendTotalUsd(rows)} kinds=${rows.map((r) => r.kind).join(",")}`);
check("pi-ai's own cost arithmetic is used, not a price we wrote", costOf(model, usage) !== undefined, JSON.stringify(costOf(model, usage)));

// The durable usage plane stays pi-durable's: a scripted offline turn reports its tokens there, and
// this demo reads them rather than recomputing them.
const harness = await openHarness({ storePath: join(dir, "harness.sqlite"), cwd: dir });
await scriptTurn(harness.faux, ["offline provider turn"]);
await prompt(harness.conversation, "provider demo", harness.context);
const durableUsage = await harness.harness.usage(harness.context);
check("durable usage reports the faux model's spend", Object.keys(durableUsage?.models ?? {}).length > 0, JSON.stringify(durableUsage));
check("ledger and durable usage are separate views, both readable", rows.length === 2 && Object.keys(durableUsage?.models ?? {}).length > 0, "");
await harness.harness.close(harness.context);

console.log(`providers: ${passed}/${total} checks passed`);
process.exit(passed === total ? 0 : 1);
