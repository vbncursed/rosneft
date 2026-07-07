import { httpGet, httpPost, httpDelete } from "@/shared/infrastructure/http/client";

export interface Passkey {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string;
}

interface BeginResponse {
  optionsJson: string;
  flowId: string;
}

// Authenticated — routed through the /api/[...path] proxy (cookie→bearer).
export function beginRegistration(): Promise<BeginResponse> {
  return httpPost<BeginResponse>("/api/auth/passkey/register/begin");
}

export function finishRegistration(flowId: string, credentialJson: string, name: string): Promise<Passkey> {
  return httpPost<Passkey>("/api/auth/passkey/register/finish", { flowId, credentialJson, name });
}

export async function listPasskeys(): Promise<Passkey[]> {
  const r = await httpGet<{ credentials?: Passkey[] }>("/api/auth/passkey/credentials");
  return r.credentials ?? [];
}

// deletePasskey requires step-up re-auth: pass { code } when the user has 2FA,
// otherwise { password }. The gateway verifies before removing the credential.
export function deletePasskey(id: string, credential: { password?: string; code?: string }): Promise<void> {
  return httpDelete(`/api/auth/passkey/credentials/${encodeURIComponent(id)}`, credential);
}

// Public login — dedicated BFF routes that set the session cookie on finish.
export function loginBegin(): Promise<BeginResponse> {
  return httpPost<BeginResponse>("/api/auth/passkey/login/begin");
}

export function loginFinish(flowId: string, assertionJson: string): Promise<void> {
  return httpPost<void>("/api/auth/passkey/login/finish", { flowId, assertionJson });
}
