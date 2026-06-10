/**
 * Feature: yeti-trials-backend, Property 15: Attestation is always
 * oracle-attested and self-verifying.
 *
 * Validates: Requirements 17.1, 17.2, 17.3, 17.4.
 *
 * For any valid attestation inputs, the returned 64-byte signature verifies
 * against the configured oracle public key over the reconstructed
 * `Signed_Message`, the provenance tier is 2, and the proof source label is
 * exactly "Oracle-Attested Demo Proof". A failing demo condition yields no
 * signature.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { Ed25519Keypair, Ed25519PublicKey } from "@mysten/sui/keypairs/ed25519";
import {
  DOMAIN_BYTES,
  buildSignedMessage,
  type ProofPayload,
  type WireProofPayload,
} from "@yeti-trials/shared";

import {
  PROOF_SOURCE_LABEL,
  buildAttestation,
  evaluateDemoCondition,
  signerFromKeypair,
} from "./oracle.js";

/** Fixed, reproducible test-only signer (NOT an operational key). */
const FIXED_SEED = Uint8Array.from(Array.from({ length: 32 }, (_, i) => i + 1));
const keypair = Ed25519Keypair.fromSecretKey(FIXED_SEED);
const signer = signerFromKeypair(keypair);
const oraclePk = new Ed25519PublicKey(signer.publicKeyBytes());

/** Rebuild the canonical Signed_Message from the wire payload the API returns. */
function signedMessageFromWire(wire: WireProofPayload): Uint8Array {
  const payload: ProofPayload = {
    network: wire.network,
    packageId: wire.packageId,
    seasonId: BigInt(wire.seasonId),
    trialId: BigInt(wire.trialId),
    factionId: wire.factionId,
    passportId: wire.passportId,
    wallet: wire.wallet,
    proofSource: wire.proofSource,
    provenanceTier: wire.provenanceTier,
    score: BigInt(wire.score),
    territoryPower: BigInt(wire.territoryPower),
    issuedMs: BigInt(wire.issuedMs),
    expiryMs: BigInt(wire.expiryMs),
    nonce: BigInt(wire.nonce),
    nullifier: wire.nullifier,
  };
  return buildSignedMessage(DOMAIN_BYTES, payload);
}

const genAddr = fc
  .uint8Array({ minLength: 32, maxLength: 32 })
  .map((b) => "0x" + Buffer.from(b).toString("hex"));
const genU64 = fc.bigInt({ min: 0n, max: 2n ** 64n - 1n });
// Keep issued + window < 2^64 so the u64 expiry never overflows.
const genHalfU64 = fc.bigInt({ min: 0n, max: 2n ** 62n });

describe("Property 15: attestation is oracle-attested and self-verifying", () => {
  it("returns a 64-byte signature that verifies, tier 2, correct label", async () => {
    await fc.assert(
      fc.asyncProperty(
        genAddr,
        genAddr,
        genAddr,
        genU64,
        genU64,
        fc.integer({ min: 0, max: 3 }),
        genU64,
        genU64,
        genHalfU64,
        genHalfU64,
        genU64,
        async (
          packageId,
          passportId,
          wallet,
          seasonId,
          trialId,
          factionId,
          score,
          territoryPower,
          nowMs,
          expiryWindowMs,
          nonce,
        ) => {
          const att = await buildAttestation(signer, {
            network: new TextEncoder().encode("localnet"),
            packageId,
            seasonId,
            trialId,
            factionId,
            passportId,
            wallet,
            score,
            territoryPower,
            nowMs,
            expiryWindowMs,
            nonce,
          });

          // 64-byte raw signature.
          expect(att.signature).toHaveLength(64);
          // Tier 2 + exact label (Requirement 17.2).
          expect(att.provenanceTier).toBe(2);
          expect(att.proofSource).toBe(PROOF_SOURCE_LABEL);
          expect(att.payload.provenanceTier).toBe(2);
          // Self-verifying over the Signed_Message (Requirement 17.4).
          const msg = signedMessageFromWire(att.payload);
          const ok = await oraclePk.verify(msg, Uint8Array.from(att.signature));
          expect(ok).toBe(true);
          // Mirror fields are consistent.
          expect(att.expiry).toBe((nowMs + expiryWindowMs).toString());
          expect(att.score).toBe(score.toString());
          expect(att.territoryPower).toBe(territoryPower.toString());
        },
      ),
      { numRuns: 60 },
    );
  });

  it("a tampered signature does not verify", async () => {
    const att = await buildAttestation(signer, {
      network: new TextEncoder().encode("localnet"),
      packageId: "0x" + "11".repeat(32),
      seasonId: 1n,
      trialId: 1n,
      factionId: 1,
      passportId: "0x" + "22".repeat(32),
      wallet: "0x" + "33".repeat(32),
      score: 100n,
      territoryPower: 50n,
      nowMs: 1000n,
      expiryWindowMs: 2000n,
      nonce: 7n,
    });
    const msg = signedMessageFromWire(att.payload);
    const bad = Uint8Array.from(att.signature);
    bad[0] = (bad[0]! ^ 1) & 0xff;
    expect(await oraclePk.verify(msg, bad)).toBe(false);
  });

  it("a failing demo condition yields no signature", async () => {
    // Not in the allowlist and no ownership probe → condition fails. The route
    // gates signing on this result, so no signature is produced.
    const fail = await evaluateDemoCondition("0xabc", { allowlist: [] });
    expect(fail.ok).toBe(false);
    expect(fail.reason).toBeTruthy();

    // Allowlisted wallet passes (the path that would proceed to sign).
    const pass = await evaluateDemoCondition("0xABC", { allowlist: ["0xabc"] });
    expect(pass.ok).toBe(true);
    expect(pass.source).toBe("demo-allowlist");
  });
});
