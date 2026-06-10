/**
 * GET /config (Requirements 14.2, 14.3).
 *
 * Returns the faction list, active season/trial ids, sponsor slot metadata,
 * territory/shard counts, provenance tiers, the package id, and the object ids
 * the frontend needs — all read from the per-network deployment artifact via
 * the resolved config (Requirement 14.3).
 */

import type { FastifyInstance } from "fastify";
import { buildPublicConfig } from "../config.js";
import type { AppDeps } from "../index.js";

export function registerConfig(app: FastifyInstance, deps: AppDeps): void {
  app.get("/config", async () =>
    buildPublicConfig(deps.config, deps.oracle.publicKeyHex()),
  );
}
