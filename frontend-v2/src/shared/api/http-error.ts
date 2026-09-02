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
