// Deterministic env for unit tests — overrides anything inherited from the shell.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
process.env.BASE_URL = "http://localhost:3000";
process.env.WEB_URL = "http://localhost:5173";
process.env.JWT_SECRET = "test-jwt-secret-0123456789";
process.env.ENCRYPTION_KEY = "a".repeat(64);
