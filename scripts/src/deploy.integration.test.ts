/**
 * Deploy/init artifact-completeness integration test (Task 8.5, Requirements
 * 21.1, 21.2, 21.4).
 *
 * This test requires a LIVE localnet (`sui start --force-regenesis` + faucet)
 * and a funded admin key, plus the oracle/recipient env vars. When those are
 * present it runs the real flow — publish → init/all → registerOracle — and
 * asserts `deployed.localnet.json` is fully populated. When they are NOT
 * present (e.g. CI without a validator), every case is SKIPPED with a clear
 * console note, so the suite never fakes on-chain results.
 *
 * It writes its artifact to a temp dir (via `YETI_ARTIFACT_DIR`) so the real
 * `deployed.localnet.json` is never touched.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SuiClient } from "@mysten/sui/client";
import { getFaucetHost, requestSuiFromFaucetV1 } from "@mysten/sui/faucet";

import { getRpcUrl, loadArtifact, type DeployedArtifact } from "./lib.js";

const RPC_URL = getRpcUrl("localnet");

interface Readiness {
  ok: boolean;
  reasons: string[];
}

/** Probe localnet reachability + required env, with a short timeout. */
async function checkReadiness(): Promise<Readiness> {
  const reasons: string[] = [];

  // Required env for the full flow.
  if (!process.env["ADMIN_PRIVATE_KEY"] && !process.env["ADMIN_KEYSTORE_PATH"]) {
    reasons.push("no ADMIN_PRIVATE_KEY / ADMIN_KEYSTORE_PATH");
  }
  if (!process.env["ORACLE_PUBLIC_KEY"]) reasons.push("no ORACLE_PUBLIC_KEY");
  for (const n of [
    "IMPACT_RECIPIENT_GLACIERS",
    "IMPACT_RECIPIENT_AVALANCHE",
    "IMPACT_RECIPIENT_BLIZZARD",
    "IMPACT_RECIPIENT_THAW",
  ]) {
    if (!process.env[n]) reasons.push(`no ${n}`);
  }

  // Reachability probe.
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

let ready = false;
let tmp: string;

beforeAll(async () => {
  tmp = mkdtempSync(resolve(tmpdir(), "yeti-deploy-it-"));
  process.env["YETI_ARTIFACT_DIR"] = tmp;
  process.env["SUI_NETWORK"] = "localnet";

  const r = await checkReadiness();
  ready = r.ok;
  if (!ready) {
    console.warn(
      `[deploy.integration] SKIPPED — live localnet deploy not run. Reasons: ${r.reasons.join("; ")}`,
    );
  }
}, 30_000);

afterAll(() => {
  delete process.env["YETI_ARTIFACT_DIR"];
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

describe("deploy + init populates the localnet artifact", () => {
  it(
    "publishes, inits, registers the oracle, and fully populates deployed.localnet.json",
    async (ctx) => {
      if (!ready) {
        ctx.skip();
        return;
      }

      // Lazy-import the flow so the heavy modules load only when the test runs.
      const { adminAddress } = await import("./lib.js");
      const { publishPackage } = await import("./publish.js");
      const { initAll } = await import("./init/all.js");
      const { registerOracle } = await import("./registerOracle.js");

      const client = new SuiClient({ url: RPC_URL });

      // Fund the admin from the localnet faucet (best-effort; ignore if already funded).
      try {
        await requestSuiFromFaucetV1({
          host: getFaucetHost("localnet"),
          recipient: adminAddress(),
        });
        // Give the faucet tx a moment to land.
        await new Promise((r) => setTimeout(r, 2000));
      } catch (err) {
        console.warn(`[deploy.integration] faucet request failed (continuing): ${String(err)}`);
      }

      await publishPackage(client);
      await initAll(client);
      await registerOracle(client);

      const artifact: DeployedArtifact = loadArtifact("localnet");

      expect(artifact.network).toBe("localnet");
      expect(artifact.packageId).toBeTruthy();
      expect(artifact.adminCap).toBeTruthy();
      expect(artifact.oracleRegistryId).toBeTruthy();
      expect(artifact.nullifierStoreId).toBeTruthy();
      expect(artifact.seasonId).toBeTruthy();
      expect(artifact.territoryMapId).toBeTruthy();
      expect(artifact.sponsorSlotId).toBeTruthy();
      expect(artifact.impactEscrowId).toBeTruthy();

      // 4 factions × SHARD_COUNT(4) = 16 shards.
      expect(Array.isArray(artifact.shards)).toBe(true);
      expect(artifact.shards!.length).toBe(16);
      for (const s of artifact.shards!) {
        expect(s.objectId).toBeTruthy();
        expect(s.faction).toBeGreaterThanOrEqual(0);
        expect(s.faction).toBeLessThanOrEqual(3);
      }

      // 4 verified recipients.
      expect(artifact.recipients?.length).toBe(4);
    },
    300_000,
  );
});
