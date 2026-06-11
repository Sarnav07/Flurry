/**
 * Publish the `yeti_trials` Move package and capture the publish-time ids into
 * the per-network artifact (Task 8.2, Requirement 21.1).
 *
 * Captured into `deployed.<network>.json`:
 *   - `packageId`        — the published package,
 *   - `adminCap`         — the `AdminCap` minted to the publisher by
 *                          `registry::init`,
 *   - `oracleRegistryId` — the shared `OracleSignerRegistry` created by
 *                          `registry::init`,
 *   - `nullifierStoreId` — the shared `NullifierStore`; created here in the
 *                          same PTB via `proof::new_nullifier_store` so it is
 *                          available immediately after publish.
 *
 * Run: `pnpm --filter @yeti-trials/scripts exec tsx src/publish.ts`
 *
 * NOTE: building the bytecode shells out to `sui move build
 * --dump-bytecode-as-base64`, which is the supported way to obtain the modules
 * + dependency digests a programmable publish needs.
 */

import { execFileSync } from "node:child_process";

import { Transaction } from "@mysten/sui/transactions";

import {
  CONTRACTS_DIR,
  adminAddress,
  createdObjectIdByType,
  createdSharedObjectIdsByType,
  getClient,
  getNetwork,
  mergeArtifact,
  publishedPackageId,
  signAndRun,
  target,
  type DeployedArtifact,
  type SuiClient,
} from "./lib.js";

interface CompiledPackage {
  modules: string[];
  dependencies: string[];
}

/** Compile the package to base64 modules + dependency digests via the Sui CLI. */
function buildPackage(): CompiledPackage {
  const out = execFileSync(
    "sui",
    [
      "move",
      "build",
      "--dump-bytecode-as-base64",
      "--path",
      CONTRACTS_DIR,
      "--build-env",
      "testnet",
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const parsed = JSON.parse(out) as CompiledPackage;
  if (!Array.isArray(parsed.modules) || !Array.isArray(parsed.dependencies)) {
    throw new Error("unexpected `sui move build` output shape");
  }
  return parsed;
}

/** Publish the package + create the NullifierStore, capturing ids. Exported so
 * the integration test can drive it in-process. */
export async function publishPackage(client?: SuiClient): Promise<DeployedArtifact> {
  const network = getNetwork();
  const c = client ?? getClient(network);
  const sender = adminAddress();

  console.log(`Publishing yeti_trials to ${network} as ${sender}`);

  const { modules, dependencies } = buildPackage();

  const tx = new Transaction();
  // Publish returns the UpgradeCap, which must be handled (transferred to the
  // publisher) so the PTB type-checks.
  const upgradeCap = tx.publish({ modules, dependencies });
  tx.transferObjects([upgradeCap], sender);

  const res = await signAndRun(tx, { client: c });

  const packageId = publishedPackageId(res);

  // Create the shared NullifierStore in a second PTB now that the package id is
  // known (it cannot be called in the same tx as the publish that defines it).
  const initTx = new Transaction();
  initTx.moveCall({ target: target(packageId, "proof", "new_nullifier_store") });
  const initRes = await signAndRun(initTx, { client: c });

  const adminCap = createdObjectIdByType(res, "::registry::AdminCap");
  const oracleRegistryId = createdObjectIdByType(
    res,
    "::registry::OracleSignerRegistry",
  );
  const [nullifierStoreId] = createdSharedObjectIdsByType(
    initRes,
    "::proof::NullifierStore",
  );
  if (!nullifierStoreId) {
    throw new Error("failed to create NullifierStore");
  }

  const artifact = mergeArtifact(
    { packageId, adminCap, oracleRegistryId, nullifierStoreId },
    network,
  );

  console.log("Published and captured publish-time ids:");
  console.log(`  packageId        = ${artifact.packageId}`);
  console.log(`  adminCap         = ${artifact.adminCap}`);
  console.log(`  oracleRegistryId = ${artifact.oracleRegistryId}`);
  console.log(`  nullifierStoreId = ${artifact.nullifierStoreId}`);
  console.log(`Artifact: deployed.${network}.json`);
  return artifact;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  publishPackage().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
