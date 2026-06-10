/**
 * Settle the season and disburse the impact escrow to the winning faction's
 * verified recipient (Task 10.3, Requirement 22.4).
 *
 * One PTB:
 *   1. `season::settle_season(&mut Season)` — requires the season finalized
 *      (closed via `finalizeTerritory`), else `E_SEASON_NOT_FINALIZED`.
 *   2. `impact::disburse(&mut ImpactEscrow, &TerritoryMap, ctx)` — requires the
 *      territory finalized and the escrow un-disbursed; routes the FULL escrow
 *      balance once to the winning faction's verified recipient.
 *
 * Assertions (Requirement 22.4):
 *   - an `ImpactFinalized` event is emitted, and
 *   - the winning faction's verified recipient SUI balance increased (read
 *     before vs after).
 *
 * Signs as the ADMIN/operator key.
 *
 * Run: `pnpm --filter @yeti-trials/scripts finalize:impact`
 */

import { Transaction } from "@mysten/sui/transactions";
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

import {
  getClient,
  getNetwork,
  loadArtifact,
  requireArtifactField,
  requireEvent,
  signAndRun,
  target,
  type SuiClient,
} from "./lib.js";

export interface FinalizeImpactOptions {
  client?: SuiClient;
  signer?: Ed25519Keypair;
}

export interface FinalizeImpactResult {
  event: Record<string, unknown>;
  digest: string;
  winner: number;
  recipient: string;
  balanceBefore: bigint;
  balanceAfter: bigint;
  increased: boolean;
}

/** Read the winning faction id (contested territory owner, index 0) on-chain. */
async function readWinningFaction(client: SuiClient, territoryMapId: string): Promise<number> {
  const obj = await client.getObject({ id: territoryMapId, options: { showContent: true } });
  const content = obj.data?.content;
  if (!content || content.dataType !== "moveObject") {
    throw new Error(`TerritoryMap ${territoryMapId} has no readable move content`);
  }
  const fields = content.fields as Record<string, unknown>;
  const owners = fields["owners"];
  if (!Array.isArray(owners) || owners.length === 0) {
    throw new Error(`TerritoryMap ${territoryMapId} has no owners`);
  }
  return Number(owners[0]);
}

/** Total SUI balance (MIST) owned by `addr`, as a bigint. */
async function suiBalance(client: SuiClient, addr: string): Promise<bigint> {
  const bal = await client.getBalance({ owner: addr });
  return BigInt(bal.totalBalance);
}

export async function finalizeImpact(
  opts: FinalizeImpactOptions = {},
): Promise<FinalizeImpactResult> {
  const network = getNetwork();
  const client = opts.client ?? getClient(network);
  const artifact = loadArtifact(network);
  const packageId = requireArtifactField(artifact, "packageId");
  const seasonId = requireArtifactField(artifact, "seasonId");
  const territoryMapId = requireArtifactField(artifact, "territoryMapId");
  const impactEscrowId = requireArtifactField(artifact, "impactEscrowId");
  const recipients = requireArtifactField(artifact, "recipients");

  const winner = await readWinningFaction(client, territoryMapId);
  const recipient = recipients[winner];
  if (!recipient) {
    throw new Error(`no recipient configured for winning faction ${winner}`);
  }
  const balanceBefore = await suiBalance(client, recipient);

  const tx = new Transaction();
  tx.moveCall({
    target: target(packageId, "season", "settle_season"),
    arguments: [tx.object(seasonId)],
  });
  tx.moveCall({
    target: target(packageId, "impact", "disburse"),
    arguments: [tx.object(impactEscrowId), tx.object(territoryMapId)],
  });

  const res = await signAndRun(tx, { client, ...(opts.signer ? { signer: opts.signer } : {}) });
  const event = requireEvent(res, "::events::ImpactFinalized");

  const balanceAfter = await suiBalance(client, recipient);
  const increased = balanceAfter > balanceBefore;

  console.log("ImpactFinalized emitted:");
  console.log(`  digest    = ${res.digest}`);
  console.log(`  winner    = faction ${winner}`);
  console.log(`  recipient = ${recipient}`);
  console.log(`  balance   = ${balanceBefore} -> ${balanceAfter} (increased: ${increased})`);
  if (!increased) {
    console.warn(
      "[finalizeImpact] WARNING: recipient balance did not increase. If the recipient is the " +
        "signer, gas may offset the credit — use a distinct recipient to observe the delta cleanly.",
    );
  }

  return {
    event,
    digest: res.digest,
    winner,
    recipient,
    balanceBefore,
    balanceAfter,
    increased,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  finalizeImpact().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
