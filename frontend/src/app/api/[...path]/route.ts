import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

const GATEWAY =
  process.env.GATEWAY_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
const SESSION = "session";

// Headers worth forwarding from the browser to the gateway (everything else,
// incl. cookies and host, is dropped — the gateway auths via Bearer only).
const FORWARD = [
  "content-type", "accept", "accept-encoding", "range",
  "if-none-match", "upload-offset", "upload-length", "content-length",
];

function unsafe(seg: string): boolean {
  return seg === "." || seg === ".." || seg.includes("/") || seg.includes("\\") || seg.includes("\0");
}

async function proxy(req: NextRequest, path: string[]): Promise<Response> {
  // Reject path-traversal segments so the proxy can only ever reach /api/* on
  // the gateway, never escape the prefix.
  if (path.some(unsafe)) return new Response("bad path", { status: 400 });

  const token = (await cookies()).get(SESSION)?.value;
  const url = `${GATEWAY}/api/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;

  const headers = new Headers();
  for (const h of FORWARD) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (token) headers.set("authorization", `Bearer ${token}`);

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const res = await fetch(url, {
    method: req.method,
    headers,
    body: hasBody ? req.body : undefined,
    // @ts-expect-error duplex is required when streaming a request body
    duplex: hasBody ? "half" : undefined,
    redirect: "manual",
    cache: "no-store",
  });

  const out = new Headers(res.headers);
  // If the gateway compressed the body, undici (this server-side fetch) already
  // decoded it — so the upstream content-encoding + content-length no longer
  // describe what we forward. Drop both: keeping content-encoding double-decodes
  // in the browser; keeping the compressed content-length truncates the body.
  // Uncompressed responses (binary assets bypass gateway compression) keep an
  // accurate content-length, so leave it — clients need it for download progress.
  if (res.headers.get("content-encoding")) {
    out.delete("content-encoding");
    out.delete("content-length");
  }
  if (res.status === 401) {
    out.append("set-cookie", `${SESSION}=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax`);
  }
  return new Response(res.body, { status: res.status, headers: out });
}

async function handler(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await ctx.params).path);
}

export {
  handler as GET, handler as POST, handler as PUT,
  handler as PATCH, handler as DELETE, handler as HEAD,
};
