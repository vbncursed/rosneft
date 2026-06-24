"use client";

import { createContext, useContext } from "react";
import type { Principal } from "@/auth/domain/principal";

const Ctx = createContext<Principal | null>(null);

export function CurrentUserProvider({ value, children }: { value: Principal | null; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCurrentUser(): Principal | null {
  return useContext(Ctx);
}
