/**
 * Phase-8 full Genesis Frost localnet SMOKE TEST — the acceptance gate (Task
 * 11, Requirements 23.1–23.4).
 *
 * This is NOT feature development. It reuses, byte-for-byte, the existing
 * publish/init/register scripts, the Phase-7 lifecycle scripts (submitProof,
 * finalizeTerritory, finalizeImpact, cleanupBatch), the orchestrator
 * (`buildApp`/oracle/chain), and `lib.ts`/`lifecycle.ts`. It adds only the
 * end-to-end driver + the per-assertion PASS/FAIL ledger.
 *
 * What it proves on a REAL localnet validator (fresh, short-window season):
 *   publish → init → create_passport_with_faction (Avalanche) →
 *   orchestrator /player + /territory (real chain.ts reads) →
 *   /proof/request → /proof/attest (oracle path) →
 *   submit_proof (ProofAccepted + ScoreShardUpdated, dual passport + dual-channel
 *     shard updates) →
 *   in-window replay (E_REUSED_NULLIFIER) →
 *   close + finalize_territory (TerritoryFinalized, argmax owner) →
 *   settle + disburse (ImpactFinalized, recipient balance increase) →
 *   cleanup (CleanupBatchDeleted, BOTH stores shrink) →
 *   post-cleanup replay (E_SEASON_INACTIVE — season no longer active, NOT
 *     relying on the deleted nullifier).
 *
 * Exit semantics (Requirement 23.4):
 *   - Every assertion passes → exit 0 with the full SMOKE TEST REPORT + PASS
 *     ledger ("GATE PASSED").
 *   - Any assertion fails → STOP at the first failure, print the report with the
 *     exact failing invariant (observed vs expected), exit non-zero.
 *   - Localnet unreachable / required keys missing → print a clearly-labeled
 *     "SMOKE PENDING — not run" report and exit 0 (a PENDING/SKIP is NOT a pass;
 *     no on-chain result is faked).
 *
 * Run: `pnpm --filter @yeti-trials/scripts smoke`
 */

import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { SuiClient } from "@mysten/sui/client";
import { getFaucetHost, requestSuiFromFaucetV1 } from "@mysten/sui/faucet";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { fromBase64, fromHex, toHex } from "@mysten/sui/utils";
import {
  ABORT_CODE,
  FACTION,
  type AttestationResponse,
  type PlayerState,
  type TerritoryState,
} from "@yeti-trials/shared";

import {
  REPO_ROOT,
  createdObjectIdByType,
  getRpcUrl,
  loadAdminKeypair,
  loadArtifact,
  mergeArtifact,
  requireArtifactField,
  signAndRun,
  signAndRunAllowAbort,
  target,
} from "./lib.js";
import {
  ALLOWED_FACTIONS,
  GENESIS_SEASON_ID,
  GENESIS_SHARD_COUNT,
  GENESIS_TRIAL_ID,
  TERRITORY_COUNT,
} from "./genesis.js";
import { CLOCK_ID, parseAbortCode } from "./lifecycle.js";
import { submitProof, buildSubmitProofTx } from "./submitProof.js";
import { finalizeTerritory } from "./finalizeTerritory.js";
import { finalizeImpact } from "./finalizeImpact.js";
import { cleanupBatch } from "./cleanupBatch.js";
import {
  emptyReport,
  formatReport,
  type SmokeReport,
} from "./smokeReport.js";

const ENC = new TextEncoder();
const RPC_URL = getRpcUrl("localnet");
/** Active-season window; must comfortably cover passport+submit+replay. */
const WINDOW_MS = Number(process.env["SMOKE_WINDOW_MS"] ?? "30000");
const FACTION_NAMES = ["Glaciers", "Avalanche", "Blizzard", "Thaw"] as const;
const RECIPIENT_ENV = [
  "IMPACT_RECIPIENT_GLACIERS",
  "IMPACT_RECIPIENT_AVALANCHE",
  "IMPACT_RECIPIENT_BLIZZARD",
  "IMPACT_RECIPIENT_THAW",
] as const;

/** Thrown by {@link Gate.check} to STOP the flow at the first failing invariant. */
class SmokeAbort extends Error {}

/**
 * The PASS/FAIL ledger. `check` records the entry and, on failure, records the
 * first failing invariant on the report and throws to stop the run immediately.
 */
