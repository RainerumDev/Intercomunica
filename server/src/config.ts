import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  /// Google Cloud OAuth client (Web application)
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  /// Public base URL of the backend, used for OAuth redirect URIs
  BASE_URL: z.string().url().default("http://localhost:3000"),
  /// Frontend origin to redirect back to after login
  WEB_URL: z.string().url().default("http://localhost:5173"),
  /// Secret for signing session JWTs
  JWT_SECRET: z.string().min(16),
  /// 32-byte hex key for AES-256-GCM encryption of stored refresh tokens
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, "must be 64 hex chars (32 bytes)"),
  /// Comma-separated list of emails granted ADMIN role at login
  ADMIN_EMAILS: z.string().default(""),
  /// Comma-separated addresses that must not receive a personal calendar
  CALENDAR_EXCLUDED_EMAILS: z.string().default(""),
  /// If set (e.g. "rainerum.it"), only accounts of this domain can log in
  ALLOWED_EMAIL_DOMAIN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function config(): Env {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `  ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      throw new Error(`Invalid environment configuration:\n${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export function adminEmails(): Set<string> {
  return new Set(
    config()
      .ADMIN_EMAILS.split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function calendarExcludedEmails(): Set<string> {
  return new Set(
    config()
      .CALENDAR_EXCLUDED_EMAILS.split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function usesPersonalCalendar(email: string): boolean {
  return !calendarExcludedEmails().has(email.trim().toLowerCase());
}
