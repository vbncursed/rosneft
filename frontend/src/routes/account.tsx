import { createRoute, Link } from "@tanstack/react-router";
import { authedLayoutRoute } from "@/routes/layout";
import { useCurrentUser } from "@/auth/presentation/current-user-context";
import ChangePasswordForm from "@/auth/presentation/account/change-password-form";
import TwoFactorSection from "@/auth/presentation/account/two-factor-section";
import PasskeysSection from "@/auth/presentation/account/passkeys-section";
import MyActivitySection from "@/audit/presentation/components/my-activity-section";
import { titleMeta } from "@/shared/presentation/page-title";

function Account() {
  const p = useCurrentUser();
  if (!p) return null;
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1c252f_0%,#0b0d10_38%,#060708_100%)] text-white">
      {/* max-w-3xl, not max-w-xl: the journal table below needs the width, and
          at xl it spent every row in horizontal scroll. */}
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-16 sm:px-10">
        <header>
          <Link to="/" className="mb-3 inline-block text-[10px] uppercase tracking-[0.28em] text-neutral-400 transition-colors hover:text-white">
            ← Back to site
          </Link>
          <p className="text-xs uppercase tracking-[0.36em] text-cyan-300/80">Account</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">{p.username}</h1>
          <p className="mt-1 text-sm text-neutral-400">{p.email}</p>
        </header>
        <ChangePasswordForm />
        {/* Unknown degrades to "off" here on purpose: this section manages the
            user's own factor, and with twofa-service down every button in it
            fails anyway. The tri-state matters in the admin console, where one
            person reads another's security posture. */}
        <TwoFactorSection initiallyEnabled={p.totpEnabled ?? false} />
        <PasskeysSection />
        <MyActivitySection />
      </section>
    </main>
  );
}

export const accountRoute = createRoute({
  getParentRoute: () => authedLayoutRoute,
  path: "/account",
  head: () => titleMeta("Account"),
  component: Account,
});
