import { createFileRoute } from '@tanstack/react-router';

import { RouteStub } from '~/components/route-stub';

export const Route = createFileRoute('/sponsor')({
  component: Sponsor,
});

function Sponsor() {
  return (
    <RouteStub title="Sponsor" phase="Phase 5">
      Genesis Frost is presented with launch sponsor Alpha City. The sponsor is
      a presentation frame rendered from config only. Sponsors cannot buy, bias,
      or affect scoring or territory outcomes.
    </RouteStub>
  );
}
