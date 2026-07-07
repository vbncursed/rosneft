import { gatewayUrl, setSession } from "@/auth/infrastructure/session-cookie";

export async function POST(req: Request): Promise<Response> {
  const { flowId, assertionJson } = await req.json();
  const res = await fetch(gatewayUrl("/api/auth/passkey/login/finish"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ flowId, assertionJson }),
    cache: "no-store",
  });
  if (!res.ok) {
    return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
  }
  const data = (await res.json()) as { token: string };
  await setSession(data.token);
  return Response.json({ ok: true });
}
