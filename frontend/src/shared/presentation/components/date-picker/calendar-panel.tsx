import { type CSSProperties, type KeyboardEvent, type Ref, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { inRange, monthGrid, monthOf, toDate } from "@/shared/domain/calendar";
import type { AnchorRect } from "@/shared/presentation/components/dropdown/use-anchored-position";
import { scaleFade } from "@/shared/presentation/motion/variants";
import { quick } from "@/shared/presentation/motion/transitions";
import { useResolvedVariants } from "@/shared/presentation/motion/reduced-motion";

interface CalendarPanelProps {
  id: string;
  panelRef: Ref<HTMLDivElement>;
  rect: AnchorRect | null;
  month: string;
  value: string;
  cursor: string;
  min?: string;
  max?: string;
  // Один шаг месяца, а не установка месяца: он двигает и курсор, поэтому мышь и
  // клавиатура делают буквально одно и то же.
  onShiftMonth: (delta: number) => void;
  onPick: (iso: string) => void;
  onClear: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

// 7 колонок по 44px (минимальный тач-таргет) плюс зазоры и паддинги. Число
// фиксированное, а не измеренное: панель не наследует ширину триггера, а знать
// её нужно до отрисовки, чтобы вписать в вьюпорт.
const PANEL_WIDTH = 336;
const PANEL_GAP = 6;
const EDGE = 8;

// Локализация подписей — только здесь. Домен остаётся детерминированным.
const MONTH_FMT = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const WEEKDAY_FMT = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const DAY_FMT = new Intl.DateTimeFormat(undefined, { day: "numeric" });
const FULL_FMT = new Intl.DateTimeFormat(undefined, { dateStyle: "long" });

// id ячейки строится от id панели, чтобы два пикера на одном экране не выдали
// одинаковых id. По нему же панель находит ячейку курсора, чтобы отдать ей
// фокус — панель портована в <body>, так что getElementById её видит.
function dayId(scope: string, iso: string): string {
  return `${scope}-${iso}`;
}

// В отличие от дропдауна панель не повторяет ширину триггера, поэтому у правого
// края экрана её нужно подтянуть внутрь вьюпорта.
function panelStyle(rect: AnchorRect): CSSProperties {
  const maxLeft = window.innerWidth - PANEL_WIDTH - EDGE;
  return {
    position: "fixed",
    top: rect.top + rect.height + PANEL_GAP,
    left: Math.max(EDGE, Math.min(rect.left, maxLeft)),
    width: PANEL_WIDTH,
  };
}

const NAV_CLASS =
  "cursor-pointer rounded px-3 py-1.5 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white";

function dayClass(state: {
  enabled: boolean;
  selected: boolean;
  highlighted: boolean;
  outside: boolean;
}): string {
  if (!state.enabled) return "cursor-not-allowed text-neutral-700";
  if (state.selected) return "cursor-pointer bg-cyan-400/20 text-cyan-200";
  if (state.highlighted) return "cursor-pointer bg-white/10 text-white";
  return state.outside
    ? "cursor-pointer text-neutral-600 hover:bg-white/5"
    : "cursor-pointer text-neutral-200 hover:bg-white/5";
}

// CalendarPanel рендерится порталом в <body>: портал выходит из любого
// родительского stacking context — backdrop-blur соседних панелей иначе
// затянул бы календарь под себя. Позиция фиксированная, привязана к
// измеренному rect триггера.
//
// Фокус живёт внутри панели, пока она открыта: триггер — текстовое поле, и
// стрелки там обязаны двигать каретку. Сетка использует roving tabindex —
// в табуляции участвует только ячейка курсора, остальные держат -1.
export default function CalendarPanel({
  id,
  panelRef,
  rect,
  month,
  value,
  cursor,
  min,
  max,
  onShiftMonth,
  onPick,
  onClear,
  onKeyDown,
}: CalendarPanelProps) {
  const anim = useResolvedVariants(scaleFade);
  const ready = rect !== null;

  // Фокус едет за курсором. Он же озвучивает дату: у ячейки полный aria-label,
  // поэтому отдельный live-регион, нужный когда фокус оставался на триггере,
  // здесь только дублировал бы её.
  //
  // `ready` в зависимостях не для красоты: на первом рендере rect ещё null,
  // сетки в DOM нет, и без него фокус не встал бы никогда.
  useEffect(() => {
    if (ready) document.getElementById(dayId(id, cursor))?.focus();
  }, [id, cursor, ready]);

  if (typeof document === "undefined" || !rect) return null;

  const days = monthGrid(month);
  // Заголовки берутся из первых семи ячеек самой сетки, поэтому они физически
  // не могут разъехаться с её первым днём недели.
  const heads = days.slice(0, 7).map((iso) => WEEKDAY_FMT.format(toDate(iso)));

  return createPortal(
    <motion.div
      ref={panelRef}
      role="dialog"
      id={id}
      aria-label="Calendar"
      onKeyDown={onKeyDown}
      style={panelStyle(rect)}
      variants={anim}
      initial="hidden"
      animate="visible"
      exit="hidden"
      transition={quick}
      className="z-[1000] origin-top rounded-md border border-white/10 bg-neutral-900/95 p-2 text-xs shadow-[0_12px_30px_rgba(0,0,0,0.45)] backdrop-blur-md"
    >
      <div className="flex items-center justify-between pb-1">
        {/* tabIndex -1 и гашение mousedown: фокус обязан остаться на ячейке
            курсора, иначе после клика по стрелке клавиатура потеряет цель. */}
        <button
          type="button"
          tabIndex={-1}
          aria-label="Previous month"
          onMouseDown={(e) => {
            e.preventDefault();
            onShiftMonth(-1);
          }}
          className={NAV_CLASS}
        >
          ‹
        </button>
        <span className="text-[11px] uppercase tracking-[0.14em] text-neutral-300">
          {MONTH_FMT.format(toDate(`${month}-01`))}
        </span>
        <button
          type="button"
          tabIndex={-1}
          aria-label="Next month"
          onMouseDown={(e) => {
            e.preventDefault();
            onShiftMonth(1);
          }}
          className={NAV_CLASS}
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {heads.map((head) => (
          // aria-hidden: каждая ячейка называет себя полной датой, дублировать
          // день недели в озвучке незачем.
          <span
            key={head}
            aria-hidden="true"
            className="py-1 text-center text-[10px] uppercase text-neutral-500"
          >
            {head}
          </span>
        ))}
        {days.map((iso) => {
          const enabled = inRange(iso, min, max);
          return (
            <button
              key={iso}
              id={dayId(id, iso)}
              data-iso={iso}
              type="button"
              tabIndex={iso === cursor ? 0 : -1}
              aria-label={FULL_FMT.format(toDate(iso))}
              aria-pressed={iso === value}
              aria-current={iso === cursor ? "date" : undefined}
              aria-disabled={enabled ? undefined : true}
              onClick={() => enabled && onPick(iso)}
              className={`h-11 rounded text-center transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-300/60 ${dayClass(
                {
                  enabled,
                  selected: iso === value,
                  highlighted: iso === cursor,
                  outside: monthOf(iso) !== month,
                },
              )}`}
            >
              {DAY_FMT.format(toDate(iso))}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        tabIndex={-1}
        onMouseDown={(e) => {
          e.preventDefault();
          onClear();
        }}
        className="mt-1 w-full cursor-pointer rounded px-2 py-2 text-[10px] uppercase tracking-[0.18em] text-neutral-500 transition-colors hover:bg-white/5 hover:text-neutral-300"
      >
        Clear
      </button>
    </motion.div>,
    document.body,
  );
}
