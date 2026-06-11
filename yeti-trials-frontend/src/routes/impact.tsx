import { createFileRoute } from '@tanstack/react-router';

import { RouteStub } from '~/components/route-stub';

export const Route = createFileRoute('/impact')({
  component: Impact,
});

function Impact() {
  return (
    <RouteStub title="Impact" phase="Phase 5">
      The impact escrow status and the golden-hour finalization ceremony. This
      surface uses impact-allocation language only. The system provides no yield
      and no investment return, and players never earn a token as a reward.
    </RouteStub>
  );
}
