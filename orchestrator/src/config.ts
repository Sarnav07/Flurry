/**
 * Orchestrator configuration loader (Task 9.2, Requirements 14.2, 14.3).
 *
 * Two sources, never hard-coded ids:
 *   1. `.env` (loaded via dotenv from the repo root) — network selection, RPC
 *      URL, oracle/sponsor keys, demo controls.
 *   2. The per-network deployment artifact `deployed.<network>.json` — every
 *      package/object id. This MIRRORS the typed loader in `scripts/src/lib.ts`
 *      (same `DeployedArtifact` shape, same `deployed.<network>.json` filename,
 *      same `YETI_ARTIFACT_DIR` override) so the orchestrator reads exactly the
 *      file the publish/init scripts wrote. The logic is kept intentionally
 *      identical to that module; it is mirrored (not imported) only because the
 *      scripts package exposes no import surface to the orchestrator.
 *
 * Per Requirement 14.3, deployment identifiers are read from the artifact, not
 * from source constants.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadDotenv } from "dotenv";
import { getFullnodeUrl } from "@mysten/sui/client";
import {
  FACTION,
  PROVENANCE_TIER,
  SHARD_COUNT,
  type Config,
  type FactionInfo,
  type ProvenanceTierInfo,
  type ShardInfo,
  type SponsorMeta,
} from "@yeti-trials/shared";

const HERE = dirname(fileURLToPath(import.meta.url));
/** Repo root (orchestrator/src -> orchestrator -> repo). */
const REPO_ROOT = resolve(HERE, "..", "..");
/** Where the publish/init scripts write the per-network artifact by default. */
const SCRIPTS_DIR = resolve(REPO_ROOT, "scripts");

// Load `.env` from the repo root. dotenv never overrides values already present
// in `process.env`, so tests that pre-set env are unaffected, and a missing
// `.env` is a silent no-op.
loadDotenv({ path: resolve(REPO_ROOT, ".env") });

// ===========================================================================
// Network + artifact (mirrors scripts/src/lib.ts)
// ===========================================================================

export type SuiNetwork = "localnet" | "testnet";

