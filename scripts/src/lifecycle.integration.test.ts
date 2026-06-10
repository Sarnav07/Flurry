/**
 * Phase-7 lifecycle integration test (Task 10, Requirements 22.1–22.5).
 *
 * Drives the full on-chain lifecycle against a LIVE localnet:
 *   submit → accept (ProofAccepted, shard + passport updated)        [22.1]
 *   replay → E_REUSED_NULLIFIER                                       [22.2]
 *   close + finalize_territory → TerritoryFinalized                  [22.3]
 *   settle + disburse → ImpactFinalized + recipient balance increase [22.4]
 *   cleanup create+delete → CleanupBatchDeleted + both stores shrink [22.5]
 *
 * It requires a localnet validator + funded admin key + oracle key + the four
 * recipient addresses. When any are missing it SKIPS with a printed reason —
 * it never fakes on-chain results.
 *
 * Because `close_season` requires `now >= Season.end_ms`, this test creates a
 * dedicated SHORT-WINDOW season (it does NOT use the long demo `init/season`
 * window) and waits out the window between submit and finalize. The attestation
 * is built in-process from `ORACLE_PRIVATE_KEY` using the shared byte-identical
 * modules (no running orchestrator needed); `ORACLE_PUBLIC_KEY` is set to that
 * key so the registry authorizes exactly the signer.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SuiClient } from "@mysten/sui/client";
import { getFaucetHost, requestSuiFromFaucetV1 } from "@mysten/sui/faucet";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { fromBase64, fromHex, toHex } from "@mysten/sui/utils";
import {
  ABORT_CODE,
  DOMAIN_BYTES,
  FACTION,
  PROVENANCE_TIER,
  buildSignedMessage,
  deriveNullifier,
  type AttestationResponse,
  type ProofPayload,
  type WireProofPayload,
} from "@yeti-trials/shared";

import {
  createdObjectIdByType,
  getRpcUrl,
  loadAdminKeypair,
  loadArtifact,
  mergeArtifact,
  requireArtifactField,
  signAndRun,
  target,
} from "./lib.js";
import {
  ALLOWED_FACTIONS,
  GENESIS_SEASON_ID,
  GENESIS_SHARD_COUNT,
  GENESIS_TRIAL_ID,
  TERRITORY_COUNT,
} from "./genesis.js";
import { CLOCK_ID } from "./lifecycle.js";
import { submitProof } from "./submitProof.js";
import { finalizeTerritory } from "./finalizeTerritory.js";
import { finalizeImpact } from "./finalizeImpact.js";
import { cleanupBatch } from "./cleanupBatch.js";

const RPC_URL = getRpcUrl("localnet");
/** Short active window so the season is closeable within the test run. */
const WINDOW_MS = 12_000;

interface Readiness {
  ok: boolean;
  reasons: string[];
}

async function checkReadiness(): Promise<Readiness> {
  const reasons: string[] = [];
  if (!process.env["ADMIN_PRIVATE_KEY"] && !process.env["ADMIN_KEYSTORE_PATH"]) {
    reasons.push("no ADMIN_PRIVATE_KEY / ADMIN_KEYSTORE_PATH");
  }
  if (!process.env["ORACLE_PRIVATE_KEY"]) reasons.push("no ORACLE_PRIVATE_KEY");
  for (const n of [
    "IMPACT_RECIPIENT_GLACIERS",
    "IMPACT_RECIPIENT_AVALANCHE",
    "IMPACT_RECIPIENT_BLIZZARD",
    "IMPACT_RECIPIENT_THAW",
  ]) {
    if (!process.env[n]) reasons.push(`no ${n}`);
  }
  try {
    const client = new SuiClient({ url: RPC_URL });
    await Promise.race([
      client.getChainIdentifier(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 2500)),
    ]);
  } catch {
    reasons.push(`localnet not reachable at ${RPC_URL}`);
  }
  return { ok: reasons.length === 0, reasons };
}

/** Parse the oracle Ed25519 keypair from ORACLE_PRIVATE_KEY (suiprivkey/hex/base64). */
function oracleKeypairFromEnv(): Ed25519Keypair {
  const raw = (process.env["ORACLE_PRIVATE_KEY"] ?? "").trim();
  if (raw.startsWith("suiprivkey")) {
    const { secretKey } = decodeSuiPrivateKey(raw);
    return Ed25519Keypair.fromSecretKey(secretKey);
  }
  if (raw.startsWith("0x")) return Ed25519Keypair.fromSecretKey(fromHex(raw));
  const bytes = fromBase64(raw);
  return Ed25519Keypair.fromSecretKey(bytes.length === 33 ? bytes.slice(1) : bytes);
}

