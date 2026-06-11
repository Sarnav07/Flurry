import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return (
    <section className="flex flex-col gap-6">
      <p className="text-xs font-medium tracking-tight text-frost-mist">
        Genesis Frost
      </p>
      <h1 className="max-w-[18ch] text-5xl font-semibold leading-[1.05] tracking-tight text-frost-ice">
        A Sui-native faction engine
      </h1>
      <p className="max-w-[60ch] text-frost-mist">
        Four Yeti factions compete over a frozen territory map by submitting
        provenance-tagged proofs of real on-chain behavior. Connect a wallet,
        create a passport, and watch the map evolve as proofs are confirmed.
      </p>
      <p className="max-w-[60ch] text-sm text-frost-mist">
        This is the Phase 0 shell. The configuration and health boot, wallet
        connection, and the live map arrive in the phases that follow.
      </p>
    </section>
  );
}
