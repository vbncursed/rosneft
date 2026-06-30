import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/application/current-user";
import { can } from "@/auth/domain/principal";
import ConsoleSidebar from "@/auth/presentation/console/console-sidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const p = await getCurrentUser();
  if (!p || !(can(p, "users:read") || can(p, "roles:read"))) redirect("/");
  const showContent = can(p, "territory:write") || can(p, "model:write");
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1c252f_0%,#0b0d10_38%,#060708_100%)] text-white">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-8 px-6 py-12 sm:px-10 md:grid-cols-[200px_1fr]">
        <ConsoleSidebar showContent={showContent} showAccess={p.isOwner} />
        <section className="min-w-0">{children}</section>
      </div>
    </main>
  );
}
