/**
 * Hermetic orchestrator endpoint tests (Task 9.8).
 *
 * Validates: Requirements 14.1, 14.2, 14.3, 15.2, 16.2, 18.1, 18.2.
 *
 * Runs entirely without a live chain: a fixture `deployed.localnet.json` in a
 * temp dir (via `YETI_ARTIFACT_DIR`) feeds the config loader, a mock
 * `ChainReader` stands in for `SuiClient`, and routes are driven with Fastify
 * `app.inject()`. Asserts /health + /config read ids from the artifact,
 * /proof/request identifies the bad field, the /player no-passport branch, the
 * /territory shape, the /demo/reset guard, and the full request→attest flow.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

import { buildApp, type AppDeps } from "./index.js";
import { loadConfig } from "./config.js";
import { loadOracleSigner } from "./oracle.js";
import { ProofStore } from "./proofStore.js";
import type { ChainReader } from "./chain.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PACKAGE_ID = "0x" + "a1".repeat(32);
const SEASON_OBJ = "0x" + "5e".repeat(32);
const ORACLE_REG = "0x" + "06".repeat(32);
const NULL_STORE = "0x" + "07".repeat(32);
const TERR_MAP = "0x" + "0e".repeat(32);
const IMPACT = "0x" + "11".repeat(32);
const SPONSOR = "0x" + "5b".repeat(32);
const SHARD_0 = "0x" + "50".repeat(32);
const RECIPIENTS = [
  "0x" + "a0".repeat(32),
  "0x" + "a1".repeat(32),
  "0x" + "a2".repeat(32),
  "0x" + "a3".repeat(32),
];

const PLAYER = "0x" + "ab".repeat(32);
const PASSPORT = "0x" + "cd".repeat(32);
const NO_PASSPORT_WALLET = "0x" + "ff".repeat(32);

const FIXTURE_ARTIFACT = {
  network: "localnet",
  packageId: PACKAGE_ID,
  adminCap: "0x" + "ad".repeat(32),
  oracleRegistryId: ORACLE_REG,
  nullifierStoreId: NULL_STORE,
  seasonId: SEASON_OBJ,
  seasonNumber: 1,
  trialId: 1,
  shards: [
    { objectId: SHARD_0, faction: 1, shard: 0 },
    { objectId: "0x" + "51".repeat(32), faction: 1, shard: 1 },
  ],
  territoryMapId: TERR_MAP,
  sponsorSlotId: SPONSOR,
  impactEscrowId: IMPACT,
  recipients: RECIPIENTS,
};

const mockChain: ChainReader = {
  readPassport: async (owner: string) =>
    owner.toLowerCase() === PLAYER
      ? {
          passportId: PASSPORT,
          factionId: 1,
          rawReputation: 100n,
          acceptedProofCount: 1n,
        }
      : null,
  readTerritory: async () => ({
    seasonId: 1n,
    finalized: false,
    owners: [0, 1, 2, 3],
    finalizedPower: [0n, 0n, 0n, 0n],
    underdogMultiplier: 2n,
    shardTotals: [
      { factionId: 1, rawScoreTotal: 100n, territoryPowerTotal: 50n, acceptedProofCount: 1n },
    ],
    impact: { escrowId: IMPACT, balance: 100_000_000n, disbursed: false, recipients: RECIPIENTS },
  }),
  ownsDemoObject: async () => false,
};

let tmp: string;

/** Build app deps from the fixture artifact + env, with the mock chain. */
function makeDeps(opts: { demoMode?: boolean; allowlist?: string[] } = {}): AppDeps {
  if (opts.demoMode) process.env["DEMO_MODE"] = "true";
  else delete process.env["DEMO_MODE"];
  if (opts.allowlist) process.env["DEMO_ALLOWLIST"] = opts.allowlist.join(",");
  else delete process.env["DEMO_ALLOWLIST"];

  const config = loadConfig("localnet");
  return {
    config,
    oracle: loadOracleSigner(),
    chain: mockChain,
    store: new ProofStore(),
  };
}

beforeEach(() => {
  tmp = mkdtempSync(resolve(tmpdir(), "yeti-orch-"));
  process.env["YETI_ARTIFACT_DIR"] = tmp;
  process.env["SUI_NETWORK"] = "localnet";
  process.env["ORACLE_PRIVATE_KEY"] = "0x" + "01".repeat(32);
  writeFileSync(
    resolve(tmp, "deployed.localnet.json"),
    JSON.stringify(FIXTURE_ARTIFACT, null, 2),
  );
});

