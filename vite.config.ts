import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json']
  },
  preview: {
    port: 3000,
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    minify: 'terser' as const,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Core React dependencies
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react-vendor';
          }
          
          // Radix UI components
          if (id.includes('node_modules/@radix-ui')) {
            return 'radix-ui';
          }
          
          // Chart and visualization libraries
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) {
            return 'charts';
          }
          
          // Form handling and validation
          if (id.includes('node_modules/react-hook-form') || 
              id.includes('node_modules/zod') || 
              id.includes('node_modules/@hookform')) {
            return 'forms';
          }
          
          // Supabase
          if (id.includes('node_modules/@supabase')) {
            return 'supabase';
          }
          
          // React Router
          if (id.includes('node_modules/react-router-dom') || 
              id.includes('node_modules/react-router')) {
            return 'router';
          }
          
          // React Query
          if (id.includes('node_modules/@tanstack/react-query')) {
            return 'react-query';
          }
          
          // Date utilities
          if (id.includes('node_modules/date-fns') || 
              id.includes('node_modules/react-day-picker')) {
            return 'date-utils';
          }
          
          // Icons
          if (id.includes('node_modules/lucide-react')) {
            return 'icons';
          }
          
          // Other node_modules
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
      },
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
    exclude: []
  }
}));