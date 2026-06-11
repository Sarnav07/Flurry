import { ActivityFeed } from '~/components/territory/activity-feed';
import { Territory2D } from '~/components/territory/territory-2d';
import { useConfig } from '~/lib/state/boot';
import { useTerritory } from '~/lib/state/territory';
import { useTerritoryEvents } from '~/lib/sui/events';
import { deriveRenderState } from '~/lib/territory/renderState';

/**
 * Territory_View container. Reads GET /territory, derives the shared render
 * state, and renders the 2.5D fallback. (The 3D scene is deferred to Phase 7;
 * VITE_ENABLE_3D currently still renders this 2.5D path.) Events drive refresh.
 */
export function TerritoryView() {
  const { factions } = useConfig();
  const { data, isPending, isError } = useTerritory();
  const { feed } = useTerritoryEvents();

  if (isPending) {
    return (
      <p role="status" className="text-sm text-frost-mist">
        Reading the territory map.
      </p>
    );
  }
  if (isError || data === undefined) {
    return (
      <p role="alert" className="text-sm text-frost-ice">
        The territory map is unavailable right now.
      </p>
    );
  }

  const renderState = deriveRenderState(data);

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_240px]">
      <Territory2D territory={data} renderState={renderState} factions={factions} />
      <ActivityFeed feed={feed} />
    </div>
  );
}
