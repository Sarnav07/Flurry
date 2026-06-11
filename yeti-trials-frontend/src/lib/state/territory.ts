import { queryOptions, useQuery } from '@tanstack/react-query';

import { orchestrator } from '~/lib/api/client';
import type { TerritoryStateVM } from '~/lib/types/viewModels';

export function territoryQueryOptions() {
  return queryOptions({
    queryKey: ['territory'] as const,
    staleTime: 5_000,
    refetchInterval: 10_000,
    queryFn: async (): Promise<TerritoryStateVM> => {
      const res = await orchestrator.getTerritory();
      if (!res.ok) throw new Error(`territory unavailable: ${res.error.message}`);
      return res.data;
    },
  });
}

export function useTerritory() {
  return useQuery(territoryQueryOptions());
}
