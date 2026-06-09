/**
 * Create the Genesis Frost `TerritoryMap` (Task 8.3, Requirement 21.2).
 *
 * Calls `territory::new_territory_map`, which assigns each of the four factions
 * one starting territory (`owners = [0,1,2,3]`) and sets the underdog
 * multiplier. Captures the shared `TerritoryMap` id into the artifact.
 *
 * Run: `pnpm --filter @yeti-trials/scripts exec tsx src/init/territory.ts`
 */

import { Transaction } from "@mysten/sui/transactions";

import {
  createdObjectIdByType,
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
import { UNDERDOG_MULTIPLIER } from "../genesis.js";

/** Create the territory map and return the updated artifact. */
export async function initTerritory(client?: SuiClient): Promise<DeployedArtifact> {
  const network = getNetwork();
  const c = client ?? getClient(network);
  const artifact = loadArtifact(network);
  const packageId = requireArtifactField(artifact, "packageId");
  const seasonNumber = requireArtifactField(artifact, "seasonNumber");

  const tx = new Transaction();
  tx.moveCall({
    target: target(packageId, "territory", "new_territory_map"),
    arguments: [tx.pure.u64(seasonNumber), tx.pure.u64(UNDERDOG_MULTIPLIER)],
  });

  const res = await signAndRun(tx, { client: c });
  const territoryMapId = createdObjectIdByType(res, "::territory::TerritoryMap");

  const updated = mergeArtifact({ territoryMapId }, network);
  console.log(`Created TerritoryMap ${territoryMapId} (4 territories, one per faction)`);
  return updated;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  initTerritory().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
