import type { Variants } from "motion/react";

export const fade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

export const scaleFade: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: -2 },
  visible: { opacity: 1, scale: 1, y: 0 },
};

export const slideRight: Variants = {
  hidden: { opacity: 0, x: 24 },
  visible: { opacity: 1, x: 0 },
};

export const slideUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

// Container drives its MotionItem children in sequence.
export const listStagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

export const listItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};