/** Resolve the target network from `SUI_NETWORK` (default localnet). */
export function getNetwork(): SuiNetwork {
  const raw = (process.env["SUI_NETWORK"] ?? "localnet").trim().toLowerCase();
  if (raw !== "localnet" && raw !== "testnet") {
    throw new Error(`SUI_NETWORK must be "localnet" or "testnet" (got "${raw}")`);
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

/** One created `ScoreShard` object, tagged with its (faction, shard) triple. */
export interface ShardEntry {
  objectId: string;
  faction: number;
  shard: number;
}

/**
 * The per-network deployment artifact shape — identical to the one written by
 * the scripts package. Every id is optional because the artifact is built up
 * incrementally by publish/init.
 */
export interface DeployedArtifact {
  network: SuiNetwork;
  packageId?: string;
  adminCap?: string;
  oracleRegistryId?: string;
  nullifierStoreId?: string;
  seasonId?: string;
  seasonNumber?: number;
  trialId?: number;
  shards?: ShardEntry[];
  territoryMapId?: string;
  sponsorSlotId?: string;
  impactEscrowId?: string;
  recipients?: string[];
}

/**
 * Absolute path of the artifact for `network`. Honors `YETI_ARTIFACT_DIR` as a
 * base-directory override (hermetic tests point this at a temp dir); defaults
 * to the scripts package directory where publish/init write it.
 */
export function artifactPath(network: SuiNetwork = getNetwork()): string {
  const baseDir = process.env["YETI_ARTIFACT_DIR"]?.trim() || SCRIPTS_DIR;
  return resolve(baseDir, `deployed.${network}.json`);
}

/** Load the artifact for `network`, throwing if it has not been created yet. */
export function loadArtifact(network: SuiNetwork = getNetwork()): DeployedArtifact {
  const path = artifactPath(network);
  if (!existsSync(path)) {
    throw new Error(
      `deployment artifact not found at ${path} — run publish/init for "${network}" first`,
    );
  }
  const parsed = JSON.parse(readFileSync(path, "utf8")) as DeployedArtifact;
  if (parsed.network && parsed.network !== network) {
    throw new Error(
      `artifact at ${path} is for network "${parsed.network}", expected "${network}"`,
    );
  }
  return { ...parsed, network };
}

/** Read a required id from the artifact or throw a clear, actionable error. */
export function requireField<K extends keyof DeployedArtifact>(
  artifact: DeployedArtifact,
  key: K,
): NonNullable<DeployedArtifact[K]> {
  const value = artifact[key];
  if (value === undefined || value === null) {
    throw new Error(
      `artifact is missing "${String(key)}" — run the prerequisite init script first`,
    );
  }
  return value as NonNullable<DeployedArtifact[K]>;
}

// ===========================================================================
// Static demo metadata (display labels / names — not chain ids)
// ===========================================================================

/** Faction display names by id (0..3). */
export const FACTION_NAMES: readonly FactionInfo[] = [
  { id: FACTION.GLACIERS, name: "Glaciers" },
  { id: FACTION.AVALANCHE, name: "Avalanche" },
  { id: FACTION.BLIZZARD, name: "Blizzard" },
  { id: FACTION.THAW, name: "Thaw" },
];

/** Provenance tiers by value. */
export const PROVENANCE_TIERS: readonly ProvenanceTierInfo[] = [
  { name: "Native", value: PROVENANCE_TIER.NATIVE },
  { name: "Sponsor-Signed", value: PROVENANCE_TIER.SPONSOR },
  { name: "Oracle-Attested", value: PROVENANCE_TIER.ORACLE },
];

/** Default human label of the Genesis Frost active trial (display only). */
const DEFAULT_TRIAL_LABEL = "Avalanche Testnet Proof";
/** Default demo score delta credited by an accepted attestation. */
const DEFAULT_DEMO_SCORE = 100n;
/** Default demo territory-power delta credited by an accepted attestation. */
const DEFAULT_DEMO_TERRITORY_POWER = 50n;
/** Default attestation validity window (24h) — generous for demo latency. */
const DEFAULT_EXPIRY_WINDOW_MS = 24n * 60n * 60n * 1000n;

// ===========================================================================
// Resolved orchestrator config
// ===========================================================================

/** Demo proof-condition + attestation tuning (Requirement 17). */
export interface DemoSettings {
  /** When true, POST /demo/reset is allowed (Requirement 18.2). */
  demoMode: boolean;
  /** Score delta the demo attestation credits. */
  score: bigint;
  /** Territory power delta the demo attestation credits. */
  territoryPower: bigint;
  /** Attestation validity window in ms (expiry = issued + window). */
  expiryWindowMs: bigint;
  /**
   * Allowlist fallback for the demo proof condition: wallets listed here pass
   * the condition even without owning a demo object. CLEARLY a demo shortcut
   * (see oracle.ts) — never a production trust source.
   */
  allowlist: string[];
  /** Optional Sui object TYPE the wallet must own to pass the demo condition. */
  objectType?: string;
  /** Optional specific Sui object id the wallet must own to pass. */
  objectId?: string;
}

/** The fully-resolved runtime config the orchestrator components consume. */
export interface OrchestratorConfig {
  network: SuiNetwork;
  rpcUrl: string;
  packageId: string;
  /** Shared `Season` object id. */
  seasonObjectId: string;
  oracleRegistryId: string;
  nullifierStoreId: string;
  territoryMapId: string;
  impactEscrowId: string;
  sponsorSlotId: string;
  shards: ShardEntry[];
  recipients: string[];
  /** Numeric on-chain `season_id` (u64). */
  seasonNumber: bigint;
  /** Numeric active `trial_id` (u64). */
  trialId: bigint;
  trialLabel: string;
  territoryCount: number;
  shardCount: number;
  /** Allowed faction ids for the active season. */
  allowedFactions: number[];
  demo: DemoSettings;
}

function parseBigintEnv(name: string, fallback: bigint): bigint {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  try {
    return BigInt(raw);
  } catch {
    throw new Error(`${name} must be an integer; got "${raw}"`);
  }
}

function parseAllowlist(): string[] {
  const raw = process.env["DEMO_ALLOWLIST"]?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

/**
 * Assemble the runtime config from `.env` + the per-network artifact. Throws a
 * clear error if a required deployment id is missing from the artifact.
 */
export function loadConfig(network: SuiNetwork = getNetwork()): OrchestratorConfig {
  const artifact = loadArtifact(network);

  const seasonNumber = parseBigintEnv(
    "ACTIVE_SEASON_ID",
    BigInt(artifact.seasonNumber ?? 0),
  );
  const trialId = parseBigintEnv(
    "ACTIVE_TRIAL_ID",
    BigInt(artifact.trialId ?? 0),
  );

  const demo: DemoSettings = {
    demoMode: (process.env["DEMO_MODE"] ?? "false").trim().toLowerCase() === "true",
    score: parseBigintEnv("DEMO_SCORE", DEFAULT_DEMO_SCORE),
    territoryPower: parseBigintEnv("DEMO_TERRITORY_POWER", DEFAULT_DEMO_TERRITORY_POWER),
    expiryWindowMs: parseBigintEnv("ATTEST_EXPIRY_MS", DEFAULT_EXPIRY_WINDOW_MS),
    allowlist: parseAllowlist(),
    ...(process.env["DEMO_OBJECT_TYPE"]?.trim()
      ? { objectType: process.env["DEMO_OBJECT_TYPE"]!.trim() }
      : {}),
    ...(process.env["DEMO_OBJECT_ID"]?.trim()
      ? { objectId: process.env["DEMO_OBJECT_ID"]!.trim() }
      : {}),
  };

  return {
    network,
    rpcUrl: getRpcUrl(network),
    packageId: requireField(artifact, "packageId"),
    seasonObjectId: requireField(artifact, "seasonId"),
    oracleRegistryId: requireField(artifact, "oracleRegistryId"),
    nullifierStoreId: requireField(artifact, "nullifierStoreId"),
    territoryMapId: requireField(artifact, "territoryMapId"),
    impactEscrowId: requireField(artifact, "impactEscrowId"),
    sponsorSlotId: requireField(artifact, "sponsorSlotId"),
    shards: artifact.shards ?? [],
    recipients: artifact.recipients ?? [],
    seasonNumber,
    trialId,
    trialLabel: process.env["ACTIVE_TRIAL_LABEL"]?.trim() || DEFAULT_TRIAL_LABEL,
    territoryCount: FACTION_NAMES.length,
    shardCount: SHARD_COUNT,
    allowedFactions: FACTION_NAMES.map((f) => f.id),
    demo,
  };
}

/**
 * Build the public `GET /config` response (Requirement 14.2) from the resolved
 * config plus the oracle's public key hex.
 */
export function buildPublicConfig(
  cfg: OrchestratorConfig,
  oraclePublicKeyHex: string,
): Config {
  const shards: ShardInfo[] = cfg.shards.map((s) => ({
    objectId: s.objectId,
    faction: s.faction,
    shard: s.shard,
  }));

  const sponsor: SponsorMeta = {
    sponsorSlotId: cfg.sponsorSlotId,
    name: process.env["SPONSOR_NAME"]?.trim() || "Demo DEX Trial",
    trialId: cfg.trialId.toString(),
    actionLabel: process.env["SPONSOR_ACTION_LABEL"]?.trim() || "Swap on the demo DEX",
    status: 0,
  };

  return {
    network: cfg.network,
    packageId: cfg.packageId,
    factions: [...FACTION_NAMES],
    activeSeasonId: cfg.seasonNumber.toString(),
    activeTrialId: cfg.trialId.toString(),
    trialLabel: cfg.trialLabel,
    territoryCount: cfg.territoryCount,
    shardCount: cfg.shardCount,
    provenanceTiers: [...PROVENANCE_TIERS],
    sponsor,
    objectIds: {
      seasonId: cfg.seasonObjectId,
      oracleRegistryId: cfg.oracleRegistryId,
      nullifierStoreId: cfg.nullifierStoreId,
      territoryMapId: cfg.territoryMapId,
      impactEscrowId: cfg.impactEscrowId,
      sponsorSlotId: cfg.sponsorSlotId,
      shards,
    },
    oraclePublicKey: oraclePublicKeyHex,
  };
}
