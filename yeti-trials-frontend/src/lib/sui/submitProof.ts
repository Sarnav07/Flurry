import { Transaction } from '@mysten/sui/transactions';
import { fromHex } from '@mysten/sui/utils';

import { SUI_CLOCK_OBJECT_ID } from '~/lib/sui/reads';
import type { AttestationResponseVM, ConfigVM } from '~/lib/types/viewModels';
import type { WireProofPayload } from '~/lib/types/wire';

/** `u64_from_le(nullifier[0..8]) % shardCount` — mirror of the Move bucket. */
export function shardBucket(nullifier: number[], shardCount: number): number {
  if (shardCount <= 0) throw new Error('shardCount must be positive');
  let acc = 0n;
  for (let i = 0; i < 8; i++) acc += BigInt(nullifier[i] ?? 0) << BigInt(i * 8);
  return Number(acc % BigInt(shardCount));
}

/** A single typed value argument, decoupled from Transaction for verbatim testing. */
export type ProofArg =
  | { kind: 'vector_u8'; value: number[] }
  | { kind: 'address'; value: string }
  | { kind: 'u64'; value: bigint }
  | { kind: 'u8'; value: number };

/**
 * The 15 ProofPayload value args (fixed canonical order) + signature + public
 * key, each forwarded VERBATIM: u64 decimal string -> BigInt, vector<u8> as the
 * exact number[], address as exact 0x-hex. No re-encoding, rounding, reordering.
 */
export function proofValueDescriptors(
  payload: WireProofPayload,
  signature: number[],
  publicKey: number[],
): ProofArg[] {
  return [
    { kind: 'vector_u8', value: payload.network },
    { kind: 'address', value: payload.packageId },
    { kind: 'u64', value: BigInt(payload.seasonId) },
    { kind: 'u64', value: BigInt(payload.trialId) },
    { kind: 'u8', value: payload.factionId },
    { kind: 'address', value: payload.passportId },
    { kind: 'address', value: payload.wallet },
    { kind: 'vector_u8', value: payload.proofSource },
    { kind: 'u8', value: payload.provenanceTier },
    { kind: 'u64', value: BigInt(payload.score) },
    { kind: 'u64', value: BigInt(payload.territoryPower) },
    { kind: 'u64', value: BigInt(payload.issuedMs) },
    { kind: 'u64', value: BigInt(payload.expiryMs) },
    { kind: 'u64', value: BigInt(payload.nonce) },
    { kind: 'vector_u8', value: payload.nullifier },
    { kind: 'vector_u8', value: signature },
    { kind: 'vector_u8', value: publicKey },
  ];
}

function applyArgs(tx: Transaction, args: ProofArg[]) {
  return args.map((a) => {
    switch (a.kind) {
      case 'vector_u8':
        return tx.pure.vector('u8', a.value);
      case 'address':
        return tx.pure.address(a.value);
      case 'u64':
        return tx.pure.u64(a.value);
      case 'u8':
        return tx.pure.u8(a.value);
    }
  });
}

export interface BuiltSubmitProof {
  tx: Transaction;
  bucket: number;
  shardId: string;
}

/**
 * Build `proof::submit_proof`. Object args (registry, passport, season, shard,
 * store), then the verbatim value args, then the `0x6` Clock. The ScoreShard is
 * selected from Config.objectIds.shards by the bucket the backend already
 * implied (forward, never re-derive crypto). Submitted under the connected sender.
 */
export function buildSubmitProofTx(
  config: ConfigVM,
  attestation: AttestationResponseVM,
): BuiltSubmitProof {
  const payload = attestation.payload;
  const bucket = shardBucket(attestation.nullifier, config.shardCount);
  const shard = config.objectIds.shards.find(
    (s) => s.faction === payload.factionId && s.shard === bucket,
  );
  if (shard === undefined) {
    throw new Error(`no ScoreShard for (faction=${payload.factionId}, shard=${bucket})`);
  }
  const hex = config.oraclePublicKey.startsWith('0x')
    ? config.oraclePublicKey.slice(2)
    : config.oraclePublicKey;
  const publicKey = Array.from(fromHex(hex));

  const tx = new Transaction();
  tx.moveCall({
    target: `${config.packageId}::proof::submit_proof`,
    arguments: [
      tx.object(config.objectIds.oracleRegistryId),
      tx.object(payload.passportId),
      tx.object(config.objectIds.seasonId),
      tx.object(shard.objectId),
      tx.object(config.objectIds.nullifierStoreId),
      ...applyArgs(tx, proofValueDescriptors(payload, attestation.signature, publicKey)),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
  return { tx, bucket, shardId: shard.objectId };
}

/** True when an execution result carries a ProofAccepted event. */
export function hasProofAccepted(result: unknown): boolean {
  const events = (result as { events?: ReadonlyArray<{ type?: string }> } | null)?.events;
  return Array.isArray(events) && events.some((e) => e.type?.endsWith('::events::ProofAccepted'));
}
