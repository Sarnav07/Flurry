import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { ConnectBar } from '~/components/wallet/connect-bar';
import { NetworkBanner } from '~/components/network-banner';

/**
 * Primary navigation. Admin (Requirement 14.2) is intentionally absent from the
 * default player navigation; it is reached only behind an explicit operator
 * guard added in Phase 6.
 */
const NAV: ReadonlyArray<{ to: string; label: string }> = [
  { to: '/', label: 'Home' },
  { to: '/play', label: 'Map' },
  { to: '/proof', label: 'Proofs' },
  { to: '/profile', label: 'Profile' },
  { to: '/impact', label: 'Impact' },
  { to: '/sponsor', label: 'Sponsor' },
  { to: '/trust', label: 'Trust' },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <NetworkBanner />

      <header
        className="sticky top-0 flex h-16 items-center gap-6 border-b border-frost-line bg-frost-void/85 px-6 backdrop-blur-sm"
        style={{ zIndex: 'var(--z-sticky)' }}
      >
        <Link to="/" className="flex items-baseline gap-2 no-underline">
          <span className="text-sm font-semibold tracking-tight text-frost-ice">
            Yeti Trials
          </span>
          <span className="text-xs text-frost-mist">Genesis Frost</span>
        </Link>

        <nav aria-label="Primary" className="flex items-center gap-1 overflow-x-auto">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded px-3 py-1.5 text-sm text-frost-mist no-underline transition-colors hover:text-frost-ice"
              activeProps={{ className: 'text-frost-ice' }}
              activeOptions={{ exact: item.to === '/' }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto">
          <ConnectBar />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1200px] flex-1 px-6 py-12">{children}</main>
    </div>
  );
}
