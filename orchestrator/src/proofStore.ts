/**
 * In-memory pending-proof store (Task 9.5, Requirements 16.1, 18.3).
 *
 * This is UX state, NOT chain truth: it tracks proof requests between
 * `POST /proof/request` and `POST /proof/attest` so the frontend can show a
 * "pending" status. It is keyed by an opaque `pendingProofId` and is the ONLY
 * thing `POST /demo/reset` clears — it never touches on-chain state.
 */

import { randomUUID, randomBytes } from "node:crypto";

/** Caller-supplied fields of a proof request (already parsed to bigint). */
export interface PendingProofInput {
  wallet: string;
  passportId: string;
  seasonId: bigint;
  trialId: bigint;
  factionId: number;
}

/** A stored pending proof, including the bound nonce and lifecycle status. */
export interface PendingProof extends PendingProofInput {
  pendingProofId: string;
  /** Per-request nonce binding the eventual nullifier to this request. */
  nonce: bigint;
  status: "requested" | "attested";
  createdMs: bigint;
}

/** Generate a random unbiased u64 nonce. */
function randomNonce(): bigint {
  return BigInt("0x" + randomBytes(8).toString("hex"));
}

/** In-memory map of pending proofs keyed by `pendingProofId`. */
export class ProofStore {
  private readonly pending = new Map<string, PendingProof>();

  /** Store a new pending proof and return it (with its generated id + nonce). */
  create(input: PendingProofInput, nowMs: bigint = BigInt(Date.now())): PendingProof {
    const entry: PendingProof = {
      ...input,
      wallet: input.wallet.toLowerCase(),
      pendingProofId: randomUUID(),
      nonce: randomNonce(),
      status: "requested",
      createdMs: nowMs,
    };
    this.pending.set(entry.pendingProofId, entry);
    return entry;
  }

  /** Look up a pending proof by id. */
  get(pendingProofId: string): PendingProof | undefined {
    return this.pending.get(pendingProofId);
  }

  /** All pending proofs for a wallet (case-insensitive), newest first. */
  listByWallet(wallet: string): PendingProof[] {
    const w = wallet.toLowerCase();
    return [...this.pending.values()]
      .filter((p) => p.wallet === w)
      .sort((a, b) => Number(b.createdMs - a.createdMs));
  }

  /** Mark a pending proof as attested. No-op if the id is unknown. */
  markAttested(pendingProofId: string): void {
    const entry = this.pending.get(pendingProofId);
    if (entry) entry.status = "attested";
  }

  /** Clear the entire store, returning how many entries were removed. */
  clear(): number {
    const count = this.pending.size;
    this.pending.clear();
    return count;
  }

  /** Current number of pending entries. */
  size(): number {
    return this.pending.size;
  }
}
