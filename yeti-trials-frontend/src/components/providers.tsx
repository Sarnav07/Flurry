import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import { useState, type ReactNode } from 'react';

import { defaultNetwork, networkConfig } from '~/lib/sui/networkConfig';

import '@mysten/dapp-kit/dist/index.css';

/**
 * App-wide providers. React Query is the cache/polling layer; dapp-kit supplies
 * the Sui client (network from env, label still from GET /health) and the wallet
 * adapter. A standard wallet connection is the default, sufficient path.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork={defaultNetwork}>
        <WalletProvider autoConnect>{children}</WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
