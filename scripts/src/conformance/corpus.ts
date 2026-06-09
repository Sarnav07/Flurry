/**
 * Deterministic generator for the Phase-2 Cryptographic Conformance corpus
 * (Requirement 25 / Property 16).
 *
 * Produces a reproducible set of `ProofPayload` vectors:
 *   - a fixed number of pseudo-random vectors (seeded PRNG),
 *   - mandatory u64 boundary vectors exercising 0, 1, 255, 256, 65535, 2^32,
 *     2^63-1, 2^64-1 across every u64 field,
 *   - variable-length `vector<u8>` ULEB128 edge vectors (`edge:*`) exercising
 *     empty (length 0), length 1, and length 200 (>= 128, the multi-byte
 *     ULEB128 length-prefix path) for `proof_source` and `network`, and
 *   - extreme-address vectors (`extreme:*`) setting `package_id`,
 *     `passport_id`, and `wallet` to all-zero, 0x0…01, and all-ones addresses.
 *
 * For each vector it computes, using the SHARED single-source-of-truth modules
 * (`@yeti-trials/shared`): the BCS-serialized `Signed_Message`, the nullifier,
 * the shard bucket, and a raw 64-byte Ed25519 signature from a FIXED keypair.
 *
 * The fixed keypair (seed below) is a TEST-ONLY deterministic key used solely
 * to make the checked-in corpus reproducible. It is NOT an operational key.
 */

import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import {
  buildSignedMessage,
  DOMAIN_BYTES,
  deriveNullifier,
  shardBucket,
  type ProofPayload,
} from "@yeti-trials/shared";

/** Fixed, reproducible test-only signing seed (32 bytes = 1..32). */
export const FIXED_SEED: Uint8Array = Uint8Array.from(
  Array.from({ length: 32 }, (_, i) => i + 1),
);

/** Shard modulus used for the conformance bucket assertions. */
export const CONFORMANCE_SHARD_COUNT = 4n;

/** The mandatory u64 boundary values (Requirement 25.7). */
export const U64_BOUNDARIES: bigint[] = [
  0n,
  1n,
  255n,
  256n,
  65535n,
  2n ** 32n,
  2n ** 63n - 1n,
  2n ** 64n - 1n,
];

/** Number of seeded random vectors (must keep total random in [50,100]). */
export const RANDOM_VECTOR_COUNT = 60;

export interface CorpusVector {
  /** Stable label for diagnostics (e.g. "boundary:score=2^64-1" or "random:7"). */
  label: string;
  network: number[];
  packageId: string;
  seasonId: bigint;
  trialId: bigint;
  factionId: number;
  passportId: string;
  wallet: string;
  proofSource: number[];
  provenanceTier: number;
  score: bigint;
  territoryPower: bigint;
  issuedMs: bigint;
  expiryMs: bigint;
  nonce: bigint;
  nullifier: number[];
  /** DOMAIN || bcs(payload). */
  signedMessage: number[];
  /** Raw 64-byte Ed25519 signature over signedMessage by the fixed key. */
  signature: number[];
  shardCount: bigint;
  shardBucket: number;
}

/** Small, fast, deterministic PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randU64(rnd: () => number): bigint {
  // Compose a full-width u64 from two 32-bit halves.
  const hi = BigInt(Math.floor(rnd() * 0x100000000)) & 0xffffffffn;
  const lo = BigInt(Math.floor(rnd() * 0x100000000)) & 0xffffffffn;
  return (hi << 32n) | lo;
}

function randBytes(rnd: () => number, len: number): number[] {
  return Array.from({ length: len }, () => Math.floor(rnd() * 256));
}

function randAddress(rnd: () => number): string {
  return "0x" + randBytes(rnd, 32).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const ENC = new TextEncoder();

const NETWORKS: number[][] = [
  Array.from(ENC.encode("localnet")),
  Array.from(ENC.encode("testnet")),
];
const PROOF_SOURCE = Array.from(ENC.encode("Oracle-Attested Demo Proof"));

/** Extreme 32-byte Sui addresses for boundary serialization/normalization. */
const ADDR_ZERO = "0x" + "00".repeat(32); // all-zero 0x0…0
const ADDR_ONE = "0x" + "00".repeat(31) + "01"; // 0x0…01
const ADDR_MAX = "0x" + "ff".repeat(32); // all-ones 0xff…ff

