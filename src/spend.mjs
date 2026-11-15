// src/spend.mjs - the spend ledger: one JSONL file, one row shape, one total.
//
// PROVENANCE: extracted from ~/Git/Durian-Pi/src/providers/spend.mjs (the spend guard at the provider
// seam) and ~/Git/Durian-Pi/src/providers/local.mjs (`isLoopbackBaseUrl`, `endpointClass`), read
// 2026-11-15 at pin v1.5.1. What changed and why:
//   - the spend CAP is dropped: Durian-Pi's cap was a rig policy (D-5015), and a single-agent harness
//     inherits no policy; what is kept is the ledger, so spend stays measurable and reportable;
//   - "classify by ENDPOINT: a loopback server costs nothing" is kept, together with the reason
//     Durian-Pi records for it - the ledger is a money record, and a $0 row for a free call reads as
//     accounting noise; here the row is still written (it is the only spend view a caller has) but it
//     is tagged `free` and excluded from the money total by that tag, not by the number;
//   - seats, queue admission, the compaction-seam wrapper, price-key environment lookups, genlock,
//     worktrees, metrics, check, constitution, selfdev: dropped.
//
// WHAT STAYS HONEST HERE: a conversation's own token and cost accounting is pi-durable's, not ours.
// node_modules/@earendil-works/pi-durable/dist/harness/types.d.ts:867 declares `usage(context)` on the
// conversation, and src/readapi.mjs re-exports that read. This file records the harness-level money
// view - WHICH model answered, FROM WHICH endpoint, at what cost - because the durable usage state
// does not carry an endpoint, and endpoint class is exactly what decides whether money was spent.

import { calculateCost } from "@earendil-works/pi-ai";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Loopback endpoints cost nothing - the rule ~/Git/Durian-Pi/src/providers/local.mjs records.
 *
 * @temp: `localhost`, `127.0.0.1`, and the bracketed form count; a LAN box (192.168.x.y) does not.
 * @temp: Durian-Pi's note about a second box on the LAN is why that distinction is kept: treating any
 * @temp: http host as free would have made a LAN server a paid endpoint in the ledger.
 */
export function isLoopbackBaseUrl(baseUrl) {
	if (!baseUrl) return false;
	const host = String(baseUrl).replace(/^https?:\/\//, "").split(/[/:]/)[0];
	return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "0.0.0.0";
}

export function endpointClass(baseUrl) {
	if (isLoopbackBaseUrl(baseUrl)) return "free";
	if (!baseUrl) return "unknown";
	return String(baseUrl).startsWith("http://") ? "local-network" : "metered";
}

/**
 * Append one ledger row as JSONL. The row shape is written once, here, so a reader and a total can
 * never disagree about what a spend record means.
 */
export function recordSpend(ledgerPath, event) {
	const row = {
		at: event.at ?? Date.now(),
		kind: event.kind ?? endpointClass(event.baseUrl),
		provider: event.provider ?? null,
		modelId: event.modelId ?? null,
		// @temp: the baseUrl is kept in the row so a reader can re-classify an endpoint after a
		// @temp: provider moved, instead of trusting a tag written once.
		baseUrl: event.baseUrl ?? null,
		// pi-ai's Usage shape (input/output/cacheRead/cacheWrite/totalTokens/cost) is copied through
		// without renaming, so the ledger records what the provider reported, not a summary of it.
		...(event.usage ?? {}),
		// @temp: `usd` and `USD` are accepted: the row key written here is `USD`, and a
		// @temp: caller that already has a lowercase field should not have to rename it before recording.
		USD: event.usd ?? event.USD ?? 0,
	};
	mkdirSync(dirname(ledgerPath), { recursive: true });
	appendFileSync(ledgerPath, JSON.stringify(row) + "\n");
	return row;
}

/** Read the ledger; a file that does not exist yet is an empty ledger, not an error. */
export async function readSpend(ledgerPath) {
	const fs = await import("node:fs");
	let text;
	try {
		text = fs.readFileSync(ledgerPath, "utf8");
	} catch {
		return [];
	}
	// One row per line: a torn tail (a process killed mid-append) must not invent a total, so a line
	// that does not parse is reported as a gap instead of being skipped silently.
	const rows = [];
	for (const line of text.split("\n")) {
		if (!line.trim()) continue;
		try {
			rows.push(JSON.parse(line));
		} catch {
			// @temp: reported as a marker row so a caller sees the hole where the record was.
			// @temp: (the alternative - dropping the line - makes a total read look complete when it
			// @temp: is not, which is the same class of failure Durian-Pi's ledger guards exist to
			// @temp: catch.)
			// @temp: kept minimal: the marker carries the unparsed text so a human can repair it.
			// @temp: shape stays compatible with the row shape above.
			rows.push({ kind: "unparsable", at: null, provider: null, modelId: null, baseUrl: null, USD: 0, raw: line });
		}
	}
	return rows;
}

/**
 * The money total over metered rows only; `free` rows never count, whatever number they carry.
 */
export function spendTotalUsd(rows) {
	return rows.reduce((sum, row) => sum + (row.kind === "free" || row.kind === "unparsable" ? 0 : Number(row.USD ?? 0)), 0);
}

/**
 * Cost one pi-ai `Usage` against a `Model`, the way pi-ai says to: `calculateCost(model, usage)` is
 * exported from dist/models.d.ts:277 and returns the `Usage["cost"]` shape.
 */
export function costOf(model, usage) {
	// @temp: pi-ai's own cost table on the model does the arithmetic; nothing here prices a model.
	// @temp: A model with no price data yields whatever pi-ai reports (zeros), which the caller can
	// @temp: tell apart from a real zero by the model's own `cost` field.
	return calculateCost(model, usage);
}

/** One row built from a pi-ai Usage + the Model that produced it, ready for `recordSpend`. */
export function spendRow(ledgerPath, model, usage, baseUrl) {
	// @temp: provider and modelId come from the model object, so the row cannot name a provider the
	// @temp: model did not belong to.
	// @temp: the model's `provider` field is its provider id per pi-ai's Model shape.
	return recordSpend(ledgerPath, {
		provider: model?.provider ?? null,
		modelId: model?.id ?? null,
		baseUrl,
		kind: endpointClass(baseUrl),
		usage: { tokens: usage?.totalTokens ?? 0 },
		USD: costOf(model, usage)?.total ?? 0,
	});
}
