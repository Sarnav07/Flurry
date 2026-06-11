import { useSuiClient } from '@mysten/dapp-kit';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import { useConfig } from '~/lib/state/boot';

export interface FeedItem {
  id: string;
  /** Short event name, e.g. ScoreShardUpdated / TerritoryFinalized. */
  label: string;
  timestampMs: bigint | null;
}

const REFRESH_EVENTS = new Set(['ScoreShardUpdated', 'TerritoryFinalized']);

/**
 * Polls the package `events` module and surfaces a recent activity feed. When a
 * new ScoreShardUpdated / TerritoryFinalized is observed, it invalidates the
 * territory query so the render reconciles to confirmed on-chain values.
 */
export function useTerritoryEvents(): { feed: FeedItem[] } {
  const client = useSuiClient();
  const { packageId } = useConfig();
  const queryClient = useQueryClient();
  const lastSeen = useRef<string | null>(null);

  const query = useQuery({
    queryKey: ['events', packageId] as const,
    refetchInterval: 8_000,
    queryFn: async (): Promise<FeedItem[]> => {
      const res = await client.queryEvents({
        query: { MoveEventModule: { package: packageId, module: 'events' } },
        limit: 25,
        order: 'descending',
      });
      const items: FeedItem[] = res.data.map((e) => ({
        id: `${e.id.txDigest}:${e.id.eventSeq}`,
        label: e.type.split('::').pop() ?? e.type,
        timestampMs: e.timestampMs != null ? BigInt(e.timestampMs) : null,
      }));

      const latest = items[0]?.id ?? null;
      if (latest !== null && latest !== lastSeen.current) {
        const relevant = items.some((i) => REFRESH_EVENTS.has(i.label));
        lastSeen.current = latest;
        if (relevant) void queryClient.invalidateQueries({ queryKey: ['territory'] });
      }
      return items;
    },
  });

  return { feed: query.data ?? [] };
}
