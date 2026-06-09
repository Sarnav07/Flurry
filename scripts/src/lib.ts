/**
 * Shared script helpers for the Yeti Trials deploy/init/lifecycle CLIs
 * (Task 8.1, Requirement 21.4).
 *
 * Everything network-specific is keyed by the `SUI_NETWORK` switch
 * (localnet | testnet) so a single code path drives either network. NOTHING in
 * here hard-codes a package id, object id, or private key:
 *
 *   - object/package ids are read from and written to the per-network
 *     deployment artifact `deployed.<network>.json` (typed load/merge/save), and
 *   - keypairs are loaded only from environment (`ADMIN_PRIVATE_KEY` /
 *     `ADMIN_KEYSTORE_PATH`), never embedded in source.
 *
 * The artifact lives next to the scripts package (`scripts/deployed.<network>.json`)
 * and is gitignored (`deployed.*.json`) so a populated artifact with real ids is
 * never committed.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { fromBase64, fromHex } from "@mysten/sui/utils";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Transaction } from "@mysten/sui/transactions";
import type {
  SuiObjectChange,
  SuiTransactionBlockResponse,
} from "@mysten/sui/client";

// Re-export the client type so scripts can type their optional `client` params
// against a single import surface.
export type { SuiClient } from "@mysten/sui/client";

// ===========================================================================
// Paths
// ===========================================================================

const HERE = dirname(fileURLToPath(import.meta.url));
/** Repo root (scripts/src -> scripts -> repo). */
export const REPO_ROOT = resolve(HERE, "..", "..");
/** The Move package directory published by `publish.ts`. */
export const CONTRACTS_DIR = resolve(REPO_ROOT, "contracts");
/** Directory the per-network artifact is written to (the scripts package). */
export const SCRIPTS_DIR = resolve(HERE, "..");

// ===========================================================================
// Network selection (SUI_NETWORK + SUI_RPC_URL)
// ===========================================================================

export type SuiNetwork = "localnet" | "testnet";

/** Resolve the target network from `SUI_NETWORK` (default localnet). */
export function getNetwork(): SuiNetwork {
  const raw = (process.env["SUI_NETWORK"] ?? "localnet").trim().toLowerCase();
  if (raw !== "localnet" && raw !== "testnet") {
    throw new Error(
      `SUI_NETWORK must be "localnet" or "testnet" (got "${raw}")`,
    );
  }
  return raw;
}

/** Resolve the RPC URL: explicit `SUI_RPC_URL`, else the network default. */
export function getRpcUrl(network: SuiNetwork = getNetwork()): string {
  const override = process.env["SUI_RPC_URL"]?.trim();
  if (override) return override;
  return network === "localnet"
    ? getFullnodeUrl("localnet")
    : getFullnodeUrl("testnet");
}

let cachedClient: SuiClient | undefined;
let cachedClientUrl: string | undefined;

/**
 * A process-wide shared {@link SuiClient} keyed by the resolved RPC URL. Reused
 * across scripts so a single run shares one connection.
 */
export function getClient(network: SuiNetwork = getNetwork()): SuiClient {
  const url = getRpcUrl(network);
  if (!cachedClient || cachedClientUrl !== url) {
    cachedClient = new SuiClient({ url });
    cachedClientUrl = url;
  }
  return cachedClient;
}

// ===========================================================================
// Keypair loading (admin) — never hard-code keys
// ===========================================================================

/**
 * Build an Ed25519 keypair from a flag-prefixed exported secret (the
 * Sui-keystore / `sui keytool` form): a base64 string of `[flag(1)][key(32)]`
 * where `flag == 0x00` is Ed25519. Aborts on any other scheme.
 */
function keypairFromFlaggedBase64(b64: string): Ed25519Keypair {
  const bytes = fromBase64(b64.trim());
  if (bytes.length !== 33) {
    throw new Error(
      `keystore entry must be 33 bytes (1 flag + 32 key); got ${bytes.length}`,
    );
  }
  const flag = bytes[0];
  if (flag !== 0x00) {
    throw new Error(
      `only Ed25519 keystore entries (flag 0x00) are supported; got flag 0x${flag?.toString(16)}`,
    );
  }
  return Ed25519Keypair.fromSecretKey(bytes.slice(1));
}

