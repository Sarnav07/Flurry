import { createFileRoute } from '@tanstack/react-router';

import { RouteStub } from '~/components/route-stub';

export const Route = createFileRoute('/profile')({
  component: Profile,
});

function Profile() {
  return (
    <RouteStub title="Profile" phase="Phase 5">
      Your passport, faction, and accepted-proof count. Raw reputation is shown
      separately from territory power; game balancing never changes your raw
      reputation.
    </RouteStub>
  );
}
