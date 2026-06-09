/**
 * Feature: yeti-trials-backend, Property 16: Cryptographic conformance across generated vectors
 *
 * TypeScript-side harness of the Cryptographic Conformance Test Suite
 * (Requirement 25). It regenerates the SAME corpus the Move known-vector
 * harness (`conformance_vectors.move`) consumes — one corpus, two harnesses —
 * and asserts, FOR ALL vectors (random + mandatory u64 boundary):
 *   (a) the recomputed TS `Signed_Message` bytes equal the corpus bytes (the
 *       exact bytes embedded in the Move harness, which asserts they equal the
 *       Move-reconstructed bytes — so (a) holds across both languages);
 *   (b) the raw 64-byte Ed25519 signature verifies against the fixed oracle
 *       public key;
 *   (c) the TS-derived nullifier equals the corpus nullifier;
 *   (d) the TS-computed shard bucket equals the corpus bucket;
 *   (e) a single-byte tamper of the message or signature makes verification
 *       fail.
 * Any vector failing any assertion fails the suite (Requirement 25.8).
 *
 * On-chain (`ed25519_verify`) confirmation of (b)/(e) is provided hermetically
 * by the Move harness (which calls `sui::ed25519::ed25519_verify` over the same
 * signatures) and, when a validator is available, by the localnet dev-inspect
 * run in `proofRoundtrip.ts`.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";
import {
  buildSignedMessage,
  DOMAIN_BYTES,
  deriveNullifier,
  shardBucket,
  type ProofPayload,
} from "@yeti-trials/shared";
import {
  generateCorpus,
  U64_BOUNDARIES,
  type CorpusVector,
} from "./corpus.js";

let publicKey: Uint8Array;
let vectors: CorpusVector[];

beforeAll(async () => {
  const corpus = await generateCorpus();
  publicKey = Uint8Array.from(corpus.publicKey);
  vectors = corpus.vectors;
});

function payloadOf(v: CorpusVector): ProofPayload {
  return {
    network: v.network,
    packageId: v.packageId,
    seasonId: v.seasonId,
    trialId: v.trialId,
    factionId: v.factionId,
    passportId: v.passportId,
    wallet: v.wallet,
    proofSource: v.proofSource,
    provenanceTier: v.provenanceTier,
    score: v.score,
    territoryPower: v.territoryPower,
    issuedMs: v.issuedMs,
    expiryMs: v.expiryMs,
    nonce: v.nonce,
    nullifier: v.nullifier,
  };
}

describe("Property 16: cryptographic conformance corpus (TS harness)", () => {
  it("corpus has 50–100 random vectors plus the mandatory boundary vectors", () => {
    const random = vectors.filter((v) => v.label.startsWith("random:")).length;
    const boundary = vectors.filter((v) => v.label.startsWith("boundary:")).length;
    expect(random).toBeGreaterThanOrEqual(50);
    expect(random).toBeLessThanOrEqual(100);
    // 7 u64 fields × 8 boundaries (isolated) + 8 all-fields vectors.
    expect(boundary).toBe(7 * U64_BOUNDARIES.length + U64_BOUNDARIES.length);
  });

  it("every mandatory u64 boundary value is present across every u64 field", () => {
    const fields = [
      "season_id",
      "trial_id",
      "score",
      "territory_power",
      "issued_ms",
      "expiry_ms",
      "nonce",
    ];
    const boundaryNames = ["0", "1", "255", "256", "65535", "2^32", "2^63-1", "2^64-1"];
    // map field names used in labels (camelCase vs snake_case): labels use camelCase
    const labelFields = [
      "seasonId",
      "trialId",
      "score",
      "territoryPower",
      "issuedMs",
      "expiryMs",
      "nonce",
    ];
    expect(fields.length).toBe(labelFields.length);
    for (const f of labelFields) {
      for (const b of boundaryNames) {
        const found = vectors.some((v) => v.label === `boundary:${f}=${b}`);
        expect(found, `missing boundary vector ${f}=${b}`).toBe(true);
      }
    }
  });

  it("(a)+(c)+(d): TS recomputation matches the corpus for ALL vectors", () => {
    for (const v of vectors) {
      // (a) byte identity of the TS Signed_Message vs the embedded corpus bytes.
      const msg = buildSignedMessage(DOMAIN_BYTES, payloadOf(v));
      expect(Buffer.from(msg), `signed-message mismatch @ ${v.label}`).toEqual(
        Buffer.from(v.signedMessage),
      );
      // (c) nullifier parity.
      const nul = deriveNullifier({
        seasonId: v.seasonId,
        trialId: v.trialId,
        factionId: v.factionId,
        passportId: v.passportId,
        wallet: v.wallet,
        nonce: v.nonce,
      });
      expect(Buffer.from(nul), `nullifier mismatch @ ${v.label}`).toEqual(
        Buffer.from(v.nullifier),
      );
      // (d) shard bucket parity.
      expect(shardBucket(nul, v.shardCount), `bucket mismatch @ ${v.label}`).toBe(
        v.shardBucket,
      );
    }
  });

  it("(b)+(e): signatures verify and single-byte tamper fails for ALL vectors", () => {
    for (const v of vectors) {
      const msg = Uint8Array.from(v.signedMessage);
      const sig = Uint8Array.from(v.signature);
      expect(sig.length, `sig len @ ${v.label}`).toBe(64);
      // (b) genuine signature verifies.
      expect(ed25519.verify(sig, msg, publicKey), `verify @ ${v.label}`).toBe(true);

      // (e) tamper the message body (after the domain prefix).
      const badMsg = Uint8Array.from(msg);
      badMsg[DOMAIN_BYTES.length] = (badMsg[DOMAIN_BYTES.length] ?? 0) ^ 1;
      expect(ed25519.verify(sig, badMsg, publicKey), `tamper-msg @ ${v.label}`).toBe(
        false,
      );

      // (e) tamper the signature.
      const badSig = Uint8Array.from(sig);
      badSig[0] = (badSig[0] ?? 0) ^ 1;
      expect(ed25519.verify(badSig, msg, publicKey), `tamper-sig @ ${v.label}`).toBe(
        false,
      );
    }
  });
});
