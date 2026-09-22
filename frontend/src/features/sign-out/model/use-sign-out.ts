import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { logout } from "@/entities/user";

/**
 * Sign out: revoke the session (`logout` never throws and always drops the
 * marker and the CSRF token), land on /login, then drop every cached query so
 * nothing of this user can flash in front of the next one. In that order: a
 * clear while the shell is still mounted makes its `me` observer refetch, the
 * 401 makes client.ts hard-reload to /login?next=… A second call while one is
 * running does nothing.
 */
export function useSignOut(): { signOut: () => Promise<void>; pending: boolean } {
  const client = useQueryClient();
  const navigate = useNavigate();
  const running = useRef(false);
  const [pending, setPending] = useState(false);

  const signOut = async () => {
    if (running.current) return;
    running.current = true;
    setPending(true);
    await logout();
    await navigate({ to: "/login" });
    client.clear();
  };

  return { signOut, pending };
}