class Gate {
  constructor(private readonly report: SmokeReport) {}

  check(
    id: string,
    description: string,
    passed: boolean,
    expected: string,
    observed: string,
  ): void {
    this.report.assertions.push({ id, description, passed, expected, observed });
    const mark = passed ? "PASS" : "FAIL";
    console.log(`  [${mark}] ${id} — ${description} (observed: ${observed})`);
    if (!passed) {
      this.report.failure = { id, description, expected, observed };
      throw new SmokeAbort(`${id}: ${description}`);
    }
  }
}

// ===========================================================================
// Preflight
// ===========================================================================

interface Preflight {
  ok: boolean;
  reasons: string[];
  admin?: Ed25519Keypair;
  oracle?: Ed25519Keypair;
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

/** Resolve preconditions: admin key, oracle key, and a reachable localnet. */
async function preflight(): Promise<Preflight> {
  const reasons: string[] = [];

  let admin: Ed25519Keypair | undefined;
  try {
    admin = loadAdminKeypair();
  } catch {
    reasons.push("no admin key (set ADMIN_PRIVATE_KEY or ADMIN_KEYSTORE_PATH)");
  }

  let oracle: Ed25519Keypair | undefined;
  if (!process.env["ORACLE_PRIVATE_KEY"]?.trim()) {
    reasons.push("no ORACLE_PRIVATE_KEY");
  } else {
    try {
      oracle = oracleKeypairFromEnv();
    } catch (err) {
      reasons.push(`ORACLE_PRIVATE_KEY could not be parsed: ${String(err)}`);
    }
  }

  try {
    const client = new SuiClient({ url: RPC_URL });
    await Promise.race([
      client.getChainIdentifier(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000)),
    ]);
  } catch {
    reasons.push(`localnet not reachable at ${RPC_URL}`);
  }

  return {
    ok: reasons.length === 0,
    reasons,
    ...(admin ? { admin } : {}),
    ...(oracle ? { oracle } : {}),
  };
}

// ===========================================================================
// Static guard: no hard-coded package/object ids in scripts/orchestrator source
// ===========================================================================

/** Walk a dir recursively, returning all `.ts` operational source files. */
function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = resolve(dir, name);
    if (name === "node_modules" || name === "dist") continue;
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      out.push(...collectSourceFiles(full));
      continue;
    }
    if (!name.endsWith(".ts")) continue;
    // Exclude tests, generators, fixtures, the corpus, dev round-trip probes,
    // and the smoke harness itself — a hard-coded id only matters in
    // operational source. Case-insensitive so e.g. `proofRoundtrip.ts` matches.
    if (/(\.test\.|\.integration\.|conformance|corpus|roundtrip|fixture|smoke|^gen)/i.test(name)) {
      continue;
    }
    out.push(full);
  }
  return out;
}

/**
 * Find any 0x literal of >= 32 hex chars (a package/object-id signature),
 * EXCLUDING the all-zero sentinel address (`0x000…000`) and the short system
 * addresses (`0x1`/`0x2`/`0x3`/`0x6`), which are constants, not deployment ids.
 */
function scanForHardcodedIds(): { file: string; line: number; match: string }[] {
  const dirs = [
    resolve(REPO_ROOT, "scripts", "src"),
    resolve(REPO_ROOT, "orchestrator", "src"),
  ];
  const offenders: { file: string; line: number; match: string }[] = [];
  const re = /0x[0-9a-fA-F]{32,}/g;
  for (const dir of dirs) {
    for (const file of collectSourceFiles(dir)) {
      const text = readFileSync(file, "utf8");
      const lines = text.split("\n");
      lines.forEach((ln, i) => {
        const m = ln.match(re);
        if (m) {
          for (const hit of m) {
            // The all-zero address is a sentinel (e.g. dev-inspect sender), not
            // a real package/object id.
            if (/^0x0+$/.test(hit)) continue;
            offenders.push({ file: file.replace(REPO_ROOT + "/", ""), line: i + 1, match: hit });
          }
        }
      });
    }
  }
  return offenders;
}

// ===========================================================================
// Small chain-read helpers (object content fields)
// ===========================================================================

