import { gatewayUrl, setSession } from "@/auth/infrastructure/session-cookie";

export async function POST(req: Request): Promise<Response> {
  const { identifier, password } = await req.json();
  const res = await fetch(gatewayUrl("/api/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
    cache: "no-store",
  });
  if (!res.ok) {
    return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
  }
  const data = (await res.json()) as { token: string; twoFactorRequired: boolean; challengeToken: string };
  if (data.twoFactorRequired) {
    return Response.json({ twoFactorRequired: true, challengeToken: data.challengeToken });
  }
  await setSession(data.token);
  return Response.json({ twoFactorRequired: false });
}
