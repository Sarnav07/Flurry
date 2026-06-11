// Feature: yeti-trials-frontend, Phase 3 territory 2.5D
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

import { Territory2D } from '~/components/territory/territory-2d';
import { createOrchestratorClient } from '~/lib/api/client';
import { deriveRenderState } from '~/lib/territory/renderState';
import type { FactionInfo } from '~/lib/types/wire';
import type { TerritoryStateVM } from '~/lib/types/viewModels';

const FACTIONS: FactionInfo[] = [
  { id: 0, name: 'Glaciers' },
  { id: 1, name: 'Avalanche' },
  { id: 2, name: 'Blizzard' },
  { id: 3, name: 'Thaw' },
];

const base = (over: Partial<TerritoryStateVM>): TerritoryStateVM => ({
  seasonId: 1n,
  finalized: false,
  owners: [0, 1, 2, 3, 0, 1],
  finalizedPower: [],
  underdogMultiplier: 1n,
  shardTotals: [
    { factionId: 0, rawScoreTotal: 100n, territoryPowerTotal: 50n, acceptedProofCount: 2n },
    { factionId: 1, rawScoreTotal: 80n, territoryPowerTotal: 40n, acceptedProofCount: 1n },
  ],
  impact: { escrowId: null, balance: 0n, disbursed: false, recipients: [] },
  ...over,
});

function renderTerritory(t: TerritoryStateVM) {
  return render(<Territory2D territory={t} renderState={deriveRenderState(t)} factions={FACTIONS} />);
}

afterEach(cleanup);

describe('Territory2D state distinctions (Requirements 7.2, 8.1, 8.4)', () => {
  it('pending: nothing captured, provisional pressure shown', () => {
    renderTerritory(base({ finalized: false }));
    expect(screen.getByTestId('territory-2d').getAttribute('data-lifecycle')).toBe('pending');
    expect(screen.getByTestId('lifecycle').textContent).toBe('Pending');
    expect(screen.queryByTestId('owners-grid')).toBeNull();
    expect(screen.getByTestId('pressure')).not.toBeNull();
  });

  it('finalized: solid ownership grid is rendered', () => {
    renderTerritory(base({ finalized: true }));
    expect(screen.getByTestId('territory-2d').getAttribute('data-lifecycle')).toBe('finalized');
    expect(screen.getByTestId('owners-grid')).not.toBeNull();
    expect(screen.queryByTestId('pressure')).toBeNull();
  });

  it('settled: distinct from a fresh finalize', () => {
    renderTerritory(base({ finalized: true, impact: { escrowId: null, balance: 0n, disbursed: true, recipients: [] } }));
    expect(screen.getByTestId('territory-2d').getAttribute('data-lifecycle')).toBe('settled');
    expect(screen.getByTestId('lifecycle').textContent).toBe('Settled');
  });

  it('renders raw reputation and territory power as two distinct values', () => {
    renderTerritory(base({ finalized: true }));
    expect(screen.getByTestId('raw-0').textContent).toBe('100');
    expect(screen.getByTestId('power-0').textContent).toBe('50');
    expect(screen.getByTestId('raw-0').textContent).not.toBe(screen.getByTestId('power-0').textContent);
  });
});

const BASE = 'http://localhost:3000';
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('getTerritory parsing (Requirement 7.5)', () => {
  it('converts every u64 wire field to BigInt without precision loss', async () => {
    server.use(
      http.get(`${BASE}/territory`, () =>
        HttpResponse.json({
          seasonId: '1',
          finalized: true,
          owners: [0, 1],
          finalizedPower: ['18446744073709551615'],
          underdogMultiplier: '3',
          shardTotals: [
            { factionId: 0, rawScoreTotal: '100', territoryPowerTotal: '50', acceptedProofCount: '2' },
          ],
          impact: { escrowId: null, balance: '18446744073709551615', disbursed: false, recipients: [] },
        }),
      ),
    );

    const res = await createOrchestratorClient(BASE).getTerritory();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.seasonId).toBe(1n);
    expect(res.data.finalizedPower[0]).toBe(2n ** 64n - 1n);
    expect(res.data.underdogMultiplier).toBe(3n);
    expect(res.data.shardTotals[0]!.rawScoreTotal).toBe(100n);
    expect(res.data.shardTotals[0]!.territoryPowerTotal).toBe(50n);
    expect(res.data.impact.balance).toBe(2n ** 64n - 1n);
  });
});
