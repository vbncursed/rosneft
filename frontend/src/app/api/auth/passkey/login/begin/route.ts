import { gatewayUrl } from "@/auth/infrastructure/session-cookie";

export async function POST(): Promise<Response> {
  const res = await fetch(gatewayUrl("/api/auth/passkey/login/begin"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  return new Response(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
