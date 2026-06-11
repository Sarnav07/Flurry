import { getFullnodeUrl } from '@mysten/sui/client';
import { createNetworkConfig } from '@mysten/dapp-kit';

import { env } from '~/env';

/**
 * Sui network endpoints for dapp-kit. An explicit `VITE_SUI_RPC_URL` overrides
 * the network default. The network LABEL shown to users still comes from
 * GET /health, not from here.
 */
const { networkConfig } = createNetworkConfig({
  localnet: { url: env.suiRpcUrl || getFullnodeUrl('localnet') },
  testnet: { url: env.suiRpcUrl || getFullnodeUrl('testnet') },
});

export { networkConfig };
export const defaultNetwork = env.suiNetwork;
