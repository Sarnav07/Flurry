/**
 * POST /proof/attest (Requirements 17.1–17.4).
 *
 * Given a valid pending proof id + matching wallet/passport, AND a satisfied
 * demo proof condition, builds and signs an Oracle-Attested attestation and
 * returns the payload, the raw 64-byte signature, the nullifier, the expiry,
 * the score, the territory power, and the "Oracle-Attested Demo Proof" label
 * (always tier 2). If the demo condition does NOT hold, returns an error and
 * produces NO signature (Requirement 17.3).
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import { buildAttestation, evaluateDemoCondition } from "../oracle.js";
import type { AppDeps } from "../index.js";

interface AttestBody {
  pendingProofId?: unknown;
  wallet?: unknown;
  passportId?: unknown;
}

export function registerProofAttest(app: FastifyInstance, deps: AppDeps): void {
  app.post(
    "/proof/attest",
    async (req: FastifyRequest<{ Body: AttestBody }>, reply) => {
      const body = req.body ?? {};

      if (typeof body.pendingProofId !== "string" || body.pendingProofId.length === 0) {
        return reply.code(400).send({ error: "invalid input", field: "pendingProofId" });
      }
      if (typeof body.wallet !== "string" || body.wallet.length === 0) {
        return reply.code(400).send({ error: "invalid input", field: "wallet" });
      }
      if (typeof body.passportId !== "string" || body.passportId.length === 0) {
        return reply.code(400).send({ error: "invalid input", field: "passportId" });
      }

      const pending = deps.store.get(body.pendingProofId);
      if (!pending) {
        return reply.code(404).send({
          error: "unknown pendingProofId",
          field: "pendingProofId",
        });
      }
      if (pending.wallet !== body.wallet.toLowerCase()) {
        return reply.code(400).send({
          error: "wallet does not match the pending request",
          field: "wallet",
        });
      }
      if (pending.passportId !== body.passportId) {
        return reply.code(400).send({
          error: "passportId does not match the pending request",
          field: "passportId",
        });
      }

      // Demo proof condition (Requirement 17.1/17.3). The chain ownership probe
      // is the primary check only when a demo object is configured; otherwise
      // the clearly-labeled allowlist fallback applies.
      const objectConfigured = Boolean(deps.config.demo.objectId || deps.config.demo.objectType);
      const condition = await evaluateDemoCondition(body.wallet, {
        allowlist: deps.config.demo.allowlist,
        ...(objectConfigured
          ? { ownershipProbe: (w: string) => deps.chain.ownsDemoObject(w) }
          : {}),
      });
      if (!condition.ok) {
        // No signature is produced on a failed condition (Requirement 17.3).
        return reply.code(403).send({
          error: "demo proof condition not satisfied",
          reason: condition.reason,
        });
      }

      const attestation = await buildAttestation(deps.oracle, {
        network: new TextEncoder().encode(deps.config.network),
        packageId: deps.config.packageId,
        seasonId: pending.seasonId,
        trialId: pending.trialId,
        factionId: pending.factionId,
        passportId: pending.passportId,
        wallet: pending.wallet,
        score: deps.config.demo.score,
        territoryPower: deps.config.demo.territoryPower,
        nowMs: BigInt(Date.now()),
        expiryWindowMs: deps.config.demo.expiryWindowMs,
        nonce: pending.nonce,
      });

      deps.store.markAttested(pending.pendingProofId);
      return reply.code(200).send(attestation);
    },
  );
}
