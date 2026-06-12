import { Page } from '@playwright/test';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';

export async function injectSuiWallet(page: Page) {
  const keypair = new Ed25519Keypair();
  const address = keypair.toSuiAddress();
  const client = new SuiClient({ url: 'http://127.0.0.1:9000' });
  
  // Fund the address
  try {
    const res = await fetch('http://127.0.0.1:9123/gas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ FixedAmountRequest: { recipient: address } }),
    });
    console.log('Faucet response:', res.status);
    await new Promise(r => setTimeout(r, 1000));
  } catch (e) {
    console.log('Faucet error:', e);
  }

  await page.exposeFunction('mockWalletSignTransactionBlock', async (txJson: string) => {
    try {
      const tx = Transaction.from(txJson);
      tx.setSenderIfNotSet(address);
      const bytes = await tx.build({ client });
      const sig = await keypair.signTransaction(bytes);
      return {
        bytes: sig.bytes, // This is already base64
        signature: sig.signature, // This is already base64
      };
    } catch (e) {
      console.error('Failed to sign transaction in mock wallet:', e);
      throw e;
    }
  });

  await page.exposeFunction('mockWalletSignPersonalMessage', async (msgBytesArr: number[]) => {
    const bytes = new Uint8Array(msgBytesArr);
    const sig = await keypair.signPersonalMessage(bytes);
    return {
      bytes: sig.bytes,
      signature: sig.signature,
    };
  });

  // Inject into browser
  await page.addInitScript((accountAddress) => {
    const wallet = {
      version: '1.0.0',
      name: 'Sui Wallet',
      icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIvPjwvc3ZnPg==',
      chains: ['sui:localnet'],
      features: {
        'standard:connect': {
          version: '1.0.0',
          connect: async () => ({
            accounts: [{
              address: accountAddress,
              publicKey: new Uint8Array(32),
              chains: ['sui:localnet'],
              features: ['sui:signTransactionBlock', 'sui:signPersonalMessage'],
            }]
          })
        },
        'standard:events': {
          version: '1.0.0',
          on: () => () => {}
        },
        'sui:signTransactionBlock': {
          version: '1.0.0',
          signTransactionBlock: async (input: any) => {
             const txObj = input.transactionBlock || input.transaction;
             const json = await txObj.toJSON();
             const res = await (window as any).mockWalletSignTransactionBlock(json);
             return {
               transactionBlockBytes: res.bytes,
               signature: res.signature
             };
          }
        },
        'sui:signPersonalMessage': {
          version: '1.0.0',
          signPersonalMessage: async (input: any) => {
             const res = await (window as any).mockWalletSignPersonalMessage(Array.from(input.message));
             return {
               bytes: res.bytes,
               signature: res.signature
             };
          }
        }
      }
    };

    let registered = false;
    function register() {
      if (registered) return;
      try {
        window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: Object.freeze(wallet) }));
        registered = true;
      } catch (e) {}
    }

    register();
    window.addEventListener('wallet-standard:app-ready', ({ detail }: any) => {
      detail.register(wallet);
      registered = true;
    });

    window.suiWallets = window.suiWallets || [];
    window.suiWallets.push(wallet);
  }, address);
}
