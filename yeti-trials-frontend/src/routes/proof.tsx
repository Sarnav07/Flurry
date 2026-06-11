import { createFileRoute } from '@tanstack/react-router';

import { ProofPanel } from '~/components/proof/proof-panel';

export const Route = createFileRoute('/proof')({
  component: Proof,
});

function Proof() {
  return <ProofPanel />;
}
