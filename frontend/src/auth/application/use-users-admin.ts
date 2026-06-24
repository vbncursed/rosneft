"use client";

import { useCallback, useEffect, useState } from "react";
import { listUsers } from "@/auth/infrastructure/auth-admin-gateway";
import type { AdminUser } from "@/auth/domain/user";
import { notify } from "@/shared/presentation/toast/use-toast";

export function useUsersAdmin() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await listUsers(status, includeDeleted));
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [status, includeDeleted]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const act = useCallback(
    async (fn: () => Promise<unknown>, ok: string) => {
      try {
        await fn();
        notify.success(ok);
        await reload();
      } catch (e) {
        notify.error(e instanceof Error ? e.message : "Action failed");
      }
    },
    [reload],
  );

  return { users, loading, status, setStatus, includeDeleted, setIncludeDeleted, reload, act };
}
