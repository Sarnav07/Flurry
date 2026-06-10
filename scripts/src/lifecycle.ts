/**
 * Shared helpers for the Phase-7 lifecycle scripts (Task 10, Requirement 22):
 * `submitProof`, `finalizeTerritory`, `finalizeImpact`, `cleanupBatch`.
 *
 * Everything here is pure/IO-light and hermetically testable where possible:
 *   - Move abort-code decoding from a committed-failure error string, mapped to
 *     the human-readable `ABORT_MESSAGES` from `@yeti-trials/shared`,
 *   - attestation loading (path / env / stdin) and the wire→PTB-arg conversion
 *     (u64 decimal strings → BigInt, addresses passed through, `vector<u8>` as
 *     `number[]`), and the shard-selection-by-bucket rule,
 *   - small on-chain reads (Season `shard_count`, the accepted-nullifier-key
 *     list, NullifierStore entry count) used by the lifecycle scripts.
 *
 * NOTHING here hard-codes an object/package id — ids flow in from the artifact
 * via the calling script.
 */

import { existsSync, readFileSync } from "node:fs";

import { Transaction } from "@mysten/sui/transactions";
import {
  ABORT_CODE,
  ABORT_MESSAGES,
  shardBucket,
  type AbortCode,
  type AttestationResponse,
  type ShardInfo,
  type WireProofPayload,
} from "@yeti-trials/shared";

import {
  decodeU64Return,
  target,
  type ShardEntry,
  type SuiClient,
} from "./lib.js";

/** The well-known shared `Clock` object id (`0x6`). */
export const CLOCK_ID = "0x6";

// ===========================================================================
// Abort-code decoding
// ===========================================================================

/** Reverse map: abort code number → its `E_*` name. */
const ABORT_NAME_BY_CODE: Readonly<Record<number, string>> = Object.fromEntries(
  Object.entries(ABORT_CODE).map(([name, code]) => [code, name]),
);

/**
 * Extract the Move abort code from a committed-failure `effects.status.error`
 * string. The outermost `MoveAbort(MoveLocation { ... }, <code>)` carries the
 * abort code as its final `, <code>)` group, so we take the LAST `, N)` match
 * (inner `function: N,` / `instruction: N,` fields are `: N,`, never `, N)`).
 * Returns `null` when the string is not a recognizable Move abort.
 */
export function parseAbortCode(error: string | undefined | null): number | null {
  if (!error) return null;
  const matches = [...error.matchAll(/,\s*(\d+)\)/g)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1]!;
  return Number(last[1]);
}

/** A decoded abort: its numeric code, `E_*` name, and human-readable message. */
export interface DecodedAbort {
  code: number;
  name: string;
  message: string;
}

/** Decode an abort code into `{ code, name, message }` using `ABORT_MESSAGES`. */
export function decodeAbort(code: number): DecodedAbort {
  const name = ABORT_NAME_BY_CODE[code] ?? `UNKNOWN(${code})`;
  const message =
    (ABORT_MESSAGES as Record<number, string>)[code] ?? "unrecognized abort code";
  return { code, name, message };
}

/**
 * Whether the error string is a Move abort with exactly `expected`
 * (an `ABORT_CODE` value). Used by the replay / time-window assertions.
 */
export function isAbort(error: string | undefined | null, expected: AbortCode): boolean {
  return parseAbortCode(error) === expected;
}

/** Render a committed-failure error as `E_NAME (code): message` when decodable. */
export function describeAbort(error: string | undefined | null): string {
  const code = parseAbortCode(error);
  if (code === null) return error ?? "unknown error";
  const d = decodeAbort(code);
  return `${d.name} (${d.code}): ${d.message}`;
}

// ===========================================================================
// Attestation loading (path / env / stdin)
// ===========================================================================

