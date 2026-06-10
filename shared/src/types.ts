/**
 * Wire/DTO shapes the orchestrator endpoints return (Task 9.1).
 *
 * These are the JSON-serializable response contracts shared between the
 * orchestrator and the frontend. Two encoding rules apply throughout and exist
 * to avoid the two ways a Sui value silently corrupts over JSON:
 *
 *   1. **`u64` values are decimal STRINGS, never JS `number`.** A JS `number`
 *      loses precision past 2^53, so every on-chain `u64` (reputation, score,
 *      territory power, season/trial ids, balances, expiry, nonce, …) is
 *      carried as a base-10 string and parsed back to `bigint` by the consumer.
 *      Small bounded values (`faction_id` 0..3, `provenance_tier` 0..2, array
 *      lengths/counts) stay `number`.
 *   2. **`vector<u8>` values are `number[]` byte arrays** (each element 0..255),
 *      and `address`/object-id values are `0x`-prefixed hex strings. Byte
 *      arrays are kept as `number[]` (not hex) so an attestation can be fed
 *      straight into a Sui PTB via `tx.pure.vector("u8", …)` without re-parsing.
 *
 * The orchestrator computes with `bigint`/`Uint8Array` internally (reusing
 * `@yeti-trials/shared` bcs/message/nullifier) and converts to these shapes
 * only at the HTTP boundary.
 */

// ===========================================================================
// Config (GET /config) — Requirement 14.2
// ===========================================================================

/** A faction id paired with its display name. */
export interface FactionInfo {
  /** Faction id 0..3 (Glaciers 0, Avalanche 1, Blizzard 2, Thaw 3). */
  id: number;
  /** Display name. */
  name: string;
}

/** A provenance tier name paired with its numeric value. */
export interface ProvenanceTierInfo {
  /** Tier name (Native / Sponsor-Signed / Oracle-Attested). */
  name: string;
  /** Numeric tier value 0..2. */
  value: number;
}

/** One created `ScoreShard` object tagged with its (faction, shard) triple. */
export interface ShardInfo {
  /** Shared `ScoreShard` object id. */
  objectId: string;
  /** Faction id 0..3. */
  faction: number;
  /** Shard index 0..shardCount-1. */
  shard: number;
}

/** Display-only sponsor slot metadata. */
export interface SponsorMeta {
  /** Shared `SponsorSlot` object id, or null if not initialized. */
  sponsorSlotId: string | null;
  /** Sponsor campaign name. */
  name: string;
  /** Trial id the slot is attached to (u64 decimal string). */
  trialId: string;
  /** Human action label. */
  actionLabel: string;
  /** Slot status code. */
  status: number;
}

/** Object ids the frontend needs to build transactions / read state. */
export interface ConfigObjectIds {
  /** Shared `Season` object id. */
  seasonId: string;
  /** Shared `OracleSignerRegistry` id. */
  oracleRegistryId: string;
  /** Shared `NullifierStore` id. */
  nullifierStoreId: string;
  /** Shared `TerritoryMap` id. */
  territoryMapId: string;
  /** Shared `ImpactEscrow` id. */
  impactEscrowId: string;
  /** Shared `SponsorSlot` id. */
  sponsorSlotId: string;
  /** All shared `ScoreShard` objects. */
  shards: ShardInfo[];
}

/** Response shape of `GET /config` (Requirement 14.2). */
export interface Config {
  /** Target Sui network ("localnet" | "testnet"). */
  network: string;
  /** Published package id. */
  packageId: string;
  /** The four factions and their names. */
  factions: FactionInfo[];
  /** Active season numeric id (u64 decimal string). */
  activeSeasonId: string;
  /** Active trial numeric id (u64 decimal string). */
  activeTrialId: string;
  /** Human label of the active trial (display only). */
  trialLabel: string;
  /** Territory count for the season. */
  territoryCount: number;
  /** Shard count (the runtime bucket modulus). */
  shardCount: number;
  /** All provenance tiers. */
  provenanceTiers: ProvenanceTierInfo[];
  /** Sponsor slot metadata. */
  sponsor: SponsorMeta;
  /** Object ids required by the frontend. */
  objectIds: ConfigObjectIds;
  /** Raw 32-byte oracle signer public key as a 0x-hex string. */
  oraclePublicKey: string;
}

// ===========================================================================
// Player state (GET /player/:address) — Requirements 15.1, 15.2
// ===========================================================================

/** A pending proof's UX status (in-memory, not chain truth). */
export interface PendingProofStatus {
  /** Opaque pending-proof identifier returned by POST /proof/request. */
  pendingProofId: string;
  /** Season numeric id the request targeted (u64 decimal string). */
  seasonId: string;
  /** Trial numeric id the request targeted (u64 decimal string). */
  trialId: string;
  /** Faction id the request targeted. */
  factionId: number;
  /** Lifecycle status: "requested" once stored, "attested" after signing. */
  status: "requested" | "attested";
  /** Creation time in epoch ms (u64 decimal string). */
  createdMs: string;
}

