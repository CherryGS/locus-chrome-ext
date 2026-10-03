import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: false,
  plugins: [tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('../..', import.meta.url)) } },
  server: { host: '127.0.0.1', port: 5180, strictPort: true, fs: { deny: ['**/*.md', '**/.impeccable/**', '**/.env*', '**/.git/**'] } },
  build: {
    outDir: '../../.impeccable/design-build/quiet-ledger', emptyOutDir: true,
    rolldownOptions: { input: { sample: fileURLToPath(new URL('index.html', import.meta.url)), comparison: fileURLToPath(new URL('comparison.html', import.meta.url)) } },
  },
});
