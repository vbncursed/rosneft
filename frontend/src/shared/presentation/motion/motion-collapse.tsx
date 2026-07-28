import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { collapse } from "@/shared/presentation/motion/variants";
import { quick } from "@/shared/presentation/motion/transitions";
import { useResolvedVariants } from "@/shared/presentation/motion/reduced-motion";

interface MotionCollapseProps {
  open: boolean;
  children: ReactNode;
  // Оформление раскрывающейся полосы (рамка/фон). Отступы кладите на внутренний
  // элемент: padding на анимируемом остался бы виден при height:0.
  className?: string;
}

// Раскрытие по высоте для разворачиваемых блоков. Форма пропсов та же, что у
// MotionOverlay: `open` снаружи, AnimatePresence внутри — она держит поддерево
// смонтированным на время exit-анимации.
//
// initial={false} — чтобы уже открытый блок не проигрывал раскрытие при первом
// рендере: подгрузка следующей страницы журнала перемонтирует список, и без
// этого все открытые строки дёрнулись бы разом.
export default function MotionCollapse({ open, children, className }: MotionCollapseProps) {
  const anim = useResolvedVariants(collapse);
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          variants={anim}
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={quick}
          style={{ overflow: "hidden" }}
          className={className}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
