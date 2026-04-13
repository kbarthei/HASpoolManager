import { defineConfig } from "vitest/config";
import path from "path";
import { config } from "dotenv";

// Load .env.local so API_SECRET_KEY and other env vars are available in tests
config({ path: path.resolve(__dirname, ".env.local") });

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
