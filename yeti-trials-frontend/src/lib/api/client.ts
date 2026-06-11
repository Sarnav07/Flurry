/**
 * Typed orchestrator HTTP client (native `fetch`). Base URL is read strictly
 * from `import.meta.env.VITE_ORCHESTRATOR_URL`. Methods NEVER throw: every
 * outcome is an `ApiResult`. `u64` strings become `bigint` at this boundary.
 */
import {
  parseAttestation,
  parseConfig,
  parseHealth,
  parsePlayerState,
  parseTerritoryState,
} from '~/lib/types/parse';
import type {
  AttestationResponse,
  Config,
  HealthResponse,
  PlayerState,
  TerritoryState,
} from '~/lib/types/wire';
import type {
  AttestationResponseVM,
  ConfigVM,
  HealthVM,
  PlayerStateVM,
  TerritoryStateVM,
} from '~/lib/types/viewModels';

export type ApiError =
  | { kind: 'network'; message: string }
  | { kind: 'http'; status: number; message: string }
  | { kind: 'parse'; message: string };

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

const ok = <T>(data: T): ApiResult<T> => ({ ok: true, data });
const fail = (error: ApiError): ApiResult<never> => ({ ok: false, error });
const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export interface OrchestratorClient {
  getHealth(): Promise<ApiResult<HealthVM>>;
  getConfig(): Promise<ApiResult<ConfigVM>>;
  getPlayer(address: string): Promise<ApiResult<PlayerStateVM>>;
  getTerritory(): Promise<ApiResult<TerritoryStateVM>>;
  proofRequest(input: ProofRequestInput): Promise<ApiResult<{ pendingProofId: string }>>;
  proofAttest(input: ProofAttestInput): Promise<ApiResult<AttestationResponseVM>>;
}

export interface ProofRequestInput {
  wallet: string;
  passportId: string;
  /** u64 decimal strings (sourced from cached Config). */
  seasonId: string;
  trialId: string;
  factionId: number;
}

export interface ProofAttestInput {
  pendingProofId: string;
  wallet: string;
  passportId: string;
}

export function createOrchestratorClient(
  baseUrl: string = import.meta.env.VITE_ORCHESTRATOR_URL,
): OrchestratorClient {
  const base = baseUrl.replace(/\/+$/, '');

  async function getRaw<T>(path: string): Promise<ApiResult<T>> {
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, { headers: { accept: 'application/json' } });
    } catch (e) {
      return fail({ kind: 'network', message: msg(e) });
    }
    if (!res.ok) {
      return fail({ kind: 'http', status: res.status, message: `${res.status} ${res.statusText}` });
    }
    try {
      return ok((await res.json()) as T);
    } catch (e) {
      return fail({ kind: 'parse', message: msg(e) });
    }
  }

  async function postRaw<T>(path: string, body: unknown): Promise<ApiResult<T>> {
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      return fail({ kind: 'network', message: msg(e) });
    }
    if (!res.ok) {
      return fail({ kind: 'http', status: res.status, message: `${res.status} ${res.statusText}` });
    }
    try {
      return ok((await res.json()) as T);
    } catch (e) {
      return fail({ kind: 'parse', message: msg(e) });
    }
  }

  return {
    async getHealth() {
      const raw = await getRaw<HealthResponse>('/health');
      if (!raw.ok) return raw;
      try {
        return ok(parseHealth(raw.data));
      } catch (e) {
        return fail({ kind: 'parse', message: msg(e) });
      }
    },
    async getConfig() {
      const raw = await getRaw<Config>('/config');
      if (!raw.ok) return raw;
      try {
        return ok(parseConfig(raw.data));
      } catch (e) {
        return fail({ kind: 'parse', message: msg(e) });
      }
    },
    async getPlayer(address: string) {
      const raw = await getRaw<PlayerState>(`/player/${encodeURIComponent(address)}`);
      if (!raw.ok) return raw;
      try {
        return ok(parsePlayerState(raw.data));
      } catch (e) {
        return fail({ kind: 'parse', message: msg(e) });
      }
    },
    async getTerritory() {
      const raw = await getRaw<TerritoryState>('/territory');
      if (!raw.ok) return raw;
      try {
        return ok(parseTerritoryState(raw.data));
      } catch (e) {
        return fail({ kind: 'parse', message: msg(e) });
      }
    },
    async proofRequest(input: ProofRequestInput) {
      const raw = await postRaw<{ pendingProofId: string }>('/proof/request', input);
      if (!raw.ok) return raw;
      return ok({ pendingProofId: raw.data.pendingProofId });
    },
    async proofAttest(input: ProofAttestInput) {
      // A non-2xx here (e.g. 403 condition-not-satisfied) is the calm
      // "proof not available yet" signal; no signature is ever surfaced.
      const raw = await postRaw<AttestationResponse>('/proof/attest', input);
      if (!raw.ok) return raw;
      try {
        return ok(parseAttestation(raw.data));
      } catch (e) {
        return fail({ kind: 'parse', message: msg(e) });
      }
    },
  };
}

/** Default singleton bound to the configured orchestrator URL. */
export const orchestrator = createOrchestratorClient();
