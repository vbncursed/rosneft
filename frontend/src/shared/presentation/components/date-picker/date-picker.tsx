import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence } from "motion/react";
import { addDays, inRange, monthOf, shiftMonth, toDate, todayISO } from "@/shared/domain/calendar";
import { useAnchoredPosition } from "@/shared/presentation/components/dropdown/use-anchored-position";
import CalendarPanel from "@/shared/presentation/components/date-picker/calendar-panel";

export interface DatePickerProps {
  // "" означает «дата не выбрана» — тот же контракт, что у нативного
  // <input type="date">, поэтому вызывающий код и гейтвей не меняются.
  value: string;
  onChange: (iso: string) => void;
  // Границы включительны. Пустая граница = ограничения нет.
  min?: string;
  max?: string;
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
}

const TRIGGER_CLASS =
  "flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 text-sm text-white transition-colors hover:border-white/25 focus:border-cyan-400/60 focus:outline-none";

// Шаг курсора по стрелкам: горизонталь — день, вертикаль — неделя.
const STEP: Record<string, number> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7,
};

// DatePicker — собственная замена нативному <input type="date">: браузерный
// пикер выглядит по-разному в каждом движке и не вписывается в тёмную
// «стеклянную» вёрстку.
//
// Механика повторяет Dropdown: фокус остаётся на кнопке-триггере, панель
// портуется в <body>, позиция берётся из useAnchoredPosition. Фокус внутрь
// панели не уходит — поэтому её элементы гасят mousedown и держат tabIndex=-1,
// а озвучку курсора берёт на себя live-регион панели.
export default function DatePicker({
  value,
  onChange,
  min,
  max,
  ariaLabel,
  placeholder = "any",
  className = "",
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => monthOf(value || todayISO()));
  const [cursor, setCursor] = useState(() => value || todayISO());
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const rect = useAnchoredPosition(triggerRef, open);

  // Каждое открытие начинается с текущего выбора пользователя, а не с того,
  // где курсор остался в прошлый раз — тот же контракт, что у openMenu()
  // в Dropdown.
  const openPanel = useCallback(() => {
    const start = value || todayISO();
    setCursor(start);
    setMonth(monthOf(start));
    setOpen(true);
  }, [value]);

  const closePanel = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const commit = useCallback(
    (iso: string) => {
      onChange(iso);
      setOpen(false);
      triggerRef.current?.focus();
    },
    [onChange],
  );

  // Закрытие по клику вне и по Esc откуда угодно. Слушаем mousedown, а не
  // click, чтобы панель исчезла до того, как отреагирует любая другая цель.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onEsc = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  // Курсор не зажимается к границе, а просто не двигается: клавиша, которая
  // молча уводит куда-то ещё, предсказуема хуже, чем клавиша, которая ничего
  // не делает. Видимый месяц следует за курсором через края сетки.
  const moveCursor = useCallback(
    (next: string) => {
      if (!inRange(next, min, max)) return;
      setCursor(next);
      setMonth(monthOf(next));
    },
    [min, max],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      const key = event.key;
      if (!open) {
        if (key === "Enter" || key === " " || key === "ArrowDown" || key === "ArrowUp") {
          event.preventDefault();
          openPanel();
        }
        return;
      }
      if (key === "Escape" || key === "Tab") {
        if (key === "Escape") event.preventDefault();
        closePanel();
        return;
      }
      if (key in STEP) {
        event.preventDefault();
        moveCursor(addDays(cursor, STEP[key]));
        return;
      }
      if (key === "PageUp" || key === "PageDown") {
        event.preventDefault();
        // ponytail: страница месяца ставит курсор на 1-е число, день не
        // сохраняем — иначе на каждом переходе нужен клэмп 31 → 30/29.
        moveCursor(`${shiftMonth(month, key === "PageUp" ? -1 : 1)}-01`);
        return;
      }
      if (key === "Home") {
        event.preventDefault();
        moveCursor(`${month}-01`);
        return;
      }
      if (key === "End") {
        event.preventDefault();
        moveCursor(addDays(`${shiftMonth(month, 1)}-01`, -1));
        return;
      }
      if (key === "Enter" || key === " ") {
        event.preventDefault();
        if (inRange(cursor, min, max)) commit(cursor);
      }
    },
    [open, cursor, month, min, max, openPanel, closePanel, commit, moveCursor],
  );

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
        onKeyDown={onKeyDown}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={ariaLabel ?? "Choose a date"}
        className={TRIGGER_CLASS}
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {value ? toDate(value).toLocaleDateString() : placeholder}
        </span>
        <span
          aria-hidden="true"
          className={`shrink-0 text-neutral-400 transition-transform duration-150 ${
            open ? "rotate-180 text-cyan-300/80" : ""
          }`}
        >
          ▾
        </span>
      </button>

      <AnimatePresence>
        {open ? (
          <CalendarPanel
            id={panelId}
            panelRef={panelRef}
            rect={rect}
            month={month}
            value={value}
            cursor={cursor}
            min={min}
            max={max}
            onMonthChange={setMonth}
            onHover={setCursor}
            onPick={commit}
            onClear={() => commit("")}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
