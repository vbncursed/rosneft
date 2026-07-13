"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { fade } from "@/shared/presentation/motion/variants";
import { quick } from "@/shared/presentation/motion/transitions";
import { useResolvedVariants } from "@/shared/presentation/motion/reduced-motion";

// A route-transition wrapper. Unlike layout.tsx, Next.js re-mounts template.tsx
// on every navigation, so this fades each new page in. Pages are viewport-sized
// (h-screen / min-h-screen), so the extra wrapper div doesn't affect layout.
export default function Template({ children }: { children: ReactNode }) {
  const anim = useResolvedVariants(fade);
  return (
    <motion.div variants={anim} initial="hidden" animate="visible" transition={quick}>
      {children}
    </motion.div>
  );
}