afterEach(() => {
  delete process.env["YETI_ARTIFACT_DIR"];
  delete process.env["SUI_NETWORK"];
  delete process.env["ORACLE_PRIVATE_KEY"];
  delete process.env["DEMO_MODE"];
  delete process.env["DEMO_ALLOWLIST"];
  rmSync(tmp, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// /health (Requirements 14.1, 14.3)
// ---------------------------------------------------------------------------

describe("GET /health", () => {
  it("returns status, network, packageId, activeSeason, oracle key id from the artifact", async () => {
    const app: FastifyInstance = buildApp(makeDeps());
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body.network).toBe("localnet");
    expect(body.packageId).toBe(PACKAGE_ID); // read from artifact
    expect(body.activeSeason).toBe("1");
    expect(body.oracleSignerKeyId).toMatch(/^0x[0-9a-f]{64}$/);
    await app.close();
  });
});

// ---------------------------------------------------------------------------
// /config (Requirements 14.2, 14.3)
// ---------------------------------------------------------------------------

describe("GET /config", () => {
  it("returns required ids/constants read from the artifact", async () => {
    const app = buildApp(makeDeps());
    const res = await app.inject({ method: "GET", url: "/config" });
    expect(res.statusCode).toBe(200);
    const cfg = res.json();

    expect(cfg.network).toBe("localnet");
    expect(cfg.packageId).toBe(PACKAGE_ID);
    expect(cfg.factions).toHaveLength(4);
    expect(cfg.provenanceTiers).toHaveLength(3);
    expect(cfg.activeSeasonId).toBe("1");
    expect(cfg.activeTrialId).toBe("1");
    expect(cfg.territoryCount).toBe(4);
    expect(cfg.shardCount).toBe(4);

    // Object ids come straight from the fixture artifact (Requirement 14.3).
    expect(cfg.objectIds.seasonId).toBe(SEASON_OBJ);
    expect(cfg.objectIds.oracleRegistryId).toBe(ORACLE_REG);
    expect(cfg.objectIds.nullifierStoreId).toBe(NULL_STORE);
    expect(cfg.objectIds.territoryMapId).toBe(TERR_MAP);
    expect(cfg.objectIds.impactEscrowId).toBe(IMPACT);
    expect(cfg.objectIds.sponsorSlotId).toBe(SPONSOR);
    expect(cfg.objectIds.shards).toHaveLength(2);
    expect(cfg.objectIds.shards[0].objectId).toBe(SHARD_0);
    expect(cfg.oraclePublicKey).toMatch(/^0x[0-9a-f]{64}$/);
    await app.close();
  });
});

// ---------------------------------------------------------------------------
// /proof/request (Requirements 16.1, 16.2)
// ---------------------------------------------------------------------------

describe("POST /proof/request", () => {
  it("identifies a missing/invalid wallet field", async () => {
    const app = buildApp(makeDeps());
    const res = await app.inject({
      method: "POST",
      url: "/proof/request",
      payload: { passportId: PASSPORT, seasonId: 1, trialId: 1, factionId: 1 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe("wallet");
    await app.close();
  });

  it("identifies a season that does not match the active config", async () => {
    const app = buildApp(makeDeps());
    const res = await app.inject({
      method: "POST",
      url: "/proof/request",
      payload: { wallet: PLAYER, passportId: PASSPORT, seasonId: 999, trialId: 1, factionId: 1 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe("seasonId");
    await app.close();
  });

  it("identifies an out-of-range faction", async () => {
    const app = buildApp(makeDeps());
    const res = await app.inject({
      method: "POST",
      url: "/proof/request",
      payload: { wallet: PLAYER, passportId: PASSPORT, seasonId: 1, trialId: 1, factionId: 9 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe("factionId");
    await app.close();
  });

  it("accepts a valid request and returns a pendingProofId", async () => {
    const app = buildApp(makeDeps());
    const res = await app.inject({
      method: "POST",
      url: "/proof/request",
      payload: { wallet: PLAYER, passportId: PASSPORT, seasonId: 1, trialId: 1, factionId: 1 },
    });
    expect(res.statusCode).toBe(201);
    expect(typeof res.json().pendingProofId).toBe("string");
    await app.close();
  });
});

// ---------------------------------------------------------------------------
// /player/:address (Requirements 15.1, 15.2)
// ---------------------------------------------------------------------------

describe("GET /player/:address", () => {
  it("returns the no-passport branch for a wallet with none", async () => {
    const app = buildApp(makeDeps());
    const res = await app.inject({ method: "GET", url: `/player/${NO_PASSPORT_WALLET}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.hasPassport).toBe(false);
    expect(body.passportId).toBeNull();
    expect(body.factionId).toBeNull();
    expect(body.rawReputation).toBeNull();
    await app.close();
  });

  it("returns passport state for a wallet that owns one", async () => {
    const app = buildApp(makeDeps());
    const res = await app.inject({ method: "GET", url: `/player/${PLAYER}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.hasPassport).toBe(true);
    expect(body.passportId).toBe(PASSPORT);
    expect(body.factionId).toBe(1);
    expect(body.rawReputation).toBe("100");
    expect(body.acceptedProofCount).toBe("1");
    await app.close();
  });
});

// ---------------------------------------------------------------------------
// /territory (Requirement 18.1)
// ---------------------------------------------------------------------------

describe("GET /territory", () => {
  it("returns the territory shape with shard totals and impact status", async () => {
    const app = buildApp(makeDeps());
    const res = await app.inject({ method: "GET", url: "/territory" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.seasonId).toBe("1");
    expect(body.owners).toEqual([0, 1, 2, 3]);
    expect(body.underdogMultiplier).toBe("2");
    expect(body.shardTotals[0].territoryPowerTotal).toBe("50");
    expect(body.impact.balance).toBe("100000000");
    expect(body.impact.disbursed).toBe(false);
    await app.close();
  });
});

// ---------------------------------------------------------------------------
// /demo/reset guard (Requirements 18.2, 18.3)
// ---------------------------------------------------------------------------

describe("POST /demo/reset", () => {
  it("rejects the request while DEMO_MODE is disabled", async () => {
    const app = buildApp(makeDeps({ demoMode: false }));
    const res = await app.inject({ method: "POST", url: "/demo/reset" });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("clears only the in-memory store while DEMO_MODE is enabled", async () => {
    const deps = makeDeps({ demoMode: true });
    deps.store.create({
      wallet: PLAYER,
      passportId: PASSPORT,
      seasonId: 1n,
      trialId: 1n,
      factionId: 1,
    });
    const app = buildApp(deps);
    const res = await app.inject({ method: "POST", url: "/demo/reset" });
    expect(res.statusCode).toBe(200);
    expect(res.json().cleared).toBe(1);
    expect(deps.store.size()).toBe(0);
    await app.close();
  });
});

// ---------------------------------------------------------------------------
// Full request -> attest flow (Requirements 17.1–17.4)
// ---------------------------------------------------------------------------

describe("POST /proof/attest", () => {
  it("signs for an allowlisted wallet and returns a 64-byte signature, tier 2", async () => {
    const app = buildApp(makeDeps({ allowlist: [PLAYER] }));
    const reqRes = await app.inject({
      method: "POST",
      url: "/proof/request",
      payload: { wallet: PLAYER, passportId: PASSPORT, seasonId: 1, trialId: 1, factionId: 1 },
    });
    const { pendingProofId } = reqRes.json();

    const res = await app.inject({
      method: "POST",
      url: "/proof/attest",
      payload: { pendingProofId, wallet: PLAYER, passportId: PASSPORT },
    });
    expect(res.statusCode).toBe(200);
    const att = res.json();
    expect(att.signature).toHaveLength(64);
    expect(att.provenanceTier).toBe(2);
    expect(att.proofSource).toBe("Oracle-Attested Demo Proof");
    await app.close();
  });

  it("returns 403 and no signature when the demo condition fails", async () => {
    const app = buildApp(makeDeps({ allowlist: [] }));
    const reqRes = await app.inject({
      method: "POST",
      url: "/proof/request",
      payload: { wallet: PLAYER, passportId: PASSPORT, seasonId: 1, trialId: 1, factionId: 1 },
    });
    const { pendingProofId } = reqRes.json();

    const res = await app.inject({
      method: "POST",
      url: "/proof/attest",
      payload: { pendingProofId, wallet: PLAYER, passportId: PASSPORT },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().signature).toBeUndefined();
    await app.close();
  });
});
