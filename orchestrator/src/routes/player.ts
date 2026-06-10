/**
 * GET /player/:address (Requirements 15.1, 15.2).
 *
 * For a wallet that owns a YetiPassport, returns the wallet, passport id,
 * faction, raw reputation, accepted-proof count, and any pending proof status.
 * For a wallet with no passport, returns an explicit `hasPassport: false`
 * response with null passport fields (Requirement 15.2).
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import type { PendingProofStatus, PlayerState } from "@yeti-trials/shared";
import type { AppDeps } from "../index.js";
import type { PendingProof } from "../proofStore.js";

function toPendingStatus(p: PendingProof): PendingProofStatus {
  return {
    pendingProofId: p.pendingProofId,
    seasonId: p.seasonId.toString(),
    trialId: p.trialId.toString(),
    factionId: p.factionId,
    status: p.status,
    createdMs: p.createdMs.toString(),
  };
}

export function registerPlayer(app: FastifyInstance, deps: AppDeps): void {
  app.get(
    "/player/:address",
    async (req: FastifyRequest<{ Params: { address: string } }>) => {
      const wallet = req.params.address;
      const pending = deps.store.listByWallet(wallet).map(toPendingStatus);
      const passport = await deps.chain.readPassport(wallet);

      if (!passport) {
        const empty: PlayerState = {
          wallet,
          hasPassport: false,
          passportId: null,
          factionId: null,
          rawReputation: null,
          acceptedProofCount: null,
          pending,
        };
        return empty;
      }

      const state: PlayerState = {
        wallet,
        hasPassport: true,
        passportId: passport.passportId,
        factionId: passport.factionId,
        rawReputation: passport.rawReputation.toString(),
        acceptedProofCount: passport.acceptedProofCount.toString(),
        pending,
      };
      return state;
    },
  );
}
