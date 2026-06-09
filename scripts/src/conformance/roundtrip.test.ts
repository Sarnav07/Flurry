/**
 * Feature: yeti-trials-backend, Property 1: Signing-path byte-identity round-trip
 *
 * TypeScript-side property test (fast-check). For arbitrary valid
 * `ProofPayload` values it asserts:
 *   - BCS serialize → parse → re-serialize is byte-stable (canonical layout);
 *   - the `Signed_Message` is exactly `DOMAIN || bcs(payload)`;
 *   - a raw 64-byte `Ed25519Keypair.sign()` signature verifies over the
 *     message, and any single-byte tamper of the message or signature fails.
 *
 * The cross-language half of Property 1 (TS bytes == Move-reconstructed bytes)
 * is proven by the hermetic Move known-vector test (`proof_tests.move`) and the
 * conformance corpus (`conformance_vectors.move`) over the same shared modules.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { ed25519 } from "@noble/curves/ed25519";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import {
  serializeProofPayload,
  ProofPayloadBcs,
  buildSignedMessage,
  DOMAIN_BYTES,
  type ProofPayload,
} from "@yeti-trials/shared";
import { FIXED_SEED } from "./corpus.js";

const U64_MAX = 2n ** 64n - 1n;
const kp = Ed25519Keypair.fromSecretKey(FIXED_SEED);
const PK = kp.getPublicKey().toRawBytes();

const u64 = fc.bigInt({ min: 0n, max: U64_MAX });
const addr = fc
  .uint8Array({ minLength: 32, maxLength: 32 })
  .map((b) => "0x" + Buffer.from(b).toString("hex"));
const bytes = fc.uint8Array({ minLength: 0, maxLength: 48 }).map((b) => Array.from(b));

const payloadArb: fc.Arbitrary<ProofPayload> = fc.record({
  network: bytes,
  packageId: addr,
  seasonId: u64,
  trialId: u64,
  factionId: fc.integer({ min: 0, max: 3 }),
  passportId: addr,
  wallet: addr,
  proofSource: bytes,
  provenanceTier: fc.integer({ min: 0, max: 2 }),
  score: u64,
  territoryPower: u64,
  issuedMs: u64,
  expiryMs: u64,
  nonce: u64,
  nullifier: fc.uint8Array({ minLength: 32, maxLength: 32 }).map((b) => Array.from(b)),
});

describe("Property 1: signing-path byte-identity round-trip (TS)", () => {
  it("BCS serialize → parse → re-serialize is byte-stable", () => {
    fc.assert(
      fc.property(payloadArb, (payload) => {
        const bytes1 = serializeProofPayload(payload);
        const parsed = ProofPayloadBcs.parse(bytes1);
        const bytes2 = ProofPayloadBcs.serialize(parsed).toBytes();
        expect(Buffer.from(bytes2)).toEqual(Buffer.from(bytes1));
      }),
      { numRuns: 200 },
    );
  });

  it("Signed_Message is exactly DOMAIN || bcs(payload)", () => {
    fc.assert(
      fc.property(payloadArb, (payload) => {
        const msg = buildSignedMessage(DOMAIN_BYTES, payload);
        const body = serializeProofPayload(payload);
        expect(msg.length).toBe(DOMAIN_BYTES.length + body.length);
        expect(Buffer.from(msg.subarray(0, DOMAIN_BYTES.length))).toEqual(
          Buffer.from(DOMAIN_BYTES),
        );
        expect(Buffer.from(msg.subarray(DOMAIN_BYTES.length))).toEqual(Buffer.from(body));
      }),
      { numRuns: 200 },
    );
  });

  it("raw 64-byte signature verifies; single-byte tamper fails", async () => {
    await fc.assert(
      fc.asyncProperty(payloadArb, async (payload) => {
        const msg = buildSignedMessage(DOMAIN_BYTES, payload);
        const sig = await kp.sign(msg);
        expect(sig.length).toBe(64);
        expect(ed25519.verify(sig, msg, PK)).toBe(true);

        // Tamper the message body (after the domain prefix).
        const badMsg = Uint8Array.from(msg);
        badMsg[DOMAIN_BYTES.length] = (badMsg[DOMAIN_BYTES.length] ?? 0) ^ 1;
        expect(ed25519.verify(sig, badMsg, PK)).toBe(false);

        // Tamper the signature.
        const badSig = Uint8Array.from(sig);
        badSig[0] = (badSig[0] ?? 0) ^ 1;
        expect(ed25519.verify(badSig, msg, PK)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
