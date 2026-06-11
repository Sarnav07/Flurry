/**
 * Mirror of `shared/src/types.ts` (the orchestrator HTTP wire contract).
 * `u64` -> decimal STRING, `address`/object-id -> `0x`-hex, `vector<u8>` -> number[].
 * A backend contract change must surface here as a TypeScript error.
 */

// ── Health (GET /health) ────────────────────────────────────────────────────
export interface HealthResponse {
  status: string;
  network: string;
  packageId: string;
  /** u64 decimal string. */
  activeSeason: string;
  oracleSignerKeyId: string;
}

// ── Config (GET /config) ───────────────────────────────────────────────────
export interface FactionInfo {
  id: number;
  name: string;
}

export interface ProvenanceTierInfo {
  name: string;
  value: number;
}

export interface ShardInfo {
  objectId: string;
  faction: number;
  shard: number;
}

export interface SponsorMeta {
  sponsorSlotId: string | null;
  name: string;
  /** u64 decimal string. */
  trialId: string;
  actionLabel: string;
  status: number;
}

export interface ConfigObjectIds {
  seasonId: string;
  oracleRegistryId: string;
  nullifierStoreId: string;
  territoryMapId: string;
  impactEscrowId: string;
  sponsorSlotId: string;
  shards: ShardInfo[];
}

export interface Config {
  network: string;
  packageId: string;
  factions: FactionInfo[];
  /** u64 decimal string. */
  activeSeasonId: string;
  /** u64 decimal string. */
  activeTrialId: string;
  trialLabel: string;
  territoryCount: number;
  shardCount: number;
  provenanceTiers: ProvenanceTierInfo[];
  sponsor: SponsorMeta;
  objectIds: ConfigObjectIds;
  oraclePublicKey: string;
}

// ── Player state (GET /player/:address) ─────────────────────────────────────
export interface PendingProofStatus {
  pendingProofId: string;
  /** u64 decimal string. */
  seasonId: string;
  /** u64 decimal string. */
  trialId: string;
  factionId: number;
  status: 'requested' | 'attested';
  /** u64 decimal string. */
  createdMs: string;
}

export interface PlayerState {
  wallet: string;
  hasPassport: boolean;
  passportId: string | null;
  factionId: number | null;
  /** u64 decimal string, or null. */
  rawReputation: string | null;
  /** u64 decimal string, or null. */
  acceptedProofCount: string | null;
  pending: PendingProofStatus[];
}

// ── Territory state (GET /territory) ────────────────────────────────────────
export interface FactionShardTotals {
  factionId: number;
  /** u64 decimal string. */
  rawScoreTotal: string;
  /** u64 decimal string. */
  territoryPowerTotal: string;
  /** u64 decimal string. */
  acceptedProofCount: string;
}

export interface ImpactStatus {
  escrowId: string | null;
  /** u64 decimal string (MIST). */
  balance: string;
  disbursed: boolean;
  recipients: string[];
}

export interface TerritoryState {
  /** u64 decimal string. */
  seasonId: string;
  finalized: boolean;
  owners: number[];
  /** u64 decimal strings. */
  finalizedPower: string[];
  /** u64 decimal string. */
  underdogMultiplier: string;
  shardTotals: FactionShardTotals[];
  impact: ImpactStatus;
}

// ── Attestation (POST /proof/attest) ────────────────────────────────────────
/**
 * The 15-field ProofPayload for JSON transport. Forwarded VERBATIM into the
 * `submit_proof` PTB later: `u64` fields stay decimal strings, `vector<u8>`
 * fields stay `number[]`. Never re-encode, round, or reorder these.
 */
export interface WireProofPayload {
  network: number[];
  packageId: string;
  /** u64 decimal string. */
  seasonId: string;
  /** u64 decimal string. */
  trialId: string;
  factionId: number;
  passportId: string;
  wallet: string;
  proofSource: number[];
  provenanceTier: number;
  /** u64 decimal string. */
  score: string;
  /** u64 decimal string. */
  territoryPower: string;
  /** u64 decimal string. */
  issuedMs: string;
  /** u64 decimal string. */
  expiryMs: string;
  /** u64 decimal string. */
  nonce: string;
  nullifier: number[];
}

export interface AttestationResponse {
  payload: WireProofPayload;
  signature: number[];
  nullifier: number[];
  /** u64 decimal string. */
  expiry: string;
  /** u64 decimal string. */
  score: string;
  /** u64 decimal string. */
  territoryPower: string;
  proofSource: 'Oracle-Attested Demo Proof';
  provenanceTier: 2;
}
