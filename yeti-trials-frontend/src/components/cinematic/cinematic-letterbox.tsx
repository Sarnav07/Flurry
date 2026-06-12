/** Letterbox + ease-in framing for a confirmed beat. The caller only renders it
 * when NOT under reduced motion; the skip control is keyboard-operable. */
export function CinematicLetterbox({ label, onSkip }: { label: string; onSkip: () => void }) {
  return (
    <div
      data-testid="cinematic-letterbox"
      aria-live="polite"
      className="relative overflow-hidden rounded-lg"
      style={{ zIndex: 'var(--z-overlay)' }}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-frost-void" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-frost-void" />
      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-xs text-frost-ice">{label}</span>
        <button
          type="button"
          onClick={onSkip}
          className="rounded border border-frost-line px-3 py-1 text-xs text-frost-ice transition-colors hover:border-frost-glow"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
