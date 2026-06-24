"use client";

import { useCallback, useEffect, useState } from "react";
import { listRoles, listPermissions, setRolePermissions, createRole, renameRole, deleteRole } from "@/auth/infrastructure/auth-admin-gateway";
import type { Role } from "@/auth/domain/role";
import type { Permission } from "@/auth/domain/permission";
import { notify } from "@/shared/presentation/toast/use-toast";

export function useRolesAdmin() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([listRoles(), listPermissions()]);
      setRoles(r);
      setPermissions(p);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Failed to load roles");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  const run = useCallback(
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

  return {
    roles,
    permissions,
    loading,
    reload,
    save: (slug: string, perms: string[]) => run(() => setRolePermissions(slug, perms), "Permissions saved"),
    create: (slug: string, title: string, perms: string[]) => run(() => createRole(slug, title, perms), "Role created"),
    rename: (slug: string, title: string) => run(() => renameRole(slug, title), "Renamed"),
    remove: (slug: string) => run(() => deleteRole(slug), "Role deleted"),
  };
}
