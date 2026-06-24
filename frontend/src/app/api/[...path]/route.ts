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

async function proxy(req: NextRequest, path: string[]): Promise<Response> {
  const token = (await cookies()).get(SESSION)?.value;
  const url = `${GATEWAY}/api/${path.join("/")}${req.nextUrl.search}`;

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
  out.delete("content-encoding"); // fetch already decoded; avoid double-decode in the browser
  out.delete("content-length");
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
