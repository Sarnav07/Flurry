/**
 * Demo oracle: Ed25519 signer + demo-proof-condition evaluation + attestation
 * builder (Task 9.3, Requirements 17.1–17.4).
 *
 * Honesty boundary: this is the CENTRALIZED V1 demo oracle. Every attestation
 * it produces is **Oracle-Attested (provenance tier 2)** and labeled exactly
 * "Oracle-Attested Demo Proof". It NEVER mints a native proof and never adds a
 * Sui intent envelope — it signs the raw `Signed_Message` with a raw 64-byte
 * `Ed25519Keypair.sign()`, exactly the bytes the Move contract reconstructs and
 * verifies. The byte layout is reused from `@yeti-trials/shared` (bcs/message/
 * nullifier); none of it is re-implemented here.
 */

import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Ed25519PublicKey } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { fromBase64, fromHex, toHex } from "@mysten/sui/utils";
import {
  DOMAIN_BYTES,
  PROVENANCE_TIER,
  buildSignedMessage,
  deriveNullifier,
  type AttestationResponse,
  type ProofPayload,
  type WireProofPayload,
} from "@yeti-trials/shared";

/** The single proof-source label every demo attestation carries. */
export const PROOF_SOURCE_LABEL = "Oracle-Attested Demo Proof" as const;
const PROOF_SOURCE_BYTES = Array.from(new TextEncoder().encode(PROOF_SOURCE_LABEL));

// ===========================================================================
// Oracle signer
// ===========================================================================

/** The signing surface the orchestrator needs from the oracle keypair. */
export interface OracleSigner {
  /** Raw 32-byte Ed25519 public key. */
  publicKeyBytes(): Uint8Array;
  /** Raw 32-byte public key as a 0x-hex string (the "signer key id"). */
  publicKeyHex(): string;
  /** Raw 64-byte Ed25519 signature over `message` (no Sui intent). */
  sign(message: Uint8Array): Promise<Uint8Array>;
  /** Verify a raw 64-byte signature against this key over `message`. */
  verify(message: Uint8Array, signature: Uint8Array): Promise<boolean>;
}

/**
 * Parse the oracle private key from a string. Accepts, in order:
 *   - a bech32 `suiprivkey1...` export (modern `sui keytool`),
 *   - a 0x-prefixed 32-byte hex string,
 *   - a base64 string of 32 raw bytes or 33 flag-prefixed bytes (flag 0x00).
 * Mirrors the admin-key parsing in `scripts/src/lib.ts`.
 */
function keypairFromString(raw: string): Ed25519Keypair {
  const value = raw.trim();
  if (value.startsWith("suiprivkey")) {
    const { schema, secretKey } = decodeSuiPrivateKey(value);
    if (schema !== "ED25519") {
      throw new Error(`ORACLE_PRIVATE_KEY scheme ${schema} is not supported`);
    }
    return Ed25519Keypair.fromSecretKey(secretKey);
  }
  if (value.startsWith("0x")) {
    const bytes = fromHex(value);
    if (bytes.length !== 32) {
      throw new Error(`hex ORACLE_PRIVATE_KEY must be 32 bytes; got ${bytes.length}`);
    }
    return Ed25519Keypair.fromSecretKey(bytes);
  }
  const bytes = fromBase64(value);
  if (bytes.length === 32) return Ed25519Keypair.fromSecretKey(bytes);
  if (bytes.length === 33) {
    if (bytes[0] !== 0x00) {
      throw new Error(
        `only Ed25519 keystore entries (flag 0x00) are supported; got flag 0x${bytes[0]?.toString(16)}`,
      );
    }
    return Ed25519Keypair.fromSecretKey(bytes.slice(1));
  }
  throw new Error(
    `base64 ORACLE_PRIVATE_KEY must decode to 32 or 33 bytes; got ${bytes.length}`,
  );
}

/** Wrap an `Ed25519Keypair` as an {@link OracleSigner}. */
export function signerFromKeypair(keypair: Ed25519Keypair): OracleSigner {
  const pkBytes = keypair.getPublicKey().toRawBytes();
  const pk = new Ed25519PublicKey(pkBytes);
  return {
    publicKeyBytes: () => pkBytes,
    publicKeyHex: () => "0x" + toHex(pkBytes),
    sign: (message) => keypair.sign(message),
    // Ed25519PublicKey.verify checks a RAW ed25519 signature over the message
    // (no personal-message / intent wrapping) — the exact inverse of sign().
    verify: (message, signature) => pk.verify(message, signature),
  };
}

/**
 * Load the oracle signer from `ORACLE_PRIVATE_KEY`. Throws if unset so the
 * service never starts silently unable to attest.
 */
export function loadOracleSigner(
  privateKey: string | undefined = process.env["ORACLE_PRIVATE_KEY"],
): OracleSigner {
  const raw = privateKey?.trim();
  if (!raw) {
    throw new Error("missing required env ORACLE_PRIVATE_KEY (Ed25519 oracle signer key)");
  }
  return signerFromKeypair(keypairFromString(raw));
}

// ===========================================================================
// Demo proof condition (Requirements 17.1, 17.3)
// ===========================================================================

/** Outcome of evaluating the demo proof condition for a wallet. */
export interface DemoConditionResult {
  /** Whether the wallet satisfies the demo proof condition. */
  ok: boolean;
  /** Which path satisfied it ("demo-object-ownership" | "demo-allowlist"). */
  source?: string;
  /** Human reason when the condition fails (Requirement 17.3). */
  reason?: string;
}

