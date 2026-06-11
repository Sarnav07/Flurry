import { queryOptions, useQuery } from '@tanstack/react-query';

import { orchestrator } from '~/lib/api/client';
import type { PlayerStateVM } from '~/lib/types/viewModels';

/** GET /player/:address. `hasPassport: false` is a normal result, not an error. */
export function playerQueryOptions(address: string | null) {
  return queryOptions({
    queryKey: ['player', address] as const,
    enabled: address !== null,
    staleTime: 10_000,
    queryFn: async (): Promise<PlayerStateVM> => {
      if (address === null) throw new Error('no connected address');
      const res = await orchestrator.getPlayer(address);
      if (!res.ok) throw new Error(`player unavailable: ${res.error.message}`);
      return res.data;
    },
  });
}

export function usePlayer(address: string | null) {
  return useQuery(playerQueryOptions(address));
}
