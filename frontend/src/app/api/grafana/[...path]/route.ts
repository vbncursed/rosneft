import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/auth/application/current-user";

const GRAFANA = process.env.GRAFANA_URL ?? "http://grafana:3000";

// Request headers worth forwarding upstream. Everything else (cookies, host,
// hop-by-hop headers) is dropped — Grafana authenticates via X-WEBAUTH-USER,
// which we set ourselves. Mirrors the allowlist in api/[...path]/route.ts.
const FORWARD = ["content-type", "accept", "accept-encoding", "range", "if-none-match", "content-length"];

// Response headers we must not copy verbatim (they describe the upstream hop).
const STRIP = new Set(["content-encoding", "content-length", "transfer-encoding"]);

async function proxy(req: NextRequest, path: string[]): Promise<Response> {
  // Gate: only Root may see any Grafana byte. The httpOnly `session` cookie is
  // sent by the browser on every same-origin iframe subresource request, so we
  // can authorize each one. ponytail: per-request getMe; add a short-TTL cache
  // keyed on the session token if this shows up in latency traces.
  const p = await getCurrentUser();
  if (!p?.isOwner) return new Response("forbidden", { status: 403 });

  const url = `${GRAFANA}/api/grafana/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;
  const headers = new Headers();
  for (const h of FORWARD) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set("x-webauth-user", p.username); // Grafana auth.proxy identity.

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

  const out = new Headers();
  res.headers.forEach((v, k) => {
    if (!STRIP.has(k.toLowerCase())) out.set(k, v);
  });
  return new Response(res.body, { status: res.status, headers: out });
}

async function handler(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await ctx.params).path);
}

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
  handler as HEAD,
};
