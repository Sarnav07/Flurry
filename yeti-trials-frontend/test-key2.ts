import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
const pair = Ed25519Keypair.fromSecretKey("suiprivkey1qzu4nf76065lgh4llfy9fqr70zxhh7ntjuthqhlazhn8tveh226dk3f2qs5");
console.log(pair.toSuiAddress());
