import type { ReactNode } from "react";
import { ConversionBadge, isOpenable, trailingNote, type ConversionState } from "@/entities/conversion";
import { CatalogCard } from "@/shared/ui/catalog-card";
import { modelPath, type Model } from "../model/model";

export type ModelCardProps = {
  model: Model;
  conversion: ConversionState;
  actions?: ReactNode;
  highlighted?: boolean;
};

export function ModelCard({ model, conversion, actions, highlighted }: ModelCardProps) {
  const open = isOpenable(conversion);

  return (
    <CatalogCard
      kind="Model"
      title={model.title}
      description={model.description}
      slug={model.slug}
      href={open ? modelPath(model.slug) : undefined}
      badge={<ConversionBadge status={conversion.status} />}
      actions={actions}
      trailing={trailingNote(conversion)}
      muted={!open}
      highlighted={highlighted}
    />
  );
}
