/**
 * Canonical TypeScript side of the byte-identical TS↔Move signing contract:
 * the `ProofPayload` BCS layout (Requirement 4.1).
 *
 * The 15 fields are declared in the EXACT order the Move `ProofPayload` struct
 * uses, because BCS serialization is positional — one reordered or
 * wrong-width field silently breaks on-chain `ed25519_verify`. This module is
 * the single source of truth for the layout; the Move `proof::ProofPayload`
 * struct and its `bcs::to_bytes` reconstruction are the matching Move side.
 * If either changes, both (and `docs/MESSAGE_FORMAT.md`) change together.
 *
 * Field-by-field layout (see design Critical Path / Requirement 4.1):
 *
 * | # | field           | Move type     | BCS encoding                        |
 * |---|-----------------|---------------|-------------------------------------|
 * | 1 | network         | vector<u8>    | ULEB128 length prefix + bytes       |
 * | 2 | package_id      | address       | 32 raw bytes                        |
 * | 3 | season_id       | u64           | 8 bytes little-endian (BigInt)      |
 * | 4 | trial_id        | u64           | 8 bytes little-endian (BigInt)      |
 * | 5 | faction_id      | u8            | 1 byte                              |
 * | 6 | passport_id     | address       | 32 raw bytes                        |
 * | 7 | wallet          | address       | 32 raw bytes                        |
 * | 8 | proof_source    | vector<u8>    | ULEB128 length prefix + bytes       |
 * | 9 | provenance_tier | u8            | 1 byte                              |
 * |10 | score           | u64           | 8 bytes little-endian (BigInt)      |
 * |11 | territory_power | u64           | 8 bytes little-endian (BigInt)      |
 * |12 | issued_ms       | u64           | 8 bytes little-endian (BigInt)      |
 * |13 | expiry_ms       | u64           | 8 bytes little-endian (BigInt)      |
 * |14 | nonce           | u64           | 8 bytes little-endian (BigInt)      |
 * |15 | nullifier       | vector<u8>    | ULEB128 length prefix + bytes       |
 */

// `@mysten/sui/bcs` re-exports the base `@mysten/bcs` instance extended with
// the Sui-specific `Address` type (32 raw bytes from a hex string), which is
// exactly the Move `address` encoding.
import { bcs } from "@mysten/sui/bcs";

/**
 * Typed `ProofPayload` (camelCase ergonomic shape). All `u64` fields are
 * `bigint` — never `number` — because a JS `number` silently loses precision
 * past 2^53 and would diverge from Move's `u64` at the boundary vectors.
 *
 * `network`, `proofSource`, and `nullifier` are `vector<u8>` (variable-length,
 * ULEB128 length-prefixed in BCS). `packageId`, `passportId`, and `wallet` are
 * 32-byte addresses supplied as 0x-prefixed hex strings.
 */
export interface ProofPayload {
  /** e.g. utf-8 bytes of "localnet" / "testnet". */
  network: Uint8Array | number[];
  /** Current package id, as a 0x hex address (32 bytes). */
  packageId: string;
  seasonId: bigint;
  trialId: bigint;
  /** 0..=3. */
  factionId: number;
  /** Passport object id, as a 0x hex address. */
  passportId: string;
  /** Player wallet, as a 0x hex address. */
  wallet: string;
  /** e.g. utf-8 bytes of "Oracle-Attested Demo Proof". */
  proofSource: Uint8Array | number[];
  /** 2 = Oracle-Attested. */
  provenanceTier: number;
  score: bigint;
  territoryPower: bigint;
  issuedMs: bigint;
  expiryMs: bigint;
  nonce: bigint;
  /** 32-byte blake2b256 nullifier digest. */
  nullifier: Uint8Array | number[];
}

/**
 * The raw BCS schema in the exact 15-field order. Field NAMES here are
 * irrelevant to the produced bytes (BCS structs serialize positionally); the
 * ORDER and the per-field TYPES are what must match Move byte-for-byte. Names
 * are kept in snake_case to mirror the Move struct for readability.
 */
export const ProofPayloadBcs = bcs.struct("ProofPayload", {
  network: bcs.vector(bcs.u8()),
  package_id: bcs.Address,
  season_id: bcs.u64(),
  trial_id: bcs.u64(),
  faction_id: bcs.u8(),
  passport_id: bcs.Address,
  wallet: bcs.Address,
  proof_source: bcs.vector(bcs.u8()),
  provenance_tier: bcs.u8(),
  score: bcs.u64(),
  territory_power: bcs.u64(),
  issued_ms: bcs.u64(),
  expiry_ms: bcs.u64(),
  nonce: bcs.u64(),
  nullifier: bcs.vector(bcs.u8()),
});

/** Normalize a `vector<u8>` input to a plain number[] the bcs layer accepts. */
function toByteArray(v: Uint8Array | number[]): number[] {
  return v instanceof Uint8Array ? Array.from(v) : v;
}

/**
 * Serialize a {@link ProofPayload} to its canonical BCS bytes. `u64` fields are
 * passed as `bigint`; the bcs `u64()` writer encodes them as 8-byte
 * little-endian, matching Move.
 */
export function serializeProofPayload(payload: ProofPayload): Uint8Array {
  return ProofPayloadBcs.serialize({
    network: toByteArray(payload.network),
    package_id: payload.packageId,
    season_id: payload.seasonId,
    trial_id: payload.trialId,
    faction_id: payload.factionId,
    passport_id: payload.passportId,
    wallet: payload.wallet,
    proof_source: toByteArray(payload.proofSource),
    provenance_tier: payload.provenanceTier,
    score: payload.score,
    territory_power: payload.territoryPower,
    issued_ms: payload.issuedMs,
    expiry_ms: payload.expiryMs,
    nonce: payload.nonce,
    nullifier: toByteArray(payload.nullifier),
  }).toBytes();
}
