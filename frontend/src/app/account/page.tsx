import { getCurrentUser } from "@/auth/application/current-user";
import { redirect } from "next/navigation";
import ChangePasswordForm from "@/auth/presentation/account/change-password-form";
import TwoFactorSection from "@/auth/presentation/account/two-factor-section";
import PasskeysSection from "@/auth/presentation/account/passkeys-section";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const p = await getCurrentUser();
  if (!p) redirect("/login");
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1c252f_0%,#0b0d10_38%,#060708_100%)] text-white">
      <section className="mx-auto flex w-full max-w-xl flex-col gap-6 px-6 py-16 sm:px-10">
        <header>
          <p className="text-xs uppercase tracking-[0.36em] text-cyan-300/80">Account</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">{p.username}</h1>
          <p className="mt-1 text-sm text-neutral-400">{p.email}</p>
        </header>
        <ChangePasswordForm />
        <TwoFactorSection initiallyEnabled={p.totpEnabled} />
        <PasskeysSection />
      </section>
    </main>
  );
}
