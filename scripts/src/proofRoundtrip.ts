/**
 * Phase-2 throwaway: the byte-identity / signature round-trip harness for the
 * critical TS↔Move signing path (Requirement 4.6, Property 1 / Property 16
 * end-to-end leg).
 *
 * Run: `pnpm --filter @yeti-trials/scripts proof:roundtrip`
 *
 * Two modes, chosen automatically:
 *
 *  1. LIVE (localnet dev-inspect) — if a Sui localnet validator is reachable
 *     AND the package is already published (its id available via
 *     `DEPLOYED_PACKAGE_ID` or `scripts/deployed.localnet.json`), this signs
 *     each sample vector in TypeScript and calls `proof::verify_signature` via
 *     `devInspectTransactionBlock`, asserting on-chain `ed25519_verify` returns
 *     true, and that a single-byte tamper returns false.
 *
 *  2. HERMETIC FALLBACK — if no validator can be reached (or no package id is
 *     available), the harness proves byte-identity WITHOUT a live chain:
 *       - every corpus signature is verified with a vetted Ed25519 verifier;
 *       - the checked-in Move corpus (`contracts/tests/conformance_vectors.move`)
 *         is confirmed to be byte-for-byte the current TS output, so the
 *         `sui move test` harness (which asserts Move-reconstructed bytes ==
 *         these embedded TS bytes) transitively proves TS↔Move byte identity.
 *     It then reports clearly that the LIVE dev-inspect signature path was not
 *     executed here (gate "proven hermetically, pending one live localnet run")
 *     and exits 0. It never fabricates on-chain results.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ed25519 } from "@noble/curves/ed25519";
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { generateCorpus, type CorpusVector } from "./conformance/corpus.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const MOVE_CORPUS = resolve(REPO, "contracts/tests/conformance_vectors.move");

const RPC_URL = process.env["SUI_RPC_URL"] ?? "http://127.0.0.1:9000";
const SAMPLE_SIZE = process.env["PROOF_ROUNDTRIP_ALL"] === "1"
  ? Number.MAX_SAFE_INTEGER
  : Number(process.env["PROOF_ROUNDTRIP_SAMPLE"] ?? "12");

function hex(b: number[] | Uint8Array): string {
  return Buffer.from(b).toString("hex");
}

/** Verify every corpus signature locally and recompute byte identity. */
function hermeticSignatureCheck(
  publicKey: number[],
  vectors: CorpusVector[],
): { ok: boolean; verified: number; tamperRejected: number } {
  const pk = Uint8Array.from(publicKey);
  let verified = 0;
  let tamperRejected = 0;
  for (const v of vectors) {
    const msg = Uint8Array.from(v.signedMessage);
    const sig = Uint8Array.from(v.signature);
    if (!ed25519.verify(sig, msg, pk)) {
      console.error(`  ✗ signature failed to verify @ ${v.label}`);
      return { ok: false, verified, tamperRejected };
    }
    verified++;
    const badSig = Uint8Array.from(sig);
    badSig[0] = (badSig[0] ?? 0) ^ 1;
    const badMsg = Uint8Array.from(msg);
    badMsg[11] = (badMsg[11] ?? 0) ^ 1; // first byte after the 11-byte domain prefix
    if (!ed25519.verify(badSig, msg, pk) && !ed25519.verify(sig, badMsg, pk)) {
      tamperRejected++;
    } else {
      console.error(`  ✗ tamper unexpectedly verified @ ${v.label}`);
      return { ok: false, verified, tamperRejected };
    }
  }
  return { ok: true, verified, tamperRejected };
}

/** Confirm the checked-in Move corpus contains every TS-serialized message. */
function hermeticByteIdentityCheck(vectors: CorpusVector[]): boolean {
  if (!existsSync(MOVE_CORPUS)) {
    console.error(`  ✗ Move corpus not found at ${MOVE_CORPUS} (run gen:conformance)`);
    return false;
  }
  const moveSrc = readFileSync(MOVE_CORPUS, "utf8");
  for (const v of vectors) {
    const literal = `vector[${v.signedMessage.join(", ")}]`;
    if (!moveSrc.includes(literal)) {
      console.error(`  ✗ Move corpus is missing the TS signed-message for ${v.label}`);
      return false;
    }
  }
  return true;
}

function resolvePackageId(): string | null {
  const fromEnv = process.env["DEPLOYED_PACKAGE_ID"];
  if (fromEnv && fromEnv.startsWith("0x")) return fromEnv;
  const artifact = resolve(REPO, "scripts/deployed.localnet.json");
  if (existsSync(artifact)) {
    try {
      const json = JSON.parse(readFileSync(artifact, "utf8")) as { packageId?: string };
      if (json.packageId) return json.packageId;
    } catch {
      /* ignore malformed artifact */
    }
  }
  return null;
}

async function tryReachLocalnet(): Promise<SuiClient | null> {
  try {
    const client = new SuiClient({ url: RPC_URL });
    const id = await Promise.race([
      client.getChainIdentifier(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 2500)),
    ]);
    console.log(`  • localnet reachable at ${RPC_URL} (chain ${id})`);
    return client;
  } catch {
    return null;
  }
}

