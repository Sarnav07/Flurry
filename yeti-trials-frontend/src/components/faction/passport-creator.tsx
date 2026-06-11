import { useState } from 'react';

import { FactionCards } from '~/components/faction/faction-cards';
import type { FactionInfo } from '~/lib/types/wire';

/**
 * Passport creation surface (presentational). The create action is disabled
 * with a visible reason while the active-season window is closed. Errors render
 * as human-readable messages, never as a raw abort number or a faked success.
 */
export function PassportCreator({
  factions,
  seasonOpen,
  pending,
  errorMessage,
  onCreate,
}: {
  factions: FactionInfo[];
  seasonOpen: boolean | null;
  pending: boolean;
  errorMessage: string | null;
  onCreate: (factionId: number) => void;
}) {
  const [selectedFactionId, setSelectedFactionId] = useState<number | null>(null);
  const seasonClosed = seasonOpen === false;
  const canCreate = !pending && !seasonClosed && selectedFactionId !== null;

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-medium tracking-tight text-frost-mist">Genesis Frost</p>
        <h1 className="text-3xl font-semibold tracking-tight text-frost-ice">Choose your faction</h1>
        <p className="max-w-[60ch] text-frost-mist">
          Your faction is fixed for the season at passport creation. Pick one to commit.
        </p>
      </header>

      <FactionCards
        factions={factions}
        selectedFactionId={selectedFactionId}
        onSelect={setSelectedFactionId}
        disabled={pending}
      />

      {seasonClosed ? (
        <p role="status" className="text-sm text-frost-mist">
          The season is not currently active, so passport creation is unavailable.
        </p>
      ) : null}

      {errorMessage !== null ? (
        <p role="alert" className="text-sm text-frost-ice">
          {errorMessage}
        </p>
      ) : null}

      <div>
        <button
          type="button"
          disabled={!canCreate}
          aria-busy={pending}
          onClick={() => {
            if (selectedFactionId !== null) onCreate(selectedFactionId);
          }}
          className="rounded border border-frost-line px-4 py-2 text-sm text-frost-ice transition-colors hover:border-frost-glow disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Creating passport' : 'Create passport'}
        </button>
      </div>
    </section>
  );
}
