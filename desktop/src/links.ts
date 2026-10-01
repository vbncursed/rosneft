export function sameOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

// http: is left out on purpose: a link the SPA renders over plain HTTP is not
// one the OS browser should be handed silently.
const EXTERNAL = new Set(["https:", "mailto:"]);

export function openableExternally(url: string): boolean {
  try {
    return EXTERNAL.has(new URL(url).protocol);
  } catch {
    return false;
  }
}
