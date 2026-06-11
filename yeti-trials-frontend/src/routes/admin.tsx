import { createFileRoute } from '@tanstack/react-router';

import { RouteStub } from '~/components/route-stub';

export const Route = createFileRoute('/admin')({
  component: Admin,
});

function Admin() {
  return (
    <RouteStub title="Operator Console" phase="Phase 6 (P2)">
      The guarded operator console drives the season lifecycle: close, finalize
      territory, settle, disburse, and cleanup. It is reachable only behind an
      explicit operator guard and is intentionally absent from the default
      player navigation.
    </RouteStub>
  );
}
