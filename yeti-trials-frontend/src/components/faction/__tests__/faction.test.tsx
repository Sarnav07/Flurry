// Feature: yeti-trials-frontend, Phase 2 faction + passport
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  account: { address: '0xabc' } as { address: string } | null,
  navigate: vi.fn(),
  submit: vi.fn(),
}));

vi.mock('@mysten/dapp-kit', () => ({
  useCurrentAccount: () => h.account,
  useSuiClient: () => ({
    getObject: async () => ({
      data: {
        content: {
          dataType: 'moveObject',
          fields: { start_ms: '0', end_ms: String(Date.now() + 1_000_000) },
        },
      },
    }),
  }),
}));

vi.mock('@tanstack/react-router', async (orig) => {
  const actual = await orig<typeof import('@tanstack/react-router')>();
  return { ...actual, useNavigate: () => h.navigate };
});

vi.mock('~/lib/sui/submit', () => ({
  useSubmitTransaction: () => ({ submit: h.submit, direct: h.submit }),
}));

import { PassportCreator } from '~/components/faction/passport-creator';
import { PassportPanel } from '~/components/faction/passport-panel';
import { BootContextProvider } from '~/lib/state/boot';
import type { ConfigVM } from '~/lib/types/viewModels';
import type { FactionInfo } from '~/lib/types/wire';

const FACTIONS: FactionInfo[] = [
  { id: 0, name: 'Glaciers' },
  { id: 1, name: 'Avalanche' },
  { id: 2, name: 'Blizzard' },
  { id: 3, name: 'Thaw' },
];

const CONFIG: ConfigVM = {
  network: 'localnet',
  packageId: '0xpkg',
  factions: FACTIONS,
  activeSeasonId: 1n,
  activeTrialId: 1n,
  trialLabel: 'Genesis',
  territoryCount: 6,
  shardCount: 8,
  provenanceTiers: [],
  sponsor: { sponsorSlotId: null, name: 'Alpha City', trialId: 1n, actionLabel: '', status: 0 },
  objectIds: {
    seasonId: '0xseason',
    oracleRegistryId: '0xo',
    nullifierStoreId: '0xn',
    territoryMapId: '0xt',
    impactEscrowId: '0xi',
    sponsorSlotId: '0xsp',
    shards: [],
  },
  oraclePublicKey: '0xpub',
};

const moveAbort = (code: number) =>
  new Error(`MoveAbort(MoveLocation { module: passport }, ${code}) in command 0`);

beforeEach(() => {
  h.account = { address: '0xabc' };
  h.navigate.mockReset();
  h.submit.mockReset();
});
afterEach(cleanup);

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <BootContextProvider value={{ config: CONFIG, network: 'localnet' }}>
        <PassportPanel />
      </BootContextProvider>
    </QueryClientProvider>,
  );
}

describe('FactionCards / PassportCreator (Requirements 5.1, 5.4)', () => {
  it('renders exactly four faction cards from Config.factions', () => {
    render(
      <PassportCreator
        factions={FACTIONS}
        seasonOpen={true}
        pending={false}
        errorMessage={null}
        onCreate={() => {}}
      />,
    );
    expect(screen.getAllByRole('radio')).toHaveLength(4);
  });

  it('disables create with a visible reason when the season is closed', () => {
    render(
      <PassportCreator
        factions={FACTIONS}
        seasonOpen={false}
        pending={false}
        errorMessage={null}
        onCreate={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: /Glaciers/i }));
    expect(screen.getByRole('button', { name: /Create passport/i })).toHaveProperty('disabled', true);
    expect(screen.getByText(/season is not currently active/i)).not.toBeNull();
  });

  it('calls onCreate with the selected faction id', () => {
    const onCreate = vi.fn();
    render(
      <PassportCreator
        factions={FACTIONS}
        seasonOpen={true}
        pending={false}
        errorMessage={null}
        onCreate={onCreate}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: /Blizzard/i }));
    fireEvent.click(screen.getByRole('button', { name: /Create passport/i }));
    expect(onCreate).toHaveBeenCalledWith(2);
  });
});

describe('PassportPanel abort routing (Requirements 6.3, 6.4)', () => {
  it('on success refreshes and routes to /play', async () => {
    h.submit.mockResolvedValue({ digest: '0xdig' });
    renderPanel();
    fireEvent.click(screen.getByRole('radio', { name: /Avalanche/i }));
    fireEvent.click(screen.getByRole('button', { name: /Create passport/i }));
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith({ to: '/play' }));
  });

  it('E_DUPLICATE_PASSPORT shows its message and routes into the game', async () => {
    h.submit.mockRejectedValue(moveAbort(5));
    renderPanel();
    fireEvent.click(screen.getByRole('radio', { name: /Glaciers/i }));
    fireEvent.click(screen.getByRole('button', { name: /Create passport/i }));
    expect(await screen.findByText(/already registered a passport/i)).not.toBeNull();
    expect(h.navigate).toHaveBeenCalledWith({ to: '/play' });
  });

  it('E_SEASON_INACTIVE shows its message and does not route', async () => {
    h.submit.mockRejectedValue(moveAbort(3));
    renderPanel();
    fireEvent.click(screen.getByRole('radio', { name: /Thaw/i }));
    fireEvent.click(screen.getByRole('button', { name: /Create passport/i }));
    expect(await screen.findByText(/outside the active season window/i)).not.toBeNull();
    expect(h.navigate).not.toHaveBeenCalled();
  });
});
