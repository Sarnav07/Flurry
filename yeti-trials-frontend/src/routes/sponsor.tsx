import { createFileRoute } from '@tanstack/react-router';

import { SponsorView } from '~/components/sponsor/sponsor-surface';

export const Route = createFileRoute('/sponsor')({
  component: Sponsor,
});

function Sponsor() {
  return <SponsorView />;
}
