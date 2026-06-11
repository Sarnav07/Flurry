import { createFileRoute } from '@tanstack/react-router';

import { RouteStub } from '~/components/route-stub';

export const Route = createFileRoute('/proof')({
  component: Proof,
});

function Proof() {
  return (
    <RouteStub title="Proofs" phase="Phase 4">
      Request a proof, receive an Oracle-Attested Demo Proof, and submit it
      on-chain. Each proof moves through an honest status machine: pending stays
      provisional until a confirming event arrives.
    </RouteStub>
  );
}