/**
 * Parse a private key supplied directly via env. Accepts, in order:
 *   - a bech32 `suiprivkey1...` string (the modern `sui keytool` export),
 *   - a 0x-prefixed 32-byte hex string,
 *   - a base64 string of either 32 raw bytes or 33 flag-prefixed bytes.
 */
function keypairFromEnvString(raw: string): Ed25519Keypair {
  const value = raw.trim();
  if (value.startsWith("suiprivkey")) {
    const { schema, secretKey } = decodeSuiPrivateKey(value);
    if (schema !== "ED25519") {
      throw new Error(`ADMIN_PRIVATE_KEY scheme ${schema} is not supported`);
    }
    return Ed25519Keypair.fromSecretKey(secretKey);
  }
  if (value.startsWith("0x")) {
    const bytes = fromHex(value);
    if (bytes.length !== 32) {
      throw new Error(`hex ADMIN_PRIVATE_KEY must be 32 bytes; got ${bytes.length}`);
    }
    return Ed25519Keypair.fromSecretKey(bytes);
  }
  // Fall back to base64 (32 raw or 33 flag-prefixed).
  const bytes = fromBase64(value);
  if (bytes.length === 32) return Ed25519Keypair.fromSecretKey(bytes);
  if (bytes.length === 33) return keypairFromFlaggedBase64(value);
  throw new Error(
    `base64 ADMIN_PRIVATE_KEY must decode to 32 or 33 bytes; got ${bytes.length}`,
  );
}

/**
 * Load the admin keypair (holds the `AdminCap`) from the environment. Tries
 * `ADMIN_PRIVATE_KEY` first, then the first Ed25519 entry of the keystore file
 * at `ADMIN_KEYSTORE_PATH`. Throws if neither is provided so a run never
 * silently proceeds without a signer.
 */
export function loadAdminKeypair(): Ed25519Keypair {
  const direct = process.env["ADMIN_PRIVATE_KEY"]?.trim();
  if (direct) return keypairFromEnvString(direct);

  const keystorePath = process.env["ADMIN_KEYSTORE_PATH"]?.trim();
  if (keystorePath) {
    if (!existsSync(keystorePath)) {
      throw new Error(`ADMIN_KEYSTORE_PATH does not exist: ${keystorePath}`);
    }
    const parsed = JSON.parse(readFileSync(keystorePath, "utf8")) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error(
        `keystore at ${keystorePath} must be a non-empty JSON array of base64 keys`,
      );
    }
    const index = Number(process.env["ADMIN_KEYSTORE_INDEX"] ?? "0");
    const entry = parsed[index];
    if (typeof entry !== "string") {
      throw new Error(`keystore entry at index ${index} is not a string`);
    }
    return keypairFromFlaggedBase64(entry);
  }

  throw new Error(
    "no admin key configured: set ADMIN_PRIVATE_KEY or ADMIN_KEYSTORE_PATH (never hard-code keys)",
  );
}

/** The 0x address of the admin keypair. */
export function adminAddress(): string {
  return loadAdminKeypair().getPublicKey().toSuiAddress();
}

// ===========================================================================
// Deployment artifact: deployed.<network>.json
// ===========================================================================

/** One created `ScoreShard` object, tagged with its (faction, shard) triple. */
export interface ShardEntry {
  /** The shared `ScoreShard` object id. */
  objectId: string;
  /** Faction id 0..3 (Glaciers, Avalanche, Blizzard, Thaw). */
  faction: number;
  /** Shard index 0..shard_count-1. */
  shard: number;
}

/**
 * The per-network deployment artifact shape. Every id is written by the
 * publish/init/register scripts; consumers (orchestrator, lifecycle scripts)
 * read ids from here rather than from hard-coded source.
 *
 * Naming note: `seasonId` is the on-chain `Season` SHARED OBJECT id, while
 * `seasonNumber` is the numeric `season_id: u64` stored inside that object (it
 * is needed by `shards`/`territory`/`impact` init to construct matching
 * objects). `trialId` is the numeric trial id of the active "Avalanche Testnet
 * Proof" trial.
 */
