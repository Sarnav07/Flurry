/**
 * Pure formatter for the Phase-8 SMOKE TEST REPORT (Task 11, Requirements
 * 23.1–23.4).
 *
 * This module is intentionally IO-free and deterministic so it can be unit
 * tested hermetically (see `smokeReport.test.ts`). `smoke.ts` accumulates a
 * {@link SmokeReport} as it drives the live localnet flow, then renders it with
 * {@link formatReport}. The renderer never performs assertions or chain calls —
 * it only turns an already-decided report into the human-readable ledger the
 * operator (and the acceptance gate) reads.
 *
 * Three terminal statuses:
 *   - `PASSED`  — every assertion passed; the gate is green (exit 0).
 *   - `FAILED`  — an assertion failed; the run STOPPED at the first failure
 *                 (exit non-zero). `failure` carries the exact failing
 *                 invariant with observed vs expected.
 *   - `PENDING` — preconditions were not met (no localnet / missing required
 *                 keys), so the flow was NOT run. This is explicitly NOT a pass;
 *                 the gate is skipped (exit 0) and `pendingReasons` explains why.
 */

/** A single PASS/FAIL ledger entry. */
export interface AssertionEntry {
  /** Stable id (e.g. "5.raw_reputation"). */
  id: string;
  /** Human description of the invariant. */
  description: string;
  /** Whether the invariant held. */
  passed: boolean;
  /** Expected value (rendered) — present for the failing entry, optional otherwise. */
  expected?: string;
  /** Observed value (rendered). */
  observed?: string;
}

/** A label → transaction-digest pair for the Executed Transactions section. */
export interface TxEntry {
  label: string;
  digest: string;
}

/** The full report `smoke.ts` accumulates and renders once. */
export interface SmokeReport {
  /** Terminal status of the run. */
  status: "PASSED" | "FAILED" | "PENDING";
  /** Environment facts (network, rpc, addresses, key ids, window, demo flags). */
  environment: Record<string, string>;
  /** Why the run is PENDING/SKIPPED (only when status === "PENDING"). */
  pendingReasons: string[];
  /** Resolved artifact ids (packageId, seasonId, …). */
  artifactIds: Record<string, string>;
  /** Executed on-chain transactions, in order. */
  transactions: TxEntry[];
  /** Distinct event types observed, in order. */
  events: string[];
  /** Player/shard state captured BEFORE the proof was submitted. */
  stateBefore: Record<string, string>;
  /** Player/shard state captured AFTER the proof was submitted. */
  stateAfter: Record<string, string>;
  /** Final territory ownership summary. */
  finalTerritoryOwnership: string;
  /** Final impact recipient + delta summary. */
  finalImpactRecipient: string;
  /** Replay outcomes (in-window + post-cleanup). */
  replayResult: string;
  /** Cleanup outcome (both-store reduction). */
  cleanupResult: string;
  /** The PASS/FAIL ledger, in assertion order. */
  assertions: AssertionEntry[];
  /** The first failing invariant (only when status === "FAILED"). */
  failure?: {
    id: string;
    description: string;
    expected: string;
    observed: string;
  };
}

/** Build an empty report shell with the given environment + window facts. */
export function emptyReport(environment: Record<string, string>): SmokeReport {
  return {
    status: "PENDING",
    environment,
    pendingReasons: [],
    artifactIds: {},
    transactions: [],
    events: [],
    stateBefore: {},
    stateAfter: {},
    finalTerritoryOwnership: "(not reached)",
    finalImpactRecipient: "(not reached)",
    replayResult: "(not reached)",
    cleanupResult: "(not reached)",
    assertions: [],
  };
}

const RULE = "=".repeat(72);
const SUBRULE = "-".repeat(72);

