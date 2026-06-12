import { Page } from '@playwright/test';

export async function injectMockWallet(page: Page) {
  await page.addInitScript(() => {
    window.suiWallets = window.suiWallets || [];
    window.suiWallets.push({
      version: '1.0.0',
      name: 'Sui Wallet',
      icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIvPjwvc3ZnPg==',
      chains: ['sui:localnet'],
      features: {
        'standard:connect': {
          version: '1.0.0',
          connect: async () => ({
            accounts: [{
              address: '0x1234567890123456789012345678901234567890123456789012345678901234',
              publicKey: new Uint8Array(32),
              chains: ['sui:localnet'],
              features: ['sui:signTransactionBlock', 'sui:signPersonalMessage'],
            }]
          })
        },
        'sui:signTransactionBlock': {
          version: '1.0.0',
          signTransactionBlock: async (input: any) => ({
            transactionBlockBytes: 'AA==',
            signature: 'AA=='
          })
        },
        'sui:signPersonalMessage': {
          version: '1.0.0',
          signPersonalMessage: async (input: any) => ({
            bytes: 'AA==',
            signature: 'AA=='
          })
        }
      }
    });
  });
}
