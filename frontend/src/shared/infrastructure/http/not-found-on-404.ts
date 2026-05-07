import { HttpError } from "@/shared/infrastructure/http/http-error";

export function notFoundOnHttp404<T>(fallback: T): (err: unknown) => T {
  return (err) => {
    if (err instanceof HttpError && err.status === 404) {
      return fallback;
    }
    throw err;
  };
}
