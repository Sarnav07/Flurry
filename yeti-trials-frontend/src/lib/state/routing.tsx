import { useCurrentAccount } from '@mysten/dapp-kit';
import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';

import { usePlayer } from '~/lib/state/player';
import type { PlayerStateVM } from '~/lib/types/viewModels';

export interface PlayerRouting {
  address: string | null;
  player: PlayerStateVM | null;
  isLoading: boolean;
}

/**
 * On connect, GET /player/:address. A returning player (`hasPassport === true`)
 * is routed straight into the game shell (`/play`); a new wallet stays on the
 * onboarding surface for faction selection (Phase 2).
 */
export function useExistingPassportRouting(): PlayerRouting {
  const address = useCurrentAccount()?.address ?? null;
  const { data, isLoading } = usePlayer(address);
  const navigate = useNavigate();

  const hasPassport = data?.hasPassport === true;
  useEffect(() => {
    if (hasPassport) void navigate({ to: '/play' });
  }, [hasPassport, navigate]);

  return { address, player: data ?? null, isLoading };
}