const ENC = new TextEncoder();
const PROOF_SOURCE_BYTES = Array.from(ENC.encode("Oracle-Attested Demo Proof"));

let ready = false;
let tmp: string;

beforeAll(async () => {
  tmp = mkdtempSync(resolve(tmpdir(), "yeti-lifecycle-it-"));
  process.env["YETI_ARTIFACT_DIR"] = tmp;
  process.env["SUI_NETWORK"] = "localnet";
  const r = await checkReadiness();
  ready = r.ok;
  if (!ready) {
    console.warn(
      `[lifecycle.integration] SKIPPED — live localnet lifecycle not run. Reasons: ${r.reasons.join("; ")}`,
    );
  }
}, 30_000);

afterAll(() => {
  delete process.env["YETI_ARTIFACT_DIR"];
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

describe("full lifecycle on localnet", () => {
  it(
    "submit/accept + replay + finalizeTerritory + finalizeImpact + cleanupBatch",
    async (ctx) => {
      if (!ready) {
        ctx.skip();
        return;
      }

      const client = new SuiClient({ url: RPC_URL });
      const admin = loadAdminKeypair();
      const adminAddr = admin.getPublicKey().toSuiAddress();

      // Oracle key: register exactly the signer derived from ORACLE_PRIVATE_KEY.
      const oracleKp = oracleKeypairFromEnv();
      const oraclePk = Array.from(oracleKp.getPublicKey().toRawBytes());
      process.env["ORACLE_PUBLIC_KEY"] = "0x" + toHex(Uint8Array.from(oraclePk));

      // Fund the admin (best-effort).
      try {
        await requestSuiFromFaucetV1({ host: getFaucetHost("localnet"), recipient: adminAddr });
        await new Promise((r) => setTimeout(r, 2000));
      } catch (err) {
        console.warn(`[lifecycle.integration] faucet request failed (continuing): ${String(err)}`);
      }

      // Lazy-import the deploy/init flow.
      const { publishPackage } = await import("./publish.js");
      const { initShards } = await import("./init/shards.js");
      const { initTerritory } = await import("./init/territory.js");
      const { initSponsor } = await import("./init/sponsor.js");
      const { initImpact } = await import("./init/impact.js");
      const { registerOracle } = await import("./registerOracle.js");

      // 1. Publish.
      await publishPackage(client);
      const packageId = requireArtifactField(loadArtifact("localnet"), "packageId");

      // 2. Create a SHORT-WINDOW season (active now, ends soon).
      const now = Date.now();
      const startMs = Math.max(0, now - 60_000);
      const endMs = now + WINDOW_MS;
      const seasonTx = new Transaction();
      seasonTx.moveCall({
        target: target(packageId, "season", "new_season"),
        arguments: [
          seasonTx.pure.u64(GENESIS_SEASON_ID),
          seasonTx.pure.u64(startMs),
          seasonTx.pure.u64(endMs),
          seasonTx.pure.vector("u8", ALLOWED_FACTIONS),
          seasonTx.pure.vector("u8", Array.from(ENC.encode("localnet"))),
          seasonTx.pure.address(packageId),
          seasonTx.pure.u64(GENESIS_TRIAL_ID),
          seasonTx.pure.u64(TERRITORY_COUNT),
          seasonTx.pure.u64(GENESIS_SHARD_COUNT),
        ],
      });
      const seasonRes = await signAndRun(seasonTx, { client });
      const seasonId = createdObjectIdByType(seasonRes, "::season::Season");
      mergeArtifact(
        { seasonId, seasonNumber: GENESIS_SEASON_ID, trialId: GENESIS_TRIAL_ID },
        "localnet",
      );

      // 3. Init shards / territory / sponsor / impact.
      await initShards(client);
      await initTerritory(client);
      await initSponsor(client);
      await initImpact(client);

      // 4. Authorize the oracle signer.
      await registerOracle(client);

      // 5. Create the player passport (admin acts as player), faction Avalanche.
      const factionId = FACTION.AVALANCHE;
      const passTx = new Transaction();
      passTx.moveCall({
        target: target(packageId, "passport", "create_passport_with_faction"),
        arguments: [passTx.object(seasonId), passTx.pure.u8(factionId), passTx.object(CLOCK_ID)],
      });
      const passRes = await signAndRun(passTx, { client, signer: admin });
      const passportId = createdObjectIdByType(passRes, "::passport::YetiPassport");

      // 6. Build the attestation in-process (oracle-signed), wallet = admin.
      const score = 100n;
      const territoryPower = 50n;
      const nonce = BigInt(Math.floor(Math.random() * 1e9));
      const issuedMs = BigInt(Date.now());
      const expiryMs = issuedMs + 60_000n; // generous; checked at submit time
      const nullifier = deriveNullifier({
        seasonId: BigInt(GENESIS_SEASON_ID),
        trialId: BigInt(GENESIS_TRIAL_ID),
        factionId,
        passportId,
        wallet: adminAddr,
        nonce,
      });
      const payload: ProofPayload = {
        network: Array.from(ENC.encode("localnet")),
        packageId,
        seasonId: BigInt(GENESIS_SEASON_ID),
        trialId: BigInt(GENESIS_TRIAL_ID),
        factionId,
        passportId,
        wallet: adminAddr,
        proofSource: PROOF_SOURCE_BYTES,
        provenanceTier: PROVENANCE_TIER.ORACLE,
        score,
        territoryPower,
        issuedMs,
        expiryMs,
        nonce,
        nullifier,
      };
      const signedMessage = buildSignedMessage(DOMAIN_BYTES, payload);
      const signature = Array.from(await oracleKp.sign(signedMessage));
      const wire: WireProofPayload = {
        network: payload.network as number[],
        packageId,
        seasonId: String(GENESIS_SEASON_ID),
        trialId: String(GENESIS_TRIAL_ID),
        factionId,
        passportId,
        wallet: adminAddr,
        proofSource: PROOF_SOURCE_BYTES,
        provenanceTier: PROVENANCE_TIER.ORACLE,
        score: score.toString(),
        territoryPower: territoryPower.toString(),
        issuedMs: issuedMs.toString(),
        expiryMs: expiryMs.toString(),
        nonce: nonce.toString(),
        nullifier: Array.from(nullifier),
      };
      const attestation: AttestationResponse = {
        payload: wire,
        signature,
        nullifier: Array.from(nullifier),
        expiry: expiryMs.toString(),
        score: score.toString(),
        territoryPower: territoryPower.toString(),
        proofSource: "Oracle-Attested Demo Proof",
        provenanceTier: 2,
      };

      // 7. Submit → ProofAccepted (22.1).
      const accept = await submitProof({
        client,
        attestation,
        signer: admin,
        publicKey: oraclePk,
      });
      expect(accept.accepted).toBe(true);
      expect(accept.event).toBeTruthy();

      // Passport reputation == score; shard raw_score_total increased.
      const passObj = await client.getObject({ id: passportId, options: { showContent: true } });
      const passFields = (passObj.data?.content as { fields: Record<string, unknown> }).fields;
      expect(String(passFields["raw_reputation"])).toBe(score.toString());

      const shardObj = await client.getObject({ id: accept.shardId, options: { showContent: true } });
      const shardFields = (shardObj.data?.content as { fields: Record<string, unknown> }).fields;
      expect(BigInt(String(shardFields["raw_score_total"]))).toBe(score);
      expect(BigInt(String(shardFields["territory_power_total"]))).toBe(territoryPower);

      // 8. Replay → E_REUSED_NULLIFIER (22.2).
      const replay = await submitProof({
        client,
        attestation,
        signer: admin,
        publicKey: oraclePk,
        expectReplay: true,
      });
      expect(replay.accepted).toBe(false);
      expect(replay.abortCode).toBe(ABORT_CODE.E_REUSED_NULLIFIER);

      // 9. Wait out the season window so close_season is allowed.
      const waitMs = endMs - Date.now() + 2_000;
      if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));

      // 10. close + finalize_territory → TerritoryFinalized (22.3).
      const terr = await finalizeTerritory({ client, signer: admin });
      expect(terr.finalized).toBe(true);
      expect(terr.event).toBeTruthy();

      // 11. settle + disburse → ImpactFinalized + recipient balance increase (22.4).
      const impact = await finalizeImpact({ client, signer: admin });
      expect(impact.event).toBeTruthy();
      // Increase holds unless the recipient happens to be the gas-paying signer.
      if (impact.recipient.toLowerCase() !== adminAddr.toLowerCase()) {
        expect(impact.increased).toBe(true);
      }

      // 12. cleanup create+delete → CleanupBatchDeleted + both stores shrink (22.5).
      const cleanup = await cleanupBatch({ client, signer: admin });
      expect(cleanup.event).toBeTruthy();
      expect(cleanup.bothReduced).toBe(true);
      expect(cleanup.nullifierCountAfter).toBeLessThan(cleanup.nullifierCountBefore);
      expect(cleanup.acceptedKeyCountAfter).toBeLessThan(cleanup.acceptedKeyCountBefore);
    },
    300_000,
  );
});
