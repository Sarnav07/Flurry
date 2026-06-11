import type { ReactNode } from 'react';

/**
 * Shell placeholder for routes whose behavior lands in later phases. Kept
 * deliberately plain and honest: it states what the surface will do without
 * claiming any functionality that is not yet wired.
 */
export function RouteStub({
  title,
  phase,
  children,
}: {
  title: string;
  phase: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <p className="text-xs font-medium tracking-tight text-frost-mist">{phase}</p>
      <h1 className="text-3xl font-semibold tracking-tight text-frost-ice">{title}</h1>
      <p className="max-w-[65ch] text-frost-mist">{children}</p>
    </section>
  );
}
