import type { Session, WebContents } from "electron";
import { openableExternally, sameOrigin } from "./links";

const CLIPBOARD = "clipboard-sanitized-write";

// Off-origin: never loaded in the window; https/mailto go to the OS browser.
export function attachWindowPolicy(
  contents: Pick<WebContents, "setWindowOpenHandler" | "on">,
  origin: string,
  openExternal: (url: string) => void,
): void {
  const leave = (url: string) => {
    if (openableExternally(url)) openExternal(url);
  };
  contents.setWindowOpenHandler(({ url }) => {
    if (!sameOrigin(url, origin)) leave(url);
    return { action: "deny" };
  });
  contents.on("will-navigate", (event, url) => {
    if (sameOrigin(url, origin)) return;
    event.preventDefault();
    leave(url);
  });
  // A same-origin page can 302 off-origin; will-navigate does not see that hop.
  contents.on("will-redirect", (event) => {
    if (!event.isMainFrame || sameOrigin(event.url, origin)) return;
    event.preventDefault();
    leave(event.url);
  });
}

// The SPA asks for one permission: a user-gesture clipboard write (copy-text.ts).
export function permissionAllowed(
  permission: string,
  details: { requestingUrl?: string; isMainFrame?: boolean },
  origin: string,
): boolean {
  return permission === CLIPBOARD && details.isMainFrame === true && sameOrigin(details.requestingUrl ?? "", origin);
}

export function permissionCheckAllowed(
  permission: string,
  requestingOrigin: string,
  details: { isMainFrame?: boolean },
  origin: string,
): boolean {
  return permission === CLIPBOARD && details.isMainFrame === true && requestingOrigin === origin;
}

export function attachPermissionPolicy(
  ses: Pick<Session, "setPermissionRequestHandler" | "setPermissionCheckHandler">,
  origin: string,
): void {
  ses.setPermissionRequestHandler((_wc, permission, callback, details) =>
    callback(permissionAllowed(permission, details, origin)),
  );
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin, details) =>
    permissionCheckAllowed(permission, requestingOrigin, details, origin),
  );
}
