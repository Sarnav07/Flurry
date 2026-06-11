import type { TerritoryStateVM } from '~/lib/types/viewModels';

/** Two separate channels per faction. Never summed or conflated into one number. */
export interface FactionChannels {
  factionId: number;
  rawScoreTotal: bigint;
  territoryPowerTotal: bigint;
}

export function factionChannels(t: TerritoryStateVM): FactionChannels[] {
  return t.shardTotals.map((s) => ({
    factionId: s.factionId,
    rawScoreTotal: s.rawScoreTotal,
    territoryPowerTotal: s.territoryPowerTotal,
  }));
}
