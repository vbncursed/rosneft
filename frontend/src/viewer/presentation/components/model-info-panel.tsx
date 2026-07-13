"use client";

import { memo } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import type { ModelMetadata } from "@/viewer/domain/model-metadata";
import { fade } from "@/shared/presentation/motion/variants";
import { smooth } from "@/shared/presentation/motion/transitions";
import { useResolvedVariants } from "@/shared/presentation/motion/reduced-motion";

interface ModelInfoPanelProps {
  metadata: ModelMetadata | null;
}

// One Intl.NumberFormat instance for the lifetime of the module instead
// of a fresh one on every render (or every call) — Intl objects are
// cheap to use but expensive to construct.
const NUMBER_FORMAT = new Intl.NumberFormat("en-US");
const formatNumber = (value: number): string => NUMBER_FORMAT.format(value);

// ModelInfoPanel doubles as the scene's "where am I" chip: it carries the
// back link to the catalog so the right rail can stay fully dedicated to
// the placements editor. Keeping these two affordances in one card avoids
// two different "this is the current project" surfaces fighting for space.
function ModelInfoPanelImpl({ metadata }: ModelInfoPanelProps) {
  const anim = useResolvedVariants(fade);
  if (!metadata) {
    return null;
  }

  return (
    <motion.div
      variants={anim}
      initial="hidden"
      animate="visible"
      transition={smooth}
      className="w-full max-w-xs rounded-xl border border-white/20 bg-black/50 p-4 shadow-xl backdrop-blur"
    >
      <Link
        href="/"
        data-tour="catalog-link"
        className="group inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.24em] text-neutral-400 transition-colors hover:text-cyan-200"
        aria-label="Back to catalog"
      >
        <span aria-hidden="true" className="transition-transform group-hover:-translate-x-0.5">
          ←
        </span>
        <span>Catalog</span>
      </Link>
      <p className="mt-2 break-all text-sm font-semibold text-white">{metadata.name}</p>
      <div className="mt-3 space-y-1 text-xs text-neutral-200">
        <p>Vertices: {formatNumber(metadata.vertices)}</p>
        <p>Faces: {formatNumber(metadata.faces)}</p>
        <p>
          Size (X/Y/Z): {metadata.dimensions.x} / {metadata.dimensions.y} /{" "}
          {metadata.dimensions.z}
        </p>
      </div>
    </motion.div>
  );
}

export default memo(ModelInfoPanelImpl);
