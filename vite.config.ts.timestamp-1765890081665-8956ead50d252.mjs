// vite.config.ts
import { defineConfig } from "file:///C:/Users/Daniel.Esuga/KT/kouti-legal-hub-41/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/Daniel.Esuga/KT/kouti-legal-hub-41/node_modules/@vitejs/plugin-react/dist/index.js";
import path from "path";
import { componentTagger } from "file:///C:/Users/Daniel.Esuga/KT/kouti-legal-hub-41/node_modules/lovable-tagger/dist/index.js";
var __vite_injected_original_dirname = "C:\\Users\\Daniel.Esuga\\KT\\kouti-legal-hub-41";
var vite_config_default = defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080
  },
  plugins: [
    react(),
    mode === "development" && componentTagger()
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src")
    },
    extensions: [".mjs", ".js", ".ts", ".jsx", ".tsx", ".json"]
  },
  preview: {
    port: 3e3,
    strictPort: false
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    minify: "terser",
    chunkSizeWarningLimit: 1e3,
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
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom") || id.includes("node_modules/use-sync-external-store")) {
            return "react-vendor";
          }
          if (id.includes("node_modules/@supabase")) {
            return "supabase";
          }
          if (id.includes("node_modules/@tanstack/react-query")) {
            return "react-query";
          }
          return void 0;
        }
      }
    }
  },
  optimizeDeps: {
    include: ["react", "react-dom"],
    exclude: []
  }
}));
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxEYW5pZWwuRXN1Z2FcXFxcS1RcXFxca291dGktbGVnYWwtaHViLTQxXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxEYW5pZWwuRXN1Z2FcXFxcS1RcXFxca291dGktbGVnYWwtaHViLTQxXFxcXHZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9DOi9Vc2Vycy9EYW5pZWwuRXN1Z2EvS1Qva291dGktbGVnYWwtaHViLTQxL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSBcInZpdGVcIjtcclxuaW1wb3J0IHJlYWN0IGZyb20gXCJAdml0ZWpzL3BsdWdpbi1yZWFjdFwiO1xyXG5pbXBvcnQgcGF0aCBmcm9tIFwicGF0aFwiO1xyXG5pbXBvcnQgeyBjb21wb25lbnRUYWdnZXIgfSBmcm9tIFwibG92YWJsZS10YWdnZXJcIjtcclxuXHJcbi8vIGh0dHBzOi8vdml0ZWpzLmRldi9jb25maWcvXHJcbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZygoeyBtb2RlIH0pID0+ICh7XHJcbiAgc2VydmVyOiB7XHJcbiAgICBob3N0OiBcIjo6XCIsXHJcbiAgICBwb3J0OiA4MDgwLFxyXG4gIH0sXHJcbiAgcGx1Z2luczogW1xyXG4gICAgcmVhY3QoKSxcclxuICAgIG1vZGUgPT09ICdkZXZlbG9wbWVudCcgJiYgY29tcG9uZW50VGFnZ2VyKCksXHJcbiAgXS5maWx0ZXIoQm9vbGVhbiksXHJcbiAgcmVzb2x2ZToge1xyXG4gICAgYWxpYXM6IHtcclxuICAgICAgXCJAXCI6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsIFwiLi9zcmNcIiksXHJcbiAgICB9LFxyXG4gICAgZXh0ZW5zaW9uczogWycubWpzJywgJy5qcycsICcudHMnLCAnLmpzeCcsICcudHN4JywgJy5qc29uJ11cclxuICB9LFxyXG4gIHByZXZpZXc6IHtcclxuICAgIHBvcnQ6IDMwMDAsXHJcbiAgICBzdHJpY3RQb3J0OiBmYWxzZSxcclxuICB9LFxyXG4gIGJ1aWxkOiB7XHJcbiAgICBvdXREaXI6ICdkaXN0JyxcclxuICAgIHNvdXJjZW1hcDogdHJ1ZSxcclxuICAgIG1pbmlmeTogJ3RlcnNlcicgYXMgY29uc3QsXHJcbiAgICBjaHVua1NpemVXYXJuaW5nTGltaXQ6IDEwMDAsXHJcbiAgICByb2xsdXBPcHRpb25zOiB7XHJcbiAgICAgIG91dHB1dDoge1xyXG4gICAgICAgIC8vIEtlZXAgbWFudWFsIGNodW5raW5nIG1pbmltYWwgdG8gYXZvaWQgY2lyY3VsYXIgZGVwZW5kZW5jaWVzIGJldHdlZW5cclxuICAgICAgICAvLyB2ZW5kb3IgYnVuZGxlcy4gU3BsaXR0aW5nIGV2ZXJ5IGBub2RlX21vZHVsZXNgIHBhY2thZ2UgaW50byBhIG1hbnVhbFxyXG4gICAgICAgIC8vIGNodW5rIHdhcyBjYXVzaW5nIHRoZSBSYWRpeCBVSSBidW5kbGUgdG8gZXhlY3V0ZSBiZWZvcmUgdGhlIFJlYWN0XHJcbiAgICAgICAgLy8gdmVuZG9yIGNodW5rIGhhZCBmaW5pc2hlZCBpbml0aWFsaXNpbmcgd2hpY2ggcmVzdWx0ZWQgaW4gYFJlYWN0YFxyXG4gICAgICAgIC8vIGJlaW5nIGB1bmRlZmluZWRgIGF0IHJ1bnRpbWUuIEJ5IG9ubHkgZXh0cmFjdGluZyB0aGUgaGVhdmllc3RcclxuICAgICAgICAvLyBpbmRlcGVuZGVudCBidW5kbGVzIHdlIGFsbG93IFJvbGx1cCB0byBtYW5hZ2UgdGhlIHJlbWFpbmluZyBtb2R1bGVcclxuICAgICAgICAvLyBncmFwaCBhdXRvbWF0aWNhbGx5IGFuZCBwcmV2ZW50IHRob3NlIGN5Y2xlcy5cclxuICAgICAgICBtYW51YWxDaHVua3M6IChpZCkgPT4ge1xyXG4gICAgICAgICAgaWYgKFxyXG4gICAgICAgICAgICBpZC5pbmNsdWRlcygnbm9kZV9tb2R1bGVzL3JlYWN0JykgfHxcclxuICAgICAgICAgICAgaWQuaW5jbHVkZXMoJ25vZGVfbW9kdWxlcy9yZWFjdC1kb20nKSB8fFxyXG4gICAgICAgICAgICBpZC5pbmNsdWRlcygnbm9kZV9tb2R1bGVzL3VzZS1zeW5jLWV4dGVybmFsLXN0b3JlJylcclxuICAgICAgICAgICkge1xyXG4gICAgICAgICAgICByZXR1cm4gJ3JlYWN0LXZlbmRvcic7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdub2RlX21vZHVsZXMvQHN1cGFiYXNlJykpIHtcclxuICAgICAgICAgICAgcmV0dXJuICdzdXBhYmFzZSc7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdub2RlX21vZHVsZXMvQHRhbnN0YWNrL3JlYWN0LXF1ZXJ5JykpIHtcclxuICAgICAgICAgICAgcmV0dXJuICdyZWFjdC1xdWVyeSc7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcclxuICAgICAgICB9LFxyXG4gICAgICB9LFxyXG4gICAgfSxcclxuICB9LFxyXG4gIG9wdGltaXplRGVwczoge1xyXG4gICAgaW5jbHVkZTogWydyZWFjdCcsICdyZWFjdC1kb20nXSxcclxuICAgIGV4Y2x1ZGU6IFtdXHJcbiAgfVxyXG59KSk7XHJcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBNlQsU0FBUyxvQkFBb0I7QUFDMVYsT0FBTyxXQUFXO0FBQ2xCLE9BQU8sVUFBVTtBQUNqQixTQUFTLHVCQUF1QjtBQUhoQyxJQUFNLG1DQUFtQztBQU16QyxJQUFPLHNCQUFRLGFBQWEsQ0FBQyxFQUFFLEtBQUssT0FBTztBQUFBLEVBQ3pDLFFBQVE7QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOLE1BQU07QUFBQSxFQUNSO0FBQUEsRUFDQSxTQUFTO0FBQUEsSUFDUCxNQUFNO0FBQUEsSUFDTixTQUFTLGlCQUFpQixnQkFBZ0I7QUFBQSxFQUM1QyxFQUFFLE9BQU8sT0FBTztBQUFBLEVBQ2hCLFNBQVM7QUFBQSxJQUNQLE9BQU87QUFBQSxNQUNMLEtBQUssS0FBSyxRQUFRLGtDQUFXLE9BQU87QUFBQSxJQUN0QztBQUFBLElBQ0EsWUFBWSxDQUFDLFFBQVEsT0FBTyxPQUFPLFFBQVEsUUFBUSxPQUFPO0FBQUEsRUFDNUQ7QUFBQSxFQUNBLFNBQVM7QUFBQSxJQUNQLE1BQU07QUFBQSxJQUNOLFlBQVk7QUFBQSxFQUNkO0FBQUEsRUFDQSxPQUFPO0FBQUEsSUFDTCxRQUFRO0FBQUEsSUFDUixXQUFXO0FBQUEsSUFDWCxRQUFRO0FBQUEsSUFDUix1QkFBdUI7QUFBQSxJQUN2QixlQUFlO0FBQUEsTUFDYixRQUFRO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxRQVFOLGNBQWMsQ0FBQyxPQUFPO0FBQ3BCLGNBQ0UsR0FBRyxTQUFTLG9CQUFvQixLQUNoQyxHQUFHLFNBQVMsd0JBQXdCLEtBQ3BDLEdBQUcsU0FBUyxzQ0FBc0MsR0FDbEQ7QUFDQSxtQkFBTztBQUFBLFVBQ1Q7QUFFQSxjQUFJLEdBQUcsU0FBUyx3QkFBd0IsR0FBRztBQUN6QyxtQkFBTztBQUFBLFVBQ1Q7QUFFQSxjQUFJLEdBQUcsU0FBUyxvQ0FBb0MsR0FBRztBQUNyRCxtQkFBTztBQUFBLFVBQ1Q7QUFFQSxpQkFBTztBQUFBLFFBQ1Q7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQSxFQUNBLGNBQWM7QUFBQSxJQUNaLFNBQVMsQ0FBQyxTQUFTLFdBQVc7QUFBQSxJQUM5QixTQUFTLENBQUM7QUFBQSxFQUNaO0FBQ0YsRUFBRTsiLAogICJuYW1lcyI6IFtdCn0K