/** Probe returning whether a wallet owns the configured demo object. */
export type OwnershipProbe = (wallet: string) => Promise<boolean>;

/**
 * Evaluate the demo proof condition.
 *
 * The documented demo source is "the wallet owns a configured demo object
 * minted at setup". When a demo object is configured, the injected
 * `ownershipProbe` (a chain read) is the primary check. The CLEARLY-LABELED
 * DEMO FALLBACK is a static allowlist (`DEMO_ALLOWLIST`): any listed wallet
 * passes so the demo can run without minting per-wallet objects. The allowlist
 * is a demo shortcut only — it is never a production trust source.
 *
 * Returns `ok: false` with a reason when neither path holds; the caller then
 * returns an error and produces NO signature. (Requirement 17.3.)
 */
export async function evaluateDemoCondition(
  wallet: string,
  opts: { allowlist: string[]; ownershipProbe?: OwnershipProbe },
): Promise<DemoConditionResult> {
  const w = wallet.trim().toLowerCase();

  if (opts.ownershipProbe) {
    const owns = await opts.ownershipProbe(w);
    if (owns) return { ok: true, source: "demo-object-ownership" };
  }

  if (opts.allowlist.includes(w)) {
    return { ok: true, source: "demo-allowlist" };
  }

  return {
    ok: false,
    reason:
      "wallet does not own the configured demo object and is not in the demo allowlist",
  };
}

// ===========================================================================
// Attestation builder (Requirements 17.1, 17.2, 17.4)
// ===========================================================================

/** Inputs required to build and sign one attestation. */
export interface AttestInputs {
  /** Expected network bytes (e.g. utf-8 of "localnet"). */
  network: Uint8Array | number[];
  /** Current package id (0x-hex address). */
  packageId: string;
  seasonId: bigint;
  trialId: bigint;
  factionId: number;
  /** Passport object id (0x-hex address). */
  passportId: string;
  /** Player wallet (0x-hex address). */
  wallet: string;
  /** Score delta to credit. */
  score: bigint;
  /** Territory power delta to credit. */
  territoryPower: bigint;
  /** Issued timestamp (epoch ms). */
  nowMs: bigint;
  /** Validity window in ms; expiry = nowMs + expiryWindowMs. */
  expiryWindowMs: bigint;
  /** Per-proof nonce binding the nullifier to this attestation. */
  nonce: bigint;
}

function toBytes(v: Uint8Array | number[]): number[] {
  return v instanceof Uint8Array ? Array.from(v) : v;
}

/**
 * Build, sign, and self-verify one Oracle-Attested demo attestation.
 *
 * Derives the nullifier via the shared module, sets issued/expiry, assembles
 * the 15-field `ProofPayload`, prepends the domain, signs raw 64 bytes, and
 * asserts the signature verifies against the oracle public key (Requirement
 * 17.4) before returning. Always tier 2 / "Oracle-Attested Demo Proof"
 * (Requirement 17.2).
 */
export async function buildAttestation(
  signer: OracleSigner,
  inputs: AttestInputs,
): Promise<AttestationResponse> {
  const issuedMs = inputs.nowMs;
  const expiryMs = inputs.nowMs + inputs.expiryWindowMs;

  const nullifier = deriveNullifier({
    seasonId: inputs.seasonId,
    trialId: inputs.trialId,
    factionId: inputs.factionId,
    passportId: inputs.passportId,
    wallet: inputs.wallet,
    nonce: inputs.nonce,
  });

  const payload: ProofPayload = {
    network: toBytes(inputs.network),
    packageId: inputs.packageId,
    seasonId: inputs.seasonId,
    trialId: inputs.trialId,
    factionId: inputs.factionId,
    passportId: inputs.passportId,
    wallet: inputs.wallet,
    proofSource: PROOF_SOURCE_BYTES,
    provenanceTier: PROVENANCE_TIER.ORACLE,
    score: inputs.score,
    territoryPower: inputs.territoryPower,
    issuedMs,
    expiryMs,
    nonce: inputs.nonce,
    nullifier,
  };

  const signedMessage = buildSignedMessage(DOMAIN_BYTES, payload);
  const signature = await signer.sign(signedMessage);

  // Requirement 17.4: the returned signature MUST verify against the configured
  // oracle public key over the Signed_Message. Verify defensively so a broken
  // signer can never emit an unverifiable attestation.
  const verified = await signer.verify(signedMessage, signature);
  if (!verified) {
    throw new Error("internal error: produced signature did not self-verify");
  }

  const wire: WireProofPayload = {
    network: toBytes(inputs.network),
    packageId: inputs.packageId,
    seasonId: inputs.seasonId.toString(),
    trialId: inputs.trialId.toString(),
    factionId: inputs.factionId,
    passportId: inputs.passportId,
    wallet: inputs.wallet,
    proofSource: PROOF_SOURCE_BYTES,
    provenanceTier: PROVENANCE_TIER.ORACLE,
    score: inputs.score.toString(),
    territoryPower: inputs.territoryPower.toString(),
    issuedMs: issuedMs.toString(),
    expiryMs: expiryMs.toString(),
    nonce: inputs.nonce.toString(),
    nullifier: Array.from(nullifier),
  };

  return {
    payload: wire,
    signature: Array.from(signature),
    nullifier: Array.from(nullifier),
    expiry: expiryMs.toString(),
    score: inputs.score.toString(),
    territoryPower: inputs.territoryPower.toString(),
    proofSource: PROOF_SOURCE_LABEL,
    provenanceTier: PROVENANCE_TIER.ORACLE as 2,
  };
}
