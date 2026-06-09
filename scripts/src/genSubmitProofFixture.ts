/**
 * One-shot generator for the Phase-3 `submit_proof` Move test fixtures.
 *
 * The genuine-pass acceptance tests (happy path, replay, one-shard, dual
 * update, no-P2E) and every post-signature rejection test need a REAL Ed25519
 * signature over the EXACT payload the Move test submits. Move cannot sign, so
 * the fixed conformance keypair (seed 1..32, identical to the Phase-2 corpus)
 * signs the payloads here and we emit Move-ready `vector[..]` literals.
 *
 * Crucially, the payload's `passport_id` and `wallet` must equal the objects
 * the Move test actually supplies:
 *   - `wallet`   = WALLET (the `test_scenario` sender),
 *   - `passport_id` = the DETERMINISTIC object id `test_scenario` assigns to the
 *     first passport created by WALLET in a fresh scenario (discovered via the
 *     `proof_submit_probe` test and pinned in `BAKED_PASSPORT_ID`). A guard test
 *     re-asserts this id so a toolchain change that shifts it fails loudly.
 *
 * Run: `pnpm --filter @yeti-trials/scripts tsx src/genSubmitProofFixture.ts`
 */

import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import {
  buildSignedMessage,
  DOMAIN_BYTES,
  deriveNullifier,
  shardBucket,
  type ProofPayload,
} from "@yeti-trials/shared";
import { FIXED_SEED, CONFORMANCE_SHARD_COUNT } from "./conformance/corpus.js";

const ENC = new TextEncoder();

/** Deterministic id of the first passport created by WALLET (probe output). */
const BAKED_PASSPORT_ID =
  "0x034401905bebdf8c04f3cd5f04f442a39372c8dc321c29edfb4f9cb30b23ab96";

const WALLET =
  "0x0000000000000000000000000000000000000000000000000000000000000b0b";
const PACKAGE_ID =
  "0x00000000000000000000000000000000000000000000000000000000000000ab";
const WRONG_WALLET =
  "0x000000000000000000000000000000000000000000000000000000000000bad0";

const SEASON_ID = 42n;
const TRIAL_ID = 7n;
const FACTION_ID = 1;
const SCORE = 1234n;
const TERRITORY_POWER = 567n;
const ISSUED_MS = 1000n;
const EXPIRY_MS = 2000n;
const NONCE = 99n;

function byteVec(bytes: Uint8Array | number[]): string {
  return `vector[${Array.from(bytes).join(", ")}]`;
}

function emit(label: string, wallet: string): void {
  const kp = Ed25519Keypair.fromSecretKey(FIXED_SEED);
  const nullifier = deriveNullifier({
    seasonId: SEASON_ID,
    trialId: TRIAL_ID,
    factionId: FACTION_ID,
    passportId: BAKED_PASSPORT_ID,
    wallet,
    nonce: NONCE,
  });
  const bucket = shardBucket(nullifier, CONFORMANCE_SHARD_COUNT);
  const payload: ProofPayload = {
    network: Array.from(ENC.encode("localnet")),
    packageId: PACKAGE_ID,
    seasonId: SEASON_ID,
    trialId: TRIAL_ID,
    factionId: FACTION_ID,
    passportId: BAKED_PASSPORT_ID,
    wallet,
    proofSource: Array.from(ENC.encode("Oracle-Attested Demo Proof")),
    provenanceTier: 2,
    score: SCORE,
    territoryPower: TERRITORY_POWER,
    issuedMs: ISSUED_MS,
    expiryMs: EXPIRY_MS,
    nonce: NONCE,
    nullifier,
  };
  const msg = buildSignedMessage(DOMAIN_BYTES, payload);
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  kp.sign(msg).then((sig) => {
    console.log(`\n// ===== ${label} =====`);
    console.log(`// shard bucket = ${bucket}`);
    console.log(`pk           = ${byteVec(kp.getPublicKey().toRawBytes())}`);
    console.log(`signature    = ${byteVec(sig)}`);
    console.log(`nullifier    = ${byteVec(nullifier)}`);
    console.log(`signed_msg   = ${byteVec(msg)}`);
    console.log(`bucket       = ${bucket}`);
  });
}

emit("V_VALID (wallet = WALLET)", WALLET);
emit("V_WRONG_WALLET (wallet = WRONG_WALLET)", WRONG_WALLET);
