import { useState } from 'react';

import { env } from '~/env';
import { describeAbort } from '~/lib/format/abort';
import { useConfig } from '~/lib/state/boot';
import { useTerritory } from '~/lib/state/territory';
import {
  LIFECYCLE_STEPS,
  STEP_LABEL,
  buildCloseSeasonTx,
  buildDisburseTx,
  buildFinalizeTerritoryTx,
  buildSettleSeasonTx,
  extractEventNames,
  lifecycleEnablement,
  type StepId,
} from '~/lib/sui/admin';
import { useSubmitTransaction } from '~/lib/sui/submit';
import type { ConfigVM } from '~/lib/types/viewModels';

function buildStepTx(step: StepId, config: ConfigVM) {
  switch (step) {
    case 'close_season':
      return buildCloseSeasonTx(config);
    case 'finalize_territory':
      return buildFinalizeTerritoryTx(config);
    case 'settle_season':
      return buildSettleSeasonTx(config);
    case 'disburse':
      return buildDisburseTx(config);
    case 'cleanup_batches':
      return null; // caller-driven two-step; requires accepted keys (read at runtime)
  }
}

export function AdminConsole() {
  // Guard: never reachable unless the operator flag is explicitly enabled.
  if (!env.demoMode) {
    return (
      <p data-testid="admin-denied" role="status" className="text-sm text-frost-mist">
        The operator console is disabled. Set VITE_DEMO_MODE to enable it.
      </p>
    );
  }
  return <AdminConsoleInner />;
}

function AdminConsoleInner() {
  const config = useConfig();
  const { data: territory } = useTerritory();
  const { submit } = useSubmitTransaction();

  const [completed, setCompleted] = useState<Partial<Record<StepId, boolean>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [events, setEvents] = useState<string[]>([]);

  const enablement = lifecycleEnablement({
    territoryFinalized: territory?.finalized ?? false,
    impactDisbursed: territory?.impact.disbursed ?? false,
    completed,
  });

  async function run(step: StepId) {
    setMessage(null);
    const tx = buildStepTx(step, config);
    if (tx === null) {
      setMessage('Cleanup is caller-driven and not automatic; run it from the cleanup tooling.');
      return;
    }
    try {
      const result = await submit(tx);
      setCompleted((c) => ({ ...c, [step]: true }));
      const names = extractEventNames(result);
      setEvents(names);
      setMessage(names.length > 0 ? `Emitted: ${names.join(', ')}` : `${STEP_LABEL[step]} submitted.`);
    } catch (e) {
      setMessage(describeAbort(e).message);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight text-frost-ice">Operator console</h1>
        <p className="text-sm text-frost-mist">
          Lifecycle actions run in order. Cleanup is caller-driven and not automatic.
        </p>
      </header>

      <ol className="flex flex-col gap-2">
        {LIFECYCLE_STEPS.map((step, i) => (
          <li key={step} className="flex items-center gap-3">
            <span className="w-5 text-xs text-frost-mist">{i + 1}</span>
            <button
              type="button"
              data-testid={`step-${step}`}
              disabled={!enablement[step]}
              onClick={() => void run(step)}
              className="rounded border border-frost-line px-4 py-2 text-sm text-frost-ice transition-colors hover:border-frost-glow disabled:cursor-not-allowed disabled:opacity-60"
            >
              {STEP_LABEL[step]}
            </button>
            {completed[step] === true ? (
              <span className="text-xs text-frost-mist">done</span>
            ) : null}
          </li>
        ))}
      </ol>

      {message !== null ? (
        <p role="status" data-testid="admin-message" className="text-sm text-frost-ice">
          {message}
        </p>
      ) : null}

      {events.length > 0 ? (
        <ul data-testid="admin-events" className="flex flex-col gap-0.5 text-xs text-frost-mist">
          {events.map((e, i) => (
            <li key={i} className="font-mono">
              {e}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
