// Feature: yeti-trials-frontend, Phase 4 proof flow
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

const A = (b: string) => `0x${b.repeat(32)}`;
const WALLET = A('a1');
const PKG = A('b2');
const PASS = A('c3');
const SHARD = A('d4');
const h = vi.hoisted(() => ({ submit: vi.fn() }));

vi.mock('@mysten/dapp-kit', () => ({
  useCurrentAccount: () => ({ address: WALLET }),
  useSuiClient: () => ({ waitForTransaction: vi.fn().mockResolvedValue({ events: [] }) }),
}));
vi.mock('~/lib/sui/submit', () => ({ useSubmitTransaction: () => ({ submit: h.submit, direct: h.submit }) }));

import { ProofPanel } from '~/components/proof/proof-panel';
import { BootContextProvider } from '~/lib/state/boot';
import type { ConfigVM } from '~/lib/types/viewModels';

const CONFIG: ConfigVM = {
  network: 'localnet',
  packageId: PKG,
  factions: [{ id: 1, name: 'Avalanche' }],
  activeSeasonId: 1n,
  activeTrialId: 1n,
  trialLabel: 'Genesis',
  territoryCount: 6,
  shardCount: 1,
  provenanceTiers: [],
  sponsor: { sponsorSlotId: null, name: 'Alpha City', trialId: 1n, actionLabel: '', status: 0 },
  objectIds: {
    seasonId: A('e5'),
    oracleRegistryId: A('e6'),
    nullifierStoreId: A('e7'),
    territoryMapId: A('e8'),
    impactEscrowId: A('e9'),
    sponsorSlotId: A('ea'),
    shards: [{ objectId: SHARD, faction: 1, shard: 0 }],
  },
  oraclePublicKey: `0x${'00'.repeat(32)}`,
};

const PLAYER = {
  wallet: WALLET,
  hasPassport: true,
  passportId: PASS,
  factionId: 1,
  rawReputation: '0',
  acceptedProofCount: '0',
  pending: [],
};

const ATTESTATION = {
  payload: {
    network: [108],
    packageId: PKG,
    seasonId: '1',
    trialId: '1',
    factionId: 1,
    passportId: PASS,
    wallet: WALLET,
    proofSource: [79],
    provenanceTier: 2,
    score: '100',
    territoryPower: '50',
    issuedMs: '1000',
    expiryMs: '2000',
    nonce: '7',
    nullifier: [0, 0, 0, 0, 0, 0, 0, 0],
  },
  signature: [1, 2, 3],
  nullifier: [0, 0, 0, 0, 0, 0, 0, 0],
  expiry: '2000',
  score: '100',
  territoryPower: '50',
  proofSource: 'Oracle-Attested Demo Proof',
  provenanceTier: 2,
};

const BASE = 'http://localhost:3000';
const moveAbort = (code: number) => new Error(`MoveAbort(MoveLocation { module: proof }, ${code})`);

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  h.submit.mockReset();
  server.use(http.get(`${BASE}/player/:address`, () => HttpResponse.json(PLAYER)));
});
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <BootContextProvider value={{ config: CONFIG, network: 'localnet' }}>
        <ProofPanel />
      </BootContextProvider>
    </QueryClientProvider>,
  );
}

async function startToAttested() {
  await waitFor(() =>
    expect((screen.getByRole('button', { name: /Request proof/i }) as HTMLButtonElement).disabled).toBe(false),
  );
  fireEvent.click(screen.getByRole('button', { name: /Request proof/i }));
  const proof = await screen.findByTestId('proof');
  await waitFor(() => expect(proof.getAttribute('data-status')).toBe('attested'));
  return proof;
}

describe('Proof flow (Requirements 9.1, 9.2, 9.5, 10.3, 10.4, 10.5, 10.8, 10.9)', () => {
  it('sends correct request/attest shapes and reaches attested', async () => {
    let requestBody: unknown = null;
    server.use(
      http.post(`${BASE}/proof/request`, async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json({ pendingProofId: 'pp1' }, { status: 201 });
      }),
      http.post(`${BASE}/proof/attest`, () => HttpResponse.json(ATTESTATION)),
    );
    renderPanel();
    await startToAttested();
    expect(requestBody).toEqual({
      wallet: WALLET,
      passportId: PASS,
      seasonId: '1',
      trialId: '1',
      factionId: 1,
    });
    expect(screen.getByText(/Oracle-Attested Demo Proof/)).not.toBeNull();
  });

  it('shows the calm "proof not available yet" state on attest failure, with no signature', async () => {
    server.use(
      http.post(`${BASE}/proof/request`, () => HttpResponse.json({ pendingProofId: 'pp1' }, { status: 201 })),
      http.post(`${BASE}/proof/attest`, () => HttpResponse.json({ error: 'condition' }, { status: 403 })),
    );
    renderPanel();
    await waitFor(() =>
      expect((screen.getByRole('button', { name: /Request proof/i }) as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(screen.getByRole('button', { name: /Request proof/i }));
    expect(await screen.findByTestId('not-available')).not.toBeNull();
    expect(screen.queryByTestId('proof')).toBeNull();
  });

  it('renders provisional frost while submitting and solidifies only on ProofAccepted', async () => {
    server.use(
      http.post(`${BASE}/proof/request`, () => HttpResponse.json({ pendingProofId: 'pp1' }, { status: 201 })),
      http.post(`${BASE}/proof/attest`, () => HttpResponse.json(ATTESTATION)),
    );
    h.submit.mockResolvedValue({ events: [{ type: '0xpkg::events::ProofAccepted' }] });
    renderPanel();
    const proof = await startToAttested();
    fireEvent.click(screen.getByRole('button', { name: /Submit proof/i }));
    await waitFor(() => expect(proof.getAttribute('data-status')).toBe('accepted'));
    expect(proof.getAttribute('data-treatment')).toBe('solid');
  });

  it('stays submitting (frost), never accepted, without a ProofAccepted event', async () => {
    server.use(
      http.post(`${BASE}/proof/request`, () => HttpResponse.json({ pendingProofId: 'pp1' }, { status: 201 })),
      http.post(`${BASE}/proof/attest`, () => HttpResponse.json(ATTESTATION)),
    );
    h.submit.mockResolvedValue({ events: [] });
    renderPanel();
    const proof = await startToAttested();
    fireEvent.click(screen.getByRole('button', { name: /Submit proof/i }));
    await waitFor(() => expect(proof.getAttribute('data-status')).toBe('submitting'));
    expect(proof.getAttribute('data-treatment')).toBe('frost');
  });

  it('routes E_REUSED_NULLIFIER to replayed with a melt treatment', async () => {
    server.use(
      http.post(`${BASE}/proof/request`, () => HttpResponse.json({ pendingProofId: 'pp1' }, { status: 201 })),
      http.post(`${BASE}/proof/attest`, () => HttpResponse.json(ATTESTATION)),
    );
    h.submit.mockRejectedValue(moveAbort(9));
    renderPanel();
    const proof = await startToAttested();
    fireEvent.click(screen.getByRole('button', { name: /Submit proof/i }));
    await waitFor(() => expect(proof.getAttribute('data-status')).toBe('replayed'));
    expect(proof.getAttribute('data-treatment')).toBe('melt');
  });
});
