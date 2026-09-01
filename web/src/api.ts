import type { SharedResource, SharedResourceDraft } from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  if (!res.ok) {
    let message = `Errore ${res.status}`;
    let code: string | undefined;
    try {
      const data = (await res.json()) as { error?: string; code?: string };
      if (data.error) message = data.error;
      code = data.code;
    } catch {
      /* non-JSON body */
    }
    throw new ApiError(res.status, message, code);
  }
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export interface ResourcePreview {
  finalUrl: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
}

export const adminResourcesApi = {
  list: () => api.get<SharedResource[]>("/api/admin/resources"),
  preview: (url: string) =>
    api.post<ResourcePreview>("/api/admin/resources/preview", { url }),
  create: (draft: SharedResourceDraft) =>
    api.post<SharedResource>("/api/admin/resources", draft),
  update: (id: string, draft: SharedResourceDraft) =>
    api.put<SharedResource>(`/api/admin/resources/${id}`, draft),
  remove: (id: string) => api.delete<{ ok: true }>(`/api/admin/resources/${id}`),
  reorder: (resourceIds: string[]) =>
    api.put<SharedResource[]>("/api/admin/resources/order", { resourceIds }),
};
