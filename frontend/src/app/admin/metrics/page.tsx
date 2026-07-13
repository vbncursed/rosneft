import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/application/current-user";

const DASHBOARDS = [
  { uid: "andrey-red", title: "Services (RED)" },
  { uid: "andrey-domain", title: "Domain" },
  { uid: "andrey-runtime", title: "Go Runtime" },
  { uid: "andrey-alerts", title: "Alerts" },
] as const;

export default async function MetricsPage() {
  const p = await getCurrentUser();
  if (!p?.isOwner) redirect("/");
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold text-white">Metrics</h1>
      {DASHBOARDS.map((d) => (
        <section key={d.uid} className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-white/70">{d.title}</h2>
          <iframe
            title={d.title}
            src={`/api/grafana/d/${d.uid}/_?kiosk&theme=dark`}
            className="h-[520px] w-full rounded-xl border border-white/10 bg-black/20"
          />
        </section>
      ))}
    </div>
  );
}
