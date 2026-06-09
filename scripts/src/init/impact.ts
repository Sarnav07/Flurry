/**
 * Create and fund the Genesis Frost `ImpactEscrow` (Task 8.3, Requirement 21.2).
 *
 * Two steps:
 *   1. `impact::new_escrow(season_id, recipients)` shares an empty escrow with
 *      the four configured `IMPACT_RECIPIENT_*` verified recipients (index =
 *      faction id). Because `new_escrow` shares the object, it cannot be funded
 *      in the same PTB.
 *   2. A second PTB splits a small SUI coin from gas and calls `impact::fund`
 *      to seed the escrow balance.
 *
 * Captures the shared `ImpactEscrow` id and the recipient list into the artifact.
 *
 * Run: `pnpm --filter @yeti-trials/scripts exec tsx src/init/impact.ts`
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
import { IMPACT_FUND_MIST, loadImpactRecipients } from "../genesis.js";

/** Create + fund the impact escrow and return the updated artifact. */
export async function initImpact(client?: SuiClient): Promise<DeployedArtifact> {
  const network = getNetwork();
  const c = client ?? getClient(network);
  const artifact = loadArtifact(network);
  const packageId = requireArtifactField(artifact, "packageId");
  const seasonNumber = requireArtifactField(artifact, "seasonNumber");
  const recipients = loadImpactRecipients();

  // Step 1: create (and share) the escrow.
  const createTx = new Transaction();
  createTx.moveCall({
    target: target(packageId, "impact", "new_escrow"),
    arguments: [
      createTx.pure.u64(seasonNumber),
      createTx.pure.vector("address", recipients),
    ],
  });
  const createRes = await signAndRun(createTx, { client: c });
  const impactEscrowId = createdObjectIdByType(createRes, "::impact::ImpactEscrow");

  // Step 2: fund it with a small coin split from gas.
  const fundTx = new Transaction();
  const [coin] = fundTx.splitCoins(fundTx.gas, [fundTx.pure.u64(IMPACT_FUND_MIST)]);
  fundTx.moveCall({
    target: target(packageId, "impact", "fund"),
    arguments: [fundTx.object(impactEscrowId), coin],
  });
  await signAndRun(fundTx, { client: c });

  const updated = mergeArtifact({ impactEscrowId, recipients }, network);
  console.log(`Created ImpactEscrow ${impactEscrowId} funded with ${IMPACT_FUND_MIST} MIST`);
  console.log(`  recipients: ${recipients.join(", ")}`);
  return updated;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  initImpact().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
