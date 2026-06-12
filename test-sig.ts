import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { toB64 } from '@mysten/sui/utils';

async function main() {
  const k = new Ed25519Keypair();
  const bytes = new Uint8Array([1, 2, 3]);
  const res = await k.signTransaction(bytes);
  console.log(typeof res.bytes, res.bytes); // Is it base64?
  console.log(typeof res.signature, res.signature); // Is it base64?
}
main();
