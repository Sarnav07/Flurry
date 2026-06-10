/**
 * Documentation-content validation (Task 13.4, Requirements 24.1–24.6).
 *
 * Hermetic: it only reads files from the repo (the four docs + README and
 * `shared/src/bcs.ts`). No chain, no keys, no network. Its job is to keep the
 * Phase-9 documentation HONEST against the implementation:
 *
 *   - each required doc exists and contains its required trust-boundary /
 *     message-format statements;
 *   - the `ProofPayload` field list documented in `docs/MESSAGE_FORMAT.md`
 *     matches the actual field NAMES and ORDER of the `ProofPayloadBcs` struct
 *     in `shared/src/bcs.ts` (both are parsed and compared);
 *   - the seven trust-boundary statements (Task 13.3) are present in
 *     `docs/TRUST_BOUNDARIES.md`.
 *
 * If a doc and the implementation drift apart, this test fails by design.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./lib.js";

function read(relPath: string): string {
  return readFileSync(resolve(REPO_ROOT, relPath), "utf8");
}

const MESSAGE_FORMAT = read("docs/MESSAGE_FORMAT.md");
const OBJECT_MODEL = read("docs/OBJECT_MODEL.md");
const TRUST_BOUNDARIES = read("docs/TRUST_BOUNDARIES.md");
const DEMO_FLOW = read("docs/DEMO_FLOW.md");
const README = read("README.md");

// Case-insensitive "contains this phrase/pattern" helper. Collapses all
// whitespace (including newlines) to single spaces first, so a phrase that the
// markdown happens to line-wrap is still matched.
function has(haystack: string, pattern: RegExp): boolean {
  return pattern.test(haystack.replace(/\s+/g, " "));
}

describe("required documentation files exist and are non-empty", () => {
  const files = [
    "docs/MESSAGE_FORMAT.md",
    "docs/OBJECT_MODEL.md",
    "docs/TRUST_BOUNDARIES.md",
    "docs/DEMO_FLOW.md",
    "README.md",
  ];
  for (const f of files) {
    it(`${f} exists and has content`, () => {
      expect(read(f).trim().length).toBeGreaterThan(0);
    });
  }
});

describe("MESSAGE_FORMAT.md documents the BCS layout + DOMAIN prefix", () => {
  it("states the raw DOMAIN prefix b\"Yeti Trials\" is prepended, not a BCS field", () => {
    expect(has(MESSAGE_FORMAT, /b"Yeti Trials"/)).toBe(true);
    expect(has(MESSAGE_FORMAT, /raw bytes/i)).toBe(true);
    expect(has(MESSAGE_FORMAT, /not\s+(as\s+a\s+|a\s+)?bcs field/i)).toBe(true);
  });

  it("states the BCS encoding rules (u64 LE, ULEB128 vectors, 32-byte address)", () => {
    expect(has(MESSAGE_FORMAT, /little-endian/i)).toBe(true);
    expect(has(MESSAGE_FORMAT, /uleb128/i)).toBe(true);
    expect(has(MESSAGE_FORMAT, /32 raw bytes/i)).toBe(true);
  });

  it("states the raw 64-byte Ed25519 signature format with no Sui intent envelope", () => {
    expect(has(MESSAGE_FORMAT, /64-byte ed25519/i)).toBe(true);
    expect(has(MESSAGE_FORMAT, /no sui intent/i)).toBe(true);
  });

  it("documents the nullifier derivation (blake2b256 over the ordered preimage)", () => {
    expect(has(MESSAGE_FORMAT, /blake2b256/i)).toBe(true);
    expect(has(MESSAGE_FORMAT, /preimage/i)).toBe(true);
  });

  it("states the change-together rule (bcs.ts / Move ProofPayload / this doc)", () => {
    expect(has(MESSAGE_FORMAT, /changed together|change together/i)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ProofPayload field order: parse MESSAGE_FORMAT.md AND shared/src/bcs.ts and
// assert the documented order matches the implementation order exactly.
// ---------------------------------------------------------------------------

/** Parse the canonical field-order marker block in MESSAGE_FORMAT.md. */
function parseDocumentedFieldOrder(doc: string): string[] {
  const start = doc.indexOf("PROOFPAYLOAD-FIELD-ORDER:START");
  const end = doc.indexOf("PROOFPAYLOAD-FIELD-ORDER:END");
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  const block = doc.slice(start, end);
  const fields: string[] = [];
  for (const line of block.split("\n")) {
    const m = line.match(/^\s*\d+\.\s*([A-Za-z_]\w*)\s*:/);
    if (m && m[1]) fields.push(m[1]);
  }
  return fields;
}

/** Parse the field names (in order) from the ProofPayloadBcs struct in bcs.ts. */
function parseBcsFieldOrder(src: string): string[] {
  const m = src.match(/bcs\.struct\(\s*"ProofPayload"\s*,\s*\{([\s\S]*?)\}\s*\)/);
  expect(m).not.toBeNull();
  const body = m![1]!;
  const fields: string[] = [];
  for (const line of body.split("\n")) {
    const fm = line.match(/^\s*([A-Za-z_]\w*)\s*:\s*bcs\./);
    if (fm && fm[1]) fields.push(fm[1]);
  }
  return fields;
}

