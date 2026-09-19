/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { createAppHandler } from "../server/src/http.js";
import { loadAiEnv } from "../server/src/env.js";

export default defineConfig({
  // ui.test.ts is a Playwright spec (npm run test:ui); keep it out of vitest.
  test: { include: ["src/**/*.test.ts"] },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          "three-vendor": ["three"],
        },
      },
    },
  },
  plugins: [{
    name: "kolher-ai-api",
    configureServer(server) {
      const handle = createAppHandler({
        webRoot: fileURLToPath(new URL("./dist", import.meta.url)),
        aiEnv: loadAiEnv(fileURLToPath(new URL("../../.env", import.meta.url))),
      });
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] !== "/api/nim") return next();
        void handle(req, res).catch(() => {
          if (res.writableEnded || res.destroyed) return;
          res.writeHead(500, { "Content-Type": "application/json", "Cache-Control": "no-store" });
          res.end(JSON.stringify({ code: "server-error", error: "AI request failed. Restart the server. Existing work is unchanged." }));
        });
      });
    },
  }],
});
