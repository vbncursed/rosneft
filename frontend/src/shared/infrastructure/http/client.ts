import { HttpError, type ApiError } from "@/shared/infrastructure/http/http-error";

const SERVER_API_BASE =
  process.env.GATEWAY_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8080";

// On the client we hit same-origin so the Next.js BFF proxy injects the Bearer.
// On the server there is no host context, so an absolute URL is required.
function apiBase(): string {
  return typeof window === "undefined" ? SERVER_API_BASE : "";
}

// On the server there is no same-origin proxy, so attach the session cookie's
// token directly. On the client the browser sends the httpOnly cookie to the
// same-origin /api proxy, which injects the header — so nothing to add here.
async function authHeaders(): Promise<Record<string, string>> {
  if (typeof window !== "undefined") return {};
  const { cookies } = await import("next/headers");
  const token = (await cookies()).get("session")?.value;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function send<T>(
  path: string,
  init: RequestInit,
  parseJson: boolean,
): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: { Accept: "application/json", ...(await authHeaders()), ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    // Server-side 401 with a session cookie present = the token expired or
    // was revoked. Middleware only checks cookie presence, so the request
    // reached here; bounce to /login instead of crashing the RSC with a 500.
    // No cookie = anonymous context (e.g. /login itself) — fall through and
    // let getCurrentUser swallow it to null.
    if (res.status === 401 && typeof window === "undefined") {
      const { cookies } = await import("next/headers");
      if ((await cookies()).has("session")) {
        const { redirect } = await import("next/navigation");
        redirect("/login");
      }
    }
    let body: ApiError | null = null;
    try {
      body = (await res.json()) as ApiError;
    } catch {
      // body not JSON
    }
    // Gateway uses {code,message}; the auth subsystem uses {error}. Read both,
    // then fall back to a human 403 line instead of surfacing a bare status code.
    const detail = body?.message ?? (body as { error?: string } | null)?.error;
    const fallback =
      res.status === 403
        ? "You don't have permission to do this"
        : res.statusText || `Request failed (${res.status})`;
    throw new HttpError(res.status, body, detail || fallback);
  }
  // 204 No Content has an empty body — parsing it as JSON throws
  // "Unexpected end of JSON input". Callers of no-content endpoints ignore
  // the return, so hand back undefined.
  if (!parseJson || res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function httpGet<T>(path: string): Promise<T> {
  return send<T>(path, { cache: "no-store" }, true);
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
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    true,
  );
}

export function httpPatch<T>(path: string, body: unknown): Promise<T> {
  return send<T>(
    path,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
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
