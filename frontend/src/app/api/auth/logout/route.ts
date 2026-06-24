import { gatewayUrl, clearSession, sessionToken } from "@/auth/infrastructure/session-cookie";

export async function POST(): Promise<Response> {
  const token = await sessionToken();
  if (token) {
    await fetch(gatewayUrl("/api/auth/logout"), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    }).catch(() => undefined);
  }
  await clearSession();
  return Response.json({ ok: true });
}
