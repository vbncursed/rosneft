import { HttpError, type ApiError } from "@/shared/infrastructure/http/http-error";

const SERVER_API_BASE =
  process.env.GATEWAY_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8080";

// On the client we hit same-origin so the Next.js rewrite proxies to gateway.
// On the server there is no host context, so an absolute URL is required.
function apiBase(): string {
  return typeof window === "undefined" ? SERVER_API_BASE : "";
}

async function send<T>(
  path: string,
  init: RequestInit,
  parseJson: boolean,
): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: { Accept: "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    let body: ApiError | null = null;
    try {
      body = (await res.json()) as ApiError;
    } catch {
      // body not JSON
    }
    throw new HttpError(res.status, body, body?.message ?? res.statusText);
  }
  return parseJson ? ((await res.json()) as T) : (undefined as T);
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

export function httpDelete(path: string): Promise<void> {
  return send<void>(path, { method: "DELETE" }, false);
}
