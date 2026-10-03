import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: false,
  plugins: [tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('../..', import.meta.url)) } },
  server: {
    host: '127.0.0.1', port: 5178, strictPort: true,
    fs: { deny: ['**/*.md', '**/.impeccable/**', '**/.env*', '**/.git/**'] },
  },
  build: { outDir: '../../.impeccable/design-build/signal-shelf', emptyOutDir: true },
});
