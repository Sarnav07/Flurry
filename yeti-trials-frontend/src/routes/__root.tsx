import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { AppShell } from '~/components/app-shell';
import { BootGate } from '~/components/boot-gate';
import { DefaultCatchBoundary } from '~/components/default-catch-boundary';
import { NotFound } from '~/components/not-found';
import { Providers } from '~/components/providers';
import appCss from '~/styles/app.css?url';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'color-scheme', content: 'dark' },
      { title: 'Yeti Trials | Genesis Frost' },
      {
        name: 'description',
        content:
          'Yeti Trials: a Sui-native faction engine. Submit provenance-tagged proofs and watch the frozen territory map evolve.',
      },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  errorComponent: DefaultCatchBoundary,
  notFoundComponent: () => <NotFound />,
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Providers>
          <BootGate>
            <AppShell>{children}</AppShell>
          </BootGate>
        </Providers>
        <Scripts />
      </body>
    </html>
  );
}
