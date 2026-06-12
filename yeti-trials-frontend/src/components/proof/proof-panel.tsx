import { useCurrentAccount, useSuiClient } from '@mysten/dapp-kit';
import { useState } from 'react';

import { orchestrator } from '~/lib/api/client';
import { describeAbort } from '~/lib/format/abort';
import {
  LIVE_PROVENANCE_TIER,
  ORACLE_ATTESTED_LABEL,
  PROVENANCE_TIERS,
} from '~/lib/proof/provenance';
import { useConfig } from '~/lib/state/boot';
import { proofTreatment } from '~/lib/state/honesty';
import { transition, type ProofStatus } from '~/lib/state/pending';
import { usePlayer } from '~/lib/state/player';
import { buildSubmitProofTx, hasProofAccepted } from '~/lib/sui/submitProof';
import { useSubmitTransaction } from '~/lib/sui/submit';
import type { AttestationResponseVM } from '~/lib/types/viewModels';

const STATUS_LABEL: Record<ProofStatus, string> = {
  requested: 'Requested',
  attested: 'Attested',
  submitting: 'Submitting',
  accepted: 'Accepted',
  rejected: 'Rejected',
  expired: 'Expired',
  replayed: 'Replayed',
};

export function ProofPanel() {
  const config = useConfig();
  const client = useSuiClient();
  const address = useCurrentAccount()?.address ?? null;
  const { data: player } = usePlayer(address);
  const { submit } = useSubmitTransaction();

  const [status, setStatus] = useState<ProofStatus | null>(null);
  const [attestation, setAttestation] = useState<AttestationResponseVM | null>(null);
  const [notAvailable, setNotAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proofAccepted, setProofAccepted] = useState(false);

  const canStart = address !== null && player?.hasPassport === true && status === null;

  async function onRequestAndAttest() {
    if (address === null || player?.passportId == null || player.factionId == null) return;
    setError(null);
    setNotAvailable(false);

    const req = await orchestrator.proofRequest({
      wallet: address,
      passportId: player.passportId,
      seasonId: config.activeSeasonId.toString(),
      trialId: config.activeTrialId.toString(),
      factionId: player.factionId,
    });
    if (!req.ok) {
      setNotAvailable(true);
      return;
    }
    setStatus('requested');

    const att = await orchestrator.proofAttest({
      pendingProofId: req.data.pendingProofId,
      wallet: address,
      passportId: player.passportId,
    });
    if (!att.ok || att.data.signature.length === 0) {
      // Calm "proof not available yet": never surface a signature or acceptance.
      setNotAvailable(true);
      setStatus(null);
      return;
    }
    setAttestation(att.data);
    setStatus((s) => (s === null ? s : transition(s, { type: 'attest_ok' })));
  }

  async function onSubmit() {
    if (attestation === null || status !== 'attested') return;
    setStatus((s) => (s === null ? s : transition(s, { type: 'broadcast' })));
    try {
      const built = buildSubmitProofTx(config, attestation);
      const result = await submit(built.tx);

      // The dapp-kit execute polyfill may return effects without events. If the
      // ProofAccepted event is not already present, poll the RPC by digest.
      let accepted = hasProofAccepted(result);
      if (!accepted && result.digest !== undefined) {
        const confirmed = await client.waitForTransaction({
          digest: result.digest,
          options: { showEvents: true },
        });
        accepted = hasProofAccepted(confirmed);
      }

      if (accepted) {
        setProofAccepted(true);
        setStatus((s) => (s === null ? s : transition(s, { type: 'proof_accepted' })));
      }
      // No ProofAccepted event: stay submitting. The cinematic never claims an
      // acceptance the chain has not confirmed (honesty gating).
    } catch (e) {
      const { code, message } = describeAbort(e);
      setError(message);
      setStatus((s) => (s === null ? s : transition(s, { type: 'abort', code })));
    }
  }

  const treatment = status === null ? 'frost' : proofTreatment(status, proofAccepted);

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-frost-ice">Proofs</h1>
        <div className="flex flex-wrap items-center gap-2">
          {PROVENANCE_TIERS.map((t) => (
            <span
              key={t.value}
              data-testid={`tier-${t.value}`}
              data-active={t.active}
              className="rounded border border-frost-line px-2 py-0.5 text-xs"
              style={{ color: t.active ? 'var(--color-frost-ice)' : 'var(--color-frost-mist)' }}
            >
              {t.name}
              {t.comingSoon ? ' (coming soon)' : ''}
            </span>
          ))}
        </div>
      </header>

      {notAvailable ? (
        <p role="status" data-testid="not-available" className="text-sm text-frost-mist">
          Proof not available yet. Nothing was signed or accepted.
        </p>
      ) : null}

      {status !== null ? (
        <div data-testid="proof" data-status={status} data-treatment={treatment} className="flex flex-col gap-2">
          <span className="text-sm text-frost-ice">
            {ORACLE_ATTESTED_LABEL} · tier {LIVE_PROVENANCE_TIER} ({STATUS_LABEL[status]})
          </span>
          {error !== null ? (
            <span role="alert" className="text-sm text-frost-mist">
              {error}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex gap-3">
        <button
          type="button"
          disabled={!canStart}
          onClick={() => void onRequestAndAttest()}
          className="rounded border border-frost-line px-4 py-2 text-sm text-frost-ice transition-colors hover:border-frost-glow disabled:cursor-not-allowed disabled:opacity-60"
        >
          Request proof
        </button>
        <button
          type="button"
          disabled={status !== 'attested'}
          onClick={() => void onSubmit()}
          className="rounded border border-frost-line px-4 py-2 text-sm text-frost-ice transition-colors hover:border-frost-glow disabled:cursor-not-allowed disabled:opacity-60"
        >
          Submit proof
        </button>
      </div>
    </section>
  );
}
