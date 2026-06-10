/**
 * Chain reader (Task 9.4, Requirements 15.1, 15.2, 18.1).
 *
 * Reads passport-by-owner, score shards, the territory map, and impact status
 * from chain via `SuiClient`. All object ids come from the deployment artifact
 * (via `OrchestratorConfig`) — nothing here hard-codes an id. Reads are exposed
 * behind the {@link ChainReader} interface so the route layer can be tested
 * hermetically against a mock without a live chain.
 *
 * Every on-chain `u64` is normalized to `bigint`; the route layer converts to
 * decimal strings at the HTTP boundary (see `@yeti-trials/shared` types).
 */

import { SuiClient } from "@mysten/sui/client";
import type { SuiObjectResponse } from "@mysten/sui/client";

import type { OrchestratorConfig } from "./config.js";

// ===========================================================================
// Normalized chain data shapes (bigint-typed)
// ===========================================================================

/** A player's on-chain passport data. */
export interface PassportChainData {
  passportId: string;
  factionId: number;
  rawReputation: bigint;
  acceptedProofCount: bigint;
}

/** Per-faction aggregated shard totals. */
export interface ShardTotal {
  factionId: number;
  rawScoreTotal: bigint;
  territoryPowerTotal: bigint;
  acceptedProofCount: bigint;
}

/** Impact escrow status. */
export interface ImpactChainData {
  escrowId: string | null;
  balance: bigint;
  disbursed: boolean;
  recipients: string[];
}

/** Territory map + aggregated shard totals + impact status. */
export interface TerritoryChainData {
  seasonId: bigint;
  finalized: boolean;
  owners: number[];
  finalizedPower: bigint[];
  underdogMultiplier: bigint;
  shardTotals: ShardTotal[];
  impact: ImpactChainData;
}

/** The read surface the routes depend on (mockable for hermetic tests). */
export interface ChainReader {
  /** The passport owned by `owner`, or null when the wallet owns none. */
  readPassport(owner: string): Promise<PassportChainData | null>;
  /** Territory map, aggregated shard totals, and impact status. */
  readTerritory(): Promise<TerritoryChainData>;
  /** Whether `wallet` owns the configured demo object (demo condition probe). */
  ownsDemoObject(wallet: string): Promise<boolean>;
}

// ===========================================================================
// Parsing helpers
// ===========================================================================

/** Extract the Move struct `fields` record from an object response. */
function moveFields(res: SuiObjectResponse): Record<string, unknown> | null {
  const content = res.data?.content;
  if (!content || content.dataType !== "moveObject") return null;
  return content.fields as Record<string, unknown>;
}

/** Coerce a Sui-JSON numeric (string | number) to bigint. */
function toBigint(v: unknown): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(v);
  if (typeof v === "string" && v.trim() !== "") return BigInt(v);
  return 0n;
}

/** Coerce a Sui-JSON numeric to a small JS number (for faction ids 0..3). */
function toNumber(v: unknown): number {
  return Number(toBigint(v));
}

/**
 * Normalize a Sui-JSON `vector<u8>` to a number[] of byte values. Sui may
 * return it as a number[], a string[] of decimals, or a base64 string.
 */
function toByteNumbers(v: unknown): number[] {
  if (Array.isArray(v)) return v.map((x) => toNumber(x));
  if (typeof v === "string") return Array.from(Buffer.from(v, "base64"));
  return [];
}

/** Normalize a Sui-JSON `vector<u64>` to a bigint[]. */
function toBigintArray(v: unknown): bigint[] {
  return Array.isArray(v) ? v.map((x) => toBigint(x)) : [];
}

/** Normalize a Sui-JSON `vector<address>` to a string[]. */
function toStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}

/**
 * Read the numeric value out of a `Balance<SUI>` field, which Sui may surface
 * either as a bare numeric (string/number) or as a `{ value }` wrapper.
 */
function balanceValue(v: unknown): bigint {
  if (v && typeof v === "object" && "value" in (v as Record<string, unknown>)) {
    return toBigint((v as Record<string, unknown>)["value"]);
  }
  return toBigint(v);
}

// ===========================================================================
// SuiClient-backed reader
// ===========================================================================

