import { ConnectButton, useCurrentAccount, useDisconnectWallet } from '@mysten/dapp-kit';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ZkLoginButton } from '~/components/wallet/zklogin-button';
import { abbreviateAddress } from '~/lib/sui/address';

/**
 * Wallet_Module surface. A standard Sui wallet connection is the default and
 * sufficient path. Connected address is shown abbreviated + copyable; disconnect
 * clears all player-scoped cached state.
 */
export function ConnectBar() {
  const account = useCurrentAccount();
  const { mutate: disconnect } = useDisconnectWallet();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);

  if (account === null) {
    return (
      <div className="flex items-center gap-2">
        <ConnectButton connectText="Connect wallet" />
        <ZkLoginButton />
      </div>
    );
  }

  const copy = () => {
    void navigator.clipboard.writeText(account.address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  const onDisconnect = () => {
    disconnect();
    queryClient.removeQueries({ queryKey: ['player'] });
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={copy}
        title="Copy address"
        aria-label={`Copy connected address ${account.address}`}
        className="rounded border border-frost-line px-3 py-1.5 font-mono text-xs text-frost-ice transition-colors hover:border-frost-glow"
      >
        {copied ? 'Copied' : abbreviateAddress(account.address)}
      </button>
      <button
        type="button"
        onClick={onDisconnect}
        className="rounded border border-frost-line px-3 py-1.5 text-xs text-frost-mist transition-colors hover:text-frost-ice hover:border-frost-glow"
      >
        Disconnect
      </button>
    </div>
  );
}
