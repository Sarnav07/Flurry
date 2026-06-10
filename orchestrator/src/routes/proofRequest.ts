/**
 * POST /proof/request (Requirements 16.1, 16.2).
 *
 * Validates the request shape, confirms the season, trial, and faction match
 * the active configuration, returns a `pendingProofId`, and stores the pending
 * request. On any invalid input it returns a 400 identifying the bad field
 * (Requirement 16.2).
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppDeps } from "../index.js";
import type { PendingProofInput } from "../proofStore.js";

interface RawBody {
  wallet?: unknown;
  passportId?: unknown;
  seasonId?: unknown;
  trialId?: unknown;
  factionId?: unknown;
}

interface FieldError {
  field: string;
  message: string;
}

/** Parse a u64-ish value (string or integer number) to bigint, or fail. */
function parseU64(value: unknown, field: string): bigint | FieldError {
  if (typeof value === "bigint") return value >= 0n ? value : { field, message: `${field} must be non-negative` };
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0) {
      return { field, message: `${field} must be a non-negative integer` };
    }
    return BigInt(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return BigInt(value.trim());
  }
  return { field, message: `${field} must be a u64 (decimal string or integer)` };
}

function isAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]+$/.test(value.trim());
}

function isFieldError(v: unknown): v is FieldError {
  return typeof v === "object" && v !== null && "field" in v && "message" in v;
}

export function registerProofRequest(app: FastifyInstance, deps: AppDeps): void {
  app.post(
    "/proof/request",
    async (req: FastifyRequest<{ Body: RawBody }>, reply) => {
      const body = req.body ?? {};

      // --- Shape validation (Requirement 16.2) -----------------------------
      if (!isAddress(body.wallet)) {
        return reply.code(400).send({ error: "invalid input", field: "wallet" });
      }
      if (!isAddress(body.passportId)) {
        return reply.code(400).send({ error: "invalid input", field: "passportId" });
      }
      const seasonId = parseU64(body.seasonId, "seasonId");
      if (isFieldError(seasonId)) {
        return reply.code(400).send({ error: seasonId.message, field: seasonId.field });
      }
      const trialId = parseU64(body.trialId, "trialId");
      if (isFieldError(trialId)) {
        return reply.code(400).send({ error: trialId.message, field: trialId.field });
      }
      if (
        typeof body.factionId !== "number" ||
        !Number.isInteger(body.factionId) ||
        body.factionId < 0 ||
        body.factionId > 3
      ) {
        return reply.code(400).send({ error: "invalid input", field: "factionId" });
      }
      const factionId = body.factionId;

      // --- Active-config match (Requirement 16.1) --------------------------
      if (seasonId !== deps.config.seasonNumber) {
        return reply.code(400).send({
          error: `season ${seasonId} does not match the active season ${deps.config.seasonNumber}`,
          field: "seasonId",
        });
      }
      if (trialId !== deps.config.trialId) {
        return reply.code(400).send({
          error: `trial ${trialId} does not match the active trial ${deps.config.trialId}`,
          field: "trialId",
        });
      }
      if (!deps.config.allowedFactions.includes(factionId)) {
        return reply.code(400).send({
          error: `faction ${factionId} is not in the active allowed set`,
          field: "factionId",
        });
      }

      // --- Store pending + return id (Requirement 16.1) --------------------
      const input: PendingProofInput = {
        wallet: body.wallet,
        passportId: body.passportId,
        seasonId,
        trialId,
        factionId,
      };
      const pending = deps.store.create(input);

      return reply.code(201).send({
        pendingProofId: pending.pendingProofId,
        status: pending.status,
        wallet: pending.wallet,
        seasonId: seasonId.toString(),
        trialId: trialId.toString(),
        factionId,
      });
    },
  );
}
