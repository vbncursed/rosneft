"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import MotionOverlay from "@/shared/presentation/motion/motion-overlay";
import { slideRight } from "@/shared/presentation/motion/variants";
import { smooth } from "@/shared/presentation/motion/transitions";
import { useResolvedVariants } from "@/shared/presentation/motion/reduced-motion";

interface MotionDrawerProps {
  open: boolean;
  onClose?: () => void;
  side?: "right" | "left";
  children: ReactNode;
  className?: string;
}

// ponytail: side panel wrapper — no current consumer, kept as the agreed
// future-proof surface. Delete if it stays unused.
export default function MotionDrawer({ open, onClose, side = "right", children, className }: MotionDrawerProps) {
  const panel = useResolvedVariants(slideRight);
  const anchor = side === "right" ? "ml-auto" : "mr-auto";
  return (
    <MotionOverlay open={open} onClose={onClose}>
      <motion.div
        variants={panel}
        initial="hidden"
        animate="visible"
        exit="hidden"
        transition={smooth}
        className={`${anchor} ${className ?? ""}`.trim()}
      >
        {children}
      </motion.div>
    </MotionOverlay>
  );
}
