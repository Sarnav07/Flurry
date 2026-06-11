import { createFileRoute } from '@tanstack/react-router';

import { ImpactView } from '~/components/impact/impact-view';

export const Route = createFileRoute('/impact')({
  component: Impact,
});

function Impact() {
  return <ImpactView />;
}
