import { bcs } from '@mysten/sui/bcs';
import { Transaction } from '@mysten/sui/transactions';

import { SUI_CLOCK_OBJECT_ID } from '~/lib/sui/reads';
import type { ConfigVM } from '~/lib/types/viewModels';

export type StepId =
  | 'close_season'
  | 'finalize_territory'
  | 'settle_season'
  | 'disburse'
  | 'cleanup_batches';

/** Operator lifecycle order (Requirement 14.3). */
export const LIFECYCLE_STEPS: ReadonlyArray<StepId> = [
  'close_season',
  'finalize_territory',
  'settle_season',
  'disburse',
  'cleanup_batches',
];

export const STEP_LABEL: Record<StepId, string> = {
  close_season: 'Close season',
  finalize_territory: 'Finalize territory',
  settle_season: 'Settle season',
  disburse: 'Disburse impact',
  cleanup_batches: 'Cleanup batches',
};

// ── PTB builders ─────────────────────────────────────────────────────────────
export function buildCloseSeasonTx(c: ConfigVM): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${c.packageId}::season::close_season`,
    arguments: [tx.object(c.objectIds.seasonId), tx.object(SUI_CLOCK_OBJECT_ID)],
  });
  return tx;
}

export interface ShardFoldPlan {
  shardIds: string[];
  /** Canonical count = shardCount × factionCount. */
  expectedCount: number;
}

/** The complete canonical shard set to fold: every ScoreShard exactly once. */
export function shardFoldPlan(c: ConfigVM): ShardFoldPlan {
  return {
    shardIds: c.objectIds.shards.map((s) => s.objectId),
    expectedCount: c.shardCount * c.factions.length,
  };
}

/** begin_power_tally → add_shard_power (per shard, complete set) → finalize_territory. */
export function buildFinalizeTerritoryTx(c: ConfigVM): Transaction {
  const { shardIds } = shardFoldPlan(c);
  const tx = new Transaction();
  const tally = tx.moveCall({
    target: `${c.packageId}::territory::begin_power_tally`,
    arguments: [tx.object(c.objectIds.seasonId)],
  });
  for (const shardId of shardIds) {
    tx.moveCall({
      target: `${c.packageId}::territory::add_shard_power`,
      arguments: [tally, tx.object(shardId)],
    });
  }
  tx.moveCall({
    target: `${c.packageId}::territory::finalize_territory`,
    arguments: [tx.object(c.objectIds.seasonId), tx.object(c.objectIds.territoryMapId), tally],
  });
  return tx;
}

export function buildSettleSeasonTx(c: ConfigVM): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${c.packageId}::season::settle_season`,
    arguments: [tx.object(c.objectIds.seasonId)],
  });
  return tx;
}

export function buildDisburseTx(c: ConfigVM): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${c.packageId}::impact::disburse`,
    arguments: [tx.object(c.objectIds.impactEscrowId), tx.object(c.objectIds.territoryMapId)],
  });
  return tx;
}

export function buildCreateCleanupBatchTx(c: ConfigVM, keys: number[][]): Transaction {
  const tx = new Transaction();
  const keysArg = bcs.vector(bcs.vector(bcs.u8())).serialize(keys).toBytes();
  tx.moveCall({
    target: `${c.packageId}::proof::create_cleanup_batch`,
    arguments: [tx.object(c.objectIds.seasonId), tx.pure(keysArg)],
  });
  return tx;
}

export function buildDeleteCleanupBatchTx(c: ConfigVM, batchId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${c.packageId}::proof::delete_cleanup_batch`,
    arguments: [
      tx.object(c.objectIds.seasonId),
      tx.object(c.objectIds.nullifierStoreId),
      tx.object(batchId),
    ],
  });
  return tx;
}

// ── Enablement (Requirement 14.3) ────────────────────────────────────────────
export interface LifecycleState {
  /** TerritoryMap finalized (from GET /territory). */
  territoryFinalized: boolean;
  /** Impact escrow disbursed (from GET /territory). */
  impactDisbursed: boolean;
  /** Locally-tracked completion for steps with no distinct on-chain read. */
  completed: Readonly<Partial<Record<StepId, boolean>>>;
}

/** Each action is disabled until its on-chain precondition is satisfiable. */
export function lifecycleEnablement(s: LifecycleState): Record<StepId, boolean> {
  const done = (id: StepId) => s.completed[id] === true;
  return {
    close_season: !s.territoryFinalized && !done('close_season'),
    finalize_territory: done('close_season') && !s.territoryFinalized,
    settle_season: s.territoryFinalized && !done('settle_season'),
    disburse: done('settle_season') && !s.impactDisbursed,
    cleanup_batches: s.impactDisbursed,
  };
}

/** Short event names emitted by a successful execution result. */
export function extractEventNames(result: unknown): string[] {
  const events = (result as { events?: ReadonlyArray<{ type?: string }> } | null)?.events;
  if (!Array.isArray(events)) return [];
  return events.map((e) => e.type?.split('::').pop() ?? '').filter((n) => n.length > 0);
}