/**
 * Resolve an {@link AttestationResponse} from, in order:
 *   1. an explicit `--attestation <path>` / `--attestation=<path>` CLI flag,
 *   2. `ATTESTATION_PATH` (a file path) or `ATTESTATION_JSON` (inline JSON) env,
 *   3. stdin (when piped).
 *
 * The wire shape is exactly what `POST /proof/attest` returns: `u64` fields as
 * decimal strings, addresses as `0x`-hex, `vector<u8>` as `number[]`.
 */
export function loadAttestation(argv: string[] = process.argv.slice(2)): AttestationResponse {
  // 1. CLI flag.
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--attestation" && argv[i + 1]) {
      return parseAttestation(readFileSync(argv[i + 1]!, "utf8"));
    }
    if (a.startsWith("--attestation=")) {
      return parseAttestation(readFileSync(a.slice("--attestation=".length), "utf8"));
    }
  }
  // 2. Env.
  const inline = process.env["ATTESTATION_JSON"]?.trim();
  if (inline) return parseAttestation(inline);
  const path = process.env["ATTESTATION_PATH"]?.trim();
  if (path) {
    if (!existsSync(path)) throw new Error(`ATTESTATION_PATH does not exist: ${path}`);
    return parseAttestation(readFileSync(path, "utf8"));
  }
  // 3. stdin (only when piped).
  if (!process.stdin.isTTY) {
    const raw = readFileSync(0, "utf8").trim();
    if (raw) return parseAttestation(raw);
  }
  throw new Error(
    "no attestation provided: pass --attestation <path>, or set ATTESTATION_PATH / ATTESTATION_JSON, or pipe JSON on stdin",
  );
}

/** Parse + lightly validate an attestation JSON string. */
export function parseAttestation(json: string): AttestationResponse {
  const parsed = JSON.parse(json) as AttestationResponse;
  if (!parsed || typeof parsed !== "object" || !parsed.payload) {
    throw new Error("attestation JSON missing `payload`");
  }
  if (!Array.isArray(parsed.signature) || parsed.signature.length !== 64) {
    throw new Error("attestation `signature` must be a 64-byte number[]");
  }
  if (!Array.isArray(parsed.nullifier) || parsed.nullifier.length !== 32) {
    throw new Error("attestation `nullifier` must be a 32-byte number[]");
  }
  return parsed;
}

// ===========================================================================
// Shard selection by bucket
// ===========================================================================

/**
 * Select the `ScoreShard` object id whose `(faction, shard)` triple matches the
 * proof's bucket. The bucket is computed from the nullifier with the Season's
 * configured `shardCount` modulus (`shardBucket`, the shared single source of
 * truth). Throws if no matching shard exists in the artifact.
 */
export function selectShardObjectId(
  shards: ShardEntry[] | ShardInfo[],
  factionId: number,
  nullifier: Uint8Array | number[],
  shardCount: bigint | number,
): { objectId: string; bucket: number } {
  const bucket = shardBucket(
    nullifier instanceof Uint8Array ? nullifier : Uint8Array.from(nullifier),
    shardCount,
  );
  const match = shards.find((s) => s.faction === factionId && s.shard === bucket);
  if (!match) {
    throw new Error(
      `no shard for (faction=${factionId}, shard=${bucket}) in the artifact; ` +
        `check the season's shard_count and the init/shards step`,
    );
  }
  return { objectId: match.objectId, bucket };
}

// ===========================================================================
// submit_proof PTB argument construction
// ===========================================================================

/**
 * Append the 18 typed `ProofPayload` value args (network … nullifier) plus the
 * signature and public key to a `submit_proof` move-call argument list, in the
 * exact Move parameter order. `u64` decimal strings become `BigInt`; addresses
 * pass through as `0x`-hex; `vector<u8>` fields are `number[]`.
 *
 * The leading object args (registry, passport, season, shard, store) and the
 * trailing `&Clock` are added by the caller around these value args.
 */
