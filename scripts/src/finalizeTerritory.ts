/**
 * Close the season and finalize the contested territory (Task 10.2, Requirement
 * 22.3).
 *
 * One PTB drives the full hot-potato `PowerTally` flow:
 *   1. `season::close_season(&mut Season, &Clock)` — sets `finalized`.
 *   2. `territory::begin_power_tally(&Season)` — opens the tally.
 *   3. `territory::add_shard_power(&mut PowerTally, &ScoreShard)` — folded once
 *      per ScoreShard from the artifact `shards[]` (the tally has NO abilities,
 *      so it cannot be dropped/stored — it must be consumed).
 *   4. `territory::finalize_territory(&Season, &mut TerritoryMap, PowerTally)`
 *      — consumes the tally, captures the winner, emits `TerritoryFinalized`.
 *
 * Assertion: a `TerritoryFinalized` event is emitted (Requirement 22.3).
 *
 * TIME-WINDOW CONSTRAINT: `close_season` requires `now >= Season.end_ms`, else
 * it aborts `E_SEASON_NOT_FINALIZED`. The demo season window is long (24h on
 * localnet), so on a freshly-initialized localnet this PTB will abort until the
 * window elapses. This script does NOT force the clock — it surfaces the abort
 * clearly so the operator knows the season is not yet closeable. (To run the
 * full lifecycle on localnet, init a short-window season or wait out the
 * window.)
 *
 * Signs as the ADMIN/operator key (these are operator lifecycle actions).
 *
 * Run: `pnpm --filter @yeti-trials/scripts finalize:territory`
 */

import { Transaction } from "@mysten/sui/transactions";
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

import {
  getClient,
  getNetwork,
  loadArtifact,
  requireArtifactField,
  requireEvent,
  signAndRunAllowAbort,
  target,
  type SuiClient,
} from "./lib.js";
import { CLOCK_ID, describeAbort, parseAbortCode } from "./lifecycle.js";

export interface FinalizeTerritoryOptions {
  client?: SuiClient;
  signer?: Ed25519Keypair;
}

export interface FinalizeTerritoryResult {
  finalized: boolean;
  event?: Record<string, unknown>;
  abortCode?: number;
  digest: string;
}

/** Build the close_season + tally + finalize_territory PTB. */
export function buildFinalizeTerritoryTx(
  packageId: string,
  seasonId: string,
  territoryMapId: string,
  shardIds: string[],
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: target(packageId, "season", "close_season"),
    arguments: [tx.object(seasonId), tx.object(CLOCK_ID)],
  });
  const tally = tx.moveCall({
    target: target(packageId, "territory", "begin_power_tally"),
    arguments: [tx.object(seasonId)],
  });
  for (const shardId of shardIds) {
    tx.moveCall({
      target: target(packageId, "territory", "add_shard_power"),
      arguments: [tally, tx.object(shardId)],
    });
  }
  tx.moveCall({
    target: target(packageId, "territory", "finalize_territory"),
    arguments: [tx.object(seasonId), tx.object(territoryMapId), tally],
  });
  return tx;
}

export async function finalizeTerritory(
  opts: FinalizeTerritoryOptions = {},
): Promise<FinalizeTerritoryResult> {
  const network = getNetwork();
  const client = opts.client ?? getClient(network);
  const artifact = loadArtifact(network);
  const packageId = requireArtifactField(artifact, "packageId");
  const seasonId = requireArtifactField(artifact, "seasonId");
  const territoryMapId = requireArtifactField(artifact, "territoryMapId");
  const shards = requireArtifactField(artifact, "shards");
  const shardIds = shards.map((s) => s.objectId);

  const tx = buildFinalizeTerritoryTx(packageId, seasonId, territoryMapId, shardIds);
  const run = await signAndRunAllowAbort(tx, { client, ...(opts.signer ? { signer: opts.signer } : {}) });

  if (!run.success) {
    const code = parseAbortCode(run.error);
    console.error(`[finalizeTerritory] aborted: ${describeAbort(run.error)}`);
    console.error(
      "[finalizeTerritory] NOTE: close_season requires now >= Season.end_ms. " +
        "If this is the time-window abort (E_SEASON_NOT_FINALIZED), the season is not yet closeable.",
    );
    return { finalized: false, ...(code !== null ? { abortCode: code } : {}), digest: run.response.digest };
  }

  const event = requireEvent(run.response, "::events::TerritoryFinalized");
  console.log("TerritoryFinalized emitted:");
  console.log(`  digest = ${run.response.digest}`);
  console.log(`  owners = ${JSON.stringify(event["owners"])}`);
  console.log(`  power  = ${JSON.stringify(event["finalized_power"])}`);
  return { finalized: true, event, digest: run.response.digest };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  finalizeTerritory()
    .then((r) => {
      if (!r.finalized) process.exit(1);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
