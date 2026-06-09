/**
 * Emits the checked-in Phase-2 conformance corpus in two forms from ONE source
 * ({@link generateCorpus}):
 *
 *   1. `contracts/tests/conformance_vectors.move` — the Move known-vector
 *      harness (consumed by `sui move test`), asserting per-vector byte
 *      identity, on-chain-style `ed25519_verify`, nullifier parity, shard
 *      bucket parity, and single-byte tamper rejection.
 *   2. `scripts/src/conformance/corpus.json` — the same corpus as data, used by
 *      the TS conformance vitest and as a reviewable record.
 *   3. `docs/conformance-corpus-sample.md` — a human-readable sample (the
 *      mandatory u64 boundary vectors shown explicitly) for review.
 *
 * Run: `pnpm --filter @yeti-trials/scripts gen:conformance`
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateCorpus,
  CONFORMANCE_SHARD_COUNT,
  U64_BOUNDARIES,
  type CorpusVector,
} from "./conformance/corpus.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");

const MOVE_OUT = resolve(REPO, "contracts/tests/conformance_vectors.move");
const JSON_OUT = resolve(REPO, "scripts/src/conformance/corpus.json");
const SAMPLE_OUT = resolve(REPO, "docs/conformance-corpus-sample.md");

const CHUNK_SIZE = 12;

function byteVec(bytes: number[]): string {
  return `vector[${bytes.join(", ")}]`;
}

function addrLit(hex: string): string {
  // `@0x...` accepts the full 64-hex address.
  return `@${hex}`;
}

function moveCheckCall(v: CorpusVector): string {
  return [
    "    check(",
    `        ${byteVec(v.signedMessage)},`,
    `        ${byteVec(v.nullifier)},`,
    `        ${byteVec(v.signature)},`,
    `        ${byteVec(v.network)},`,
    `        ${addrLit(v.packageId)},`,
    `        ${v.seasonId},`,
    `        ${v.trialId},`,
    `        ${v.factionId},`,
    `        ${addrLit(v.passportId)},`,
    `        ${addrLit(v.wallet)},`,
    `        ${byteVec(v.proofSource)},`,
    `        ${v.provenanceTier},`,
    `        ${v.score},`,
    `        ${v.territoryPower},`,
    `        ${v.issuedMs},`,
    `        ${v.expiryMs},`,
    `        ${v.nonce},`,
    `        ${v.shardBucket},`,
    `        ${v.shardCount},`,
    "    );",
  ].join("\n");
}

function emitMove(publicKey: number[], vectors: CorpusVector[]): string {
  const chunks: CorpusVector[][] = [];
  for (let i = 0; i < vectors.length; i += CHUNK_SIZE) {
    chunks.push(vectors.slice(i, i + CHUNK_SIZE));
  }

  const header = `/// GENERATED FILE — do not edit by hand.
/// Regenerate with: pnpm --filter @yeti-trials/scripts gen:conformance
///
/// Phase-2 Cryptographic Conformance Test Suite — Move known-vector harness.
///
/// Feature: yeti-trials-backend, Property 16: Cryptographic conformance across generated vectors
///
/// Consumes a checked-in corpus of ${vectors.length} ProofPayload vectors
/// (${countPrefix(vectors, "random:")} seeded-random + ${boundaryCount(vectors)} mandatory u64 boundary
/// + ${countPrefix(vectors, "edge:")} variable-length vector<u8> ULEB128 edge
/// + ${countPrefix(vectors, "extreme:")} extreme-address vectors).
/// For every vector this harness asserts, hermetically:
///   (a) Move-reconstructed Signed_Message bytes == the TypeScript-serialized
///       bytes checked into the corpus;
///   (b) the raw 64-byte Ed25519 signature produced in TypeScript verifies via
///       sui::ed25519::ed25519_verify against the fixed oracle public key
///       (this also cryptographically witnesses (a): ed25519 cannot verify
///       unless the message bytes match exactly what TS signed);
///   (c) the Move-computed nullifier == the TS-derived nullifier;
///   (d) the Move-computed shard bucket == the TS-computed shard bucket;
///   (e) flipping a single byte of the signature OR the message makes
///       verification fail.
/// Any vector failing any assertion fails the suite (Requirement 25.8).
#[test_only]
module yeti_trials::conformance_vectors;

use sui::ed25519;
use yeti_trials::proof;

/// Fixed test-only oracle public key (32 raw bytes) matching the corpus signer.
fun oracle_pk(): vector<u8> {
    ${byteVec(publicKey)}
}

/// Assert every conformance property for a single corpus vector.
fun check(
    expected_msg: vector<u8>,
    expected_nullifier: vector<u8>,
    sig: vector<u8>,
    network: vector<u8>,
    package_id: address,
    season_id: u64,
    trial_id: u64,
    faction_id: u8,
    passport_id: address,
    wallet: address,
    proof_source: vector<u8>,
    provenance_tier: u8,
    score: u64,
    territory_power: u64,
    issued_ms: u64,
    expiry_ms: u64,
    nonce: u64,
    expected_bucket: u64,
    shard_count: u64,
) {
    let pk = oracle_pk();

    // (c) Nullifier parity: Move compute_nullifier == TS deriveNullifier.
    let computed_null = proof::compute_nullifier(
        season_id, trial_id, faction_id, passport_id, wallet, nonce,
    );
    assert!(computed_null == expected_nullifier, 102);

    // (d) Shard bucket parity (nullifier passed by reference, reused below).
    assert!(proof::compute_shard_bucket(&expected_nullifier, shard_count) == expected_bucket, 103);

    // (e) Tamper the message -> verification must fail.
    let mut bad_msg = expected_msg;
    let m0 = *vector::borrow(&bad_msg, 0);
    *vector::borrow_mut(&mut bad_msg, 0) = m0 ^ 1u8;
    assert!(!ed25519::ed25519_verify(&sig, &pk, &bad_msg), 104);

    // (e) Tamper the signature -> verification must fail.
    let mut bad_sig = sig;
    let s0 = *vector::borrow(&bad_sig, 0);
    *vector::borrow_mut(&mut bad_sig, 0) = s0 ^ 1u8;

    // Reconstruct the payload from typed fields (expected_nullifier moved last).
    let payload = proof::build_payload(
        network, package_id, season_id, trial_id, faction_id, passport_id,
        wallet, proof_source, provenance_tier, score, territory_power,
        issued_ms, expiry_ms, nonce, expected_nullifier,
    );

    // (a) Byte identity: Move-reconstructed Signed_Message == TS bytes.
    assert!(proof::signed_message_bytes(&payload) == expected_msg, 100);

    // (b) Untampered signature verifies (also witnesses (a) cryptographically).
    assert!(proof::verify_payload_signature(&payload, &sig, &pk), 101);

    // (e) Tampered signature does not verify against the genuine message.
    assert!(!proof::verify_payload_signature(&payload, &bad_sig, &pk), 105);
}
`;

  const fns = chunks
    .map((chunk, idx) => {
      const body = chunk.map(moveCheckCall).join("\n\n");
      return `#[test]
/// Corpus chunk ${idx} (${chunk.length} vectors): ${chunk[0]!.label} .. ${chunk[chunk.length - 1]!.label}
fun conformance_chunk_${idx}() {
${body}
}`;
    })
    .join("\n\n");

  return `${header}\n${fns}\n`;
}

function boundaryCount(vectors: CorpusVector[]): number {
  return vectors.filter((v) => v.label.startsWith("boundary:")).length;
}

function countPrefix(vectors: CorpusVector[], prefix: string): number {
  return vectors.filter((v) => v.label.startsWith(prefix)).length;
}

function emitSample(publicKey: number[], vectors: CorpusVector[]): string {
  const hex = (b: number[]) => Buffer.from(b).toString("hex");
  const boundaryAll = U64_BOUNDARIES.map((bv) => {
    const name =
      bv === 0n
        ? "0"
        : bv === 2n ** 32n
          ? "2^32"
          : bv === 2n ** 63n - 1n
            ? "2^63-1"
            : bv === 2n ** 64n - 1n
              ? "2^64-1"
              : bv.toString();
    const v = vectors.find((x) => x.label === `boundary:all=${name}`)!;
    return { name, v };
  });

  const lines: string[] = [];
  lines.push("# Phase-2 Conformance Corpus — Sample Dump");
  lines.push("");
  lines.push(
    "Generated by `pnpm --filter @yeti-trials/scripts gen:conformance`. This is a reviewable record; the authoritative corpus lives in `scripts/src/conformance/corpus.json` and `contracts/tests/conformance_vectors.move`.",
  );
  lines.push("");
  lines.push(`- Total vectors: **${vectors.length}**`);
  lines.push(`- Seeded-random vectors: **${countPrefix(vectors, "random:")}**`);
  lines.push(`- Boundary vectors: **${boundaryCount(vectors)}**`);
  lines.push(`- Variable-length ULEB128 edge vectors: **${countPrefix(vectors, "edge:")}**`);
  lines.push(`- Extreme-address vectors: **${countPrefix(vectors, "extreme:")}**`);
  lines.push(`- Shard modulus (Season.shard_count): **${CONFORMANCE_SHARD_COUNT}**`);
  lines.push(`- Fixed oracle public key (32 bytes): \`${hex(publicKey)}\``);
  lines.push("");
  lines.push(
    "## Mandatory u64 boundary vectors (all seven u64 fields set to the boundary)",
  );
  lines.push("");
  lines.push(
    "Each row sets `season_id`, `trial_id`, `score`, `territory_power`, `issued_ms`, `expiry_ms`, and `nonce` all to the boundary value.",
  );
  lines.push("");
  lines.push("| boundary | numeric value | nullifier (hex) | bucket | sig len | msg len |");
  lines.push("|---|---|---|---|---|---|");
  for (const { name, v } of boundaryAll) {
    const value = v.seasonId.toString();
    lines.push(
      `| \`${name}\` | ${value} | \`${hex(v.nullifier).slice(0, 24)}…\` | ${v.shardBucket} | ${v.signature.length} | ${v.signedMessage.length} |`,
    );
  }
  lines.push("");
  lines.push("## Per-field boundary coverage");
  lines.push("");
  lines.push(
    "In addition to the all-fields rows above, the corpus isolates each u64 field at each boundary (others nominal):",
  );
  lines.push("");
  const fields = [
    "season_id",
    "trial_id",
    "score",
    "territory_power",
    "issued_ms",
    "expiry_ms",
    "nonce",
  ];
  lines.push(`Fields covered: ${fields.map((f) => `\`${f}\``).join(", ")}.`);
  lines.push("");
  lines.push(
    `Boundary values per field: 0, 1, 255, 256, 65535, 2^32, 2^63-1, 2^64-1 → ${fields.length} × ${U64_BOUNDARIES.length} = ${fields.length * U64_BOUNDARIES.length} isolated boundary vectors, plus ${U64_BOUNDARIES.length} all-fields vectors.`,
  );
  lines.push("");
  lines.push("## Variable-length `vector<u8>` ULEB128 edge vectors (Check B)");
  lines.push("");
  lines.push(
    "These exercise the BCS `vector<u8>` length encoding for `proof_source` and `network`, including the empty (length 0), length 1, and length 200 (>= 128, multi-byte ULEB128 length prefix) cases.",
  );
  lines.push("");
  lines.push("| label | field | length | ULEB128 prefix |");
  lines.push("|---|---|---|---|");
  for (const v of vectors.filter((x) => x.label.startsWith("edge:"))) {
    const onProofSource = v.label.includes("proof_source");
    const field = onProofSource ? "proof_source" : "network";
    const len = onProofSource ? v.proofSource.length : v.network.length;
    const prefix =
      len < 128 ? `0x${len.toString(16).padStart(2, "0")}` : `0x${(0x80 | (len & 0x7f)).toString(16)} 0x${(len >> 7).toString(16).padStart(2, "0")}`;
    lines.push(`| \`${v.label}\` | ${field} | ${len} | \`${prefix}\` |`);
  }
  lines.push("");
  lines.push("## Extreme-address vectors (Check C)");
  lines.push("");
  lines.push(
    "These set `package_id`, `passport_id`, and `wallet` to extreme 32-byte Sui addresses (all-zero `0x0…0`, `0x0…01`, all-ones `0xff…ff`, plus a mixed vector) to exercise address normalization/serialization at the boundaries.",
  );
  lines.push("");
  lines.push("| label | package_id | passport_id | wallet |");
  lines.push("|---|---|---|---|");
  for (const v of vectors.filter((x) => x.label.startsWith("extreme:"))) {
    const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
    lines.push(`| \`${v.label}\` | \`${short(v.packageId)}\` | \`${short(v.passportId)}\` | \`${short(v.wallet)}\` |`);
  }
  lines.push("");
  lines.push("## First 3 random vectors (abridged)");
  lines.push("");
  for (let i = 0; i < 3; i++) {
    const v = vectors.find((x) => x.label === `random:${i}`)!;
    lines.push(`### ${v.label}`);
    lines.push("");
    lines.push("```");
    lines.push(`network        = ${hex(v.network)}`);
    lines.push(`package_id     = ${v.packageId}`);
    lines.push(`season_id      = ${v.seasonId}`);
    lines.push(`trial_id       = ${v.trialId}`);
    lines.push(`faction_id     = ${v.factionId}`);
    lines.push(`passport_id    = ${v.passportId}`);
    lines.push(`wallet         = ${v.wallet}`);
    lines.push(`proof_source   = ${hex(v.proofSource)}`);
    lines.push(`provenance_tier= ${v.provenanceTier}`);
    lines.push(`score          = ${v.score}`);
    lines.push(`territory_power= ${v.territoryPower}`);
    lines.push(`issued_ms      = ${v.issuedMs}`);
    lines.push(`expiry_ms      = ${v.expiryMs}`);
    lines.push(`nonce          = ${v.nonce}`);
    lines.push(`nullifier      = ${hex(v.nullifier)}`);
    lines.push(`shard_bucket   = ${v.shardBucket}`);
    lines.push(`signature      = ${hex(v.signature)}`);
    lines.push("```");
    lines.push("");
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const { publicKey, vectors } = await generateCorpus();

  // Sanity: total random must be within [50, 100] (count by label prefix so the
  // edge/extreme vectors added for Phase-2 hardening are not miscounted).
  const random = countPrefix(vectors, "random:");
  if (random < 50 || random > 100) {
    throw new Error(`random vector count ${random} outside [50,100]`);
  }
  const edge = countPrefix(vectors, "edge:");
  const extreme = countPrefix(vectors, "extreme:");

  mkdirSync(dirname(MOVE_OUT), { recursive: true });
  mkdirSync(dirname(JSON_OUT), { recursive: true });
  mkdirSync(dirname(SAMPLE_OUT), { recursive: true });

  writeFileSync(MOVE_OUT, emitMove(publicKey, vectors));
  writeFileSync(
    JSON_OUT,
    JSON.stringify(
      {
        publicKey,
        shardCount: CONFORMANCE_SHARD_COUNT.toString(),
        count: vectors.length,
        randomCount: random,
        boundaryCount: boundaryCount(vectors),
        edgeCount: edge,
        extremeCount: extreme,
        vectors: vectors.map((v) => ({
          ...v,
          seasonId: v.seasonId.toString(),
          trialId: v.trialId.toString(),
          score: v.score.toString(),
          territoryPower: v.territoryPower.toString(),
          issuedMs: v.issuedMs.toString(),
          expiryMs: v.expiryMs.toString(),
          nonce: v.nonce.toString(),
          shardCount: v.shardCount.toString(),
        })),
      },
      null,
      0,
    ),
  );
  writeFileSync(SAMPLE_OUT, emitSample(publicKey, vectors));

  console.log(
    `Wrote ${vectors.length} vectors (${random} random + ${boundaryCount(vectors)} boundary + ${edge} edge + ${extreme} extreme).`,
  );
  console.log(`  Move:   ${MOVE_OUT}`);
  console.log(`  JSON:   ${JSON_OUT}`);
  console.log(`  Sample: ${SAMPLE_OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
