import { cookies } from "next/headers";

export const SESSION = "session";
const GATEWAY =
  process.env.GATEWAY_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export function gatewayUrl(path: string): string {
  return `${GATEWAY}${path}`;
}

export async function setSession(token: string): Promise<void> {
  (await cookies()).set({
    name: SESSION,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // matches the gateway's absolute session cap
  });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(SESSION);
}

export async function sessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION)?.value;
}
