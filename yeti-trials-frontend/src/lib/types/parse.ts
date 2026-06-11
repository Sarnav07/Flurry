/**
 * Boundary parsers: wire DTO -> `*VM`. The ONLY place `u64` decimal strings
 * become `bigint`. No `u64` is ever routed through a JS `number`.
 */
import type {
  AttestationResponse,
  Config,
  HealthResponse,
  PlayerState,
  TerritoryState,
} from '~/lib/types/wire';
import type {
  AttestationResponseVM,
  ConfigVM,
  FactionShardTotalsVM,
  HealthVM,
  PendingProofStatusVM,
  PlayerStateVM,
  TerritoryStateVM,
} from '~/lib/types/viewModels';

const U64_MAX = (1n << 64n) - 1n;
const U64_RE = /^(0|[1-9]\d*)$/;

/** Strict `u64` decimal-string -> `bigint`. Throws on non-canonical / overflow. */
export function toU64(value: string): bigint {
  if (!U64_RE.test(value)) {
    throw new RangeError(`invalid u64 decimal string: ${JSON.stringify(value)}`);
  }
  const n = BigInt(value);
  if (n > U64_MAX) throw new RangeError(`u64 overflow: ${value}`);
  return n;
}

/** Nullable variant: passes `null` through, otherwise strict `toU64`. */
export function toU64OrNull(value: string | null): bigint | null {
  return value === null ? null : toU64(value);
}

// ── Mappers ─────────────────────────────────────────────────────────────────
export function parseHealth(h: HealthResponse): HealthVM {
  return {
    status: h.status,
    network: h.network,
    packageId: h.packageId,
    activeSeason: toU64(h.activeSeason),
    oracleSignerKeyId: h.oracleSignerKeyId,
  };
}

export function parseConfig(c: Config): ConfigVM {
  return {
    network: c.network,
    packageId: c.packageId,
    factions: c.factions,
    activeSeasonId: toU64(c.activeSeasonId),
    activeTrialId: toU64(c.activeTrialId),
    trialLabel: c.trialLabel,
    territoryCount: c.territoryCount,
    shardCount: c.shardCount,
    provenanceTiers: c.provenanceTiers,
    sponsor: {
      sponsorSlotId: c.sponsor.sponsorSlotId,
      name: c.sponsor.name,
      trialId: toU64(c.sponsor.trialId),
      actionLabel: c.sponsor.actionLabel,
      status: c.sponsor.status,
    },
    objectIds: c.objectIds,
    oraclePublicKey: c.oraclePublicKey,
  };
}

export function parsePlayerState(p: PlayerState): PlayerStateVM {
  const pending: PendingProofStatusVM[] = p.pending.map((s) => ({
    pendingProofId: s.pendingProofId,
    seasonId: toU64(s.seasonId),
    trialId: toU64(s.trialId),
    factionId: s.factionId,
    status: s.status,
    createdMs: toU64(s.createdMs),
  }));
  return {
    wallet: p.wallet,
    hasPassport: p.hasPassport,
    passportId: p.passportId,
    factionId: p.factionId,
    rawReputation: toU64OrNull(p.rawReputation),
    acceptedProofCount: toU64OrNull(p.acceptedProofCount),
    pending,
  };
}

export function parseTerritoryState(t: TerritoryState): TerritoryStateVM {
  const shardTotals: FactionShardTotalsVM[] = t.shardTotals.map((s) => ({
    factionId: s.factionId,
    rawScoreTotal: toU64(s.rawScoreTotal),
    territoryPowerTotal: toU64(s.territoryPowerTotal),
    acceptedProofCount: toU64(s.acceptedProofCount),
  }));
  return {
    seasonId: toU64(t.seasonId),
    finalized: t.finalized,
    owners: t.owners,
    finalizedPower: t.finalizedPower.map(toU64),
    underdogMultiplier: toU64(t.underdogMultiplier),
    shardTotals,
    impact: {
      escrowId: t.impact.escrowId,
      balance: toU64(t.impact.balance),
      disbursed: t.impact.disbursed,
      recipients: t.impact.recipients,
    },
  };
}

/** Payload + signature + nullifier are preserved verbatim for the PTB. */
export function parseAttestation(a: AttestationResponse): AttestationResponseVM {
  return {
    payload: a.payload,
    signature: a.signature,
    nullifier: a.nullifier,
    expiry: toU64(a.expiry),
    score: toU64(a.score),
    territoryPower: toU64(a.territoryPower),
    proofSource: a.proofSource,
    provenanceTier: a.provenanceTier,
  };
}
