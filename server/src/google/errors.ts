export interface MappedGoogleError {
  httpStatus: number;
  body: { error: string; code: string };
}

interface GaxiosLike {
  status?: number;
  code?: number | string;
  message?: string;
  config?: { url?: string };
}

/**
 * Translate Google API (gaxios) failures into actionable HTTP responses,
 * instead of a generic 500. Returns null for non-Google errors.
 */
export function mapGoogleError(err: unknown): MappedGoogleError | null {
  if (typeof err !== "object" || err === null) return null;
  const e = err as GaxiosLike;
  const url = e.config?.url ?? "";
  const message = e.message ?? "";
  const status = typeof e.status === "number" ? e.status : typeof e.code === "number" ? e.code : undefined;

  // Refresh token revoked/expired → the master account must be re-connected.
  if (message.includes("invalid_grant")) {
    return {
      httpStatus: 409,
      body: {
        code: "MASTER_TOKEN_REVOKED",
        error:
          "Autorizzazione dell'account master scaduta o revocata. Ricollegare l'account Google dalle Impostazioni.",
      },
    };
  }

  if (!url.includes("googleapis.com") || status === undefined) return null;

  if (status === 403 && url.includes("admin.googleapis.com")) {
    return {
      httpStatus: 403,
      body: {
        code: "DIRECTORY_FORBIDDEN",
        error:
          "L'account master non ha privilegi di amministratore sulla Directory. " +
          "Richiedere all'amministratore Google Workspace un ruolo delegato con privilegio " +
          "«Admin API → Gruppi → Lettura» per l'account master.",
      },
    };
  }

  if (status === 403 && url.includes("gmail.googleapis.com")) {
    return {
      httpStatus: 403,
      body: {
        code: "GMAIL_FORBIDDEN",
        error:
          "Permessi Gmail insufficienti per l'account master. Ricollegare l'account accettando tutti i permessi richiesti.",
      },
    };
  }

  if (status === 403) {
    return {
      httpStatus: 403,
      body: {
        code: "GOOGLE_FORBIDDEN",
        error: "Google ha negato l'operazione: permessi insufficienti per l'account master.",
      },
    };
  }

  if (status === 401) {
    return {
      httpStatus: 409,
      body: {
        code: "MASTER_TOKEN_REVOKED",
        error:
          "Credenziali Google non più valide. Ricollegare l'account master dalle Impostazioni.",
      },
    };
  }

  if (status === 429) {
    return {
      httpStatus: 503,
      body: {
        code: "GOOGLE_RATE_LIMITED",
        error: "Limite di richieste Google raggiunto. Riprovare tra qualche minuto.",
      },
    };
  }

  return null;
}
