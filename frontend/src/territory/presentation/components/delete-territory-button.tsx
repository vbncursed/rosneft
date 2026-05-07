"use client";

import { deleteTerritory } from "@/territory/infrastructure/territory-gateway";
import DeleteButton from "@/shared/presentation/components/delete-button";

interface DeleteTerritoryButtonProps {
  slug: string;
  label: string;
  redirectTo?: string;
}

export default function DeleteTerritoryButton({
  slug,
  label,
  redirectTo,
}: DeleteTerritoryButtonProps) {
  return (
    <DeleteButton
      label={label}
      onDelete={() => deleteTerritory(slug)}
      redirectTo={redirectTo}
    />
  );
}
