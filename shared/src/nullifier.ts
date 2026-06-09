/**
 * Nullifier derivation and shard-bucket computation — the TypeScript side of
 * the cross-language nullifier contract (Requirements 5.1, 5.4, 6.1, 6.4).
 *
 * The nullifier is the blake2b256 digest of the BCS serialization of an
 * explicitly ORDERED preimage struct (corrected decision 2) — not a loose byte
 * concatenation. Both this module and the Move `proof::compute_nullifier`
 * serialize the identical preimage struct before hashing, so the two
 * implementations cannot silently disagree.
 *
 * Dependency note: blake2b256 is provided by `@noble/hashes` (a vetted,
 * audited hash library). We use the 32-byte output length so the digest equals
 * Sui's `sui::hash::blake2b256`.
 */

import { bcs } from "@mysten/sui/bcs";
import { blake2b } from "@noble/hashes/blake2b";

/**
 * The nullifier preimage in its exact field order (design Nullifier Section):
 *
 * | # | field       | Move type | BCS encoding                  |
 * |---|-------------|-----------|-------------------------------|
 * | 1 | season_id   | u64       | 8 bytes little-endian (BigInt)|
 * | 2 | trial_id    | u64       | 8 bytes little-endian (BigInt)|
 * | 3 | faction_id  | u8        | 1 byte                        |
 * | 4 | passport_id | address   | 32 raw bytes                  |
 * | 5 | wallet      | address   | 32 raw bytes                  |
 * | 6 | nonce       | u64       | 8 bytes little-endian (BigInt)|
 */
export const NullifierPreimageBcs = bcs.struct("NullifierPreimage", {
  season_id: bcs.u64(),
  trial_id: bcs.u64(),
  faction_id: bcs.u8(),
  passport_id: bcs.Address,
  wallet: bcs.Address,
  nonce: bcs.u64(),
});

/** Typed nullifier preimage inputs (camelCase ergonomic shape). */
export interface NullifierPreimage {
  seasonId: bigint;
  trialId: bigint;
  factionId: number;
  passportId: string;
  wallet: string;
  nonce: bigint;
}

/**
 * Derive the 32-byte nullifier: `blake2b256(bcs::to_bytes(&NullifierPreimage))`.
 * Identical inputs produce a digest byte-for-byte equal to the Move
 * computation. (Requirements 5.1, 5.4)
 */
export function deriveNullifier(preimage: NullifierPreimage): Uint8Array {
  const bytes = NullifierPreimageBcs.serialize({
    season_id: preimage.seasonId,
    trial_id: preimage.trialId,
    faction_id: preimage.factionId,
    passport_id: preimage.passportId,
    wallet: preimage.wallet,
    nonce: preimage.nonce,
  }).toBytes();
  return blake2b(bytes, { dkLen: 32 });
}

/**
 * Compute the deterministic shard bucket:
 * `u64_from_le(nullifier[0..8]) % shardCount`.
 *
 * The little-endian u64 of the first 8 nullifier bytes is reduced modulo the
 * Season's configured `shard_count` (the single source of truth for the
 * modulus). Identical to the Move `proof::compute_shard_bucket`. (Requirements
 * 6.1, 6.4)
 */
export function shardBucket(
  nullifier: Uint8Array,
  shardCount: bigint | number,
): number {
  const modulus = typeof shardCount === "bigint" ? shardCount : BigInt(shardCount);
  if (modulus <= 0n) {
    throw new Error("shardCount must be a positive integer");
  }
  let acc = 0n;
  for (let i = 0; i < 8; i++) {
    acc += BigInt(nullifier[i] ?? 0) << BigInt(i * 8);
  }
  return Number(acc % modulus);
}
