import { createFileRoute } from '@tanstack/react-router';

import { ProfileView } from '~/components/meters/profile-view';

export const Route = createFileRoute('/profile')({
  component: Profile,
});

function Profile() {
  return <ProfileView />;
}
