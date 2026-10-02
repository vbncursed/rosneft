// Verified against real territories: three.js and the Draco/basis decoders need
// 'unsafe-eval' and blob: workers, pdf.js needs 'unsafe-inline'.
// base-uri, form-action and frame-ancestors do not fall back to default-src —
// left out they are unrestricted — so they are spelled out.
export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' blob: data:",
  "frame-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

/** Keyed on the content type, not the path: index.html, offline pages and pdf.js's viewer.html all need it. */
export function withCsp(res: Response): Response {
  if (!(res.headers.get("content-type") ?? "").toLowerCase().startsWith("text/html")) return res;
  const headers = new Headers(res.headers);
  headers.set("content-security-policy", CSP);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

// A blob is user content served from the app's origin: opened as a top-level document it must not run script.
// Fetched by pdf.js, three.js loaders and <img>, a CSP on the resource is ignored, so they are unaffected.
export const BLOB_CSP = "sandbox; default-src 'none'";

export function withBlobCsp(res: Response): Response {
  if (res.type === "error") return res; // Response.error() has no status to copy
  const headers = new Headers(res.headers);
  headers.set("content-security-policy", BLOB_CSP);
  headers.set("x-content-type-options", "nosniff");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
