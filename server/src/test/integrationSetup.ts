import "./setup.js";
import { requireIntegrationDatabaseUrl } from "./integrationDatabaseUrl.js";

// The ordinary setup intentionally points at a non-production placeholder.
// Integration tests replace it only with the explicitly supplied disposable URL.
process.env.DATABASE_URL = requireIntegrationDatabaseUrl();
