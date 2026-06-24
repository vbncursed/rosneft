import { requirePermission } from "@/auth/application/require-permission";
import NewTerritoryForm from "./new-territory-form";

export const dynamic = "force-dynamic";

export default async function NewTerritoryPage() {
  await requirePermission("territory:write");
  return <NewTerritoryForm />;
}
