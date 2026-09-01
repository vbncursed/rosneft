import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "@/routes/root";
import LoginPage from "@/login/login-page";
import { titleMeta } from "@/shared/presentation/page-title";

// Only same-origin relative paths survive as ?next= — reject schemes and
// protocol-relative URLs so login can't redirect off-site.
function safeNext(raw: unknown): string {
  if (typeof raw !== "string") return "/";
  return raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : "/";
}

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  head: () => titleMeta("Sign in"),
  validateSearch: (s: Record<string, unknown>): { next: string } => ({ next: safeNext(s.next) }),
  component: LoginPage,
});
