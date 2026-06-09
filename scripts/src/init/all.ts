/**
 * Run the full Genesis Frost init in dependency order (Task 8.3, Requirement
 * 21.2): season → shards → territory → sponsor → impact, then ensure the shared
 * `NullifierStore` exists.
 *
 * Every step reads the ids it needs from `deployed.<network>.json` and appends
 * the ids it creates, so re-running picks up where prior steps left off.
 *
 * `publish.ts` already creates the `NullifierStore`; this script calls
 * `proof::new_nullifier_store` only as a fallback when the artifact has no
 * `nullifierStoreId` yet (e.g. init run against a package published elsewhere).
 *
 * Run: `pnpm --filter @yeti-trials/scripts exec tsx src/init/all.ts`
 */

import { Transaction } from "@mysten/sui/transactions";

import {
  createdSharedObjectIdsByType,
  getClient,
  getNetwork,
  loadArtifact,
  mergeArtifact,
  requireArtifactField,
  signAndRun,
  target,
  type DeployedArtifact,
  type SuiClient,
} from "../lib.js";
import { initSeason } from "./season.js";
import { initShards } from "./shards.js";
import { initTerritory } from "./territory.js";
import { initSponsor } from "./sponsor.js";
import { initImpact } from "./impact.js";

/** Create the NullifierStore if the artifact does not already record one. */
async function ensureNullifierStore(client: SuiClient): Promise<void> {
  const network = getNetwork();
  const artifact = loadArtifact(network);
  if (artifact.nullifierStoreId) {
    console.log(`NullifierStore already present: ${artifact.nullifierStoreId}`);
    return;
  }
  const packageId = requireArtifactField(artifact, "packageId");
  const tx = new Transaction();
  tx.moveCall({ target: target(packageId, "proof", "new_nullifier_store") });
  const res = await signAndRun(tx, { client });
  const [nullifierStoreId] = createdSharedObjectIdsByType(res, "::proof::NullifierStore");
  if (!nullifierStoreId) throw new Error("failed to create NullifierStore");
  mergeArtifact({ nullifierStoreId }, network);
  console.log(`Created NullifierStore ${nullifierStoreId}`);
}

export async function initAll(client?: SuiClient): Promise<DeployedArtifact> {
  const network = getNetwork();
  const c = client ?? getClient(network);

  console.log(`=== Genesis Frost init on ${network} ===`);
  await initSeason(c);
  await initShards(c);
  await initTerritory(c);
  await initSponsor(c);
  await initImpact(c);
  await ensureNullifierStore(c);

  const artifact = loadArtifact(network);
  console.log("=== init complete; artifact populated ===");
  return artifact;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  initAll().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
