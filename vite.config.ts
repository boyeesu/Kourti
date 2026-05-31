import { defineConfig } from 'vite';
// @ts-expect-error - vite plugin types are handled by vite
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: 'localhost',
    port: 8081,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // Generates manifest icon entries + injects favicon/apple-touch links
      // from pwa-assets.config.ts (run `npm run generate:pwa-assets` to rebuild).
      pwaAssets: { config: true, overrideManifestIcons: true },
      manifest: {
        name: 'Kourti AI — Legal Practice Management',
        short_name: 'Kourti',
        description:
          'Manage cases, clients, contracts, documents, billing, and team collaboration — all in one place.',
        id: '/',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#eff2f6',
        theme_color: '#256ada',
        categories: ['business', 'productivity'],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        // SPA fallback so installed app deep-links resolve to index.html,
        // but never hijack API/auth requests.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/auth/, /^\/portal/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        // Precache app shell only; never cache API responses (avoids serving
        // stale case/client data offline). Larger bundles are allowed through.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      // Keep the SW out of dev to avoid caching surprises while developing.
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
    // Keep .tsx before .ts to avoid silently resolving stale duplicate hooks
    extensions: ['.mjs', '.js', '.tsx', '.ts', '.jsx', '.json'],
  },
  preview: {
    port: 3000,
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: mode === 'development',
    minify: 'terser' as const,
    chunkSizeWarningLimit: 2000, // Increased from 1000 to reduce warning noise for larger chunks
    rollupOptions: {
      output: {
        // Keep manual chunking minimal to avoid circular dependencies between
        // vendor bundles. Splitting every `node_modules` package into a manual
        // chunk was causing the Radix UI bundle to execute before the React
        // vendor chunk had finished initialising which resulted in `React`
        // being `undefined` at runtime. By only extracting the heaviest
        // independent bundles we allow Rollup to manage the remaining module
        // graph automatically and prevent those cycles.
        manualChunks: (id) => {
          if (
            id.includes('node_modules/react') ||
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/use-sync-external-store')
          ) {
            return 'react-vendor';
          }

          if (id.includes('node_modules/@tanstack/react-query')) {
            return 'react-query';
          }

          return undefined;
        },
      },
    },
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      '@radix-ui/react-select',
      '@radix-ui/react-context',
      '@radix-ui/react-primitive',
      '@radix-ui/react-slot',
    ],
    exclude: [],
  },
}));
