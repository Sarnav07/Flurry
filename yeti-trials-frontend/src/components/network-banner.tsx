import { useBootData } from '~/lib/state/boot';

/**
 * Network_Banner. Displays the authoritative network of record from GET /health
 * (via the Boot_Loader cache), never from env or a source constant.
 */
export function NetworkBanner() {
  const { network } = useBootData();
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 border-b border-frost-line bg-frost-deep px-4 py-1.5 text-xs text-frost-mist"
      style={{ zIndex: 'var(--z-banner)' }}
    >
      <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-frost-glow" />
      <span>Network</span>
      <span className="font-medium text-frost-ice">{network}</span>
    </div>
  );
}
