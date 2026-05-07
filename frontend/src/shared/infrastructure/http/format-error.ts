import { HttpError } from "@/shared/infrastructure/http/http-error";

// formatError renders any thrown value as a single-line, user-facing
// string. HttpError carries a structured body when the gateway speaks
// JSON; otherwise we fall back to the HTTP status line.
export function formatError(err: unknown): string {
  if (err instanceof HttpError) {
    return err.body?.message ?? `HTTP ${err.status}`;
  }
  return err instanceof Error ? err.message : "unknown error";
}
