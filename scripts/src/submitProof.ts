/**
 * Submit an oracle attestation on-chain via `proof::submit_proof` (Task 10.1,
 * Requirements 22.1, 22.2).
 *
 * Flow:
 *   1. Load an attestation (the JSON `POST /proof/attest` returns) from
 *      `--attestation <path>`, `ATTESTATION_PATH` / `ATTESTATION_JSON`, or
 *      stdin. The wire shape carries `u64` as decimal strings, `vector<u8>` as
 *      `number[]`, addresses as `0x`-hex.
 *   2. Read all object ids from `deployed.<network>.json` (never hard-coded):
 *      `oracleRegistryId`, the player's `passportId` (from the payload),
 *      `seasonId`, `nullifierStoreId`, and the matching `ScoreShard`.
 *   3. Select the ScoreShard by bucket: compute `shardBucket(nullifier,
 *      Season.shard_count)` (the shared single source of truth, with
 *      `shard_count` read live from the Season) and pick the artifact shard
 *      whose `(faction, shard)` triple matches.
 *   4. Build the PTB calling `proof::submit_proof` with the object args
 *      (registry, passport, season, shard, store), the 15 typed `ProofPayload`
 *      value args, the raw 64-byte signature, the registered oracle public key
 *      (`ORACLE_PUBLIC_KEY`), and the `0x6` `Clock`.
 *   5. Sign/execute as the PLAYER wallet — the wallet in the attestation, which
 *      must equal `passport.owner == ctx.sender()`. In the demo the admin key
 *      is the player ({@link loadPlayerKeypair} falls back to the admin key);
 *      set `PLAYER_PRIVATE_KEY` to sign as a distinct wallet.
 *
 * Assertion: a `ProofAccepted` event is emitted on success (Requirement 22.1).
 *
 * Replay (Requirement 22.2): re-running the SAME attestation aborts with
 * `E_REUSED_NULLIFIER`. This script succeeds on the FIRST run; on a replay it
 * surfaces the decoded abort (and, with `--expect-replay`, exits 0 only when
 * the abort is exactly `E_REUSED_NULLIFIER`). The integration test drives both.
 *
 * Run: `pnpm --filter @yeti-trials/scripts submit:proof -- --attestation att.json`
 */

import { fromBase64, fromHex } from "@mysten/sui/utils";
import { Transaction } from "@mysten/sui/transactions";
import { ABORT_CODE, type AttestationResponse } from "@yeti-trials/shared";

import {
  getClient,
  getNetwork,
  loadArtifact,
  loadPlayerKeypair,
  requireArtifactField,
  requireEvent,
  signAndRun,
  signAndRunAllowAbort,
  target,
  type SuiClient,
} from "./lib.js";
import {
  CLOCK_ID,
  describeAbort,
  loadAttestation,
  parseAbortCode,
  proofValueArgs,
  readSeasonShardCount,
  selectShardObjectId,
} from "./lifecycle.js";
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

/** Parse the registered raw 32-byte oracle public key from `ORACLE_PUBLIC_KEY`. */
export function loadOraclePublicKey(): number[] {
  const raw = process.env["ORACLE_PUBLIC_KEY"]?.trim();
  if (!raw) {
    throw new Error("missing required env ORACLE_PUBLIC_KEY (raw 32-byte Ed25519 public key)");
  }
  const bytes = raw.startsWith("0x") ? fromHex(raw) : fromBase64(raw);
  if (bytes.length !== 32) {
    throw new Error(
      `ORACLE_PUBLIC_KEY must be exactly 32 raw bytes; got ${bytes.length}. ` +
        "Use Ed25519Keypair.getPublicKey().toRawBytes(), not a flag-prefixed key.",
    );
  }
  return Array.from(bytes);
}

/** Build the fully-populated `submit_proof` PTB for an attestation. */
export async function buildSubmitProofTx(
  client: SuiClient,
  attestation: AttestationResponse,
  publicKey: number[],
): Promise<{ tx: Transaction; bucket: number; shardId: string }> {
  const network = getNetwork();
  const artifact = loadArtifact(network);
  const packageId = requireArtifactField(artifact, "packageId");
  const registryId = requireArtifactField(artifact, "oracleRegistryId");
  const seasonId = requireArtifactField(artifact, "seasonId");
  const nullifierStoreId = requireArtifactField(artifact, "nullifierStoreId");
  const shards = requireArtifactField(artifact, "shards");

  const payload = attestation.payload;

  // Shard selection by bucket, using the Season's configured shard_count.
  const shardCount = await readSeasonShardCount(client, seasonId);
  const { objectId: shardId, bucket } = selectShardObjectId(
    shards,
    payload.factionId,
    attestation.nullifier,
    shardCount,
  );

  const tx = new Transaction();
  tx.moveCall({
    target: target(packageId, "proof", "submit_proof"),
    arguments: [
      tx.object(registryId),
      tx.object(payload.passportId),
      tx.object(seasonId),
      tx.object(shardId),
      tx.object(nullifierStoreId),
      ...proofValueArgs(tx, payload, attestation.signature, publicKey),
      tx.object(CLOCK_ID),
    ],
  });
  return { tx, bucket, shardId };
}

