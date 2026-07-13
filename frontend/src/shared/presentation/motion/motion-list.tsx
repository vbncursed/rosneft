"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { listStagger, listItem } from "@/shared/presentation/motion/variants";
import { useResolvedVariants } from "@/shared/presentation/motion/reduced-motion";

// Stagger container. Renders on the server as hidden, then animates in on
// hydration — safe to drop around an RSC-rendered grid.
export function MotionList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={listStagger} initial="hidden" animate="visible" className={className}>
      {children}
    </motion.div>
  );
}

export function MotionItem({ children, className }: { children: ReactNode; className?: string }) {
  const item = useResolvedVariants(listItem);
  return (
    <motion.div variants={item} className={className}>
      {children}
    </motion.div>
  );
}
