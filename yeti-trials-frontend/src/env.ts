/**
 * Typed, validated access to the `VITE_`-prefixed environment.
 *
 * This module is the ONLY place raw `import.meta.env` is read. It never holds a
 * package / object / season / trial id: those come from GET /config at runtime.
 * Booleans default to `false` so every cinematic / onboarding flag is opt-in.
 */

type SuiNetwork = 'localnet' | 'testnet';

const flag = (raw: string | undefined): boolean => raw === 'true' || raw === '1';

const network = (raw: string | undefined): SuiNetwork =>
  raw === 'testnet' ? 'testnet' : 'localnet';

export interface FrontendEnv {
  /** Base URL of the orchestrator (frontend API + demo oracle + chain reader). */
  readonly orchestratorUrl: string;
  /** Configured Sui network. The displayed network of record still comes from GET /health. */
  readonly suiNetwork: SuiNetwork;
  /** Optional explicit RPC URL; empty string means "use the network default". */
  readonly suiRpcUrl: string;
  /** Enable the lazy-loaded R3F 3D scene (otherwise the 2.5D fallback renders). */
  readonly enable3D: boolean;
  /** Enable the post-processing stack (3D path + capable device only). */
  readonly enablePostFx: boolean;
  /** Surface demo-only affordances. */
  readonly demoMode: boolean;
  /** Enable optional zkLogin onboarding + sponsored first-run. */
  readonly enableZkLogin: boolean;
}

export const env: FrontendEnv = {
  orchestratorUrl: import.meta.env.VITE_ORCHESTRATOR_URL ?? 'http://localhost:3000',
  suiNetwork: network(import.meta.env.VITE_SUI_NETWORK),
  suiRpcUrl: import.meta.env.VITE_SUI_RPC_URL ?? '',
  enable3D: flag(import.meta.env.VITE_ENABLE_3D),
  enablePostFx: flag(import.meta.env.VITE_ENABLE_POST_FX),
  demoMode: flag(import.meta.env.VITE_DEMO_MODE),
  enableZkLogin: flag(import.meta.env.VITE_ENABLE_ZKLOGIN),
};
