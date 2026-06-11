import type { ReactNode } from 'react';

import { ConnectionUnavailable } from '~/components/connection-unavailable';
import { BootContextProvider, useBoot } from '~/lib/state/boot';

/** Calm first-paint splash while config + health resolve. */
function BootSplash() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-6">
      <p role="status" aria-live="polite" className="text-sm text-frost-mist">
        Reading the season from the orchestrator
      </p>
    </div>
  );
}

/**
 * Blocks all id-dependent children until BOTH GET /config and GET /health
 * succeed. On failure it renders the connection-unavailable fallback INSTEAD of
 * the app shell.
 */
export function BootGate({ children }: { children: ReactNode }) {
  const { data, isPending, isError, isFetching, refetch } = useBoot();

  if (isPending) return <BootSplash />;
  if (isError || data === undefined) {
    return (
      <ConnectionUnavailable onRetry={() => void refetch()} retrying={isFetching} />
    );
  }
  return <BootContextProvider value={data}>{children}</BootContextProvider>;
}
