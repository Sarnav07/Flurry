import type { TerritoryStateVM } from '~/lib/types/viewModels';

export type Lifecycle = 'pending' | 'finalized' | 'settled';

export interface FactionPressure {
  factionId: number;
  territoryPower: bigint;
  /** Display-only ratio 0..1 of total territory power (never a value channel). */
  share: number;
}

export interface TerritoryRenderState {
  lifecycle: Lifecycle;
  /** Confirmed owners (index = territory) only once finalized; null while pending. */
  owners: number[] | null;
  /** Provisional per-faction pressure from shardTotals (shown while pending). */
  pressure: FactionPressure[];
}

/** Display ratio via BigInt math; the u64 value itself never becomes a number. */
function shareOf(power: bigint, total: bigint): number {
  if (total <= 0n) return 0;
  return Number((power * 10_000n) / total) / 10_000;
}

/**
 * Pure, render-path-agnostic lifecycle derivation. Honest by construction:
 * nothing is captured until finalized. `settled` is the available-data proxy
 * `finalized && impact.disbursed` (no new backend field). This function NEVER
 * reads the VITE_ENABLE_3D flag; both render paths consume its output verbatim.
 */
export function deriveRenderState(t: TerritoryStateVM): TerritoryRenderState {
  const lifecycle: Lifecycle = !t.finalized
    ? 'pending'
    : t.impact.disbursed
      ? 'settled'
      : 'finalized';

  const total = t.shardTotals.reduce((acc, s) => acc + s.territoryPowerTotal, 0n);
  const pressure: FactionPressure[] = t.shardTotals.map((s) => ({
    factionId: s.factionId,
    territoryPower: s.territoryPowerTotal,
    share: shareOf(s.territoryPowerTotal, total),
  }));

  return {
    lifecycle,
    owners: lifecycle === 'pending' ? null : t.owners,
    pressure,
  };
}

/** Render-path parity guarantee: the path argument must NOT affect the result. */
export function renderStateForPath(
  t: TerritoryStateVM,
  _path: '2d' | '3d',
): TerritoryRenderState {
  return deriveRenderState(t);
}
