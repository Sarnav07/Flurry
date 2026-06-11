import { useCurrentAccount } from '@mysten/dapp-kit';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { PassportCreator } from '~/components/faction/passport-creator';
import { ABORT_CODE, describeAbort } from '~/lib/format/abort';
import { useConfig } from '~/lib/state/boot';
import { buildCreatePassportTx } from '~/lib/sui/passport';
import { useSeasonWindow } from '~/lib/sui/season';
import { useSubmitTransaction } from '~/lib/sui/submit';

/**
 * Passport creation container. Builds and submits `create_passport_with_faction`
 * under the connected sender, gates on the active-season window, maps aborts to
 * human-readable messages, and on confirmation refreshes PlayerState and routes
 * into the game shell. E_DUPLICATE_PASSPORT routes into the existing-passport
 * experience.
 */
export function PassportPanel() {
  const { factions, packageId, objectIds } = useConfig();
  const address = useCurrentAccount()?.address ?? null;
  const { open: seasonOpen } = useSeasonWindow();
  const { submit } = useSubmitTransaction();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function onCreate(factionId: number) {
    setPending(true);
    setErrorMessage(null);
    try {
      await submit(buildCreatePassportTx({ packageId, seasonId: objectIds.seasonId, factionId }));
      if (address !== null) {
        await queryClient.invalidateQueries({ queryKey: ['player', address] });
      }
      void navigate({ to: '/play' });
    } catch (error) {
      const { code, message } = describeAbort(error);
      setErrorMessage(message);
      // A duplicate means the player already holds a passport: route into game.
      if (code === ABORT_CODE.E_DUPLICATE_PASSPORT) void navigate({ to: '/play' });
    } finally {
      setPending(false);
    }
  }

  return (
    <PassportCreator
      factions={factions}
      seasonOpen={seasonOpen}
      pending={pending}
      errorMessage={errorMessage}
      onCreate={onCreate}
    />
  );
}
