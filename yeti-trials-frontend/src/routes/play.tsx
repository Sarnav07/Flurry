import { createFileRoute } from '@tanstack/react-router';

import { RouteStub } from '~/components/route-stub';

export const Route = createFileRoute('/play')({
  component: Play,
});

function Play() {
  return (
    <RouteStub title="Territory Map" phase="Phase 3">
      The living territory map renders faction pressure from confirmed shard
      totals, with distinct pending, finalized, and settled states. The premium
      2.5D fallback path is built first; the 3D scene is opt-in.
    </RouteStub>
  );
}
