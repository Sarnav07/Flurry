import { createFileRoute } from '@tanstack/react-router';

import { TerritoryView } from '~/components/territory/territory-view';

export const Route = createFileRoute('/play')({
  component: Play,
});

function Play() {
  return <TerritoryView />;
}