async function objectFields(
  client: SuiClient,
  id: string,
): Promise<Record<string, unknown>> {
  const obj = await client.getObject({ id, options: { showContent: true } });
  const content = obj.data?.content;
  if (!content || content.dataType !== "moveObject") {
    throw new Error(`object ${id} has no readable move content`);
  }
  return content.fields as Record<string, unknown>;
}

/** Distinct event type suffixes from a tx digest. */
async function eventTypesForDigest(client: SuiClient, digest: string): Promise<string[]> {
  const txb = await client.getTransactionBlock({ digest, options: { showEvents: true } });
  return (txb.events ?? []).map((e) => e.type);
}

/** A committed (or thrown) replay outcome: the digest and decoded abort code. */
interface ReplayOutcome {
  accepted: boolean;
  abortCode: number | null;
  digest: string;
}

/**
 * Submit the SAME attestation again and decode the abort, WITHOUT relying on the
 * SDK's automatic gas-budget dry-run. An intentionally-aborting transaction
 * makes the auto-budget dry-run throw ("could not automatically determine a
 * budget") instead of committing a failed tx, so we set an explicit gas budget:
 * the abort then commits as a failed transaction whose `effects.status.error`
 * carries the Move abort code we parse. (Reuses the exported `buildSubmitProofTx`
 * + `signAndRunAllowAbort` + `parseAbortCode`; no lifecycle/protocol changes.)
 */
async function replayAndDecode(
  client: SuiClient,
  attestation: AttestationResponse,
  oraclePk: number[],
  signer: Ed25519Keypair,
): Promise<ReplayOutcome> {
  const { tx } = await buildSubmitProofTx(client, attestation, oraclePk);
  tx.setGasBudget(200_000_000n);
  const run = await signAndRunAllowAbort(tx, { client, signer });
  return {
    accepted: run.success,
    abortCode: parseAbortCode(run.error),
    digest: run.response.digest,
  };
}

// ===========================================================================
// Recipient resolution (PREFER env; fall back to generated demo recipients)
// ===========================================================================

/**
 * Resolve the four verified recipients. Each `IMPACT_RECIPIENT_*` is preferred
 * from env; any unset slot falls back to a freshly-generated demo address. The
 * Avalanche slot (the demo winner) is forced to differ from the gas-paying
 * admin so the impact-disbursement delta is clean. The resolved values are
 * written back into `process.env` so the reused `init/impact.ts` picks them up
 * unchanged.
 */
function resolveRecipients(adminAddr: string): { recipients: string[]; source: string[] } {
  const recipients: string[] = [];
  const source: string[] = [];
  for (let i = 0; i < RECIPIENT_ENV.length; i++) {
    const envName = RECIPIENT_ENV[i]!;
    let value = process.env[envName]?.trim();
    let src = "env";
    if (!value || !value.startsWith("0x")) {
      value = Ed25519Keypair.generate().getPublicKey().toSuiAddress();
      src = "generated";
    }
    // The winner (Avalanche) recipient must NOT be the gas payer.
    if (i === FACTION.AVALANCHE && value.toLowerCase() === adminAddr.toLowerCase()) {
      value = Ed25519Keypair.generate().getPublicKey().toSuiAddress();
      src = "generated (env equalled admin)";
    }
    process.env[envName] = value;
    recipients.push(value);
    source.push(src);
  }
  return { recipients, source };
}

// ===========================================================================
// The live flow
// ===========================================================================

