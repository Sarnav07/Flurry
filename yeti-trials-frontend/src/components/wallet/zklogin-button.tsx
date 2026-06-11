import { env } from '~/env';

/**
 * Optional zkLogin onboarding, gated by VITE_ENABLE_ZKLOGIN (default off). It is
 * onboarding convenience only: NOT personhood verification and NOT Sybil
 * resistance. When the flag is off it renders nothing and the standard wallet +
 * direct-submit path remains the complete, sufficient flow. The full OAuth/proof
 * exchange lands later; this gate keeps the surface honest until then.
 */
export function ZkLoginButton() {
  if (!env.enableZkLogin) return null;
  return (
    <button
      type="button"
      disabled
      title="zkLogin onboarding (convenience only, not Sybil resistance). Coming soon."
      className="rounded border border-frost-line px-3 py-1.5 text-xs text-frost-mist opacity-60"
    >
      Continue with zkLogin
    </button>
  );
}
