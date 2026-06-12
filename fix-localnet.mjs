import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { writeFileSync, readFileSync } from "fs";
import { execSync } from "child_process";

const admin = Ed25519Keypair.generate();
const oracle = Ed25519Keypair.generate();

const adminPk = admin.getSecretKey(); // Actually we want suiprivkey... wait
// suiprivkey encoding is easiest
console.log("Funding admin...");
execSync(`curl --location --request POST 'http://127.0.0.1:9123/gas' --header 'Content-Type: application/json' --data-raw '{"FixedAmountRequest":{"recipient":"${admin.getPublicKey().toSuiAddress()}"}}'`);
console.log("Funding oracle...");
execSync(`curl --location --request POST 'http://127.0.0.1:9123/gas' --header 'Content-Type: application/json' --data-raw '{"FixedAmountRequest":{"recipient":"${oracle.getPublicKey().toSuiAddress()}"}}'`);

let env = readFileSync(".env", "utf8");
env = env.replace(/^ADMIN_KEYSTORE_PATH=.*/m, "# ADMIN_KEYSTORE_PATH=");
env = env.replace(/^ORACLE_KEYSTORE_PATH=.*/m, "# ORACLE_KEYSTORE_PATH=");
env = env.replace(/^#?\s*ADMIN_PRIVATE_KEY=.*/m, `ADMIN_PRIVATE_KEY=${admin.getSecretKey()}`);
env = env.replace(/^#?\s*ORACLE_PRIVATE_KEY=.*/m, `ORACLE_PRIVATE_KEY=${oracle.getSecretKey()}`);
// The Ed25519Keypair doesn't have a direct getSecretKey() returning suiprivkey.
// Let's just use the smoke-keygen format or Sui's encodeSuiPrivateKey.
