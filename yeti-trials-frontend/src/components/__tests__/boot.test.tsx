// Feature: yeti-trials-frontend, Phase 0 boot
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse, delay } from 'msw';

import { BootGate } from '~/components/boot-gate';
import { NetworkBanner } from '~/components/network-banner';
import { useConfig } from '~/lib/state/boot';

const BASE = 'http://localhost:3000';

const HEALTH = (network: string) => ({
  status: 'ok',
  network,
  packageId: '0xpkg',
  activeSeason: '1',
  oracleSignerKeyId: '0xkey',
});

const CONFIG = {
  network: 'testnet',
  packageId: '0xpkg',
  factions: [
    { id: 0, name: 'Glaciers' },
    { id: 1, name: 'Avalanche' },
    { id: 2, name: 'Blizzard' },
    { id: 3, name: 'Thaw' },
  ],
  activeSeasonId: '1',
  activeTrialId: '1',
  trialLabel: 'Avalanche Testnet Proof',
  territoryCount: 6,
  shardCount: 8,
  provenanceTiers: [
    { name: 'Native', value: 0 },
    { name: 'Sponsor-Signed', value: 1 },
    { name: 'Oracle-Attested', value: 2 },
  ],
  sponsor: { sponsorSlotId: null, name: 'Alpha City', trialId: '1', actionLabel: '', status: 0 },
  objectIds: {
    seasonId: '0xs',
    oracleRegistryId: '0xo',
    nullifierStoreId: '0xn',
    territoryMapId: '0xt',
    impactEscrowId: '0xi',
    sponsorSlotId: '0xsp',
    shards: [],
  },
  oraclePublicKey: '0xpub',
};

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());

function ConfigDependent() {
  const config = useConfig();
  return <div data-testid="ready">READY {config.network}</div>;
}

function renderBoot() {
  // retryDelay 0 keeps the unavailable path fast (bootQueryOptions sets retry: 2).
  const queryClient = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <BootGate>
        <NetworkBanner />
        <ConfigDependent />
      </BootGate>
    </QueryClientProvider>,
  );
}

describe('Boot_Loader (Requirements 1.1, 1.4, 1.5)', () => {
  it('blocks id-dependent screens until /config and /health resolve', async () => {
    server.use(
      http.get(`${BASE}/config`, async () => {
        await delay(30);
        return HttpResponse.json(CONFIG);
      }),
      http.get(`${BASE}/health`, () => HttpResponse.json(HEALTH('testnet'))),
    );

    renderBoot();
    // Before resolution: the splash shows, the id-dependent screen does not.
    expect(screen.queryByTestId('ready')).toBeNull();
    expect(screen.getByRole('status').textContent).toMatch(/Reading the season/i);

    await screen.findByTestId('ready');
  });

  it('renders the Network_Banner from health.network', async () => {
    server.use(
      http.get(`${BASE}/config`, () => HttpResponse.json(CONFIG)),
      http.get(`${BASE}/health`, () => HttpResponse.json(HEALTH('localnet'))),
    );

    renderBoot();
    await screen.findByTestId('ready');
    expect(screen.getByText('localnet')).not.toBeNull();
  });

  it('renders the calm unavailable state when the orchestrator is unreachable', async () => {
    server.use(
      http.get(`${BASE}/config`, () => HttpResponse.error()),
      http.get(`${BASE}/health`, () => HttpResponse.json(HEALTH('localnet'))),
    );

    renderBoot();
    expect(await screen.findByText(/Connection unavailable/i)).not.toBeNull();
    expect(screen.queryByTestId('ready')).toBeNull();
  });
});