export class SuiChainReader implements ChainReader {
  private readonly client: SuiClient;
  private readonly cfg: OrchestratorConfig;

  constructor(cfg: OrchestratorConfig, client?: SuiClient) {
    this.cfg = cfg;
    this.client = client ?? new SuiClient({ url: cfg.rpcUrl });
  }

  async readPassport(owner: string): Promise<PassportChainData | null> {
    const structType = `${this.cfg.packageId}::passport::YetiPassport`;
    const owned = await this.client.getOwnedObjects({
      owner,
      filter: { StructType: structType },
      options: { showContent: true },
    });

    const first = owned.data[0];
    if (!first) return null;
    const fields = moveFields(first);
    if (!fields) return null;

    const passportId = first.data?.objectId;
    if (!passportId) return null;

    return {
      passportId,
      factionId: toNumber(fields["faction_id"]),
      rawReputation: toBigint(fields["raw_reputation"]),
      acceptedProofCount: toBigint(fields["accepted_proof_count"]),
    };
  }

  async readTerritory(): Promise<TerritoryChainData> {
    const [mapRes, impactRes, shardTotals] = await Promise.all([
      this.client.getObject({
        id: this.cfg.territoryMapId,
        options: { showContent: true },
      }),
      this.client.getObject({
        id: this.cfg.impactEscrowId,
        options: { showContent: true },
      }),
      this.readShardTotals(),
    ]);

    const mapFields = moveFields(mapRes) ?? {};
    const impactFields = moveFields(impactRes);

    const impact: ImpactChainData = impactFields
      ? {
          escrowId: this.cfg.impactEscrowId,
          balance: balanceValue(impactFields["balance"]),
          disbursed: Boolean(impactFields["disbursed"]),
          recipients: toStringArray(impactFields["recipients"]),
        }
      : { escrowId: null, balance: 0n, disbursed: false, recipients: [] };

    return {
      seasonId: toBigint(mapFields["season_id"]),
      finalized: Boolean(mapFields["finalized"]),
      owners: toByteNumbers(mapFields["owners"]),
      finalizedPower: toBigintArray(mapFields["finalized_power"]),
      underdogMultiplier: toBigint(mapFields["underdog_multiplier"]),
      shardTotals,
      impact,
    };
  }

  /** Read every configured shard and aggregate totals per faction. */
  private async readShardTotals(): Promise<ShardTotal[]> {
    const ids = this.cfg.shards.map((s) => s.objectId);
    if (ids.length === 0) return [];

    const objs = await this.client.multiGetObjects({
      ids,
      options: { showContent: true },
    });

    const byFaction = new Map<number, ShardTotal>();
    for (const res of objs) {
      const fields = moveFields(res);
      if (!fields) continue;
      const factionId = toNumber(fields["faction_id"]);
      const acc =
        byFaction.get(factionId) ??
        {
          factionId,
          rawScoreTotal: 0n,
          territoryPowerTotal: 0n,
          acceptedProofCount: 0n,
        };
      acc.rawScoreTotal += toBigint(fields["raw_score_total"]);
      acc.territoryPowerTotal += toBigint(fields["territory_power_total"]);
      acc.acceptedProofCount += toBigint(fields["accepted_proof_count"]);
      byFaction.set(factionId, acc);
    }

    return [...byFaction.values()].sort((a, b) => a.factionId - b.factionId);
  }

  async ownsDemoObject(wallet: string): Promise<boolean> {
    const { objectId, objectType } = this.cfg.demo;

    // A specific demo object: it must exist and be owned by the wallet.
    if (objectId) {
      const res = await this.client.getObject({
        id: objectId,
        options: { showOwner: true },
      });
      const owner = res.data?.owner;
      if (
        owner &&
        typeof owner === "object" &&
        "AddressOwner" in owner &&
        owner.AddressOwner.toLowerCase() === wallet.toLowerCase()
      ) {
        return true;
      }
    }

    // Any object of the configured demo type owned by the wallet.
    if (objectType) {
      const owned = await this.client.getOwnedObjects({
        owner: wallet,
        filter: { StructType: objectType },
      });
      if (owned.data.length > 0) return true;
    }

    return false;
  }
}
