import type { components } from "@/shared/infrastructure/api/dto";

export type ApiError = components["schemas"]["Error"];

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiError | null,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}
