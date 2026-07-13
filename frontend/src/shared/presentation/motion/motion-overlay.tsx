"use client";

import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { fade } from "@/shared/presentation/motion/variants";
import { smooth } from "@/shared/presentation/motion/transitions";
import { useResolvedVariants } from "@/shared/presentation/motion/reduced-motion";

interface MotionOverlayProps {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  className?: string;
}

// Shared fading backdrop + centering shell for modals and drawers.
// AnimatePresence keeps the subtree mounted through its exit animation.
export default function MotionOverlay({ open, onClose, children, className }: MotionOverlayProps) {
  const backdrop = useResolvedVariants(fade);
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          variants={backdrop}
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={smooth}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose?.();
          }}
          className={
            className ??
            "fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          }
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
