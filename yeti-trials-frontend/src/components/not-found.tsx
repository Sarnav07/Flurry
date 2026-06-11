import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

export function NotFound({ children }: { children?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-4 py-12">
      <h1 className="text-xl font-semibold text-frost-ice">Lost in the frost</h1>
      <p className="max-w-[60ch] text-sm text-frost-mist">
        {children ?? 'This route does not exist.'}
      </p>
      <Link
        to="/"
        className="rounded border border-frost-line px-3 py-1.5 text-sm text-frost-ice no-underline transition-colors hover:border-frost-glow"
      >
        Back to home
      </Link>
    </div>
  );
}
