import type { FactionInfo } from '~/lib/types/wire';

/** Faction accent within the Frost_Grade palette, keyed by faction id 0..3. */
const ACCENT: Readonly<Record<number, string>> = {
  0: 'var(--color-faction-glaciers)',
  1: 'var(--color-faction-avalanche)',
  2: 'var(--color-faction-blizzard)',
  3: 'var(--color-faction-thaw)',
};

/**
 * Carved-ice faction cards rendered dynamically from Config.factions. Exactly
 * one selection (radiogroup); selection is changeable until submission. No
 * join-multiple and no switch-faction affordance exists here.
 */
export function FactionCards({
  factions,
  selectedFactionId,
  onSelect,
  disabled = false,
}: {
  factions: FactionInfo[];
  selectedFactionId: number | null;
  onSelect: (id: number) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Choose a faction"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      {factions.map((faction) => {
        const selected = faction.id === selectedFactionId;
        const accent = ACCENT[faction.id] ?? 'var(--color-frost-glow)';
        return (
          <button
            key={faction.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onSelect(faction.id)}
            className="group relative flex min-h-[160px] flex-col justify-end rounded-lg border bg-frost-deep p-5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              borderColor: selected ? accent : 'var(--color-frost-line)',
              boxShadow: selected ? `inset 0 0 0 1px ${accent}` : undefined,
            }}
          >
            <span
              aria-hidden="true"
              className="absolute left-5 top-5 h-2 w-2 rounded-full"
              style={{ backgroundColor: accent }}
            />
            <span className="text-lg font-semibold tracking-tight text-frost-ice">
              {faction.name}
            </span>
            <span className="text-xs text-frost-mist">Faction {faction.id}</span>
          </button>
        );
      })}
    </div>
  );
}
