/**
 * Typed orchestrator HTTP client (native `fetch`). Base URL is read strictly
 * from `import.meta.env.VITE_ORCHESTRATOR_URL`. Methods NEVER throw: every
 * outcome is an `ApiResult`. `u64` strings become `bigint` at this boundary.
 */
import { parseConfig, parseHealth, parsePlayerState } from '~/lib/types/parse';
import type { Config, HealthResponse, PlayerState } from '~/lib/types/wire';
import type { ConfigVM, HealthVM, PlayerStateVM } from '~/lib/types/viewModels';

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
  };
}

/** Default singleton bound to the configured orchestrator URL. */
export const orchestrator = createOrchestratorClient();