function renderKeyValues(title: string, kv: Record<string, string>): string[] {
  const lines = [title];
  const entries = Object.entries(kv);
  if (entries.length === 0) {
    lines.push("  (none)");
    return lines;
  }
  const width = Math.max(...entries.map(([k]) => k.length));
  for (const [k, v] of entries) {
    lines.push(`  ${k.padEnd(width)} : ${v}`);
  }
  return lines;
}

/** Render the report to a single multi-line string. */
export function formatReport(report: SmokeReport): string {
  const out: string[] = [];
  out.push(RULE);
  out.push("SMOKE TEST REPORT — Yeti Trials Genesis Frost (localnet acceptance gate)");
  out.push(`STATUS: ${statusBanner(report.status)}`);
  out.push(RULE);

  if (report.status === "PENDING") {
    out.push("");
    out.push("SMOKE PENDING — not run");
    out.push(
      "This is a SKIPPED/PENDING result, NOT a pass. A real pass requires a live",
    );
    out.push("localnet validator and the required signing keys. Reasons:");
    for (const r of report.pendingReasons) out.push(`  - ${r}`);
  }

  out.push("");
  out.push(...renderKeyValues("Environment:", report.environment));

  out.push("");
  out.push(...renderKeyValues("Artifact IDs:", report.artifactIds));

  out.push("");
  out.push("Executed Transactions (digests):");
  if (report.transactions.length === 0) {
    out.push("  (none)");
  } else {
    for (const t of report.transactions) out.push(`  ${t.label.padEnd(28)} ${t.digest}`);
  }

  out.push("");
  out.push("Events Emitted:");
  if (report.events.length === 0) out.push("  (none)");
  else for (const e of report.events) out.push(`  - ${e}`);

  out.push("");
  out.push(...renderKeyValues("State Before:", report.stateBefore));

  out.push("");
  out.push(...renderKeyValues("State After:", report.stateAfter));

  out.push("");
  out.push(`Final Territory Ownership: ${report.finalTerritoryOwnership}`);
  out.push(`Final Impact Recipient   : ${report.finalImpactRecipient}`);
  out.push(`Replay Result            : ${report.replayResult}`);
  out.push(`Cleanup Result           : ${report.cleanupResult}`);

  out.push("");
  out.push(SUBRULE);
  out.push("Assertion Ledger:");
  out.push(SUBRULE);
  if (report.assertions.length === 0) {
    out.push("  (no assertions evaluated)");
  } else {
    for (const a of report.assertions) {
      const mark = a.passed ? "PASS" : "FAIL";
      out.push(`  [${mark}] ${a.id} — ${a.description}`);
      if (!a.passed) {
        out.push(`         expected: ${a.expected ?? "(n/a)"}`);
        out.push(`         observed: ${a.observed ?? "(n/a)"}`);
      }
    }
  }

  const passed = report.assertions.filter((a) => a.passed).length;
  out.push(SUBRULE);
  out.push(`Ledger: ${passed}/${report.assertions.length} assertions passed`);

  if (report.status === "FAILED" && report.failure) {
    out.push("");
    out.push(RULE);
    out.push("GATE FAILED — first failing invariant:");
    out.push(`  ${report.failure.id} — ${report.failure.description}`);
    out.push(`  expected: ${report.failure.expected}`);
    out.push(`  observed: ${report.failure.observed}`);
    out.push(RULE);
  } else if (report.status === "PASSED") {
    out.push("");
    out.push(RULE);
    out.push("GATE PASSED — full Genesis Frost lifecycle verified on live localnet.");
    out.push(RULE);
  } else if (report.status === "PENDING") {
    out.push("");
    out.push(RULE);
    out.push("GATE SKIPPED (PENDING) — flow not run; not a pass. See reasons above.");
    out.push(RULE);
  }

  return out.join("\n");
}

function statusBanner(status: SmokeReport["status"]): string {
  switch (status) {
    case "PASSED":
      return "PASSED ✅";
    case "FAILED":
      return "FAILED ❌";
    case "PENDING":
      return "PENDING / SKIPPED ⏭  (not a pass)";
  }
}
