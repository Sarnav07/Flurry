import { createFileRoute } from '@tanstack/react-router';

import { TrustSurface } from '~/components/trust/trust-surface';

export const Route = createFileRoute('/trust')({
  component: Trust,
});

function Trust() {
  return <TrustSurface />;
}