export interface DeployedArtifact {
  /** Network this artifact targets (localnet | testnet). */
  network: SuiNetwork;
  /** Published package id (`publish.ts`). */
  packageId?: string;
  /** `AdminCap` object id owned by the publisher (`publish.ts`). */
  adminCap?: string;
  /** Shared `OracleSignerRegistry` id created by `registry::init` (`publish.ts`). */
  oracleRegistryId?: string;
  /** Shared `NullifierStore` id from `proof::new_nullifier_store`. */
  nullifierStoreId?: string;
  /** Shared `Season` object id (`init/season.ts`). */
  seasonId?: string;
  /** Numeric `season_id: u64` stored in the Season (needed by shards/territory/impact). */
  seasonNumber?: number;
  /** Numeric active trial id ("Avalanche Testnet Proof"). */
  trialId?: number;
  /** All shared `ScoreShard` objects (`init/shards.ts`). */
  shards?: ShardEntry[];
  /** Shared `TerritoryMap` id (`init/territory.ts`). */
  territoryMapId?: string;
  /** Shared `SponsorSlot` id (`init/sponsor.ts`). */
  sponsorSlotId?: string;
  /** Shared `ImpactEscrow` id (`init/impact.ts`). */
  impactEscrowId?: string;
  /** Per-faction verified recipient addresses (index = faction id). */
  recipients?: string[];
}

/** Absolute path of the artifact for `network`.
 *
 * Honors `YETI_ARTIFACT_DIR` as a base-directory override (used by hermetic
 * tests to write to a temp dir); defaults to the scripts package directory.
 */
export function artifactPath(network: SuiNetwork = getNetwork()): string {
  const baseDir = process.env["YETI_ARTIFACT_DIR"]?.trim() || SCRIPTS_DIR;
  return resolve(baseDir, `deployed.${network}.json`);
}

/**
 * Load the artifact for `network`. Returns a fresh `{ network }` shell when the
 * file does not yet exist (first publish), so callers can always merge into it.
 */
export function loadArtifact(network: SuiNetwork = getNetwork()): DeployedArtifact {
  const path = artifactPath(network);
  if (!existsSync(path)) return { network };
  const parsed = JSON.parse(readFileSync(path, "utf8")) as DeployedArtifact;
  // The on-disk network must match the requested one; guard against a stale or
  // mis-copied artifact silently feeding wrong ids into a different network.
  if (parsed.network && parsed.network !== network) {
    throw new Error(
      `artifact at ${path} is for network "${parsed.network}", expected "${network}"`,
    );
  }
  return { ...parsed, network };
}

/**
 * A patch for {@link mergeArtifact}. Unlike `Partial<DeployedArtifact>` under
 * `exactOptionalPropertyTypes`, this explicitly allows `undefined` values so
 * callers can pass through optional ids; `undefined` values are ignored on merge.
 */
export type ArtifactPatch = {
  [K in keyof DeployedArtifact]?: DeployedArtifact[K] | undefined;
};

/**
 * Shallow-merge `patch` into the existing artifact and persist it, returning the
 * merged result. Existing ids are preserved unless explicitly overwritten by a
 * defined value in `patch` (so each script appends without clobbering others).
 */
export function mergeArtifact(
  patch: ArtifactPatch,
  network: SuiNetwork = getNetwork(),
): DeployedArtifact {
  const current = loadArtifact(network);
  const merged: DeployedArtifact = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      (merged as unknown as Record<string, unknown>)[key] = value;
    }
  }
  merged.network = network;
  saveArtifact(merged, network);
  return merged;
}

/** Write `artifact` to `deployed.<network>.json` (pretty-printed). */
export function saveArtifact(
  artifact: DeployedArtifact,
  network: SuiNetwork = getNetwork(),
): void {
  writeFileSync(artifactPath(network), JSON.stringify(artifact, null, 2) + "\n");
}

