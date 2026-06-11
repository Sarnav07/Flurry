// Feature: yeti-trials-frontend, Phase 6 admin + trust
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

const env = vi.hoisted(() => ({
  demoMode: false,
  enableZkLogin: false,
  enable3D: false,
  enablePostFx: false,
  suiNetwork: 'localnet' as const,
  suiRpcUrl: '',
  orchestratorUrl: 'http://localhost:3000',
}));

vi.mock('~/env', () => ({ env }));
vi.mock('~/lib/sui/submit', () => ({ useSubmitTransaction: () => ({ submit: vi.fn(), direct: vi.fn() }) }));

import { AdminConsole } from '~/components/admin/admin-console';
import { TrustSurface } from '~/components/trust/trust-surface';
import { BootContextProvider } from '~/lib/state/boot';
import type { ConfigVM } from '~/lib/types/viewModels';

const CONFIG: ConfigVM = {
  network: 'localnet',
  packageId: '0xpkg',
  factions: [{ id: 0, name: 'Glaciers' }],
  activeSeasonId: 1n,
  activeTrialId: 1n,
  trialLabel: 'g',
  territoryCount: 6,
  shardCount: 1,
  provenanceTiers: [],
  sponsor: { sponsorSlotId: null, name: '', trialId: 0n, actionLabel: '', status: 0 },
  objectIds: {
    seasonId: '0xs', oracleRegistryId: '0xo', nullifierStoreId: '0xn', territoryMapId: '0xt',
    impactEscrowId: '0xi', sponsorSlotId: '0xsp', shards: [{ objectId: '0xsh', faction: 0, shard: 0 }],
  },
  oraclePublicKey: '0xpub',
};

const TERRITORY = {
  seasonId: '1', finalized: false, owners: [], finalizedPower: [], underdogMultiplier: '1',
  shardTotals: [], impact: { escrowId: null, balance: '0', disbursed: false, recipients: [] },
};

const BASE = 'http://localhost:3000';
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  env.demoMode = false;
  cleanup();
});
afterAll(() => server.close());

function renderAdmin() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <BootContextProvider value={{ config: CONFIG, network: 'localnet' }}>
        <AdminConsole />
      </BootContextProvider>
    </QueryClientProvider>,
  );
}

describe('AdminConsole guard + lifecycle (Requirements 14.2, 14.3)', () => {
  it('is hidden unless VITE_DEMO_MODE is enabled', () => {
    env.demoMode = false;
    renderAdmin();
    expect(screen.getByTestId('admin-denied')).not.toBeNull();
    expect(screen.queryByTestId('step-close_season')).toBeNull();
  });

  it('shows the ordered lifecycle, gating each action by precondition', async () => {
    env.demoMode = true;
    server.use(http.get(`${BASE}/territory`, () => HttpResponse.json(TERRITORY)));
    renderAdmin();
    await waitFor(() => expect(screen.getByTestId('step-close_season')).not.toBeNull());
    expect((screen.getByTestId('step-close_season') as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId('step-finalize_territory') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('step-settle_season') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('TrustSurface (Requirements 15.2-15.7)', () => {
  it('states every trust boundary in plain language', () => {
    render(<TrustSurface />);
    const present = (re: RegExp) => expect(screen.getAllByText(re).length).toBeGreaterThan(0);
    present(/centralized V1/i);
    present(/single operator key/i);
    present(/not a native on-chain fact/i);
    present(/not personhood/i);
    present(/not Sybil resistance/i);
    present(/per Sui address per season/i);
    present(/caller-driven and not automatic/i);
    present(/cannot buy, bias, or affect scoring/i);
    present(/no yield, no profit, and no investment return/i);
    present(/never earn a token as a gameplay reward/i);
  });
});
