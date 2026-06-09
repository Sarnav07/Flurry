/**
 * Authorize the oracle signer public key (Task 8.4, Requirement 21.3).
 *
 * Calls `registry::add_signer` with the `AdminCap` (id from the artifact) and
 * the raw 32-byte Ed25519 public key from `ORACLE_PUBLIC_KEY`, then confirms
 * authorization succeeded by dev-inspecting `registry::is_authorized`.
 *
 * `ORACLE_PUBLIC_KEY` accepts a 0x-prefixed 32-byte hex string or a base64
 * string decoding to 32 bytes. The key must be the RAW public key
 * (`Ed25519Keypair.getPublicKey().toRawBytes()`), not a flag-prefixed Sui key.
 *
 * Run: `pnpm --filter @yeti-trials/scripts exec tsx src/registerOracle.ts`
 */

import { fromBase64, fromHex } from "@mysten/sui/utils";
import { Transaction } from "@mysten/sui/transactions";

import {
  adminAddress,
  getClient,
  getNetwork,
  loadArtifact,
  requireArtifactField,
  signAndRun,
  target,
  type SuiClient,
} from "./lib.js";

/** Parse the raw 32-byte oracle public key from env (hex or base64). */
function loadOraclePublicKey(): number[] {
  const raw = process.env["ORACLE_PUBLIC_KEY"]?.trim();
  if (!raw) throw new Error("missing required env ORACLE_PUBLIC_KEY (raw 32-byte Ed25519 public key)");
  const bytes = raw.startsWith("0x") ? fromHex(raw) : fromBase64(raw);
  if (bytes.length !== 32) {
    throw new Error(
      `ORACLE_PUBLIC_KEY must be exactly 32 raw bytes; got ${bytes.length}. ` +
        "Use Ed25519Keypair.getPublicKey().toRawBytes(), not a flag-prefixed key.",
    );
  }
  return Array.from(bytes);
}

/** Dev-inspect `is_authorized` to confirm the key is now authorized. */
async function confirmAuthorized(
  client: SuiClient,
  packageId: string,
  registryId: string,
  pk: number[],
): Promise<boolean> {
  const tx = new Transaction();
  tx.moveCall({
    target: target(packageId, "registry", "is_authorized"),
    arguments: [tx.object(registryId), tx.pure.vector("u8", pk)],
  });
  const res = await client.devInspectTransactionBlock({
    sender: adminAddress(),
    transactionBlock: tx,
  });
  const returnValues = res.results?.[0]?.returnValues;
  const first = Array.isArray(returnValues) ? returnValues[0] : undefined;
  const out = Array.isArray(first) ? (first[0] as number[]) : undefined;
  return Array.isArray(out) && out[0] === 1;
}

async function registerOracle(client?: SuiClient): Promise<void> {
  const network = getNetwork();
  const c = client ?? getClient(network);
  const artifact = loadArtifact(network);
  const packageId = requireArtifactField(artifact, "packageId");
  const adminCap = requireArtifactField(artifact, "adminCap");
  const registryId = requireArtifactField(artifact, "oracleRegistryId");
  const pk = loadOraclePublicKey();

  const tx = new Transaction();
  tx.moveCall({
    target: target(packageId, "registry", "add_signer"),
    arguments: [tx.object(adminCap), tx.object(registryId), tx.pure.vector("u8", pk)],
  });
  await signAndRun(tx, { client: c });

  const authorized = await confirmAuthorized(c, packageId, registryId, pk);
  if (!authorized) {
    throw new Error("add_signer executed but is_authorized returned false");
  }
  console.log("Oracle signer authorized in the registry:");
  console.log(`  registry  = ${registryId}`);
  console.log(`  publicKey = 0x${Buffer.from(pk).toString("hex")}`);
}

export { registerOracle };

if (import.meta.url === `file://${process.argv[1]}`) {
  registerOracle().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
