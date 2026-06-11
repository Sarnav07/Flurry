import { createFileRoute } from '@tanstack/react-router';

import { RouteStub } from '~/components/route-stub';

export const Route = createFileRoute('/trust')({
  component: Trust,
});

function Trust() {
  return (
    <RouteStub title="How this works" phase="Phase 6">
      The trust surface states every trust boundary in plain language: the demo
      oracle is centralized V1 infrastructure, an Oracle-Attested proof is the
      oracle&apos;s signed statement and not a native on-chain fact, zkLogin is
      onboarding convenience and not Sybil resistance, and cleanup is
      caller-driven, not automatic.
    </RouteStub>
  );
}
