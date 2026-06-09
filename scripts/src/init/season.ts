/**
 * Create the Genesis Frost `Season` (Task 8.3, Requirement 21.2).
 *
 * Calls `season::new_season` with the demo configuration, deriving the
 * replay-safety source-of-truth fields from the environment / artifact:
 *   - `network`             = bytes of `SUI_NETWORK`,
 *   - `expected_package_id` = the published `packageId` from the artifact,
 *   - `trial_id`            = the "Avalanche Testnet Proof" trial id,
 *   - allowed factions      = all four,
 *   - territory_count = 4, shard_count = SHARD_COUNT (4),
 *   - an active window starting slightly in the past so the season is
 *     immediately active for passport creation / proof submission.
 *
 * Captures the shared `Season` object id into the artifact.
 *
 * Run: `pnpm --filter @yeti-trials/scripts exec tsx src/init/season.ts`
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
  ALLOWED_FACTIONS,
  GENESIS_SEASON_ID,
  GENESIS_SHARD_COUNT,
  GENESIS_TRIAL_ID,
  TERRITORY_COUNT,
  activeWindowMs,
} from "../genesis.js";

/** Window start offset: begin slightly in the past so the season is active now. */
const START_BACKDATE_MS = 60_000;

const NETWORK_BYTES = (network: string): number[] =>
  Array.from(new TextEncoder().encode(network));

/**
 * Create the Genesis Frost season and return the updated artifact. Exported so
 * `init/all.ts` and the integration test can drive it in-process.
 */
export async function initSeason(client?: SuiClient): Promise<DeployedArtifact> {
  const network = getNetwork();
  const c = client ?? getClient(network);
  const artifact = loadArtifact(network);
  const packageId = requireArtifactField(artifact, "packageId");

  const now = Date.now();
  const startMs = Math.max(0, now - START_BACKDATE_MS);
  const endMs = now + activeWindowMs(network);

  const tx = new Transaction();
  tx.moveCall({
    target: target(packageId, "season", "new_season"),
    arguments: [
      tx.pure.u64(GENESIS_SEASON_ID),
      tx.pure.u64(startMs),
      tx.pure.u64(endMs),
      tx.pure.vector("u8", ALLOWED_FACTIONS),
      tx.pure.vector("u8", NETWORK_BYTES(network)),
      tx.pure.address(packageId),
      tx.pure.u64(GENESIS_TRIAL_ID),
      tx.pure.u64(TERRITORY_COUNT),
      tx.pure.u64(GENESIS_SHARD_COUNT),
    ],
  });

  const res = await signAndRun(tx, { client: c });
  const seasonId = createdObjectIdByType(res, "::season::Season");

  const updated = mergeArtifact(
    {
      seasonId,
      seasonNumber: GENESIS_SEASON_ID,
      trialId: GENESIS_TRIAL_ID,
    },
    network,
  );
  console.log(`Created Season ${seasonId} (season_id=${GENESIS_SEASON_ID})`);
  console.log(`  window: [${startMs}, ${endMs}) on ${network}`);
  return updated;
}

// Run directly (not when imported by init/all.ts or tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  initSeason().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
