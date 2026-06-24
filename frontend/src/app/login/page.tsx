import { Suspense } from "react";
import LoginForm from "@/auth/presentation/login/login-form";
import TopographicMotif from "@/auth/presentation/login/topographic-motif";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen grid-cols-1 bg-[radial-gradient(circle_at_top,#1c252f_0%,#0b0d10_38%,#060708_100%)] text-white md:grid-cols-2">
      <section className="relative hidden overflow-hidden border-r border-white/10 md:flex md:flex-col md:justify-end md:p-12">
        <TopographicMotif />
        <div className="relative">
          <p className="text-xs uppercase tracking-[0.36em] text-cyan-300/80">Andrey · 3D Platform</p>
          <h2 className="mt-4 max-w-sm text-4xl font-semibold leading-tight tracking-tight">
            Territories &amp; models, rendered with precision.
          </h2>
        </div>
      </section>
      <section className="flex items-center justify-center p-6 sm:p-10">
        <Suspense>
          <LoginForm />
        </Suspense>
      </section>
    </main>
  );
}
