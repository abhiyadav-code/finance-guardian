import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Base path this app is mounted under, so multiple local apps can share a host
// (e.g. localhost:8080/finance-guardian). Keep in sync with server BASE_PATH.
const BASE_PATH = "/finance-guardian";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: `${BASE_PATH}/`,
  server: {
    host: "::",
    // Dev server on its own port so it never collides with the hosted
    // production (8080) or demo (8081) instances.
    port: 8090,
    hmr: {
      overlay: false,
    },
    proxy: {
      // During dev, forward API calls to the demo backend (sandbox + seeded).
      [`${BASE_PATH}/api`]: {
        target: "http://localhost:8081",
        changeOrigin: true,
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
