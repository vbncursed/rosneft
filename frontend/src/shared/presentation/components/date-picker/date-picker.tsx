import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence } from "motion/react";
import {
  formatDateInput,
  inRange,
  monthOf,
  parseDateInput,
  shiftMonth,
  todayISO,
} from "@/shared/domain/calendar";
import { useAnchoredPosition } from "@/shared/presentation/components/dropdown/use-anchored-position";
import CalendarPanel from "@/shared/presentation/components/date-picker/calendar-panel";
import { useCalendarKeyboard } from "@/shared/presentation/components/date-picker/use-calendar-keyboard";

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
  // Подменяет оформление поля, не раскладку. См. одноимённый проп Dropdown.
  triggerClassName?: string;
}

const FIELD_LAYOUT = "flex w-full items-center gap-1";
const FIELD_LOOK =
  "rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 text-sm text-white transition-colors focus-within:border-cyan-400/60";

// DatePicker — собственная замена нативному <input type="date">: браузерный
// пикер выглядит по-разному в каждом движке и не вписывается в тёмную
// «стеклянную» вёрстку.
//
// Дата вводится двумя способами и оба равноправны: руками в поле (29/07/2026,
// 29.07.2026 или ISO — см. parseDateInput) и мышью/клавиатурой в календаре.
// Пока календарь открыт, фокус находится внутри него: в текстовом поле стрелки
// обязаны двигать каретку, а не дни, поэтому разделение по фокусу — это не
// украшение, а единственный способ не отобрать у поля клавиатуру.
export default function DatePicker({
  value,
  onChange,
  min,
  max,
  ariaLabel,
  placeholder = "dd/mm/yyyy",
  className = "",
  triggerClassName,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => monthOf(value || todayISO()));
  const [cursor, setCursor] = useState(() => value || todayISO());
  const [text, setText] = useState(() => formatDateInput(value));
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const rect = useAnchoredPosition(wrapRef, open);

  // Значение может смениться снаружи — выбором в календаре, кнопкой Clear или
  // сбросом фильтров родителем. Текст поля следует за ним; набор это не сбивает,
  // потому что value меняется только в момент коммита.
  useEffect(() => {
    setText(formatDateInput(value));
  }, [value]);

  const closePanel = useCallback(() => {
    setOpen(false);
    inputRef.current?.focus();
  }, []);

  const commit = useCallback(
    (iso: string) => {
      onChange(iso);
      setOpen(false);
      inputRef.current?.focus();
    },
    [onChange],
  );

  // Открытие всегда начинается с текущего выбора пользователя, а не с того, где
  // курсор остался в прошлый раз.
  const openPanel = useCallback(() => {
    const start = value || todayISO();
    setCursor(start);
    setMonth(monthOf(start));
    setOpen(true);
  }, [value]);

  const moveCursor = useCallback((next: string) => {
    setCursor(next);
    setMonth(monthOf(next));
  }, []);

  // Шаг месяца двигает и курсор: иначе ячейка курсора размонтируется, фокус
  // упадёт на body и клавиатура потеряет цель.
  const shiftMonthBy = useCallback(
    (delta: number) => {
      const next = `${shiftMonth(month, delta)}-01`;
      if (inRange(next, min, max)) moveCursor(next);
    },
    [month, min, max, moveCursor],
  );

  // Закрытие по клику вне и по Esc откуда угодно.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target)) return;
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

  // Разбор набранного. Пустое поле — это снятие фильтра, а не ошибка. Дата вне
  // границ и нечитаемая строка обрабатываются одинаково: текст возвращается к
  // действующему значению, чтобы поле не осталось врать.
  const commitText = useCallback(() => {
    if (!text.trim()) {
      onChange("");
      return;
    }
    const parsed = parseDateInput(text);
    if (parsed && inRange(parsed, min, max)) onChange(parsed);
    else setText(formatDateInput(value));
  }, [text, value, min, max, onChange]);

  const onInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commitText();
      } else if (event.key === "ArrowDown" && !open) {
        event.preventDefault();
        openPanel();
      }
    },
    [commitText, open, openPanel],
  );

  const onPanelKeyDown = useCalendarKeyboard({
    cursor,
    month,
    min,
    max,
    onMove: moveCursor,
    onCommit: commit,
    onClose: closePanel,
  });

  // Подсветка неприемлемого ввода. Без неё «ничего не произошло» невозможно
  // отличить от «набрано неверно». Дата за границей диапазона считается тем же
  // самым: она разбирается успешно, но принята не будет, и краснеть поле должно
  // до отката, а не после.
  const parsedText = parseDateInput(text);
  const invalid = text.trim() !== "" && (!parsedText || !inRange(parsedText, min, max));

  return (
    <div className={`relative ${className}`}>
      <div
        ref={wrapRef}
        className={`${FIELD_LAYOUT} ${triggerClassName ?? FIELD_LOOK} ${
          invalid ? "border-rose-400/60" : ""
        }`}
      >
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={text}
          placeholder={placeholder}
          aria-label={ariaLabel ?? "Date"}
          aria-invalid={invalid || undefined}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onInputKeyDown}
          onBlur={commitText}
          className="min-w-0 flex-1 bg-transparent placeholder:text-neutral-600 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => (open ? setOpen(false) : openPanel())}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-label={`${ariaLabel ?? "Date"}: open the calendar`}
          className="shrink-0 cursor-pointer rounded px-1 text-neutral-400 transition-colors hover:text-cyan-300"
        >
          {/* Типографский символ, а не эмодзи: эмодзи рисуется шрифтом
              платформы и выбивается из остальной иконографии. */}
          ▾
        </button>
      </div>

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
            onShiftMonth={shiftMonthBy}
            onPick={commit}
            onClear={() => commit("")}
            onKeyDown={onPanelKeyDown}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
