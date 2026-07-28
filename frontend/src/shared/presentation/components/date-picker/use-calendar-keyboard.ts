import { type KeyboardEvent, useCallback } from "react";
import { addDays, inRange, shiftMonth } from "@/shared/domain/calendar";

interface UseCalendarKeyboardParams {
  cursor: string;
  month: string;
  min?: string;
  max?: string;
  onMove: (iso: string) => void;
  onCommit: (iso: string) => void;
  onClose: () => void;
}

// Шаг курсора по стрелкам: горизонталь — день, вертикаль — неделя.
const STEP: Record<string, number> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7,
};

// useCalendarKeyboard возвращает один обработчик для сетки дней. Он живёт на
// панели, а не на триггере: триггер теперь текстовое поле, и там стрелки должны
// двигать каретку, а не дни.
//
// Ход за пределы [min, max] не выполняется — курсор просто остаётся на месте.
// Клавиша, которая молча уводит куда-то ещё, предсказуема хуже, чем клавиша,
// которая ничего не делает.
export function useCalendarKeyboard(params: UseCalendarKeyboardParams) {
  const { cursor, month, min, max, onMove, onCommit, onClose } = params;

  const move = useCallback(
    (next: string) => {
      if (inRange(next, min, max)) onMove(next);
    },
    [min, max, onMove],
  );

  return useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const key = event.key;
      if (key === "Escape" || key === "Tab") {
        // Tab уводит фокус дальше по форме, поэтому панель закрывается, но
        // событие не гасится — иначе переход по Tab перестал бы работать.
        if (key === "Escape") event.preventDefault();
        onClose();
        return;
      }
      if (key in STEP) {
        event.preventDefault();
        move(addDays(cursor, STEP[key]));
        return;
      }
      if (key === "PageUp" || key === "PageDown") {
        event.preventDefault();
        // ponytail: страница месяца ставит курсор на 1-е число, день не
        // сохраняем — иначе на каждом переходе нужен клэмп 31 → 30/29.
        move(`${shiftMonth(month, key === "PageUp" ? -1 : 1)}-01`);
        return;
      }
      if (key === "Home") {
        event.preventDefault();
        move(`${month}-01`);
        return;
      }
      if (key === "End") {
        event.preventDefault();
        move(addDays(`${shiftMonth(month, 1)}-01`, -1));
        return;
      }
      if (key === "Enter" || key === " ") {
        event.preventDefault();
        if (inRange(cursor, min, max)) onCommit(cursor);
      }
    },
    [cursor, month, min, max, move, onCommit, onClose],
  );
}
