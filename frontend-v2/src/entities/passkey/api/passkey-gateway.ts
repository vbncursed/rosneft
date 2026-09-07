import { httpDelete, httpGet, httpPost } from "@/shared/api";
import type { Passkey } from "../model/passkey";

type CredentialDto = { id?: string; name?: string; createdAt?: string; lastUsedAt?: string };

const toPasskey = (d: CredentialDto): Passkey => ({
  id: d.id ?? "",
  name: d.name ?? "",
  createdAt: d.createdAt ?? "",
  lastUsedAt: d.lastUsedAt ?? null,
});

export async function listPasskeys(): Promise<Passkey[]> {
  const d = await httpGet<{ credentials?: CredentialDto[] }>("/api/auth/passkey/credentials");
  return (d.credentials ?? []).map(toPasskey);
}

export async function beginRegistration(): Promise<{ optionsJson: string; flowId: string }> {
  const d = await httpPost<{ optionsJson?: string; flowId?: string }>("/api/auth/passkey/register/begin");
  return { optionsJson: d.optionsJson ?? "", flowId: d.flowId ?? "" };
}

export async function finishRegistration(flowId: string, credentialJson: string, name: string): Promise<Passkey> {
  return toPasskey(
    await httpPost<CredentialDto>("/api/auth/passkey/register/finish", { flowId, credentialJson, name }),
  );
}

/**
 * The caller picks which field to fill from removalFactor(); the server
 * re-derives the required factor from live 2FA state and refuses a mismatch,
 * so sending the wrong one fails closed rather than removing anything.
 *
 * No `credentialed`: the gateway answers `403 forbidden` ("re-authentication
 * failed") for a wrong code or password, measured live. A 401 from this route
 * is therefore the session, not the factor, and must bounce.
 */
export function removePasskey(id: string, credential: { code?: string; password?: string }): Promise<void> {
  return httpDelete(`/api/auth/passkey/credentials/${encodeURIComponent(id)}`, credential);
}
