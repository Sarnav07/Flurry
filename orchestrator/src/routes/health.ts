/**
 * GET /health (Requirement 14.1).
 *
 * Returns the service status, the Sui network, the package id, the active
 * season id, and the oracle signer key id (the raw public key hex). Every value
 * derives from the deployment artifact / resolved config — none is hard-coded.
 */

import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../index.js";

export function registerHealth(app: FastifyInstance, deps: AppDeps): void {
  app.get("/health", async () => ({
    status: "ok",
    network: deps.config.network,
    packageId: deps.config.packageId,
    activeSeason: deps.config.seasonNumber.toString(),
    oracleSignerKeyId: deps.oracle.publicKeyHex(),
  }));
}
