/**
 * Create the demo "Demo DEX Trial" `SponsorSlot` (Task 8.3, Requirement 21.2).
 *
 * Calls `sponsor::create_slot` (display-only — no auction/payment surface) and
 * captures the shared `SponsorSlot` id into the artifact.
 *
 * Run: `pnpm --filter @yeti-trials/scripts exec tsx src/init/sponsor.ts`
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
import {
  GENESIS_TRIAL_ID,
  SPONSOR_ACTION_LABEL,
  SPONSOR_NAME,
  SPONSOR_STATUS,
} from "../genesis.js";

const bytes = (s: string): number[] => Array.from(new TextEncoder().encode(s));

/** Create the demo sponsor slot and return the updated artifact. */
export async function initSponsor(client?: SuiClient): Promise<DeployedArtifact> {
  const network = getNetwork();
  const c = client ?? getClient(network);
  const artifact = loadArtifact(network);
  const packageId = requireArtifactField(artifact, "packageId");

  const tx = new Transaction();
  tx.moveCall({
    target: target(packageId, "sponsor", "create_slot"),
    arguments: [
      tx.pure.vector("u8", bytes(SPONSOR_NAME)),
      tx.pure.u64(GENESIS_TRIAL_ID),
      tx.pure.vector("u8", bytes(SPONSOR_ACTION_LABEL)),
      tx.pure.u8(SPONSOR_STATUS),
    ],
  });

  const res = await signAndRun(tx, { client: c });
  const sponsorSlotId = createdObjectIdByType(res, "::sponsor::SponsorSlot");

  const updated = mergeArtifact({ sponsorSlotId }, network);
  console.log(`Created SponsorSlot ${sponsorSlotId} ("${SPONSOR_NAME}")`);
  return updated;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  initSponsor().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
