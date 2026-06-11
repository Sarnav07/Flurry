import { useCurrentAccount } from '@mysten/dapp-kit';

import { formatU64 } from '~/lib/format/numbers';
import { useConfig } from '~/lib/state/boot';
import { usePlayer } from '~/lib/state/player';
import { useTerritory } from '~/lib/state/territory';
import { abbreviateAddress } from '~/lib/sui/address';

/** Presentational profile. Raw reputation and territory power are two distinct,
 * labeled channels; they are never combined into a single number. */
export function ProfileCard({
  passportId,
  factionName,
  rawReputation,
  territoryPower,
  acceptedProofCount,
  pendingCount,
}: {
  passportId: string;
  factionName: string;
  rawReputation: bigint;
  territoryPower: bigint;
  acceptedProofCount: bigint;
  pendingCount: number;
}) {
  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight text-frost-ice">Profile</h1>
        <p className="text-sm text-frost-mist">
          {factionName} · passport{' '}
          <span className="font-mono">{abbreviateAddress(passportId)}</span>
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1 rounded border border-frost-line p-4">
          <span className="text-xs text-frost-mist">Raw reputation</span>
          <span data-testid="raw-reputation" className="font-mono text-2xl text-frost-ice">
            {formatU64(rawReputation)}
          </span>
        </div>
        <div className="flex flex-col gap-1 rounded border border-frost-line p-4">
          <span className="text-xs text-frost-mist">Territory power</span>
          <span data-testid="territory-power" className="font-mono text-2xl text-frost-ice">
            {formatU64(territoryPower)}
          </span>
        </div>
      </div>

      <p className="max-w-[65ch] text-sm text-frost-mist">
        Raw reputation is what your proofs literally said. Territory power is game-balanced and
        tracked separately; game balancing never changes your raw reputation.
      </p>

      <dl className="flex gap-8 text-sm">
        <div className="flex flex-col">
          <dt className="text-frost-mist">Accepted proofs</dt>
          <dd className="font-mono text-frost-ice">{formatU64(acceptedProofCount)}</dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-frost-mist">Pending</dt>
          <dd className="font-mono text-frost-ice">{pendingCount}</dd>
        </div>
      </dl>
    </section>
  );
}

export function ProfileView() {
  const address = useCurrentAccount()?.address ?? null;
  const { data: player } = usePlayer(address);
  const { data: territory } = useTerritory();
  const { factions } = useConfig();

  if (address === null) {
    return <p className="text-sm text-frost-mist">Connect a wallet to view your profile.</p>;
  }
  if (player === undefined) {
    return <p role="status" className="text-sm text-frost-mist">Reading your passport.</p>;
  }
  if (!player.hasPassport || player.passportId === null || player.factionId === null) {
    return <p className="text-sm text-frost-mist">No passport yet for this wallet.</p>;
  }

  const factionId = player.factionId;
  const factionName = factions.find((f) => f.id === factionId)?.name ?? `Faction ${factionId}`;
  const territoryPower =
    territory?.shardTotals.find((s) => s.factionId === factionId)?.territoryPowerTotal ?? 0n;

  return (
    <ProfileCard
      passportId={player.passportId}
      factionName={factionName}
      rawReputation={player.rawReputation ?? 0n}
      territoryPower={territoryPower}
      acceptedProofCount={player.acceptedProofCount ?? 0n}
      pendingCount={player.pending.length}
    />
  );
}