/** Response shape of `GET /player/:address` (Requirements 15.1, 15.2). */
export interface PlayerState {
  /** The queried wallet address. */
  wallet: string;
  /** Whether the wallet owns a YetiPassport this season. */
  hasPassport: boolean;
  /** Passport object id, or null when no passport exists. */
  passportId: string | null;
  /** Active faction id, or null when no passport exists. */
  factionId: number | null;
  /** Raw reputation total (u64 decimal string), or null when no passport. */
  rawReputation: string | null;
  /** Accepted-proof count (u64 decimal string), or null when no passport. */
  acceptedProofCount: string | null;
  /** Any pending proof statuses for this wallet (UX state, may be empty). */
  pending: PendingProofStatus[];
}

// ===========================================================================
// Territory state (GET /territory) — Requirement 18.1
// ===========================================================================

/** Per-faction shard totals summed across that faction's shards. */
export interface FactionShardTotals {
  /** Faction id 0..3. */
  factionId: number;
  /** Summed `raw_score_total` across the faction's shards (u64 string). */
  rawScoreTotal: string;
  /** Summed `territory_power_total` across the faction's shards (u64 string). */
  territoryPowerTotal: string;
  /** Summed accepted-proof count across the faction's shards (u64 string). */
  acceptedProofCount: string;
}

/** Impact escrow status carried in the territory response. */
export interface ImpactStatus {
  /** Shared `ImpactEscrow` id, or null when not initialized. */
  escrowId: string | null;
  /** Current held balance in MIST (u64 decimal string). */
  balance: string;
  /** Whether the escrow has been disbursed. */
  disbursed: boolean;
  /** Verified recipient addresses (index = faction id). */
  recipients: string[];
}

/** Response shape of `GET /territory` (Requirement 18.1). */
export interface TerritoryState {
  /** Season numeric id (u64 decimal string). */
  seasonId: string;
  /** Whether the territory map has been finalized. */
  finalized: boolean;
  /** Faction id owning each territory (index = territory). */
  owners: number[];
  /** Per-faction finalized power recorded at finalization (u64 strings). */
  finalizedPower: string[];
  /** Underdog multiplier applied only to the capture comparison (u64 string). */
  underdogMultiplier: string;
  /** Live per-faction shard totals. */
  shardTotals: FactionShardTotals[];
  /** Impact escrow status. */
  impact: ImpactStatus;
}

// ===========================================================================
// Attestation (POST /proof/attest) — Requirements 17.1–17.4
// ===========================================================================

/**
 * A `ProofPayload` serialized for JSON transport: `u64` fields as decimal
 * strings, addresses as `0x`-hex, `vector<u8>` fields as `number[]` byte
 * arrays. Field order is irrelevant on the wire (the canonical BCS bytes are
 * produced by `@yeti-trials/shared`); these are the same 15 fields by name.
 */
export interface WireProofPayload {
  /** Network bytes (e.g. utf-8 of "localnet"). */
  network: number[];
  /** Package id as 0x-hex address. */
  packageId: string;
  /** Season numeric id (u64 string). */
  seasonId: string;
  /** Trial numeric id (u64 string). */
  trialId: string;
  /** Faction id 0..3. */
  factionId: number;
  /** Passport object id as 0x-hex address. */
  passportId: string;
  /** Player wallet as 0x-hex address. */
  wallet: string;
  /** Proof source label bytes (utf-8 of "Oracle-Attested Demo Proof"). */
  proofSource: number[];
  /** Provenance tier (2 = Oracle-Attested). */
  provenanceTier: number;
  /** Score delta (u64 string). */
  score: string;
  /** Territory power delta (u64 string). */
  territoryPower: string;
  /** Issued time epoch ms (u64 string). */
  issuedMs: string;
  /** Expiry time epoch ms (u64 string). */
  expiryMs: string;
  /** Per-proof nonce (u64 string). */
  nonce: string;
  /** 32-byte blake2b256 nullifier digest as a byte array. */
  nullifier: number[];
}

/** Response shape of `POST /proof/attest` (Requirements 17.1–17.4). */
export interface AttestationResponse {
  /** The full reconstructed payload (for PTB construction). */
  payload: WireProofPayload;
  /** Raw 64-byte Ed25519 signature over the Signed_Message (no intent). */
  signature: number[];
  /** 32-byte nullifier digest. */
  nullifier: number[];
  /** Attestation expiry epoch ms (u64 string). */
  expiry: string;
  /** Score delta (u64 string). */
  score: string;
  /** Territory power delta (u64 string). */
  territoryPower: string;
  /** Always the literal "Oracle-Attested Demo Proof". */
  proofSource: "Oracle-Attested Demo Proof";
  /** Always 2 (Oracle-Attested). */
  provenanceTier: 2;
}
