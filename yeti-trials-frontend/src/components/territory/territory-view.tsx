import { Suspense, lazy, useEffect, useState } from 'react';

import { ActivityFeed } from '~/components/territory/activity-feed';
import { CinematicLetterbox } from '~/components/cinematic/cinematic-letterbox';
import { Territory2D } from '~/components/territory/territory-2d';
import { env } from '~/env';
import { usePrefersReducedMotion } from '~/lib/a11y/reduced-motion';
import { canPostFx, canRender3D, probeCapability, type DeviceCapability } from '~/lib/perf/capability';
import { useConfig } from '~/lib/state/boot';
import { useTerritory } from '~/lib/state/territory';
import { useTerritoryEvents } from '~/lib/sui/events';
import { deriveRenderState } from '~/lib/territory/renderState';

// Code-split: the 3D scene is never part of the boot bundle.
const TerritoryScene = lazy(() => import('~/scene/territory-scene'));

export function TerritoryView() {
  const { factions } = useConfig();
  const { data, isPending, isError } = useTerritory();
  const { feed } = useTerritoryEvents();
  const reducedMotion = usePrefersReducedMotion();

  const [cap, setCap] = useState<DeviceCapability | null>(null);
  const [degraded, setDegraded] = useState(false);
  const [deferredMount, setDeferredMount] = useState(false);
  const [skipped, setSkipped] = useState(false);

  // Probe device capability and defer the 3D mount until first interaction/idle.
  useEffect(() => {
    setCap(probeCapability());
    const ready = () => setDeferredMount(true);
    const t = setTimeout(ready, 1200);
    window.addEventListener('pointerdown', ready, { once: true });
    window.addEventListener('keydown', ready, { once: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener('pointerdown', ready);
      window.removeEventListener('keydown', ready);
    };
  }, []);

  if (isPending) {
    return <p role="status" className="text-sm text-frost-mist">Reading the territory map.</p>;
  }
  if (isError || data === undefined) {
    return <p role="alert" className="text-sm text-frost-ice">The territory map is unavailable right now.</p>;
  }

  const renderState = deriveRenderState(data);
  const use3D =
    !degraded && cap !== null && canRender3D(env.enable3D, cap) && deferredMount;
  const postFx = cap !== null && canPostFx(env.enablePostFx, cap);
  const showLetterbox = use3D && !reducedMotion && !skipped && renderState.lifecycle === 'finalized';

  const map = use3D ? (
    <Suspense fallback={<Territory2D territory={data} renderState={renderState} factions={factions} />}>
      <TerritoryScene
        territory={data}
        renderState={renderState}
        reducedMotion={reducedMotion}
        postFx={postFx}
        onDegrade={() => setDegraded(true)}
      />
    </Suspense>
  ) : (
    <Territory2D territory={data} renderState={renderState} factions={factions} />
  );

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_240px]">
      <div className="flex flex-col gap-3">
        {showLetterbox ? (
          <CinematicLetterbox label="Territory finalized" onSkip={() => setSkipped(true)} />
        ) : null}
        {map}
      </div>
      <ActivityFeed feed={feed} />
    </div>
  );
}