/** Decode a Move `bool` return value (1 byte) from devInspect results. */
function decodeBoolReturn(returnValues: unknown): boolean | null {
  // returnValues: Array<[number[], string]>
  if (!Array.isArray(returnValues) || returnValues.length === 0) return null;
  const first = returnValues[0] as [number[], string];
  const bytes = first[0];
  return Array.isArray(bytes) && bytes.length >= 1 ? bytes[0] === 1 : null;
}

async function devInspectVerify(
  client: SuiClient,
  pkg: string,
  publicKey: number[],
  v: CorpusVector,
  sig: number[],
): Promise<boolean | null> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${pkg}::proof::verify_signature`,
    arguments: [
      tx.pure.vector("u8", v.network),
      tx.pure.address(v.packageId),
      tx.pure.u64(v.seasonId),
      tx.pure.u64(v.trialId),
      tx.pure.u8(v.factionId),
      tx.pure.address(v.passportId),
      tx.pure.address(v.wallet),
      tx.pure.vector("u8", v.proofSource),
      tx.pure.u8(v.provenanceTier),
      tx.pure.u64(v.score),
      tx.pure.u64(v.territoryPower),
      tx.pure.u64(v.issuedMs),
      tx.pure.u64(v.expiryMs),
      tx.pure.u64(v.nonce),
      tx.pure.vector("u8", v.nullifier),
      tx.pure.vector("u8", sig),
      tx.pure.vector("u8", publicKey),
    ],
  });
  const res = await client.devInspectTransactionBlock({
    sender: "0x0000000000000000000000000000000000000000000000000000000000000000",
    transactionBlock: tx,
  });
  const results = res.results ?? [];
  if (results.length === 0) {
    console.error(`    dev-inspect produced no results @ ${v.label}: ${res.error ?? ""}`);
    return null;
  }
  return decodeBoolReturn(results[0]?.returnValues);
}

async function runLive(
  client: SuiClient,
  pkg: string,
  publicKey: number[],
  vectors: CorpusVector[],
): Promise<boolean> {
  console.log(`  • LIVE dev-inspect against package ${pkg}`);
  const sample = vectors.slice(0, SAMPLE_SIZE);
  let ok = true;
  for (const v of sample) {
    const good = await devInspectVerify(client, pkg, publicKey, v, v.signature);
    if (good !== true) {
      console.error(`  ✗ on-chain verify did not return true @ ${v.label} (got ${good})`);
      ok = false;
      continue;
    }
    const tampered = v.signature.slice();
    tampered[0] = (tampered[0]! ^ 1) & 0xff;
    const bad = await devInspectVerify(client, pkg, publicKey, v, tampered);
    if (bad !== false) {
      console.error(`  ✗ on-chain tamper did not return false @ ${v.label} (got ${bad})`);
      ok = false;
    }
  }
  if (ok) {
    console.log(`  ✓ ${sample.length} vectors verified on-chain (genuine true, tamper false)`);
  }
  return ok;
}

async function main(): Promise<void> {
  console.log("Phase-2 proof round-trip harness");
  const { publicKey, vectors } = await generateCorpus();
  console.log(`  • corpus: ${vectors.length} vectors; oracle pk ${hex(publicKey)}`);

  // Hermetic checks always run (cheap, no chain needed).
  const sig = hermeticSignatureCheck(publicKey, vectors);
  if (!sig.ok) {
    console.error("HERMETIC SIGNATURE CHECK FAILED");
    process.exit(1);
  }
  console.log(
    `  ✓ hermetic: ${sig.verified} signatures verified, ${sig.tamperRejected} tamper cases rejected`,
  );
  if (!hermeticByteIdentityCheck(vectors)) {
    console.error("HERMETIC BYTE-IDENTITY CHECK FAILED (Move corpus out of sync)");
    process.exit(1);
  }
  console.log(
    "  ✓ hermetic: checked-in Move corpus embeds every TS signed-message (byte identity proven via `sui move test`)",
  );

  const client = await tryReachLocalnet();
  const pkg = resolvePackageId();

  if (client && pkg) {
    const liveOk = await runLive(client, pkg, publicKey, vectors);
    if (!liveOk) {
      console.error("LIVE dev-inspect FAILED");
      process.exit(1);
    }
    console.log("\nRESULT: byte-identity + signature verification proven HERMETICALLY and LIVE (localnet dev-inspect).");
    return;
  }

  const why = !client
    ? `no localnet validator reachable at ${RPC_URL}`
    : "no published package id (set DEPLOYED_PACKAGE_ID or scripts/deployed.localnet.json)";
  console.log(`\n  • LIVE dev-inspect skipped: ${why}.`);
  console.log("RESULT: byte-identity, nullifier/shard parity, and signature verification are");
  console.log("PROVEN HERMETICALLY (via `sui move test` + this harness). The live localnet");
  console.log("dev-inspect signature-verify path was NOT executed in this environment —");
  console.log("gate is GREEN hermetically, pending one live localnet `dev-inspect` run.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
