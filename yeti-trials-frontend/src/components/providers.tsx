import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

/**
 * App-wide providers. React Query is the cache/polling layer the Boot_Loader
 * (Phase 0) and later phases build on. Wallet / dapp-kit providers are added in
 * Phase 1; they are intentionally absent from this shell.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Config/health are long-lived once discovered; tune per-query later.
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
