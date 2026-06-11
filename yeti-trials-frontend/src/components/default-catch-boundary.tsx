import {
  ErrorComponent,
  Link,
  rootRouteId,
  useMatch,
  useRouter,
  type ErrorComponentProps,
} from '@tanstack/react-router';

/**
 * Calm, branded catch boundary. Honest by default: it reports a problem without
 * dressing it up as a confirmed or successful state.
 */
export function DefaultCatchBoundary({ error }: ErrorComponentProps) {
  const router = useRouter();
  const isRoot = useMatch({
    strict: false,
    select: (state) => state.id === rootRouteId,
  });

  return (
    <div className="flex flex-col items-start gap-4 py-12">
      <h1 className="text-xl font-semibold text-frost-ice">Something went wrong</h1>
      <p className="max-w-[60ch] text-sm text-frost-mist">
        The interface hit an unexpected error. Your on-chain state is unaffected.
      </p>
      <ErrorComponent error={error} />
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => void router.invalidate()}
          className="rounded border border-frost-line px-3 py-1.5 text-sm text-frost-ice transition-colors hover:border-frost-glow"
        >
          Try again
        </button>
        {isRoot ? (
          <Link
            to="/"
            className="rounded border border-frost-line px-3 py-1.5 text-sm text-frost-ice no-underline transition-colors hover:border-frost-glow"
          >
            Home
          </Link>
        ) : null}
      </div>
    </div>
  );
}
