/**
 * Calm connection-unavailable state. Honest: it names that the orchestrator
 * could not be reached and withholds every id-dependent screen. Full border
 * (no side-stripe), single accent, keyboard-operable retry, reduced-motion safe.
 */
export function ConnectionUnavailable({
  onRetry,
  retrying,
}: {
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-6">
      <div className="flex max-w-[52ch] flex-col items-start gap-5 rounded-lg border border-frost-line bg-frost-deep p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-frost-ice">
          Connection unavailable
        </h1>
        <p className="text-frost-mist">
          The orchestrator could not be reached, so the live network and contract
          details are not loaded. Nothing here is faked while the connection is
          down. Check that the orchestrator is running, then try again.
        </p>
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          aria-busy={retrying}
          className="rounded border border-frost-line px-4 py-2 text-sm text-frost-ice transition-colors hover:border-frost-glow disabled:cursor-not-allowed disabled:opacity-60"
        >
          {retrying ? 'Reconnecting' : 'Try again'}
        </button>
      </div>
    </div>
  );
}
