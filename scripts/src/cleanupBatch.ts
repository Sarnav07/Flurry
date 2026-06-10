/**
 * Create and delete a nullifier cleanup batch after settlement (Task 10.4,
 * Requirement 22.5).
 *
 * Two transactions (the created `CleanupBatch` is transferred to the caller, so
 * it must persist between create and delete):
 *   1. `proof::create_cleanup_batch(&Season, keys, ctx)` — `keys` is a bounded
 *      slice (<= `MAX_BATCH_SIZE`) of the Season's `accepted_nullifier_keys`
 *      (read on-chain) or a caller-supplied list. Requires the season settled,
 *      else `E_CLEANUP_TOO_EARLY`.
 *   2. `proof::delete_cleanup_batch(&mut Season, &mut NullifierStore,
 *      &mut CleanupBatch)` — removes those keys from BOTH stores.
 *
 * Assertions (Requirement 22.5):
 *   - a `CleanupBatchDeleted` event is emitted, AND
 *   - entries were removed from BOTH the `NullifierStore` (entry count drops)
 *     AND `Season.accepted_nullifier_keys` (length drops) — both read before
 *     vs after.
 *
 * Signs as the ADMIN/operator key (delete is callable by anyone).
 *
 * Run: `pnpm --filter @yeti-trials/scripts cleanup:batch`
 */

import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { MAX_BATCH_SIZE } from "@yeti-trials/shared";

import {
  adminAddress,
  createdObjectIdByType,
  getClient,
  getNetwork,
  loadArtifact,
  requireArtifactField,
  requireEvent,
  signAndRun,
  target,
  type SuiClient,
} from "./lib.js";
import {
  readAcceptedKeyCount,
  readAcceptedNullifierKeys,
  readNullifierCount,
} from "./lifecycle.js";

export interface CleanupBatchOptions {
  client?: SuiClient;
  signer?: Ed25519Keypair;
  /** Caller-supplied keys (number[][]); defaults to the Season's accepted keys. */
  keys?: number[][];
  /** Max keys per batch (defaults to MAX_BATCH_SIZE). */
  maxBatch?: number;
}

export interface CleanupBatchResult {
  event: Record<string, unknown>;
  createDigest: string;
  deleteDigest: string;
  batchId: string;
  keyCount: number;
  nullifierCountBefore: bigint;
  nullifierCountAfter: bigint;
  acceptedKeyCountBefore: bigint;
  acceptedKeyCountAfter: bigint;
  bothReduced: boolean;
}

export async function cleanupBatch(opts: CleanupBatchOptions = {}): Promise<CleanupBatchResult> {
  const network = getNetwork();
  const client = opts.client ?? getClient(network);
  const artifact = loadArtifact(network);
  const packageId = requireArtifactField(artifact, "packageId");
  const seasonId = requireArtifactField(artifact, "seasonId");
  const nullifierStoreId = requireArtifactField(artifact, "nullifierStoreId");

  const sender = opts.signer?.getPublicKey().toSuiAddress() ?? adminAddress();
  const maxBatch = opts.maxBatch ?? MAX_BATCH_SIZE;

  // Resolve the keys to clean up (bounded slice of the accepted-key list).
  const allKeys = opts.keys ?? (await readAcceptedNullifierKeys(client, seasonId));
  const keys = allKeys.slice(0, maxBatch);
  if (keys.length === 0) {
    throw new Error(
      "no accepted nullifier keys to clean up (submit at least one proof first, " +
        "or pass keys explicitly)",
    );
  }

  // Snapshot both stores BEFORE.
  const nullifierCountBefore = await readNullifierCount(client, packageId, nullifierStoreId, sender);
  const acceptedKeyCountBefore = await readAcceptedKeyCount(client, packageId, seasonId, sender);

  // 1. Create the batch (transferred to the caller). `keys` is a
  //    vector<vector<u8>>, serialized explicitly via BCS.
  const keysArg = bcs.vector(bcs.vector(bcs.u8())).serialize(keys).toBytes();
  const createTx = new Transaction();
  createTx.moveCall({
    target: target(packageId, "proof", "create_cleanup_batch"),
    arguments: [createTx.object(seasonId), createTx.pure(keysArg)],
  });
  const createRes = await signAndRun(createTx, {
    client,
    ...(opts.signer ? { signer: opts.signer } : {}),
  });
  requireEvent(createRes, "::events::CleanupBatchCreated");
  const batchId = createdObjectIdByType(createRes, "::proof::CleanupBatch");

  // 2. Delete the batch (prunes BOTH stores).
  const deleteTx = new Transaction();
  deleteTx.moveCall({
    target: target(packageId, "proof", "delete_cleanup_batch"),
    arguments: [
      deleteTx.object(seasonId),
      deleteTx.object(nullifierStoreId),
      deleteTx.object(batchId),
    ],
  });
  const deleteRes = await signAndRun(deleteTx, {
    client,
    ...(opts.signer ? { signer: opts.signer } : {}),
  });
  const event = requireEvent(deleteRes, "::events::CleanupBatchDeleted");

  // Snapshot both stores AFTER.
  const nullifierCountAfter = await readNullifierCount(client, packageId, nullifierStoreId, sender);
  const acceptedKeyCountAfter = await readAcceptedKeyCount(client, packageId, seasonId, sender);

  const bothReduced =
    nullifierCountAfter < nullifierCountBefore &&
    acceptedKeyCountAfter < acceptedKeyCountBefore;

  console.log("CleanupBatchDeleted emitted:");
  console.log(`  createDigest = ${createRes.digest}`);
  console.log(`  deleteDigest = ${deleteRes.digest}`);
  console.log(`  batch        = ${batchId} (${keys.length} keys)`);
  console.log(
    `  NullifierStore: ${nullifierCountBefore} -> ${nullifierCountAfter}`,
  );
  console.log(
    `  Season.accepted_nullifier_keys: ${acceptedKeyCountBefore} -> ${acceptedKeyCountAfter}`,
  );
  console.log(`  both reduced: ${bothReduced}`);

  return {
    event,
    createDigest: createRes.digest,
    deleteDigest: deleteRes.digest,
    batchId,
    keyCount: keys.length,
    nullifierCountBefore,
    nullifierCountAfter,
    acceptedKeyCountBefore,
    acceptedKeyCountAfter,
    bothReduced,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  cleanupBatch()
    .then((r) => {
      if (!r.bothReduced) {
        console.error("[cleanupBatch] expected BOTH stores to shrink");
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
