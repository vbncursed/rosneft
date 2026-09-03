import type { components } from "./dto";

export type ApiError = components["schemas"]["Error"];

/** A non-2xx response, with the gateway's own body attached where it sent one. */
export class HttpError extends Error {
  readonly status: number;
  readonly body: ApiError | null;

  constructor(status: number, body: ApiError | null, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.body = body;
  }
}

const GENERIC_ERROR = "Something went wrong. Try again.";

/**
 * What to tell the operator about a failure. The gateway's own message when
 * there is one — it names the actual refusal ("last admin", "self-target") —
 * and a plain sentence otherwise, since "Failed to fetch" helps nobody.
 */
export const messageOf = (err: unknown, fallback = GENERIC_ERROR): string =>
  err instanceof HttpError ? err.message : fallback;
