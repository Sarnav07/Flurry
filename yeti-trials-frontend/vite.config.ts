import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { defineConfig } from 'vite';
import viteReact from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { nitro } from 'nitro/vite';

export default defineConfig({
  server: {
    // Orchestrator (frontend API + demo oracle) owns :3000, so the frontend
    // dev server binds elsewhere to avoid a clash on the default demo port.
    port: 3001,
  },
  resolve: {
    // Honors the `~/*` -> `./src/*` paths from tsconfig.json.
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    tanstackStart({ srcDirectory: 'src' }),
    viteReact(),
    nitro(),
  ],
});
