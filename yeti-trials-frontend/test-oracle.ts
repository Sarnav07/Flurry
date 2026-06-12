import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { toHex } from '@mysten/sui/utils';
const pair = Ed25519Keypair.fromSecretKey("suiprivkey1qzu94fzkcq48wqhxeacext6yr7phvfcsjxn05hzalqx5g30rfrlxqep9c05");
console.log("0x" + toHex(pair.getPublicKey().toRawBytes()));