/** Deterministic filler bytes for variable-length vector<u8> edge vectors. */
function fillBytes(len: number): number[] {
  return Array.from({ length: len }, (_, i) => (i * 7 + 3) & 0xff);
}

interface RawFields {
  label: string;
  network: number[];
  packageId: string;
  seasonId: bigint;
  trialId: bigint;
  factionId: number;
  passportId: string;
  wallet: string;
  proofSource: number[];
  provenanceTier: number;
  score: bigint;
  territoryPower: bigint;
  issuedMs: bigint;
  expiryMs: bigint;
  nonce: bigint;
}

/** Nominal (non-boundary) values used as the base for boundary vectors. */
function nominalBase(label: string): RawFields {
  return {
    label,
    network: NETWORKS[0]!,
    packageId: "0x" + "11".repeat(32),
    seasonId: 1n,
    trialId: 1n,
    factionId: 1,
    passportId: "0x" + "22".repeat(32),
    wallet: "0x" + "33".repeat(32),
    proofSource: PROOF_SOURCE,
    provenanceTier: 2,
    score: 100n,
    territoryPower: 50n,
    issuedMs: 1_000n,
    expiryMs: 2_000n,
    nonce: 7n,
  };
}

const U64_FIELDS = [
  "seasonId",
  "trialId",
  "score",
  "territoryPower",
  "issuedMs",
  "expiryMs",
  "nonce",
] as const;

type U64Field = (typeof U64_FIELDS)[number];

function boundaryName(v: bigint): string {
  switch (v) {
    case 0n:
      return "0";
    case 1n:
      return "1";
    case 255n:
      return "255";
    case 256n:
      return "256";
    case 65535n:
      return "65535";
    case 2n ** 32n:
      return "2^32";
    case 2n ** 63n - 1n:
      return "2^63-1";
    case 2n ** 64n - 1n:
      return "2^64-1";
    default:
      return v.toString();
  }
}

/** Build the raw (pre-crypto) field sets: random + boundary. */
export function buildRawFields(): RawFields[] {
  const out: RawFields[] = [];
  const rnd = mulberry32(0xc0ffee);

  // Seeded random vectors.
  for (let i = 0; i < RANDOM_VECTOR_COUNT; i++) {
    out.push({
      label: `random:${i}`,
      network: NETWORKS[i % NETWORKS.length]!,
      packageId: randAddress(rnd),
      seasonId: randU64(rnd),
      trialId: randU64(rnd),
      factionId: Math.floor(rnd() * 4),
      passportId: randAddress(rnd),
      wallet: randAddress(rnd),
      proofSource: randBytes(rnd, 1 + Math.floor(rnd() * 40)),
      provenanceTier: Math.floor(rnd() * 3),
      score: randU64(rnd),
      territoryPower: randU64(rnd),
      issuedMs: randU64(rnd),
      expiryMs: randU64(rnd),
      nonce: randU64(rnd),
    });
  }

  // Per-field boundary vectors: isolate one u64 field at each boundary value
  // while the rest stay nominal — proves each field's width independently.
  for (const field of U64_FIELDS) {
    for (const bv of U64_BOUNDARIES) {
      const base = nominalBase(`boundary:${field}=${boundaryName(bv)}`);
      (base as Record<U64Field, bigint>)[field] = bv;
      out.push(base);
    }
  }

  // All-fields-at-boundary vectors: every u64 field set to the same boundary.
  for (const bv of U64_BOUNDARIES) {
    const base = nominalBase(`boundary:all=${boundaryName(bv)}`);
    for (const field of U64_FIELDS) {
      (base as Record<U64Field, bigint>)[field] = bv;
    }
    out.push(base);
  }

  // Variable-length vector<u8> ULEB128 edge vectors (Check B). The random
  // corpus never exceeds ~40 bytes, so the multi-byte ULEB128 length-prefix
  // path (length >= 128) and the empty/length-1 paths are otherwise untested.
  // proof_source = empty (0-byte vector<u8>; 1-byte ULEB128 length 0x00).
  {
    const base = nominalBase("edge:proof_source=empty");
    base.proofSource = [];
    out.push(base);
  }
  // proof_source = length 1 (1-byte ULEB128 length 0x01).
  {
    const base = nominalBase("edge:proof_source=len1");
    base.proofSource = fillBytes(1);
    out.push(base);
  }
  // proof_source = length 200 (>= 128 -> 2-byte ULEB128 length prefix 0xC8 0x01).
  {
    const base = nominalBase("edge:proof_source=len200");
    base.proofSource = fillBytes(200);
    out.push(base);
  }
  // network = empty (0-byte vector<u8>) — exercises the empty path on a second
  // variable-length field.
  {
    const base = nominalBase("edge:network=empty");
    base.network = [];
    out.push(base);
  }
  // network = length 1 — empty + length-1 coverage on the network field too.
  {
    const base = nominalBase("edge:network=len1");
    base.network = fillBytes(1);
    out.push(base);
  }

  // Extreme address vectors (Check C): exercise Sui address normalization /
  // serialization at the boundaries by setting package_id, passport_id, and
  // wallet to all-zero, 0x0…01, and all-ones addresses.
  {
    const base = nominalBase("extreme:addr=zero");
    base.packageId = ADDR_ZERO;
    base.passportId = ADDR_ZERO;
    base.wallet = ADDR_ZERO;
    out.push(base);
  }
  {
    const base = nominalBase("extreme:addr=one");
    base.packageId = ADDR_ONE;
    base.passportId = ADDR_ONE;
    base.wallet = ADDR_ONE;
    out.push(base);
  }
  {
    const base = nominalBase("extreme:addr=max");
    base.packageId = ADDR_MAX;
    base.passportId = ADDR_MAX;
    base.wallet = ADDR_MAX;
    out.push(base);
  }
  // Mixed extreme addresses in a single vector (zero / one / max across the
  // three address fields) so a positional address mix-up cannot pass.
  {
    const base = nominalBase("extreme:addr=mixed");
    base.packageId = ADDR_ZERO;
    base.passportId = ADDR_ONE;
    base.wallet = ADDR_MAX;
    out.push(base);
  }

  return out;
}

