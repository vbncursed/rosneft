import { deleteTerritory } from "@/territory/infrastructure/territory-gateway";
import DeleteButton from "@/shared/presentation/components/delete-button";

export default function DeleteTerritoryButton({
  slug,
  label,
  redirectTo,
}: {
  slug: string;
  label: string;
  redirectTo?: string;
}) {
  return <DeleteButton label={label} onDelete={() => deleteTerritory(slug)} redirectTo={redirectTo} />;
}
