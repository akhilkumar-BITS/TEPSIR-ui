import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development the UI proxies API calls to the FastAPI service so the
// browser sees a single origin and no CORS configuration is needed.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_PROXY_TARGET ?? "http://localhost:8000",
        changeOrigin: true,
      },
      "/healthz": {
        target: process.env.VITE_PROXY_TARGET ?? "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
