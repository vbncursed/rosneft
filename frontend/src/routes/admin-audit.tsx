import { createRoute } from "@tanstack/react-router";
import { adminLayoutRoute } from "@/routes/admin";
import { requireConsolePermission } from "@/routes/guard";
import AuditPanel from "@/audit/presentation/components/audit-panel";
import { titleMeta } from "@/shared/presentation/page-title";

// AuditPanel owns its own filter state and paging; the route only gates entry.
// The gateway is the real boundary — it resolves the company scope from the
// session, so this guard is UX, not security.
export const adminAuditRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "audit",
  head: () => titleMeta("Audit log · Admin"),
  beforeLoad: ({ context, location }) =>
    requireConsolePermission(context.queryClient, location, "audit:read"),
  component: AuditPanel,
});
