import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
const admin = Ed25519Keypair.generate();
const oracle = Ed25519Keypair.generate();
console.log(JSON.stringify({
  ADMIN_PRIVATE_KEY: admin.getSecretKey(),
  ADMIN_ADDRESS: admin.getPublicKey().toSuiAddress(),
  ORACLE_PRIVATE_KEY: oracle.getSecretKey(),
  ORACLE_ADDRESS: oracle.getPublicKey().toSuiAddress(),
}));
