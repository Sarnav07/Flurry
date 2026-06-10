/**
 * GET /sponsor (optional stub) — Requirements 20.2, 20.3.
 *
 * A NON-signing sponsorship hook: it reports that sponsorship is supported and
 * lists the allowed sponsored transaction kinds. It never signs arbitrary
 * transactions (Requirement 20.3); the actual sponsor key (SPONSOR_* env
 * placeholders, Requirement 20.2) is not used here.
 */

import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../index.js";

/** The `module::function` calls the (future) sponsor would be willing to fund. */
const ALLOWED_TX_KINDS = [
  { module: "passport", fn: "create_passport_with_faction" },
  { module: "proof", fn: "submit_proof" },
] as const;

export function registerSponsor(app: FastifyInstance, deps: AppDeps): void {
  app.get("/sponsor", async () => ({
    sponsorshipSupported: true,
    // Reflect whether a sponsor key is configured, without ever exposing it.
    sponsorEnabled: (process.env["SPONSOR_ENABLED"] ?? "false").trim().toLowerCase() === "true",
    allowedTransactionKinds: ALLOWED_TX_KINDS.map(
      (k) => `${deps.config.packageId}::${k.module}::${k.fn}`,
    ),
  }));
}
