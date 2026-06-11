import { useSuiClient } from '@mysten/dapp-kit';

import { useConfig } from '~/lib/state/boot';
import type { ConfigObjectIds } from '~/lib/types/wire';

/** Shared system clock object. A protocol constant, not a deployment id. */
export const SUI_CLOCK_OBJECT_ID = '0x6';

/** Object ids sourced ONLY from the cached Config, never a source constant. */
export function useObjectIds(): ConfigObjectIds {
  return useConfig().objectIds;
}

/** Thin Sui read layer: the dapp-kit client plus Config-sourced object ids. */
type DappKitSuiClient = ReturnType<typeof useSuiClient>;

export function useSuiReader(): {
  client: DappKitSuiClient;
  objectIds: ConfigObjectIds;
  getObject: (id: string) => ReturnType<DappKitSuiClient['getObject']>;
} {
  const client = useSuiClient();
  const objectIds = useObjectIds();
  return {
    client,
    objectIds,
    getObject: (id: string) =>
      client.getObject({ id, options: { showContent: true, showType: true } }),
  };
}
