import { useQuery } from '@tanstack/react-query';

import { useSuiReader } from '~/lib/sui/reads';
import { toU64 } from '~/lib/types/parse';

export interface SeasonWindow {
  /** true = within [start, end); false = closed; null = unknown/loading. */
  open: boolean | null;
  loading: boolean;
}

/** Reads the on-chain Season's start_ms/end_ms to gate passport creation. */
export function useSeasonWindow(): SeasonWindow {
  const { client, objectIds } = useSuiReader();
  const query = useQuery({
    queryKey: ['season-window', objectIds.seasonId] as const,
    staleTime: 5_000,
    queryFn: async (): Promise<{ startMs: bigint; endMs: bigint }> => {
      const res = await client.getObject({
        id: objectIds.seasonId,
        options: { showContent: true },
      });
      const content = res.data?.content;
      const fields =
        content?.dataType === 'moveObject'
          ? (content.fields as Record<string, unknown>)
          : undefined;
      if (fields === undefined) throw new Error('season object not readable');
      return { startMs: toU64(String(fields['start_ms'])), endMs: toU64(String(fields['end_ms'])) };
    },
  });

  if (query.data === undefined) return { open: null, loading: query.isLoading };
  const now = BigInt(Date.now());
  return { open: now >= query.data.startMs && now < query.data.endMs, loading: false };
}