/** Generate the full corpus, computing crypto material with the shared modules. */
export async function generateCorpus(): Promise<{
  publicKey: number[];
  vectors: CorpusVector[];
}> {
  const kp = Ed25519Keypair.fromSecretKey(FIXED_SEED);
  const publicKey = Array.from(kp.getPublicKey().toRawBytes());

  const vectors: CorpusVector[] = [];
  for (const f of buildRawFields()) {
    const nullifier = deriveNullifier({
      seasonId: f.seasonId,
      trialId: f.trialId,
      factionId: f.factionId,
      passportId: f.passportId,
      wallet: f.wallet,
      nonce: f.nonce,
    });
    const bucket = shardBucket(nullifier, CONFORMANCE_SHARD_COUNT);

    const payload: ProofPayload = {
      network: f.network,
      packageId: f.packageId,
      seasonId: f.seasonId,
      trialId: f.trialId,
      factionId: f.factionId,
      passportId: f.passportId,
      wallet: f.wallet,
      proofSource: f.proofSource,
      provenanceTier: f.provenanceTier,
      score: f.score,
      territoryPower: f.territoryPower,
      issuedMs: f.issuedMs,
      expiryMs: f.expiryMs,
      nonce: f.nonce,
      nullifier,
    };
    const signedMessage = buildSignedMessage(DOMAIN_BYTES, payload);
    // Raw 64-byte Ed25519 signature (no Sui intent envelope) — Requirement 4.4.
    const signature = await kp.sign(signedMessage);

    vectors.push({
      label: f.label,
      network: f.network,
      packageId: f.packageId,
      seasonId: f.seasonId,
      trialId: f.trialId,
      factionId: f.factionId,
      passportId: f.passportId,
      wallet: f.wallet,
      proofSource: f.proofSource,
      provenanceTier: f.provenanceTier,
      score: f.score,
      territoryPower: f.territoryPower,
      issuedMs: f.issuedMs,
      expiryMs: f.expiryMs,
      nonce: f.nonce,
      nullifier: Array.from(nullifier),
      signedMessage: Array.from(signedMessage),
      signature: Array.from(signature),
      shardCount: CONFORMANCE_SHARD_COUNT,
      shardBucket: bucket,
    } satisfies CorpusVector);
  }

  return { publicKey, vectors };
}
