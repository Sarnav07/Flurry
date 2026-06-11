/**
 * View-models: the boundary-parsed mirrors of the wire types. EVERY `u64`
 * decimal-string field becomes `bigint`. `factionId`/`provenanceTier`/counts/
 * `owners[]` stay `number`; addresses/object ids stay `0x`-hex `string`;
 * `vector<u8>` stays `number[]`. The raw `WireProofPayload` is carried verbatim
 * for later PTB forwarding and is intentionally NOT bigint-converted.
 */
import type {
  ConfigObjectIds,
  FactionInfo,
  ProvenanceTierInfo,
  WireProofPayload,
} from '~/lib/types/wire';

// ── Config ──────────────────────────────────────────────────────────────────
export interface HealthVM {
  status: string;
  network: string;
  packageId: string;
  activeSeason: bigint;
  oracleSignerKeyId: string;
}

export interface SponsorMetaVM {
  sponsorSlotId: string | null;
  name: string;
  trialId: bigint;
  actionLabel: string;
  status: number;
}

export interface ConfigVM {
  network: string;
  packageId: string;
  factions: FactionInfo[];
  activeSeasonId: bigint;
  activeTrialId: bigint;
  trialLabel: string;
  territoryCount: number;
  shardCount: number;
  provenanceTiers: ProvenanceTierInfo[];
  sponsor: SponsorMetaVM;
  objectIds: ConfigObjectIds;
  oraclePublicKey: string;
}

// ── Player state ──────────────────────────────────────────────────────────
export interface PendingProofStatusVM {
  pendingProofId: string;
  seasonId: bigint;
  trialId: bigint;
  factionId: number;
  status: 'requested' | 'attested';
  createdMs: bigint;
}

export interface PlayerStateVM {
  wallet: string;
  hasPassport: boolean;
  passportId: string | null;
  factionId: number | null;
  rawReputation: bigint | null;
  acceptedProofCount: bigint | null;
  pending: PendingProofStatusVM[];
}

// ── Territory state ─────────────────────────────────────────────────────────
export interface FactionShardTotalsVM {
  factionId: number;
  rawScoreTotal: bigint;
  territoryPowerTotal: bigint;
  acceptedProofCount: bigint;
}

export interface ImpactStatusVM {
  escrowId: string | null;
  balance: bigint;
  disbursed: boolean;
  recipients: string[];
}

export interface TerritoryStateVM {
  seasonId: bigint;
  finalized: boolean;
  owners: number[];
  finalizedPower: bigint[];
  underdogMultiplier: bigint;
  shardTotals: FactionShardTotalsVM[];
  impact: ImpactStatusVM;
}

// ── Attestation ─────────────────────────────────────────────────────────────
export interface AttestationResponseVM {
  /** Verbatim wire payload for the `submit_proof` PTB. Do not bigint-convert. */
  payload: WireProofPayload;
  /** Verbatim 64-byte Ed25519 signature. */
  signature: number[];
  /** Verbatim 32-byte nullifier digest. */
  nullifier: number[];
  expiry: bigint;
  score: bigint;
  territoryPower: bigint;
  proofSource: 'Oracle-Attested Demo Proof';
  provenanceTier: 2;
}