async function runFlow(
  report: SmokeReport,
  client: SuiClient,
  admin: Ed25519Keypair,
  oracle: Ed25519Keypair,
): Promise<void> {
  const gate = new Gate(report);
  const adminAddr = admin.getPublicKey().toSuiAddress();
  const playerAddr = adminAddr; // demo posture: admin wallet is the player
  const oraclePk = Array.from(oracle.getPublicKey().toRawBytes());

  // Lazy-import the deploy/init/orchestrator surfaces (reused, not reimplemented).
  const { publishPackage } = await import("./publish.js");
  const { initShards } = await import("./init/shards.js");
  const { initTerritory } = await import("./init/territory.js");
  const { initSponsor } = await import("./init/sponsor.js");
  const { initImpact } = await import("./init/impact.js");
  const { registerOracle } = await import("./registerOracle.js");
  const orch = await import("@yeti-trials/orchestrator");

  // --- 1. Publish -----------------------------------------------------------
  console.log("[smoke] publishing package…");
  await publishPackage(client);
  const packageId = requireArtifactField(loadArtifact("localnet"), "packageId");

  // Record the numeric season/trial so the season-independent init steps run
  // before the (short-window) Season object is created — this keeps the active
  // window pressure minimal (only passport+submit+replay must fit inside it).
  mergeArtifact({ seasonNumber: GENESIS_SEASON_ID, trialId: GENESIS_TRIAL_ID }, "localnet");

  // --- 2. Init shards / territory / sponsor / impact + register oracle ------
  console.log("[smoke] initializing shards/territory/sponsor/impact…");
  await initShards(client);
  await initTerritory(client);
  await initSponsor(client);
  await initImpact(client);
  await registerOracle(client);

  // --- 3. Create the SHORT-WINDOW Genesis Frost Season ----------------------
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
  mergeArtifact({ seasonId }, "localnet");
  report.transactions.push({ label: "new_season", digest: seasonRes.digest });
  console.log(`[smoke] season ${seasonId} active window ends in ${WINDOW_MS}ms`);

  // Capture resolved artifact ids for the report.
  const artifact = loadArtifact("localnet");
  report.artifactIds = {
    packageId,
    seasonId,
    oracleRegistryId: requireArtifactField(artifact, "oracleRegistryId"),
    nullifierStoreId: requireArtifactField(artifact, "nullifierStoreId"),
    territoryMapId: requireArtifactField(artifact, "territoryMapId"),
    impactEscrowId: requireArtifactField(artifact, "impactEscrowId"),
    sponsorSlotId: requireArtifactField(artifact, "sponsorSlotId"),
    adminCap: requireArtifactField(artifact, "adminCap"),
    shards: `${(artifact.shards ?? []).length} ScoreShard objects`,
  };

  // --- 4. create_passport_with_faction (Avalanche) --------------------------
  const factionId = FACTION.AVALANCHE;
  const passTx = new Transaction();
  passTx.moveCall({
    target: target(packageId, "passport", "create_passport_with_faction"),
    arguments: [passTx.object(seasonId), passTx.pure.u8(factionId), passTx.object(CLOCK_ID)],
  });
  const passRes = await signAndRun(passTx, { client, signer: admin });
  const passportId = createdObjectIdByType(passRes, "::passport::YetiPassport");
  report.transactions.push({ label: "create_passport", digest: passRes.digest });
  gate.check(
    "4.passport_created",
    "create_passport_with_faction created a YetiPassport",
    passportId.length > 0,
    "a passport object id",
    passportId,
  );

  // --- 5. Start orchestrator in-process; drive real chain reads -------------
  process.env["DEMO_MODE"] = "true";
  process.env["DEMO_ALLOWLIST"] = playerAddr.toLowerCase();
  const app = await orch.buildApp(orch.createDefaultDeps());

  // /player BEFORE submit — validates chain.ts passport parsing on real shapes.
  const playerBeforeRes = await app.inject({ method: "GET", url: `/player/${playerAddr}` });
  const playerBefore = playerBeforeRes.json() as PlayerState;
  gate.check(
    "5.player.hasPassport",
    "GET /player reads the real on-chain passport",
    playerBefore.hasPassport === true,
    "true",
    String(playerBefore.hasPassport),
  );
  gate.check(
    "5.player.faction",
    "GET /player reports the selected faction (Avalanche)",
    playerBefore.factionId === factionId,
    String(factionId),
    String(playerBefore.factionId),
  );
  gate.check(
    "5.player.rep0",
    "fresh passport raw_reputation is 0",
    playerBefore.rawReputation === "0",
    "0",
    String(playerBefore.rawReputation),
  );
  gate.check(
    "5.player.count0",
    "fresh passport accepted_proof_count is 0",
    playerBefore.acceptedProofCount === "0",
    "0",
    String(playerBefore.acceptedProofCount),
  );
  report.stateBefore = {
    "player.passportId": passportId,
    "player.faction": `${FACTION_NAMES[factionId]} (${factionId})`,
    "player.raw_reputation": String(playerBefore.rawReputation),
    "player.accepted_proof_count": String(playerBefore.acceptedProofCount),
    "shards (fresh)": "all raw_score_total / territory_power_total = 0",
  };

  // /territory BEFORE submit — validates chain.ts territory/shard/impact parsing.
  const terrBeforeRes = await app.inject({ method: "GET", url: "/territory" });
  const terrBefore = terrBeforeRes.json() as TerritoryState;
  gate.check(
    "5.territory.notFinalized",
    "GET /territory reports not-yet-finalized map",
    terrBefore.finalized === false,
    "false",
    String(terrBefore.finalized),
  );
  gate.check(
    "5.territory.notDisbursed",
    "GET /territory reports impact escrow not disbursed",
    terrBefore.impact.disbursed === false,
    "false",
    String(terrBefore.impact.disbursed),
  );

  // --- 6. /proof/request -> /proof/attest (oracle path) ---------------------
  const reqRes = await app.inject({
    method: "POST",
    url: "/proof/request",
    payload: {
      wallet: playerAddr,
      passportId,
      seasonId: GENESIS_SEASON_ID,
      trialId: GENESIS_TRIAL_ID,
      factionId,
    },
  });
  gate.check(
    "6.proof_request",
    "POST /proof/request returns a pendingProofId",
    reqRes.statusCode === 201,
    "201",
    `${reqRes.statusCode} ${reqRes.payload}`,
  );
  const pendingProofId = (reqRes.json() as { pendingProofId: string }).pendingProofId;

  const attRes = await app.inject({
    method: "POST",
    url: "/proof/attest",
    payload: { pendingProofId, wallet: playerAddr, passportId },
  });
  gate.check(
    "6.proof_attest",
    "POST /proof/attest returns a signed attestation",
    attRes.statusCode === 200,
    "200",
    `${attRes.statusCode} ${attRes.payload}`,
  );
  const attestation = attRes.json() as AttestationResponse;
  gate.check(
    "6.attest.tier",
    "attestation is Oracle-Attested (tier 2)",
    attestation.provenanceTier === 2,
    "2",
    String(attestation.provenanceTier),
  );
  gate.check(
    "6.attest.label",
    'attestation proof source is "Oracle-Attested Demo Proof"',
    attestation.proofSource === "Oracle-Attested Demo Proof",
    "Oracle-Attested Demo Proof",
    String(attestation.proofSource),
  );
  gate.check(
    "6.attest.sig",
    "attestation carries a raw 64-byte signature",
    Array.isArray(attestation.signature) && attestation.signature.length === 64,
    "64",
    String(attestation.signature?.length),
  );

  const score = attestation.payload.score; // decimal string
  const territoryPower = attestation.payload.territoryPower;

  // --- 7. submit_proof: ProofAccepted + ScoreShardUpdated + state deltas ----
  const accept = await submitProof({ client, attestation, signer: admin, publicKey: oraclePk });
  report.transactions.push({ label: "submit_proof", digest: accept.digest });
  gate.check(
    "7.accepted",
    "submit_proof accepted the proof",
    accept.accepted === true,
    "true",
    String(accept.accepted),
  );
  const submitEvents = await eventTypesForDigest(client, accept.digest);
  const hasProofAccepted = submitEvents.some((t) => t.endsWith("::events::ProofAccepted"));
  const hasShardUpdated = submitEvents.some((t) => t.endsWith("::events::ScoreShardUpdated"));
  gate.check(
    "7.event.ProofAccepted",
    "ProofAccepted event emitted",
    hasProofAccepted,
    "ProofAccepted present",
    submitEvents.join(", ") || "(none)",
  );
  gate.check(
    "7.event.ScoreShardUpdated",
    "ScoreShardUpdated event emitted",
    hasShardUpdated,
    "ScoreShardUpdated present",
    submitEvents.join(", ") || "(none)",
  );
  report.events = [...new Set(submitEvents)];

  // Passport: raw_reputation == score; accepted_proof_count incremented by 1.
  const passFields = await objectFields(client, passportId);
  gate.check(
    "7.passport.raw_reputation",
    "passport raw_reputation == accepted score",
    String(passFields["raw_reputation"]) === score,
    score,
    String(passFields["raw_reputation"]),
  );
  gate.check(
    "7.passport.count",
    "passport accepted_proof_count incremented by 1 (0 -> 1)",
    String(passFields["accepted_proof_count"]) === "1",
    "1",
    String(passFields["accepted_proof_count"]),
  );

  // Shard: raw_score_total += score; territory_power_total += territory_power.
  const shardFields = await objectFields(client, accept.shardId);
  gate.check(
    "7.shard.raw_score_total",
    "shard raw_score_total += score (0 -> score)",
    String(shardFields["raw_score_total"]) === score,
    score,
    String(shardFields["raw_score_total"]),
  );
  gate.check(
    "7.shard.territory_power_total",
    "shard territory_power_total += territory_power (0 -> territory_power)",
    String(shardFields["territory_power_total"]) === territoryPower,
    territoryPower,
    String(shardFields["territory_power_total"]),
  );
  report.stateAfter = {
    "player.raw_reputation": String(passFields["raw_reputation"]),
    "player.accepted_proof_count": String(passFields["accepted_proof_count"]),
    "shard.id": accept.shardId,
    "shard.raw_score_total": String(shardFields["raw_score_total"]),
    "shard.territory_power_total": String(shardFields["territory_power_total"]),
  };

  // /player AFTER submit — chain.ts reflects the real updated passport.
  const playerAfterRes = await app.inject({ method: "GET", url: `/player/${playerAddr}` });
  const playerAfter = playerAfterRes.json() as PlayerState;
  gate.check(
    "7.player.repAfter",
    "GET /player reflects updated raw_reputation == score",
    playerAfter.rawReputation === score,
    score,
    String(playerAfter.rawReputation),
  );
  gate.check(
    "7.player.countAfter",
    "GET /player reflects accepted_proof_count == 1",
    playerAfter.acceptedProofCount === "1",
    "1",
    String(playerAfter.acceptedProofCount),
  );

  // --- 8. In-window replay -> E_REUSED_NULLIFIER ----------------------------
  const replayInWindow = await replayAndDecode(client, attestation, oraclePk, admin);
  report.transactions.push({ label: "replay (in-window)", digest: replayInWindow.digest });
  gate.check(
    "8.replay.aborted",
    "in-window replay of the same attestation aborts",
    replayInWindow.accepted === false,
    "aborted",
    replayInWindow.accepted ? "accepted" : "aborted",
  );
  gate.check(
    "8.replay.code",
    "in-window replay aborts with E_REUSED_NULLIFIER",
    replayInWindow.abortCode === ABORT_CODE.E_REUSED_NULLIFIER,
    `E_REUSED_NULLIFIER (${ABORT_CODE.E_REUSED_NULLIFIER})`,
    String(replayInWindow.abortCode),
  );

  // --- 9. Wait out the season window, then finalize_territory ---------------
  const waitMs = endMs - Date.now() + 3_000;
  if (waitMs > 0) {
    console.log(`[smoke] waiting ${waitMs}ms for the season window to close…`);
    await new Promise((r) => setTimeout(r, waitMs));
  }

  const terr = await finalizeTerritory({ client, signer: admin });
  report.transactions.push({ label: "finalize_territory", digest: terr.digest });
  gate.check(
    "9.territory.finalized",
    "finalize_territory finalized the map",
    terr.finalized === true && Boolean(terr.event),
    "TerritoryFinalized",
    terr.finalized ? "finalized" : "not finalized",
  );
  for (const e of await eventTypesForDigest(client, terr.digest)) {
    if (!report.events.includes(e)) report.events.push(e);
  }
  const owners = (terr.event?.["owners"] as unknown[] | undefined)?.map((x) => Number(x)) ?? [];
  const finalizedPower = (terr.event?.["finalized_power"] as unknown[] | undefined)?.map((x) =>
    BigInt(String(x)),
  ) ?? [];
  // argmax over per-faction finalized power (only Avalanche has power → wins).
  let argmax = 0;
  for (let i = 1; i < finalizedPower.length; i++) {
    if ((finalizedPower[i] ?? 0n) > (finalizedPower[argmax] ?? 0n)) argmax = i;
  }
  gate.check(
    "9.territory.winner",
    "contested territory owned by the max-adjusted-power faction (Avalanche)",
    owners[0] === argmax && owners[0] === FACTION.AVALANCHE,
    `owners[0] == argmax == ${FACTION.AVALANCHE}`,
    `owners=[${owners.join(",")}] argmax=${argmax}`,
  );
  report.finalTerritoryOwnership = `owners=[${owners.join(",")}], winner=${
    FACTION_NAMES[owners[0] ?? 0]
  }(${owners[0]}), finalized_power=[${finalizedPower.join(",")}]`;

  // --- 10. settle + disburse -> ImpactFinalized + recipient balance up ------
  const impact = await finalizeImpact({ client, signer: admin });
  report.transactions.push({ label: "settle+disburse", digest: impact.digest });
  gate.check(
    "10.impact.event",
    "ImpactFinalized event emitted",
    Boolean(impact.event),
    "ImpactFinalized",
    impact.event ? "emitted" : "missing",
  );
  gate.check(
    "10.impact.winner",
    "impact routed to the winning faction (Avalanche)",
    impact.winner === FACTION.AVALANCHE,
    String(FACTION.AVALANCHE),
    String(impact.winner),
  );
  gate.check(
    "10.impact.cleanRecipient",
    "winning recipient differs from the gas-paying signer (clean delta)",
    impact.recipient.toLowerCase() !== adminAddr.toLowerCase(),
    "recipient != admin",
    impact.recipient,
  );
  gate.check(
    "10.impact.increased",
    "winning recipient SUI balance increased",
    impact.increased === true,
    `balance > ${impact.balanceBefore}`,
    `${impact.balanceBefore} -> ${impact.balanceAfter}`,
  );
  for (const e of await eventTypesForDigest(client, impact.digest)) {
    if (!report.events.includes(e)) report.events.push(e);
  }
  report.finalImpactRecipient = `${impact.recipient} (faction ${impact.winner}, ${
    impact.balanceBefore
  } -> ${impact.balanceAfter} MIST)`;

  // --- 11. cleanup -> CleanupBatchDeleted + BOTH stores shrink --------------
  const cleanup = await cleanupBatch({ client, signer: admin });
  report.transactions.push({ label: "cleanup create", digest: cleanup.createDigest });
  report.transactions.push({ label: "cleanup delete", digest: cleanup.deleteDigest });
  gate.check(
    "11.cleanup.event",
    "CleanupBatchDeleted event emitted",
    Boolean(cleanup.event),
    "CleanupBatchDeleted",
    cleanup.event ? "emitted" : "missing",
  );
  gate.check(
    "11.cleanup.nullifierStore",
    "NullifierStore entry count reduced",
    cleanup.nullifierCountAfter < cleanup.nullifierCountBefore,
    `< ${cleanup.nullifierCountBefore}`,
    String(cleanup.nullifierCountAfter),
  );
  gate.check(
    "11.cleanup.acceptedKeys",
    "Season.accepted_nullifier_keys length reduced",
    cleanup.acceptedKeyCountAfter < cleanup.acceptedKeyCountBefore,
    `< ${cleanup.acceptedKeyCountBefore}`,
    String(cleanup.acceptedKeyCountAfter),
  );
  for (const e of await eventTypesForDigest(client, cleanup.deleteDigest)) {
    if (!report.events.includes(e)) report.events.push(e);
  }
  report.cleanupResult = `NullifierStore ${cleanup.nullifierCountBefore} -> ${
    cleanup.nullifierCountAfter
  }, accepted_nullifier_keys ${cleanup.acceptedKeyCountBefore} -> ${cleanup.acceptedKeyCountAfter}`;

  // --- 12. Post-cleanup replay -> E_SEASON_INACTIVE (Requirement 23.3) ------
  const replayAfter = await replayAndDecode(client, attestation, oraclePk, admin);
  report.transactions.push({ label: "replay (post-cleanup)", digest: replayAfter.digest });
  gate.check(
    "12.replay.code",
    "post-cleanup replay aborts with E_SEASON_INACTIVE (not via nullifier persistence)",
    replayAfter.abortCode === ABORT_CODE.E_SEASON_INACTIVE,
    `E_SEASON_INACTIVE (${ABORT_CODE.E_SEASON_INACTIVE})`,
    String(replayAfter.abortCode),
  );
  report.replayResult =
    `in-window: code ${replayInWindow.abortCode} (E_REUSED_NULLIFIER); ` +
    `post-cleanup: code ${replayAfter.abortCode} (E_SEASON_INACTIVE)`;

  // --- 13. Artifact id resolution: every required id present + exists -------
  const required = [
    "packageId",
    "seasonId",
    "oracleRegistryId",
    "nullifierStoreId",
    "territoryMapId",
    "impactEscrowId",
    "sponsorSlotId",
  ] as const;
  const ids = required.map((k) => requireArtifactField(artifact, k) as string);
  const objs = await client.multiGetObjects({ ids, options: { showType: true } });
  const allExist = objs.every((o) => Boolean(o.data?.objectId));
  gate.check(
    "13.artifact.idsResolve",
    "every required artifact id resolves to an on-chain object",
    allExist,
    "all objects exist",
    `${objs.filter((o) => o.data).length}/${ids.length} resolved`,
  );

  // --- 14. Static guard: no hard-coded package/object ids in source ---------
  const offenders = scanForHardcodedIds();
  gate.check(
    "14.noHardcodedIds",
    "no hard-coded 0x package/object ids in scripts/orchestrator source",
    offenders.length === 0,
    "0 hard-coded ids",
    offenders.length === 0
      ? "none"
      : offenders.map((o) => `${o.file}:${o.line} ${o.match}`).join("; "),
  );

  // Try to close the Fastify app (best-effort; no port was bound).
  try {
    await app.close();
  } catch {
    /* ignore */
  }
}

