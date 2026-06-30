import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/application/current-user";
import { listTerritories } from "@/territory/infrastructure/territory-gateway";
import TerritoryAccessTable from "@/territory/presentation/territory-access-table";

export const dynamic = "force-dynamic";

// Root-only: assigning territories to admins is an owner action.
export default async function TerritoryAccessPage() {
  const p = await getCurrentUser();
  if (!p?.isOwner) redirect("/admin/users");
  const territories = await listTerritories();
  return <TerritoryAccessTable territories={territories} />;
}
