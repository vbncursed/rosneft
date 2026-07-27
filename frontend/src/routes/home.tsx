import { createRoute } from "@tanstack/react-router";
import { authedLayoutRoute } from "@/routes/layout";
import { useCurrentUser } from "@/auth/presentation/current-user-context";

function Home() {
  const me = useCurrentUser();
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1c252f_0%,#0b0d10_38%,#060708_100%)] p-10 text-white">
      <p className="text-xs uppercase tracking-[0.36em] text-cyan-300/80">Andrey · 3D Platform</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        Signed in{me ? ` as ${me.username}` : "…"}
      </h1>
      <p className="mt-2 text-sm text-neutral-400">Ф2 placeholder — the real home grid lands in Ф3.</p>
    </main>
  );
}

export const homeRoute = createRoute({
  getParentRoute: () => authedLayoutRoute,
  path: "/",
  component: Home,
});
