interface IntegrationEnvironment {
  INTERCOMUNICA_INTEGRATION_DATABASE_URL?: string;
}

const missingIntegrationDatabaseMessage =
  "INTERCOMUNICA_INTEGRATION_DATABASE_URL is required for integration tests. " +
  "Point it to a migrated, disposable PostgreSQL database; never use development or production data.";

export function requireIntegrationDatabaseUrl(
  env: IntegrationEnvironment = process.env
): string {
  const databaseUrl = env.INTERCOMUNICA_INTEGRATION_DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error(missingIntegrationDatabaseMessage);
  return databaseUrl;
}
