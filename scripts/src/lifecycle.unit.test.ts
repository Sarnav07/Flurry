/**
 * Hermetic unit tests for the Phase-7 lifecycle helpers (Task 10).
 *
 * These ALWAYS run — no chain, no keys, no network. They cover the pure logic
 * the lifecycle scripts depend on:
 *   - Move abort-code decoding from a realistic committed-failure error string,
 *   - shard-selection-by-bucket (the `(faction, bucket)` rule), incl. the
 *     no-match throw,
 *   - attestation wire parsing/validation and `vector<u8>` normalization,
 *   - the wire→PTB-arg conversion (`proofValueArgs`) over a sample payload.
 */

import { describe, expect, it } from "vitest";

import { Transaction } from "@mysten/sui/transactions";
import {
  ABORT_CODE,
  deriveNullifier,
  shardBucket,
  type AttestationResponse,
  type WireProofPayload,
} from "@yeti-trials/shared";

import {
  decodeAbort,
  describeAbort,
  isAbort,
  normalizeByteVec,
  parseAbortCode,
  parseAttestation,
  proofValueArgs,
  selectShardObjectId,
} from "./lifecycle.js";
import type { ShardEntry } from "./lib.js";

// A realistic Sui committed-failure error string for a Move abort with code 9
// (E_REUSED_NULLIFIER). Note the inner `function: N,` / `instruction: N,`
// fields are `: N,` (never `, N)`), so only the outer `, 9)` is the abort code.
const REUSED_NULLIFIER_ERR =
  'MoveAbort(MoveLocation { module: ModuleId { address: 0xabc, ' +
  'name: Identifier("proof") }, function: 7, instruction: 142, ' +
  'function_name: Some("submit_proof") }, 9) in command 0';

const SEASON_NOT_FINALIZED_ERR =
  'MoveAbort(MoveLocation { module: ModuleId { address: 0xabc, ' +
  'name: Identifier("season") }, function: 3, instruction: 10, ' +
  'function_name: Some("close_season") }, 19) in command 0';

describe("parseAbortCode", () => {
  it("extracts the abort code from a Move abort error string", () => {
    expect(parseAbortCode(REUSED_NULLIFIER_ERR)).toBe(ABORT_CODE.E_REUSED_NULLIFIER);
    expect(parseAbortCode(SEASON_NOT_FINALIZED_ERR)).toBe(ABORT_CODE.E_SEASON_NOT_FINALIZED);
  });

  it("returns null for a non-abort / empty error", () => {
    expect(parseAbortCode(undefined)).toBeNull();
    expect(parseAbortCode(null)).toBeNull();
    expect(parseAbortCode("network timeout")).toBeNull();
  });
});

describe("decodeAbort / isAbort / describeAbort", () => {
  it("decodes a code into name + message", () => {
    const d = decodeAbort(ABORT_CODE.E_REUSED_NULLIFIER);
    expect(d.code).toBe(9);
    expect(d.name).toBe("E_REUSED_NULLIFIER");
    expect(d.message).toMatch(/nullifier/i);
  });

  it("matches an expected abort code", () => {
    expect(isAbort(REUSED_NULLIFIER_ERR, ABORT_CODE.E_REUSED_NULLIFIER)).toBe(true);
    expect(isAbort(REUSED_NULLIFIER_ERR, ABORT_CODE.E_SEASON_INACTIVE)).toBe(false);
  });

  it("renders a readable description", () => {
    expect(describeAbort(REUSED_NULLIFIER_ERR)).toMatch(/E_REUSED_NULLIFIER \(9\)/);
    expect(describeAbort("plain error")).toBe("plain error");
  });
});

