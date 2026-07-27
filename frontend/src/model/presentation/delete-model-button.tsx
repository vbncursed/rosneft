import { deleteModel } from "@/model/infrastructure/model-gateway";
import DeleteButton from "@/shared/presentation/components/delete-button";

export default function DeleteModelButton({
  slug,
  label,
  redirectTo,
}: {
  slug: string;
  label: string;
  redirectTo?: string;
}) {
  return <DeleteButton label={label} onDelete={() => deleteModel(slug)} redirectTo={redirectTo} />;
}
