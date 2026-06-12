import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromB64, toHex } from '@mysten/sui/utils';
const pkBytes = fromB64("AE6WIA2u8ApTVArW+Oj8ch/2rlHehS63Udow4XFYi7oo");
const pair = Ed25519Keypair.fromSecretKey(pkBytes.slice(1));
console.log("0x" + toHex(pair.getPublicKey().toRawBytes()));
