"use client";

import { deleteModel } from "@/model/infrastructure/model-gateway";
import DeleteButton from "@/shared/presentation/components/delete-button";

interface DeleteModelButtonProps {
  slug: string;
  label: string;
  redirectTo?: string;
}

export default function DeleteModelButton({
  slug,
  label,
  redirectTo,
}: DeleteModelButtonProps) {
  return (
    <DeleteButton
      label={label}
      onDelete={() => deleteModel(slug)}
      redirectTo={redirectTo}
    />
  );
}
