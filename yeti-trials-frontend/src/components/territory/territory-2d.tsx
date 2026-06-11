import { factionChannels } from '~/lib/territory/separation';
import type { TerritoryRenderState } from '~/lib/territory/renderState';
import { formatU64 } from '~/lib/format/numbers';
import type { FactionInfo } from '~/lib/types/wire';
import type { TerritoryStateVM } from '~/lib/types/viewModels';

const ACCENT: Readonly<Record<number, string>> = {
  0: 'var(--color-faction-glaciers)',
  1: 'var(--color-faction-avalanche)',
  2: 'var(--color-faction-blizzard)',
  3: 'var(--color-faction-thaw)',
};

const LIFECYCLE_LABEL = { pending: 'Pending', finalized: 'Finalized', settled: 'Settled' } as const;

/**
 * 2.5D fallback render path (VITE_ENABLE_3D=false). Parallax frost layers +
 * animated masks in the Frost_Grade palette. Honest distinctions: pending is
 * translucent with nothing captured; finalized is solid ownership; settled is a
 * distinct quiet treatment. No 3D, no post-processing, no ceremonies.
 */
export function Territory2D({
  territory,
  renderState,
  factions,
}: {
  territory: TerritoryStateVM;
  renderState: TerritoryRenderState;
  factions: FactionInfo[];
}) {
  const { lifecycle, owners, pressure } = renderState;
  const channels = factionChannels(territory);
  const nameOf = (id: number) => factions.find((f) => f.id === id)?.name ?? `Faction ${id}`;
  const stageClass =
    lifecycle === 'pending' ? 'frost-pending' : lifecycle === 'settled' ? 'frost-settled' : '';

  return (
    <div
      data-testid="territory-2d"
      data-lifecycle={lifecycle}
      className="relative overflow-hidden rounded-lg border border-frost-line bg-frost-deep p-6"
    >
      <div aria-hidden="true" className="frost-parallax-back pointer-events-none absolute inset-0" />
      <div aria-hidden="true" className="frost-parallax-fore pointer-events-none absolute inset-0" />

      <div className="relative flex flex-col gap-6">
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-frost-ice">Territory</h2>
          <span
            data-testid="lifecycle"
            className="rounded border border-frost-line px-2 py-0.5 text-xs text-frost-mist"
          >
            {LIFECYCLE_LABEL[lifecycle]}
          </span>
        </header>

        {owners === null ? (
          <div data-testid="pressure" className={`flex flex-col gap-3 ${stageClass}`}>
            <p className="text-xs text-frost-mist">
              Provisional faction pressure. Nothing is captured until the season is finalized.
            </p>
            {pressure.map((p) => (
              <div key={p.factionId} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-sm text-frost-ice">{nameOf(p.factionId)}</span>
                <span className="h-2 flex-1 overflow-hidden rounded bg-frost-surface">
                  <span
                    className="block h-full rounded"
                    style={{
                      width: `${Math.round(p.share * 100)}%`,
                      backgroundColor: ACCENT[p.factionId] ?? 'var(--color-frost-glow)',
                    }}
                  />
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div data-testid="owners-grid" className={`grid grid-cols-3 gap-2 sm:grid-cols-6 ${stageClass}`}>
            {owners.map((factionId, territoryIndex) => (
              <span
                key={territoryIndex}
                title={`Territory ${territoryIndex}: ${nameOf(factionId)}`}
                className="flex aspect-square items-center justify-center rounded text-xs font-medium text-frost-void"
                style={{ backgroundColor: ACCENT[factionId] ?? 'var(--color-frost-glow)' }}
              >
                {factionId}
              </span>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {channels.map((c) => (
            <div
              key={c.factionId}
              className="flex flex-col gap-1 rounded border border-frost-line p-3"
            >
              <span className="text-sm font-medium text-frost-ice">{nameOf(c.factionId)}</span>
              <span className="text-xs text-frost-mist">
                Raw reputation:{' '}
                <span data-testid={`raw-${c.factionId}`} className="font-mono text-frost-ice">
                  {formatU64(c.rawScoreTotal)}
                </span>
              </span>
              <span className="text-xs text-frost-mist">
                Territory power:{' '}
                <span data-testid={`power-${c.factionId}`} className="font-mono text-frost-ice">
                  {formatU64(c.territoryPowerTotal)}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
