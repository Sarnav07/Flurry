/**
 * Orchestrator entrypoint (Task 9.2): Fastify bootstrap + route registration.
 *
 * Three roles in one service — demo oracle, frontend API, and chain reader —
 * wired from injectable dependencies so the whole app can be exercised
 * hermetically with `app.inject()` against a mock chain + fixture artifact (no
 * live localnet needed). Each route lives in its own file under `routes/`.
 */

import Fastify, { type FastifyInstance } from "fastify";

import { loadConfig, type OrchestratorConfig } from "./config.js";
import { loadOracleSigner, type OracleSigner } from "./oracle.js";
import { SuiChainReader, type ChainReader } from "./chain.js";
import { ProofStore } from "./proofStore.js";

import { registerHealth } from "./routes/health.js";
import { registerConfig } from "./routes/config.js";
import { registerPlayer } from "./routes/player.js";
import { registerProofRequest } from "./routes/proofRequest.js";
import { registerProofAttest } from "./routes/proofAttest.js";
import { registerTerritory } from "./routes/territory.js";
import { registerDemoReset } from "./routes/demoReset.js";
import { registerSponsor } from "./routes/sponsor.js";

/** The injectable dependencies every route is built from. */
export interface AppDeps {
  config: OrchestratorConfig;
  oracle: OracleSigner;
  chain: ChainReader;
  store: ProofStore;
}

/** Build the real dependency set from `.env` + the deployment artifact. */
export function createDefaultDeps(): AppDeps {
  const config = loadConfig();
  return {
    config,
    oracle: loadOracleSigner(),
    chain: new SuiChainReader(config),
    store: new ProofStore(),
  };
}

import cors from "@fastify/cors";

/**
 * Construct the Fastify app and register every route. Pure with respect to its
 * `deps`, so tests inject a mock chain / fixture config and drive it with
 * `app.inject()`.
 */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(cors, {
    origin: "*", // allow frontend dev servers
  });

  registerHealth(app, deps);
  registerConfig(app, deps);
  registerPlayer(app, deps);
  registerProofRequest(app, deps);
  registerProofAttest(app, deps);
  registerTerritory(app, deps);
  registerDemoReset(app, deps);
  registerSponsor(app, deps);

  return app;
}

/** Boot the server (used by `pnpm start` / `pnpm dev`). */
export async function start(): Promise<void> {
  const app = await buildApp(createDefaultDeps());
  const port = Number(process.env["PORT"] ?? "3000");
  const host = process.env["HOST"] ?? "0.0.0.0";
  await app.listen({ port, host });
  // eslint-disable-next-line no-console
  console.log(`orchestrator listening on http://${host}:${port}`);
}

// Run directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  start().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
