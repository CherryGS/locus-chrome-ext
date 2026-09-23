import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'Locus capture',
    description: 'Capture supported Twitter posts and Bilibili video parts, retain results, and export files with JSON metadata.',
    minimum_chrome_version: '116',
    permissions: ['offscreen', 'scripting', 'downloads', 'unlimitedStorage', 'storage', 'alarms', 'declarativeNetRequestWithHostAccess'],
    optional_host_permissions: ['http://127.0.0.1/*', 'https://x.com/*', 'https://twitter.com/*', 'https://pbs.twimg.com/*', 'https://video.twimg.com/*', 'https://www.bilibili.com/*', 'https://space.bilibili.com/*', 'https://api.bilibili.com/*', 'https://*.bilivideo.com/*', 'https://*.hdslb.com/*'],
    action: { default_title: 'Open Locus results' },
  },
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  hooks: {
    'vite:build:extendConfig'(entries, config) {
      if (entries.length < 2) return;
      config.build ??= {};
      config.build.rolldownOptions ??= {};
      const options = config.build.rolldownOptions;
      // Keep shared helpers out of either HTML entry's initialization chunk.
      // Otherwise cross-entry imports can run the results React mount inside
      // the offscreen document, which intentionally has no UI root.
      options.preserveEntrySignatures = 'strict';
      options.output = { ...(Array.isArray(options.output) ? {} : options.output), strictExecutionOrder: true };
    },
  },
});
