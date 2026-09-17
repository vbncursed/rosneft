export type RemovalFactor = "code" | "password" | "unavailable";

/**
 * Which second factor a passkey removal must collect.
 *
 * The gateway derives this itself from live 2FA state and refuses a mismatch,
 * so the client's only job is to ask for the right thing — and, when it cannot
 * know, to say so instead of collecting a value that would be discarded.
 */
export function removalFactor(totpEnabled: boolean | null): RemovalFactor {
  if (totpEnabled === null) return "unavailable";
  return totpEnabled ? "code" : "password";
}
