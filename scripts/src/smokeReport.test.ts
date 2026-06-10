/**
 * Hermetic unit tests for the SMOKE TEST REPORT formatter (Task 11).
 *
 * The formatter is pure (no IO, no chain), so these tests assert the rendered
 * ledger faithfully reflects the report status, sections, and — critically —
 * the first failing invariant with observed vs expected. The smoke flow itself
 * is integration and localnet-gated (it is NOT exercised here).
 */

import { describe, expect, it } from "vitest";

import { emptyReport, formatReport, type SmokeReport } from "./smokeReport.js";

function baseReport(): SmokeReport {
  const r = emptyReport({ network: "localnet", rpcUrl: "http://127.0.0.1:9000" });
  r.artifactIds = { packageId: "0xpkg", seasonId: "0xseason" };
  r.transactions = [{ label: "submit_proof", digest: "0xdigest" }];
  r.events = ["::events::ProofAccepted", "::events::ScoreShardUpdated"];
  r.stateBefore = { raw_reputation: "0" };
  r.stateAfter = { raw_reputation: "100" };
  r.finalTerritoryOwnership = "owners=[1,1,2,3], winner=Avalanche(1)";
  r.finalImpactRecipient = "0xrecip (+100000000 MIST)";
  r.replayResult = "in-window: E_REUSED_NULLIFIER; post-cleanup: E_SEASON_INACTIVE";
  r.cleanupResult = "NullifierStore 1->0, accepted_keys 1->0";
  return r;
}

describe("formatReport", () => {
  it("renders a PASSED gate with the full ledger and pass banner", () => {
    const r = baseReport();
    r.status = "PASSED";
    r.assertions = [
      { id: "5.raw_reputation", description: "passport raw_reputation == score", passed: true },
      { id: "5.shard", description: "shard raw_score_total += score", passed: true },
    ];

    const text = formatReport(r);

    expect(text).toContain("SMOKE TEST REPORT");
    expect(text).toContain("STATUS: PASSED");
    expect(text).toContain("GATE PASSED");
    expect(text).toContain("[PASS] 5.raw_reputation");
    expect(text).toContain("Ledger: 2/2 assertions passed");
    // A passing report never prints a failing-invariant block.
    expect(text).not.toContain("GATE FAILED");
  });

  it("renders a FAILED gate that STOPS at the first failing invariant with observed vs expected", () => {
    const r = baseReport();
    r.status = "FAILED";
    r.assertions = [
      { id: "5.proof_accepted", description: "ProofAccepted emitted", passed: true },
      {
        id: "5.raw_reputation",
        description: "passport raw_reputation == score",
        passed: false,
        expected: "100",
        observed: "0",
      },
    ];
    r.failure = {
      id: "5.raw_reputation",
      description: "passport raw_reputation == score",
      expected: "100",
      observed: "0",
    };

    const text = formatReport(r);

    expect(text).toContain("STATUS: FAILED");
    expect(text).toContain("GATE FAILED — first failing invariant:");
    expect(text).toContain("5.raw_reputation");
    expect(text).toContain("expected: 100");
    expect(text).toContain("observed: 0");
    expect(text).toContain("Ledger: 1/2 assertions passed");
    expect(text).not.toContain("GATE PASSED");
  });

  it("renders a PENDING gate that is explicitly NOT a pass and lists reasons", () => {
    const r = emptyReport({ network: "localnet" });
    r.status = "PENDING";
    r.pendingReasons = ["localnet not reachable at http://127.0.0.1:9000", "no ORACLE_PRIVATE_KEY"];

    const text = formatReport(r);

    expect(text).toContain("SMOKE PENDING — not run");
    expect(text).toContain("NOT a pass");
    expect(text).toContain("localnet not reachable");
    expect(text).toContain("no ORACLE_PRIVATE_KEY");
    expect(text).toContain("GATE SKIPPED (PENDING)");
    // A pending report must never claim the gate passed.
    expect(text).not.toContain("GATE PASSED");
  });

  it("renders empty sections without throwing", () => {
    const r = emptyReport({});
    const text = formatReport(r);
    expect(text).toContain("Executed Transactions");
    expect(text).toContain("(none)");
  });
});