describe("documented ProofPayload field order matches shared/src/bcs.ts", () => {
  const documented = parseDocumentedFieldOrder(MESSAGE_FORMAT);
  const implemented = parseBcsFieldOrder(read("shared/src/bcs.ts"));

  it("parses exactly 15 fields from both sources", () => {
    expect(documented).toHaveLength(15);
    expect(implemented).toHaveLength(15);
  });

  it("documented order equals the implemented BCS struct order", () => {
    expect(documented).toEqual(implemented);
  });

  it("matches the canonical 15-field order", () => {
    expect(implemented).toEqual([
      "network",
      "package_id",
      "season_id",
      "trial_id",
      "faction_id",
      "passport_id",
      "wallet",
      "proof_source",
      "provenance_tier",
      "score",
      "territory_power",
      "issued_ms",
      "expiry_ms",
      "nonce",
      "nullifier",
    ]);
  });
});

// ---------------------------------------------------------------------------
// The seven trust-boundary statements (Task 13.3 / Requirements 24.1–24.4).
// ---------------------------------------------------------------------------

describe("TRUST_BOUNDARIES.md contains all seven trust-boundary statements", () => {
  const statements: { name: string; patterns: RegExp[] }[] = [
    {
      name: "1. centralized V1 oracle; Oracle-Attested Demo Proof is a TRUSTED input",
      patterns: [/centralized v1/i, /trusted input/i],
    },
    {
      name: "2. oracle-attested ≠ native on-chain proof",
      patterns: [/oracle-attested ≠ native/i, /not a native on-chain (proof|fact)/i],
    },
    {
      name: "3. wallet ownership ≠ personhood",
      patterns: [/wallet ownership ≠ personhood/i],
    },
    {
      name: "4. zkLogin ≠ personhood / ≠ Sybil resistance; per-address-per-season uniqueness",
      patterns: [/zklogin ≠ personhood and ≠ sybil resistance/i, /per sui address per season/i],
    },
    {
      name: "5. cleanup is NOT automatic; rebate-incentivized",
      patterns: [/cleanup is not automatic/i, /storage rebate exceeds the gas/i],
    },
    {
      name: "6. sponsors cannot affect scoring (SponsorSlot display-only)",
      patterns: [/sponsors cannot affect scoring/i, /display-only/i],
    },
    {
      name: "7. no yield/profit/investment return; community-directed allocation",
      patterns: [
        /no yield, profit, or investment return/i,
        /community-directed allocation/i,
      ],
    },
  ];

  for (const s of statements) {
    it(`states: ${s.name}`, () => {
      for (const p of s.patterns) {
        expect(has(TRUST_BOUNDARIES, p)).toBe(true);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Required statements echoed by README and OBJECT_MODEL / DEMO_FLOW.
// ---------------------------------------------------------------------------

describe("README documents architecture, quickstarts, and the smoke test", () => {
  it("describes the four layers (contracts / shared / orchestrator / scripts)", () => {
    expect(has(README, /contracts\//)).toBe(true);
    expect(has(README, /shared\//)).toBe(true);
    expect(has(README, /orchestrator\//)).toBe(true);
    expect(has(README, /scripts\//)).toBe(true);
  });

  it("has a localnet quickstart and a testnet quickstart", () => {
    expect(has(README, /localnet quickstart/i)).toBe(true);
    expect(has(README, /testnet quickstart/i)).toBe(true);
  });

  it("documents how to run the smoke test", () => {
    expect(has(README, /pnpm run smoke|run smoke/i)).toBe(true);
  });

  it("restates the core trust boundaries (no P2E, centralized V1, zkLogin)", () => {
    expect(has(README, /no p2e/i)).toBe(true);
    expect(has(README, /centralized v1/i)).toBe(true);
    expect(has(README, /zklogin is onboarding, not sybil resistance/i)).toBe(true);
  });
});

describe("OBJECT_MODEL.md documents every object", () => {
  const objects = [
    "YetiPassport",
    "Season",
    "OracleSignerRegistry",
    "AdminCap",
    "ScoreShard",
    "TerritoryMap",
    "PowerTally",
    "ImpactEscrow",
    "NullifierStore",
    "CleanupBatch",
    "SponsorSlot",
  ];
  for (const o of objects) {
    it(`documents ${o}`, () => {
      expect(has(OBJECT_MODEL, new RegExp(o))).toBe(true);
    });
  }

  it("notes the non-transferable (key-only, no store) passport", () => {
    expect(has(OBJECT_MODEL, /non-transferable/i)).toBe(true);
    expect(has(OBJECT_MODEL, /no\s+`?store`?/i)).toBe(true);
  });

  it("notes the PowerTally finalize approach and the dual ScoreShard channels", () => {
    expect(has(OBJECT_MODEL, /hot[- ]potato/i)).toBe(true);
    expect(has(OBJECT_MODEL, /raw_score_total/)).toBe(true);
    expect(has(OBJECT_MODEL, /territory_power_total/)).toBe(true);
  });
});

describe("DEMO_FLOW.md documents the Genesis Frost lifecycle and commands", () => {
  it("covers the lifecycle steps in order", () => {
    for (const step of [
      /create_passport_with_faction/,
      /proof\/request/,
      /proof\/attest/,
      /submit_proof/,
      /finalize_territory/,
      /disburse/i,
      /cleanup/i,
    ]) {
      expect(has(DEMO_FLOW, step)).toBe(true);
    }
  });

  it("documents testnet faucet funding (out-of-band) and generous expiry windows", () => {
    expect(has(DEMO_FLOW, /faucet/i)).toBe(true);
    expect(has(DEMO_FLOW, /out-of-band|out of band/i)).toBe(true);
    expect(has(DEMO_FLOW, /real-clock latency/i)).toBe(true);
  });
});
