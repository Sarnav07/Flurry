/**
 * Boot_Loader. Fetches GET /config + GET /health together and gates all
 * id-dependent screens until BOTH succeed. The BigInt-parsed ConfigVM is cached
 * with an infinite stale time as the sole source of package/object/season/trial
 * /shard/sponsor identifiers.
 */
import { queryOptions, useQuery } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';

import { orchestrator, type OrchestratorClient } from '~/lib/api/client';
import type { ConfigVM } from '~/lib/types/viewModels';

export interface BootData {
  config: ConfigVM;
  /** Authoritative network of record from GET /health. */
  network: string;
}

export function bootQueryOptions(client: OrchestratorClient = orchestrator) {
  return queryOptions({
    queryKey: ['boot'] as const,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 2,
    queryFn: async (): Promise<BootData> => {
      const [config, health] = await Promise.all([client.getConfig(), client.getHealth()]);
      if (!config.ok) throw new Error(`config unavailable: ${config.error.message}`);
      if (!health.ok) throw new Error(`health unavailable: ${health.error.message}`);
      return { config: config.data, network: health.data.network };
    },
  });
}

export function useBoot() {
  return useQuery(bootQueryOptions());
}

const BootContext = createContext<BootData | null>(null);

export function BootContextProvider({
  value,
  children,
}: {
  value: BootData;
  children: ReactNode;
}) {
  return <BootContext.Provider value={value}>{children}</BootContext.Provider>;
}

/** Read the cached boot data. Only valid under a ready Boot_Loader. */
export function useBootData(): BootData {
  const value = useContext(BootContext);
  if (value === null) {
    throw new Error('useBootData must be used within a ready Boot_Loader');
  }
  return value;
}

export function useConfig(): ConfigVM {
  return useBootData().config;
}
