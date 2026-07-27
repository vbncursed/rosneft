import { createRoute, redirect } from "@tanstack/react-router";
import { rootRoute } from "@/routes/root";
import LoginPage from "@/login/login-page";

// Only same-origin relative paths survive as ?next= — reject schemes and
// protocol-relative URLs so login can't redirect off-site.
function safeNext(raw: unknown): string {
  if (typeof raw !== "string") return "/";
  return raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : "/";
}

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: (s: Record<string, unknown>): { next: string } => ({ next: safeNext(s.next) }),
  component: LoginPage,
});

// Ф1: every other path redirects to /login. Real routes arrive in Ф2/Ф3.
export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/login", search: { next: "/" } });
  },
});
