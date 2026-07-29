import { HttpError, type ApiError } from "@/shared/infrastructure/http/http-error";
import { clearAuthed } from "@/auth/infrastructure/session-marker";

const API_BASE = import.meta.env.VITE_API_URL;

async function send<T>(path: string, init: RequestInit, parseJson: boolean): Promise<T> {
  // No Authorization header: the session is an httpOnly cookie, and the SPA is
  // single-origin with the API in both dev and prod, so the browser attaches it
  // to every request here without being asked.
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    // 401 = session expired or revoked. Drop the marker and bounce to /login —
    // unless we're already on /login (a bad-credentials login also 401s; let it
    // surface).
    if (res.status === 401 && !location.pathname.startsWith("/login")) {
      clearAuthed();
      location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
    }
    let body: ApiError | null = null;
    try {
      body = (await res.json()) as ApiError;
    } catch {
      // body not JSON
    }
    const detail = body?.message ?? (body as { error?: string } | null)?.error;
    const fallback =
      res.status === 403
        ? "You don't have permission to do this"
        : res.statusText || `Request failed (${res.status})`;
    throw new HttpError(res.status, body, detail || fallback);
  }
  if (!parseJson || res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function httpGet<T>(path: string): Promise<T> {
  return send<T>(path, {}, true);
}

export function httpPost<T>(path: string, body?: unknown): Promise<T> {
  const hasBody = body !== undefined;
  return send<T>(
    path,
    {
      method: "POST",
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      body: hasBody ? JSON.stringify(body) : undefined,
    },
    true,
  );
}

export function httpPut<T>(path: string, body: unknown): Promise<T> {
  return send<T>(
    path,
    { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    true,
  );
}

export function httpPatch<T>(path: string, body: unknown): Promise<T> {
  return send<T>(
    path,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    true,
  );
}

export function httpDelete(path: string, body?: unknown): Promise<void> {
  const hasBody = body !== undefined;
  return send<void>(
    path,
    {
      method: "DELETE",
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      body: hasBody ? JSON.stringify(body) : undefined,
    },
    false,
  );
}
