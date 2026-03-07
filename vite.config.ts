import { defineConfig } from 'vite';
// @ts-expect-error - vite plugin types are handled by vite
import react from '@vitejs/plugin-react';
import path from 'path';
import { componentTagger } from 'lovable-tagger';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: 'localhost',
    port: 8081,
  },
  plugins: [react(), mode === 'development' && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json'],
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

          if (id.includes('node_modules/@supabase')) {
            return 'supabase';
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