export function proofValueArgs(
  tx: Transaction,
  payload: WireProofPayload,
  signature: number[],
  publicKey: number[],
) {
  return [
    tx.pure.vector("u8", payload.network),
    tx.pure.address(payload.packageId),
    tx.pure.u64(BigInt(payload.seasonId)),
    tx.pure.u64(BigInt(payload.trialId)),
    tx.pure.u8(payload.factionId),
    tx.pure.address(payload.passportId),
    tx.pure.address(payload.wallet),
    tx.pure.vector("u8", payload.proofSource),
    tx.pure.u8(payload.provenanceTier),
    tx.pure.u64(BigInt(payload.score)),
    tx.pure.u64(BigInt(payload.territoryPower)),
    tx.pure.u64(BigInt(payload.issuedMs)),
    tx.pure.u64(BigInt(payload.expiryMs)),
    tx.pure.u64(BigInt(payload.nonce)),
    tx.pure.vector("u8", payload.nullifier),
    tx.pure.vector("u8", signature),
    tx.pure.vector("u8", publicKey),
  ];
}

// ===========================================================================
// On-chain reads
// ===========================================================================

/** Normalize a Sui-JSON `vector<u8>` value (number[] or base64 string) to bytes. */
export function normalizeByteVec(v: unknown): number[] {
  if (Array.isArray(v)) return v.map((n) => Number(n) & 0xff);
  if (typeof v === "string") {
    return Array.from(Buffer.from(v, "base64"));
  }
  throw new Error(`cannot normalize vector<u8> value: ${JSON.stringify(v)}`);
}

/** Read the Season's configured `shard_count` from its on-chain content. */
export async function readSeasonShardCount(
  client: SuiClient,
  seasonObjectId: string,
): Promise<number> {
  const obj = await client.getObject({ id: seasonObjectId, options: { showContent: true } });
  const content = obj.data?.content;
  if (!content || content.dataType !== "moveObject") {
    throw new Error(`Season ${seasonObjectId} has no readable move content`);
  }
  const fields = content.fields as Record<string, unknown>;
  return Number(fields["shard_count"]);
}

/**
 * Read the Season's `accepted_nullifier_keys` list from on-chain content, each
 * key normalized to a `number[]`. The cleanup batch is built from a bounded
 * slice of these keys.
 */
export async function readAcceptedNullifierKeys(
  client: SuiClient,
  seasonObjectId: string,
): Promise<number[][]> {
  const obj = await client.getObject({ id: seasonObjectId, options: { showContent: true } });
  const content = obj.data?.content;
  if (!content || content.dataType !== "moveObject") {
    throw new Error(`Season ${seasonObjectId} has no readable move content`);
  }
  const fields = content.fields as Record<string, unknown>;
  const raw = fields["accepted_nullifier_keys"];
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => normalizeByteVec(entry));
}

/** dev-inspect `proof::nullifier_count(store)` → entry count. */
export async function readNullifierCount(
  client: SuiClient,
  packageId: string,
  nullifierStoreId: string,
  sender: string,
): Promise<bigint> {
  const tx = new Transaction();
  tx.moveCall({
    target: target(packageId, "proof", "nullifier_count"),
    arguments: [tx.object(nullifierStoreId)],
  });
  const res = await client.devInspectTransactionBlock({ sender, transactionBlock: tx });
  const decoded = decodeU64Return(res.results?.[0]?.returnValues);
  if (decoded === null) {
    throw new Error(`could not read nullifier_count: ${res.error ?? "no return value"}`);
  }
  return decoded;
}

/** dev-inspect `season::accepted_nullifier_key_count(season)` → key-list length. */
export async function readAcceptedKeyCount(
  client: SuiClient,
  packageId: string,
  seasonObjectId: string,
  sender: string,
): Promise<bigint> {
  const tx = new Transaction();
  tx.moveCall({
    target: target(packageId, "season", "accepted_nullifier_key_count"),
    arguments: [tx.object(seasonObjectId)],
  });
  const res = await client.devInspectTransactionBlock({ sender, transactionBlock: tx });
  const decoded = decodeU64Return(res.results?.[0]?.returnValues);
  if (decoded === null) {
    throw new Error(`could not read accepted_nullifier_key_count: ${res.error ?? "no return value"}`);
  }
  return decoded;
}
