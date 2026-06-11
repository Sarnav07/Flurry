import { useState } from 'react';

import { formatU64 } from '~/lib/format/numbers';
import { impactStrings } from '~/lib/impact/copy';
import { useConfig } from '~/lib/state/boot';
import { useTerritory } from '~/lib/state/territory';
import { abbreviateAddress } from '~/lib/sui/address';
import type { ImpactStatusVM, TerritoryStateVM } from '~/lib/types/viewModels';

/** Most-owned faction once finalized; the faction that directs the allocation. */
function winningFaction(t: TerritoryStateVM): number | null {
  if (!t.finalized || t.owners.length === 0) return null;
  const counts = new Map<number, number>();
  for (const f of t.owners) counts.set(f, (counts.get(f) ?? 0) + 1);
  let winner = t.owners[0]!;
  for (const [f, c] of counts) if (c > (counts.get(winner) ?? 0)) winner = f;
  return winner;
}

export function ImpactCard({
  impact,
  winnerName,
  recipient,
}: {
  impact: ImpactStatusVM;
  winnerName: string | null;
  recipient: string | null;
}) {
  const [revealDismissed, setRevealDismissed] = useState(false);
  const copy = impactStrings({ disbursed: impact.disbursed, winnerName, recipient });
  const [
    title,
    balanceLabel,
    recipientsLabel,
    note,
    statusLine,
    revealHeading,
    recipientLine,
  ] = copy;

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight text-frost-ice">{title}</h1>
        <p role="status" data-testid="impact-status" data-disbursed={impact.disbursed} className="text-sm text-frost-mist">
          {statusLine}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1 rounded border border-frost-line p-4">
          <span className="text-xs text-frost-mist">{balanceLabel}</span>
          <span data-testid="impact-balance" className="font-mono text-2xl text-frost-ice">
            {formatU64(impact.balance)}
          </span>
        </div>
        <div className="flex flex-col gap-1 rounded border border-frost-line p-4">
          <span className="text-xs text-frost-mist">{recipientsLabel}</span>
          <ul className="flex flex-col gap-0.5 font-mono text-sm text-frost-ice">
            {impact.recipients.length === 0 ? (
              <li className="text-frost-mist">None registered</li>
            ) : (
              impact.recipients.map((r, i) => <li key={i}>{abbreviateAddress(r)}</li>)
            )}
          </ul>
        </div>
      </div>

      {impact.disbursed && !revealDismissed && revealHeading !== undefined ? (
        // Functional finalization reveal (golden-hour cinema deferred to Phase 7);
        // no animation, so reduced-motion is honored by construction.
        <div data-testid="impact-reveal" className="flex flex-col gap-2 rounded border border-frost-line bg-frost-surface p-5">
          <h2 className="text-lg font-semibold text-frost-ice">{revealHeading}</h2>
          {recipientLine !== undefined ? (
            <p className="font-mono text-sm text-frost-mist">{recipientLine}</p>
          ) : null}
          <button
            type="button"
            onClick={() => setRevealDismissed(true)}
            className="self-start rounded border border-frost-line px-3 py-1.5 text-xs text-frost-mist transition-colors hover:text-frost-ice hover:border-frost-glow"
          >
            Skip
          </button>
        </div>
      ) : null}

      <p className="max-w-[65ch] text-sm text-frost-mist">{note}</p>
    </section>
  );
}

export function ImpactView() {
  const { data: territory } = useTerritory();
  const { factions } = useConfig();

  if (territory === undefined) {
    return <p role="status" className="text-sm text-frost-mist">Reading the impact escrow.</p>;
  }

  const winnerId = winningFaction(territory);
  const winnerName =
    winnerId === null ? null : (factions.find((f) => f.id === winnerId)?.name ?? `Faction ${winnerId}`);
  const recipient =
    winnerId === null ? null : (territory.impact.recipients[winnerId] ?? null);

  return <ImpactCard impact={territory.impact} winnerName={winnerName} recipient={recipient} />;
}
