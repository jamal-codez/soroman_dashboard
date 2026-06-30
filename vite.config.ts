import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
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
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // ---------------------------------------------------------------------------
    // Manual chunks – split heavy vendor libraries into separate, long-cached
    // bundles so users only re-download what actually changed between deploys.
    // ---------------------------------------------------------------------------
    rollupOptions: {
      output: {
        manualChunks: {
          // React core (~140KB) – changes very rarely
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Data layer (~50KB)
          'vendor-query': ['@tanstack/react-query'],
          // Charting (~180KB) – only needed on Dashboard/Reports
          'vendor-charts': ['recharts'],
          // Date utilities (~30KB)
          'vendor-date': ['date-fns'],
          // Radix UI primitives (~80KB combined)
          'vendor-radix': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-popover',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-tabs',
            '@radix-ui/react-select',
            '@radix-ui/react-toast',
          ],
        },
      },
    },
  },
}));