/** Read a required id from the artifact or throw a clear, actionable error. */
export function requireArtifactField<K extends keyof DeployedArtifact>(
  artifact: DeployedArtifact,
  key: K,
): NonNullable<DeployedArtifact[K]> {
  const value = artifact[key];
  if (value === undefined || value === null) {
    throw new Error(
      `artifact is missing "${String(key)}" — run the prerequisite script first`,
    );
  }
  return value as NonNullable<DeployedArtifact[K]>;
}

// ===========================================================================
// PTB helpers: build / sign / execute, and created-object extraction
// ===========================================================================

/**
 * Sign and execute a PTB with the admin keypair, waiting for the transaction to
 * be available and returning the full response with effects + object changes +
 * events. Throws if execution did not reach `success`.
 */
export async function signAndRun(
  tx: Transaction,
  options: { client?: SuiClient } = {},
): Promise<SuiTransactionBlockResponse> {
  const client = options.client ?? getClient();
  const keypair = loadAdminKeypair();
  const res = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: {
      showEffects: true,
      showObjectChanges: true,
      showEvents: true,
    },
  });
  // Ensure the indexer/full node has the tx before we read object changes.
  await client.waitForTransaction({ digest: res.digest });
  const status = res.effects?.status?.status;
  if (status !== "success") {
    throw new Error(
      `transaction ${res.digest} failed: ${res.effects?.status?.error ?? "unknown error"}`,
    );
  }
  return res;
}

/** All `created` object changes from a transaction response. */
export function createdObjects(res: SuiTransactionBlockResponse): SuiObjectChange[] {
  return (res.objectChanges ?? []).filter((c) => c.type === "created");
}

/**
 * The id of the single created object whose fully-qualified type ENDS WITH
 * `typeSuffix` (e.g. `"::registry::OracleSignerRegistry"`). Throws if zero or
 * more than one match, so an ambiguous extraction never silently picks wrong.
 */
export function createdObjectIdByType(
  res: SuiTransactionBlockResponse,
  typeSuffix: string,
): string {
  const matches = createdObjects(res).filter(
    (c) => "objectType" in c && c.objectType.endsWith(typeSuffix),
  );
  if (matches.length === 0) {
    throw new Error(`no created object of type *${typeSuffix} in tx ${res.digest}`);
  }
  if (matches.length > 1) {
    throw new Error(
      `expected exactly one created *${typeSuffix}, found ${matches.length} in tx ${res.digest}`,
    );
  }
  const only = matches[0]!;
  return "objectId" in only ? only.objectId : "";
}

/**
 * All created SHARED-object ids whose type ends with `typeSuffix`, in creation
 * order. Used by `init/shards.ts` to collect the many shards from one PTB.
 */
export function createdSharedObjectIdsByType(
  res: SuiTransactionBlockResponse,
  typeSuffix: string,
): string[] {
  return createdObjects(res)
    .filter(
      (c) =>
        "objectType" in c &&
        c.objectType.endsWith(typeSuffix) &&
        "owner" in c &&
        isShared(c.owner),
    )
    .map((c) => ("objectId" in c ? c.objectId : ""))
    .filter((id) => id.length > 0);
}

/** The published package id from a publish transaction's object changes. */
export function publishedPackageId(res: SuiTransactionBlockResponse): string {
  const published = (res.objectChanges ?? []).find((c) => c.type === "published");
  if (!published || !("packageId" in published)) {
    throw new Error(`no published package in tx ${res.digest}`);
  }
  return published.packageId;
}

/** Whether an object-change owner is a shared owner. */
function isShared(owner: unknown): boolean {
  return (
    typeof owner === "object" &&
    owner !== null &&
    ("Shared" in owner || "ConsensusV2" in owner)
  );
}

/** Convenience: the full `<packageId>::<module>::<fn>` move-call target. */
export function target(
  packageId: string,
  moduleName: string,
  fnName: string,
): `${string}::${string}::${string}` {
  return `${packageId}::${moduleName}::${fnName}`;
}
