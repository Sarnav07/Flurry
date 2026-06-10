/**
 * POST /demo/reset (Requirements 18.2, 18.3).
 *
 * Guarded by `DEMO_MODE`: while demo mode is disabled the request is rejected
 * (Requirement 18.2). While enabled it clears ONLY the in-memory pending-proof
 * store and never touches on-chain state (Requirement 18.3).
 */

import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../index.js";

export function registerDemoReset(app: FastifyInstance, deps: AppDeps): void {
  app.post("/demo/reset", async (_req, reply) => {
    if (!deps.config.demo.demoMode) {
      return reply.code(403).send({
        error: "demo mode is disabled (set DEMO_MODE=true to allow /demo/reset)",
      });
    }
    const cleared = deps.store.clear();
    return reply.code(200).send({ ok: true, cleared, scope: "in-memory-proof-store" });
  });
}