export interface SubmitProofOptions {
  client?: SuiClient;
  /** In-memory attestation override (tests). Falls back to {@link loadAttestation}. */
  attestation?: AttestationResponse;
  /** Player signer override (tests). Falls back to {@link loadPlayerKeypair}. */
  signer?: Ed25519Keypair;
  /** Oracle public key override (tests). Falls back to `ORACLE_PUBLIC_KEY`. */
  publicKey?: number[];
  /** When true, a replay abort (`E_REUSED_NULLIFIER`) is the EXPECTED outcome. */
  expectReplay?: boolean;
}

/** Result of a submit attempt. */
export interface SubmitProofResult {
  /** Whether `submit_proof` succeeded (a fresh accept). */
  accepted: boolean;
  /** The `ProofAccepted` event fields on success. */
  event?: Record<string, unknown>;
  /** The Move abort code when it aborted (e.g. `E_REUSED_NULLIFIER` on replay). */
  abortCode?: number;
  /** Transaction digest. */
  digest: string;
  /** Selected shard object id + computed bucket. */
  shardId: string;
  bucket: number;
}

export async function submitProof(opts: SubmitProofOptions = {}): Promise<SubmitProofResult> {
  const network = getNetwork();
  const client = opts.client ?? getClient(network);
  const attestation = opts.attestation ?? loadAttestation();
  const signer = opts.signer ?? loadPlayerKeypair();
  const publicKey = opts.publicKey ?? loadOraclePublicKey();

  const signerAddr = signer.getPublicKey().toSuiAddress();
  if (signerAddr.toLowerCase() !== attestation.payload.wallet.toLowerCase()) {
    console.warn(
      `[submitProof] WARNING: signer ${signerAddr} != attestation wallet ` +
        `${attestation.payload.wallet}. submit_proof asserts wallet == passport.owner == sender; ` +
        "set PLAYER_PRIVATE_KEY to the attestation wallet.",
    );
  }

  const { tx, bucket, shardId } = await buildSubmitProofTx(client, attestation, publicKey);

  if (opts.expectReplay) {
    // Replay path: we EXPECT E_REUSED_NULLIFIER and must not throw on abort.
    const run = await signAndRunAllowAbort(tx, { client, signer });
    const code = parseAbortCode(run.error);
    if (run.success) {
      console.warn("[submitProof] expected a replay abort but submit_proof SUCCEEDED");
      const event = requireEvent(run.response, "::events::ProofAccepted");
      return { accepted: true, event, digest: run.response.digest, shardId, bucket };
    }
    console.log(`[submitProof] replay aborted as expected: ${describeAbort(run.error)}`);
    return {
      accepted: false,
      ...(code !== null ? { abortCode: code } : {}),
      digest: run.response.digest,
      shardId,
      bucket,
    };
  }

  // First-run path: success is required; assert the ProofAccepted event.
  const res = await signAndRun(tx, { client, signer });
  const event = requireEvent(res, "::events::ProofAccepted");
  console.log("ProofAccepted emitted:");
  console.log(`  digest    = ${res.digest}`);
  console.log(`  shard     = ${shardId} (bucket ${bucket})`);
  console.log(`  faction   = ${attestation.payload.factionId}`);
  console.log(`  score     = ${attestation.payload.score}`);
  console.log(`  power     = ${attestation.payload.territoryPower}`);
  return { accepted: true, event, digest: res.digest, shardId, bucket };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const expectReplay = process.argv.includes("--expect-replay");
  submitProof({ expectReplay })
    .then((r) => {
      if (expectReplay && r.abortCode !== ABORT_CODE.E_REUSED_NULLIFIER) {
        console.error(
          `expected E_REUSED_NULLIFIER on replay, got ${r.abortCode ?? "success"}`,
        );
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