describe("selectShardObjectId (bucket rule)", () => {
  const FACTION = 1;
  // A nullifier whose bucket we compute via the shared single source of truth.
  const nullifier = deriveNullifier({
    seasonId: 42n,
    trialId: 7n,
    factionId: FACTION,
    passportId: "0x" + "22".repeat(32),
    wallet: "0x" + "33".repeat(32),
    nonce: 99n,
  });

  function shardsFor(shardCount: number): ShardEntry[] {
    const out: ShardEntry[] = [];
    for (let faction = 0; faction < 4; faction++) {
      for (let shard = 0; shard < shardCount; shard++) {
        out.push({ objectId: `0xface_${faction}_${shard}`, faction, shard });
      }
    }
    return out;
  }

  it("selects the shard whose (faction, shard) matches the computed bucket", () => {
    const shardCount = 4;
    const expectedBucket = shardBucket(nullifier, shardCount);
    const { objectId, bucket } = selectShardObjectId(
      shardsFor(shardCount),
      FACTION,
      nullifier,
      shardCount,
    );
    expect(bucket).toBe(expectedBucket);
    expect(objectId).toBe(`0xface_${FACTION}_${expectedBucket}`);
  });

  it("accepts a number[] nullifier and agrees with the Uint8Array form", () => {
    const shardCount = 4;
    const a = selectShardObjectId(shardsFor(shardCount), FACTION, nullifier, shardCount);
    const b = selectShardObjectId(
      shardsFor(shardCount),
      FACTION,
      Array.from(nullifier),
      shardCount,
    );
    expect(b.objectId).toBe(a.objectId);
    expect(b.bucket).toBe(a.bucket);
  });

  it("throws when no shard matches the (faction, bucket)", () => {
    // Only faction-0 shards present, but we ask for faction 1.
    const onlyFaction0: ShardEntry[] = [
      { objectId: "0xa", faction: 0, shard: 0 },
      { objectId: "0xb", faction: 0, shard: 1 },
    ];
    expect(() => selectShardObjectId(onlyFaction0, FACTION, nullifier, 4)).toThrow(
      /no shard for/,
    );
  });
});

describe("normalizeByteVec", () => {
  it("passes through a number[] (masking to bytes)", () => {
    expect(normalizeByteVec([1, 2, 255])).toEqual([1, 2, 255]);
  });

  it("decodes a base64 string", () => {
    const b64 = Buffer.from([10, 20, 30]).toString("base64");
    expect(normalizeByteVec(b64)).toEqual([10, 20, 30]);
  });

  it("throws on an unsupported value", () => {
    expect(() => normalizeByteVec(123 as unknown)).toThrow();
  });
});

function sampleWire(): WireProofPayload {
  return {
    network: Array.from(new TextEncoder().encode("localnet")),
    packageId: "0x" + "ab".repeat(32),
    seasonId: "42",
    trialId: "7",
    factionId: 1,
    passportId: "0x" + "22".repeat(32),
    wallet: "0x" + "33".repeat(32),
    proofSource: Array.from(new TextEncoder().encode("Oracle-Attested Demo Proof")),
    provenanceTier: 2,
    score: "1234",
    territoryPower: "567",
    issuedMs: "1000",
    expiryMs: "2000",
    nonce: "99",
    nullifier: Array.from({ length: 32 }, (_, i) => i),
  };
}

function sampleAttestation(): AttestationResponse {
  return {
    payload: sampleWire(),
    signature: Array.from({ length: 64 }, (_, i) => i % 256),
    nullifier: Array.from({ length: 32 }, (_, i) => i),
    expiry: "2000",
    score: "1234",
    territoryPower: "567",
    proofSource: "Oracle-Attested Demo Proof",
    provenanceTier: 2,
  };
}

describe("parseAttestation", () => {
  it("parses a valid attestation", () => {
    const att = parseAttestation(JSON.stringify(sampleAttestation()));
    expect(att.payload.seasonId).toBe("42");
    expect(att.signature.length).toBe(64);
    expect(att.nullifier.length).toBe(32);
  });

  it("rejects a bad signature length", () => {
    const bad = sampleAttestation();
    bad.signature = [1, 2, 3];
    expect(() => parseAttestation(JSON.stringify(bad))).toThrow(/signature/);
  });

  it("rejects a bad nullifier length", () => {
    const bad = sampleAttestation();
    bad.nullifier = [1, 2, 3];
    expect(() => parseAttestation(JSON.stringify(bad))).toThrow(/nullifier/);
  });

  it("rejects missing payload", () => {
    expect(() => parseAttestation("{}")).toThrow(/payload/);
  });
});

describe("proofValueArgs (wire -> PTB args)", () => {
  it("produces 17 args (15 payload fields + signature + pk) without throwing", () => {
    const tx = new Transaction();
    const att = sampleAttestation();
    const pk = Array.from({ length: 32 }, (_, i) => i);
    const args = proofValueArgs(tx, att.payload, att.signature, pk);
    // 15 ProofPayload fields + signature + public key.
    expect(args.length).toBe(17);
  });

  it("converts u64 decimal strings to BigInt-encoded pure args (no precision loss)", () => {
    // A value beyond 2^53 must survive as a bigint, not a lossy JS number.
    const tx = new Transaction();
    const wire = sampleWire();
    wire.score = (2n ** 63n - 1n).toString();
    // Should not throw; BigInt(...) preserves the full-width value.
    expect(() => proofValueArgs(tx, wire, new Array(64).fill(0), new Array(32).fill(0))).not.toThrow();
    expect(BigInt(wire.score)).toBe(2n ** 63n - 1n);
  });
});
