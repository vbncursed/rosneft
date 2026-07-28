// Single boundary for the session token. localStorage today; swap the three
// bodies for a Tauri secure store on tablet without touching callers.
const KEY = "andrey.token";

export function getToken(): string | null {
  return localStorage.getItem(KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(KEY);
}
