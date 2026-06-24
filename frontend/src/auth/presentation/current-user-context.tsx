"use client";

import { createContext, useContext } from "react";
import { can, type Principal } from "@/auth/domain/principal";

const Ctx = createContext<Principal | null>(null);

export function CurrentUserProvider({ value, children }: { value: Principal | null; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCurrentUser(): Principal | null {
  return useContext(Ctx);
}

// useCan reads the current user once and returns a permission checker, so a
// component testing several permissions only subscribes to the context once.
export function useCan(): (permission: string) => boolean {
  const me = useContext(Ctx);
  return (permission) => can(me, permission);
}
