import { createFileRoute } from '@tanstack/react-router';

import { useExistingPassportRouting } from '~/lib/state/routing';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  // Returning players (hasPassport) are routed into the game shell automatically.
  const { address, player } = useExistingPassportRouting();
  const connected = address !== null;
  const needsPassport = connected && player?.hasPassport === false;

  return (
    <section className="flex flex-col gap-6">
      <p className="text-xs font-medium tracking-tight text-frost-mist">Genesis Frost</p>
      <h1 className="max-w-[18ch] text-5xl font-semibold leading-[1.05] tracking-tight text-frost-ice">
        A Sui-native faction engine
      </h1>
      <p className="max-w-[60ch] text-frost-mist">
        Four Yeti factions compete over a frozen territory map by submitting
        provenance-tagged proofs of real on-chain behavior. Connect a wallet,
        create a passport, and watch the map evolve as proofs are confirmed.
      </p>
      <p className="max-w-[60ch] text-sm text-frost-mist">
        {connected
          ? needsPassport
            ? 'No passport yet for this wallet. Faction selection arrives in the next phase.'
            : 'Reading your passport from the orchestrator.'
          : 'Connect a standard Sui wallet to begin. That alone is enough to play.'}
      </p>
    </section>
  );
}