// ===========================================================================
// Entry point
// ===========================================================================

async function main(): Promise<void> {
  process.env["SUI_NETWORK"] = "localnet";
  const tmp = mkdtempSync(resolve(tmpdir(), "yeti-smoke-"));
  process.env["YETI_ARTIFACT_DIR"] = tmp;

  const report = emptyReport({
    network: "localnet",
    rpcUrl: RPC_URL,
    windowMs: String(WINDOW_MS),
    artifactDir: tmp,
  });

  let exitCode = 0;
  try {
    const pre = await preflight();
    if (!pre.ok || !pre.admin || !pre.oracle) {
      report.status = "PENDING";
      report.pendingReasons = pre.reasons;
      console.log(formatReport(report));
      // PENDING/SKIP is NOT a pass, but exits 0 (no on-chain result faked).
      rmSync(tmp, { recursive: true, force: true });
      process.exit(0);
    }

    const admin = pre.admin;
    const oracle = pre.oracle;
    const adminAddr = admin.getPublicKey().toSuiAddress();

    // Register the EXACT oracle signer derived from ORACLE_PRIVATE_KEY.
    process.env["ORACLE_PUBLIC_KEY"] = "0x" + toHex(oracle.getPublicKey().toRawBytes());

    // Resolve recipients (PREFER env; generate clean demo recipients otherwise).
    const { recipients, source } = resolveRecipients(adminAddr);

    report.environment = {
      ...report.environment,
      adminAddress: adminAddr,
      playerAddress: adminAddr,
      oraclePublicKey: process.env["ORACLE_PUBLIC_KEY"]!,
      demoMode: "true",
      recipients: recipients.map((r, i) => `${FACTION_NAMES[i]}=${r}(${source[i]})`).join(", "),
    };

    const client = new SuiClient({ url: RPC_URL });

    // Fund the admin (best-effort; a fresh localnet admin needs gas).
    try {
      console.log("[smoke] requesting faucet funds for admin…");
      await requestSuiFromFaucetV1({ host: getFaucetHost("localnet"), recipient: adminAddr });
      await new Promise((r) => setTimeout(r, 2500));
    } catch (err) {
      console.warn(`[smoke] faucet request failed (continuing): ${String(err)}`);
    }

    await runFlow(report, client, admin, oracle);

    report.status = "PASSED";
    console.log("\n" + formatReport(report));
  } catch (err) {
    if (err instanceof SmokeAbort) {
      report.status = "FAILED";
      console.log("\n" + formatReport(report));
      exitCode = 1;
    } else {
      // An unexpected (non-assertion) error: surface it and fail the gate.
      report.status = "FAILED";
      if (!report.failure) {
        report.failure = {
          id: "runtime",
          description: "unexpected error during the smoke flow",
          expected: "no error",
          observed: err instanceof Error ? err.message : String(err),
        };
        report.assertions.push({
          id: "runtime",
          description: "unexpected error during the smoke flow",
          passed: false,
          expected: "no error",
          observed: err instanceof Error ? err.stack ?? err.message : String(err),
        });
      }
      console.log("\n" + formatReport(report));
      console.error(err);
      exitCode = 1;
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
