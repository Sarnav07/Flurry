/**
 * Create the Genesis Frost `ScoreShard` objects (Task 8.3, Requirement 21.2).
 *
 * The design specifies `SHARD_COUNT × 4` shards: for each faction (0..3) and
 * each shard index (0..shard_count-1) a shared `ScoreShard` is created via
 * `shard::new_shard`. All shards are created in a single PTB; the created ids
 * are then read back on-chain to map each id to its (faction, shard) triple so
 * the artifact records an accurate, non-positional mapping.
 *
 * Run: `pnpm --filter @yeti-trials/scripts exec tsx src/init/shards.ts`
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
  type ShardEntry,
  type SuiClient,
} from "../lib.js";
import { ALLOWED_FACTIONS, GENESIS_SHARD_COUNT } from "../genesis.js";

/** Read a created shard's (faction, shard) triple from its on-chain content. */
async function readShardTriple(
  client: SuiClient,
  objectId: string,
): Promise<{ faction: number; shard: number }> {
  const obj = await client.getObject({ id: objectId, options: { showContent: true } });
  const content = obj.data?.content;
  if (!content || content.dataType !== "moveObject") {
    throw new Error(`shard ${objectId} has no readable move content`);
  }
  const fields = content.fields as Record<string, unknown>;
  return {
    faction: Number(fields["faction_id"]),
    shard: Number(fields["shard_id"]),
  };
}

/** Create all shards and return the updated artifact. */
export async function initShards(client?: SuiClient): Promise<DeployedArtifact> {
  const network = getNetwork();
  const c = client ?? getClient(network);
  const artifact = loadArtifact(network);
  const packageId = requireArtifactField(artifact, "packageId");
  const seasonNumber = requireArtifactField(artifact, "seasonNumber");

  const tx = new Transaction();
  for (const faction of ALLOWED_FACTIONS) {
    for (let shard = 0; shard < GENESIS_SHARD_COUNT; shard++) {
      tx.moveCall({
        target: target(packageId, "shard", "new_shard"),
        arguments: [
          tx.pure.u64(seasonNumber),
          tx.pure.u8(faction),
          tx.pure.u64(shard),
        ],
      });
    }
  }

  const res = await signAndRun(tx, { client: c });
  const createdIds = createdSharedObjectIdsByType(res, "::shard::ScoreShard");
  const expected = ALLOWED_FACTIONS.length * GENESIS_SHARD_COUNT;
  if (createdIds.length !== expected) {
    throw new Error(`expected ${expected} shards, created ${createdIds.length}`);
  }

  const shards: ShardEntry[] = [];
  for (const objectId of createdIds) {
    const { faction, shard } = await readShardTriple(c, objectId);
    shards.push({ objectId, faction, shard });
  }
  shards.sort((a, b) => a.faction - b.faction || a.shard - b.shard);

  const updated = mergeArtifact({ shards }, network);
  console.log(`Created ${shards.length} shards (${ALLOWED_FACTIONS.length} factions × ${GENESIS_SHARD_COUNT}):`);
  for (const s of shards) {
    console.log(`  faction ${s.faction} shard ${s.shard} -> ${s.objectId}`);
  }
  return updated;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  initShards().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
