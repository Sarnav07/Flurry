/**
 * GET /territory (Requirement 18.1).
 *
 * Returns the season id, finalized territory owners, current per-faction shard
 * totals, the underdog multiplier, and impact status — read from chain.
 */

import type { FastifyInstance } from "fastify";
import type { FactionShardTotals, TerritoryState } from "@yeti-trials/shared";
import type { AppDeps } from "../index.js";

export function registerTerritory(app: FastifyInstance, deps: AppDeps): void {
  app.get("/territory", async () => {
    const t = await deps.chain.readTerritory();

    const shardTotals: FactionShardTotals[] = t.shardTotals.map((s) => ({
      factionId: s.factionId,
      rawScoreTotal: s.rawScoreTotal.toString(),
      territoryPowerTotal: s.territoryPowerTotal.toString(),
      acceptedProofCount: s.acceptedProofCount.toString(),
    }));

    const state: TerritoryState = {
      seasonId: t.seasonId.toString(),
      finalized: t.finalized,
      owners: t.owners,
      finalizedPower: t.finalizedPower.map((p) => p.toString()),
      underdogMultiplier: t.underdogMultiplier.toString(),
      shardTotals,
      impact: {
        escrowId: t.impact.escrowId,
        balance: t.impact.balance.toString(),
        disbursed: t.impact.disbursed,
        recipients: t.impact.recipients,
      },
    };
    return state;
  });
}
