import { defineConfig } from "vitest/config";
import { requireIntegrationDatabaseUrl } from "./src/test/integrationDatabaseUrl.js";

requireIntegrationDatabaseUrl();

export default defineConfig({
  test: {
    include: ["src/**/*.integration.test.ts"],
    setupFiles: ["src/test/integrationSetup.ts"],
  },
});
