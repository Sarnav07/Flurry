// Feature: yeti-trials-frontend, Phase 1 wallet + routing
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

const h = vi.hoisted(() => ({
  account: null as { address: string } | null,
  disconnect: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('@mysten/dapp-kit', () => ({
  useCurrentAccount: () => h.account,
  useDisconnectWallet: () => ({ mutate: h.disconnect }),
  ConnectButton: ({ connectText }: { connectText?: string }) => (
    <button type="button">{connectText ?? 'Connect'}</button>
  ),
}));

vi.mock('@tanstack/react-router', async (orig) => {
  const actual = await orig<typeof import('@tanstack/react-router')>();
  return { ...actual, useNavigate: () => h.navigate };
});

import { ConnectBar } from '~/components/wallet/connect-bar';
import { useExistingPassportRouting } from '~/lib/state/routing';

const BASE = 'http://localhost:3000';
const ADDR = '0x1234567890abcdef';

const player = (hasPassport: boolean) =>
  hasPassport
    ? {
        wallet: ADDR,
        hasPassport: true,
        passportId: '0xpass',
        factionId: 1,
        rawReputation: '100',
        acceptedProofCount: '2',
        pending: [],
      }
    : {
        wallet: ADDR,
        hasPassport: false,
        passportId: null,
        factionId: null,
        rawReputation: null,
        acceptedProofCount: null,
        pending: [],
      };

const server = setupServer();
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});
beforeEach(() => {
  h.account = null;
  h.disconnect.mockReset();
  h.navigate.mockReset();
});
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());

function withClient(node: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
  return { queryClient, ...utils };
}

function RoutingProbe() {
  useExistingPassportRouting();
  return <div>probe</div>;
}

describe('Wallet_Module (Requirements 2.4, 2.5)', () => {
  it('shows the default connect path and hides gated zkLogin when disconnected', () => {
    h.account = null;
    withClient(<ConnectBar />);
    expect(screen.getByText('Connect wallet')).not.toBeNull();
    expect(screen.queryByText(/Continue with zkLogin/i)).toBeNull();
    expect(screen.queryByText(/Disconnect/i)).toBeNull();
  });

  it('exposes an abbreviated, copyable address when connected', async () => {
    h.account = { address: ADDR };
    withClient(<ConnectBar />);
    const chip = screen.getByText('0x1234…cdef');
    fireEvent.click(chip);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(ADDR);
    expect(await screen.findByText('Copied')).not.toBeNull();
  });

  it('clears player-scoped cached state on disconnect', () => {
    h.account = { address: ADDR };
    const { queryClient } = withClient(<ConnectBar />);
    queryClient.setQueryData(['player', ADDR], player(true));

    fireEvent.click(screen.getByText('Disconnect'));

    expect(h.disconnect).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(['player', ADDR])).toBeUndefined();
  });
});

describe('Existing-passport routing (Requirements 4.2, 4.3)', () => {
  it('routes a returning player (hasPassport: true) into /play', async () => {
    h.account = { address: ADDR };
    server.use(http.get(`${BASE}/player/:address`, () => HttpResponse.json(player(true))));

    withClient(<RoutingProbe />);

    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith({ to: '/play' }));
  });

  it('does not route a new wallet (hasPassport: false)', async () => {
    h.account = { address: ADDR };
    server.use(http.get(`${BASE}/player/:address`, () => HttpResponse.json(player(false))));

    const { queryClient } = withClient(<RoutingProbe />);

    await waitFor(() =>
      expect(queryClient.getQueryData(['player', ADDR])).toBeDefined(),
    );
    expect(h.navigate).not.toHaveBeenCalled();
  });
});
