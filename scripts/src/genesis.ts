/**
 * Genesis Frost demo configuration (the single localnet/testnet demo season).
 *
 * These are the demo-fixed numeric values the init scripts use to construct the
 * season, shards, territory map, sponsor slot, and impact escrow. They are demo
 * CONSTANTS (not secrets and not chain ids) — the package id, object ids, and
 * keys are never here; those come from the artifact and the environment.
 *
 * Maps to Requirement 21.2 (init the Genesis Frost demo state) and the demo
 * narrative: faction Avalanche proves an "Avalanche Testnet Proof" trial.
 */

import { FACTION, SHARD_COUNT } from "@yeti-trials/shared";
import type { SuiNetwork } from "./lib.js";

/** Numeric on-chain `season_id` for the Genesis Frost season. */
export const GENESIS_SEASON_ID = 1;

/** Numeric on-chain `trial_id` for the "Avalanche Testnet Proof" trial. */
export const GENESIS_TRIAL_ID = 1;

/** Human label of the active trial (display only; not serialized on-chain). */
export const GENESIS_TRIAL_LABEL = "Avalanche Testnet Proof";

/** All four factions are allowed in the Genesis Frost season. */
export const ALLOWED_FACTIONS: number[] = [
  FACTION.GLACIERS,
  FACTION.AVALANCHE,
  FACTION.BLIZZARD,
  FACTION.THAW,
];

/** One contested + three home territories — one starting territory per faction. */
export const TERRITORY_COUNT = 4;

/** Genesis Frost shard count is the default `SHARD_COUNT` (4). */
export const GENESIS_SHARD_COUNT = SHARD_COUNT;

/** Underdog multiplier for the territory capture comparison. */
export const UNDERDOG_MULTIPLIER = 2;

/** Demo sponsor slot ("Demo DEX Trial"). */
export const SPONSOR_NAME = "Demo DEX Trial";
export const SPONSOR_ACTION_LABEL = "Swap on the demo DEX";
/** Sponsor slot status (0 = active/open display state). */
export const SPONSOR_STATUS = 0;

/**
 * Active-window length for the demo season. Localnet uses a long window so the
 * full submit flow fits comfortably; testnet uses a more generous window to
 * absorb real-clock latency.
 */
export function activeWindowMs(network: SuiNetwork): number {
  return network === "localnet"
    ? 24 * 60 * 60 * 1000 // 24h on localnet
    : 14 * 24 * 60 * 60 * 1000; // 14d on testnet
}

/**
 * Amount (in MIST) used to fund the demo `ImpactEscrow` on localnet. Small on
 * purpose — it is routed to the winning faction's verified recipient.
 */
export const IMPACT_FUND_MIST = 100_000_000; // 0.1 SUI

/**
 * The four verified recipient addresses (index = faction id) read from the
 * `IMPACT_RECIPIENT_*` env vars. Throws if any is missing so the escrow is
 * never funded with an unset/placeholder recipient.
 */
export function loadImpactRecipients(): string[] {
  const names = [
    "IMPACT_RECIPIENT_GLACIERS",
    "IMPACT_RECIPIENT_AVALANCHE",
    "IMPACT_RECIPIENT_BLIZZARD",
    "IMPACT_RECIPIENT_THAW",
  ] as const;
  const recipients = names.map((n) => {
    const value = process.env[n]?.trim();
    if (!value) {
      throw new Error(`missing required env ${n} (one Sui address per faction)`);
    }
    if (!value.startsWith("0x")) {
      throw new Error(`${n} must be a 0x Sui address; got "${value}"`);
    }
    return value;
  });
  return recipients;
}
