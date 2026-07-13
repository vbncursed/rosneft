"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import MotionOverlay from "@/shared/presentation/motion/motion-overlay";
import { scaleFade } from "@/shared/presentation/motion/variants";
import { smooth } from "@/shared/presentation/motion/transitions";
import { useResolvedVariants } from "@/shared/presentation/motion/reduced-motion";

interface MotionModalProps {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  // Styles the panel box (border/bg/padding/width).
  className?: string;
}

// Centered dialog: scaleFade panel over a fading backdrop.
export default function MotionModal({ open, onClose, children, className }: MotionModalProps) {
  const panel = useResolvedVariants(scaleFade);
  return (
    <MotionOverlay open={open} onClose={onClose}>
      <motion.div
        variants={panel}
        initial="hidden"
        animate="visible"
        exit="hidden"
        transition={smooth}
        className={className}
      >
        {children}
      </motion.div>
    </MotionOverlay>
  );
}
