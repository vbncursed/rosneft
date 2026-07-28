# Календарь выбора даты — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить два нативных `<input type="date">` в фильтрах журнала аудита на собственный компонент календаря, не меняя контракт значения (`YYYY-MM-DD`).

**Architecture:** Чистая календарная арифметика над ISO-строками в `shared/domain/calendar.ts` (тестируется `node --test`), поверх неё — портальный поповер в `shared/presentation/components/date-picker/`, построенный на уже существующей инфраструктуре дропдауна (`useAnchoredPosition`, `createPortal` в `<body>`, motion-пресеты `scaleFade`/`quick`). Границы диапазона выражаются через существующее состояние фильтров, отдельной валидации нет.

**Tech Stack:** React 19, TypeScript strict, Tailwind CSS 4, `motion/react`, `node --test` (домен) + vitest/jsdom (компоненты).

Спека: `docs/superpowers/specs/2026-07-29-date-picker-design.md`

## Global Constraints

- Все команды выполняются из `frontend/`.
- **Жёсткий лимит 200 строк на файл** (ESLint `max-lines`, `skipBlankLines`, `skipComments`). Превышение — ошибка сборки, не предупреждение.
- **Никогда не писать `"use client"`** — это Vite SPA, а не Next.js.
- Слои: зависимости направлены строго внутрь, `domain` не импортирует ничего наружу. `motion` — только в `presentation/`.
- Импорты между модулями приложения — через алиас `@/*` → `frontend/src/*`. **Исключение:** файлы `*.test.ts` для `node --test` должны импортировать относительным путём с явным расширением (`from "./calendar.ts"`) — Node не разрешает алиасы tsconfig.
- Vitest запущен **без** `globals`: `describe`/`it`/`expect`/`vi` импортируются явно, `afterEach(cleanup)` вешается руками.
- Два раннера, глобы не пересекаются: `*.test.ts` → `yarn test`, `*.spec.ts(x)` → `yarn test:spa`.
- Любая анимированная поверхность обязана уважать `prefers-reduced-motion` через `useResolvedVariants`.
- Новых npm-зависимостей не добавлять.
- Комментарии — по-русски, объясняют «почему», а не «что» (как в существующих файлах контекста `audit/`).
- Финальный гейт перед каждым коммитом: `yarn lint && yarn test && yarn test:spa`.

---

## File Structure

| Файл | Ответственность |
| --- | --- |
| `src/shared/domain/calendar.ts` (создать) | Календарная арифметика над строками `YYYY-MM-DD`. Ноль зависимостей, ноль форматирования. |
| `src/shared/domain/calendar.test.ts` (создать) | `node --test` для арифметики: смещение сетки, границы месяца/года, високосный день, включительность диапазона. |
| `src/shared/presentation/components/date-picker/calendar-panel.tsx` (создать) | Портальная панель: шапка месяца, 42 ячейки, `Clear`, live-регион. Вся `Intl`-локализация здесь. |
| `src/shared/presentation/components/date-picker/date-picker.tsx` (создать) | Кнопка-триггер, состояние `open`/`month`/`cursor`, клавиатура, закрытие по outside-click и `Esc`. |
| `src/shared/presentation/components/date-picker/date-picker.spec.tsx` (создать) | vitest: открытие, выбор, блокировка за `max`, `Clear`, `Esc`, стрелки. |
| `src/audit/presentation/components/audit-filters.tsx` (изменить: строки 69-85) | Подключение `DatePicker` вместо двух инпутов, взаимные границы `From`/`To`. |

---

## Task 1: Календарная арифметика

**Files:**
- Create: `frontend/src/shared/domain/calendar.ts`
- Test: `frontend/src/shared/domain/calendar.test.ts`

**Interfaces:**
- Consumes: ничего.
- Produces:
  - `todayISO(): string` — сегодня как `"YYYY-MM-DD"`
  - `addDays(iso: string, n: number): string`
  - `monthOf(iso: string): string` — `"2026-07-29"` → `"2026-07"`
  - `shiftMonth(ym: string, delta: number): string` — `"2026-12"` → `"2027-01"`
  - `monthGrid(ym: string): string[]` — ровно 42 ISO-даты, первая = понедельник на или до 1-го числа
  - `inRange(iso: string, min?: string, max?: string): boolean` — включительно, пустая/`undefined` граница = отсутствует
  - `toDate(iso: string): Date` — единственный переход ISO → `Date`, для `Intl`

- [ ] **Step 1: Написать падающий тест**

Создать `frontend/src/shared/domain/calendar.test.ts`:

```ts
// Run with: yarn test  (Node's built-in runner, no framework dependency)
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  addDays,
  inRange,
  monthGrid,
  monthOf,
  shiftMonth,
  toDate,
  todayISO,
} from "./calendar.ts";

test("monthGrid always returns six full weeks", () => {
  // Фиксированная длина держит высоту панели постоянной: при перелистывании
  // месяцев вёрстка не должна прыгать.
  assert.equal(monthGrid("2026-07").length, 42);
  assert.equal(monthGrid("2026-02").length, 42);
  assert.equal(monthGrid("2026-08").length, 42);
});

test("monthGrid pads back to the Monday on or before the 1st", () => {
  // 1 июля 2026 — среда, сетка начинается 29 июня.
  assert.equal(monthGrid("2026-07")[0], "2026-06-29");
  // 1 марта 2026 — воскресенье: максимальное смещение, шесть дней назад.
  assert.equal(monthGrid("2026-03")[0], "2026-02-23");
  // 1 июня 2026 — понедельник: смещения нет вовсе.
  assert.equal(monthGrid("2026-06")[0], "2026-06-01");
});

test("monthGrid covers the leap day", () => {
  assert.ok(monthGrid("2028-02").includes("2028-02-29"));
  assert.ok(!monthGrid("2026-02").includes("2026-02-29"));
});

test("addDays crosses month, year and leap-day boundaries", () => {
  assert.equal(addDays("2026-07-31", 1), "2026-08-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(addDays("2026-02-28", 1), "2026-03-01");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  // Ход стрелкой вверх/вниз — ровно неделя.
  assert.equal(addDays("2026-07-29", 7), "2026-08-05");
  assert.equal(addDays("2026-07-29", -7), "2026-07-22");
  assert.equal(addDays("2026-07-29", 0), "2026-07-29");
});

test("shiftMonth wraps the year in both directions", () => {
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-07", 0), "2026-07");
});

test("monthOf takes the year-month prefix", () => {
  assert.equal(monthOf("2026-07-29"), "2026-07");
  assert.equal(monthOf("2026-01-01"), "2026-01");
});

test("inRange treats a missing bound as no bound and includes both ends", () => {
  assert.ok(inRange("2026-07-29", undefined, undefined));
  assert.ok(inRange("2026-07-29", "", ""));
  assert.ok(inRange("2026-07-29", "2026-07-01", "2026-07-31"));
  assert.ok(inRange("2026-07-01", "2026-07-01", "2026-07-31"));
  assert.ok(inRange("2026-07-31", "2026-07-01", "2026-07-31"));
  assert.ok(!inRange("2026-08-01", undefined, "2026-07-31"));
  assert.ok(!inRange("2026-06-30", "2026-07-01", undefined));
});

test("ISO strings sort chronologically", () => {
  // На этом держится вся проверка границ: если формат потеряет ведущие нули,
  // сравнение поедет молча, без единой ошибки типов.
  const grid = monthGrid("2026-12");
  assert.deepEqual([...grid].sort(), grid);
});

test("toDate keeps the calendar day of its ISO string", () => {
  // Регрессия на две самые частые ошибки дат: new Date("2026-07-29") парсится
  // как UTC-полночь, а toISOString() отдаёт предыдущий день для любой
  // положительной таймзоны.
  const d = toDate("2026-07-29");
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 6);
  assert.equal(d.getDate(), 29);
});

test("todayISO produces a zero-padded ISO date", () => {
  assert.match(todayISO(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(monthOf(todayISO()).length, 7);
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `cd frontend && yarn test`
Expected: FAIL — `Cannot find module './calendar.ts'`.

- [ ] **Step 3: Реализовать модуль**

Создать `frontend/src/shared/domain/calendar.ts`:

```ts
// Календарная арифметика над строками "YYYY-MM-DD". Строки выбраны не для
// удобства, а потому что их лексикографический порядок совпадает с
// хронологическим: вся проверка границ диапазона — это сравнение строк, без
// Date и без таймзон (см. inRange).
const pad = (n: number) => String(n).padStart(2, "0");

function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Полдень, а не полночь: DST-переход сдвигает время на ±1 час, и с полуночи
// это перебросило бы дату на соседние сутки. new Date(iso) здесь не подходит
// вовсе — спецификация парсит "2026-07-29" как UTC-полночь, что в любой
// положительной таймзоне даёт предыдущий день.
export function toDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

export function todayISO(): string {
  return toISO(new Date());
}

export function addDays(iso: string, n: number): string {
  const d = toDate(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  // Переполнение месяца Date разруливает сам: месяц 12 → январь следующего года.
  const d = new Date(y, m - 1 + delta, 1, 12);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

// Ровно 42 дня (шесть недель) начиная с понедельника на или до 1-го числа.
// Постоянная длина = постоянная высота панели: перелистывание месяцев не
// дёргает вёрстку.
// ponytail: понедельник как первый день недели захардкожен; если понадобится
// воскресная неделя — смещение станет параметром.
export function monthGrid(ym: string): string[] {
  const first = `${ym}-01`;
  const offset = (toDate(first).getDay() + 6) % 7; // JS: вс=0 → наш: пн=0
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

// Единственная проверка доступности дня. Границы включительны, пустая или
// отсутствующая граница означает «ограничения нет».
export function inRange(iso: string, min?: string, max?: string): boolean {
  return (!min || iso >= min) && (!max || iso <= max);
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `cd frontend && yarn test`
Expected: PASS — все тесты `calendar.test.ts` зелёные, ранее существовавшие тесты не сломаны.

- [ ] **Step 5: Линт**

Run: `cd frontend && yarn lint`
Expected: без ошибок (в частности `max-lines` — файл ~45 значащих строк).

- [ ] **Step 6: Коммит**

```bash
cd frontend && git add src/shared/domain/calendar.ts src/shared/domain/calendar.test.ts
git commit -m "feat(shared): calendar arithmetic over ISO date strings"
```

---

## Task 2: Компонент DatePicker

**Files:**
- Create: `frontend/src/shared/presentation/components/date-picker/calendar-panel.tsx`
- Create: `frontend/src/shared/presentation/components/date-picker/date-picker.tsx`
- Test: `frontend/src/shared/presentation/components/date-picker/date-picker.spec.tsx`

**Interfaces:**
- Consumes из Task 1: `todayISO`, `addDays`, `monthOf`, `shiftMonth`, `monthGrid`, `inRange`, `toDate` из `@/shared/domain/calendar`.
- Consumes существующее (менять нельзя):
  - `useAnchoredPosition(anchor: RefObject<HTMLElement | null> | string, enabled: boolean): AnchorRect | null` и тип `AnchorRect { top; left; width; height }` из `@/shared/presentation/components/dropdown/use-anchored-position`
  - `scaleFade` из `@/shared/presentation/motion/variants`, `quick` из `@/shared/presentation/motion/transitions`, `useResolvedVariants` из `@/shared/presentation/motion/reduced-motion`
- Produces для Task 3: default-экспорт `DatePicker` с пропсами
  `{ value: string; onChange: (iso: string) => void; min?: string; max?: string; ariaLabel?: string; placeholder?: string; className?: string }`.

Важно про направление импорта: `calendar-panel.tsx` **не** импортирует ничего из `date-picker.tsx`. Зависимость односторонняя, пикер → панель, цикла нет.

- [ ] **Step 1: Написать падающий тест**

Создать `frontend/src/shared/presentation/components/date-picker/date-picker.spec.tsx`:

```tsx
// Run with: yarn test:spa  (vitest + jsdom).
//
// cleanup is wired by hand: vitest runs without `globals`, so testing-library
// cannot register its own afterEach hook.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// motion мокается, чтобы панель монтировалась и размонтировалась синхронно:
// exit-анимация оставила бы закрытую панель в DOM и превратила любую проверку
// закрытия в гонку. Мок сторонней рендер-обёртки — принятый в проекте приём
// (panorama-loading-overlay.spec.tsx так мокает drei).
vi.mock("motion/react", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    div: (props: Record<string, unknown>) => {
      // motion-специфичные пропсы отбрасываем, иначе React ругается на
      // неизвестные DOM-атрибуты. Ведущее подчёркивание — принятая в проекте
      // отметка намеренно неиспользуемой переменной (eslint.config.mjs:30-33).
      const {
        variants: _variants,
        initial: _initial,
        animate: _animate,
        exit: _exit,
        transition: _transition,
        ...rest
      } = props;
      return <div {...(rest as React.ComponentProps<"div">)} />;
    },
  },
  useReducedMotion: () => false,
}));

import DatePicker from "./date-picker";

// Ячейки ищем по data-iso, а не по подписи: подпись форматируется Intl в
// локали окружения, и завязка на неё сделала бы тест хрупким.
function day(iso: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-iso="${iso}"]`);
  if (!el) throw new Error(`no day cell rendered for ${iso}`);
  return el;
}

afterEach(cleanup);

describe("DatePicker", () => {
  it("shows the placeholder while no date is chosen", () => {
    render(<DatePicker value="" onChange={vi.fn()} ariaLabel="From" />);

    const trigger = screen.getByRole("button", { name: "From" });
    expect(trigger.textContent).toContain("any");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("reports the clicked day as an ISO date and closes", async () => {
    const onChange = vi.fn();
    render(<DatePicker value="2026-07-15" onChange={onChange} ariaLabel="From" />);

    await userEvent.click(screen.getByRole("button", { name: "From" }));
    await userEvent.click(day("2026-07-29"));

    expect(onChange).toHaveBeenCalledWith("2026-07-29");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the adjacent months that pad the six-week grid", async () => {
    render(<DatePicker value="2026-07-15" onChange={vi.fn()} ariaLabel="From" />);

    await userEvent.click(screen.getByRole("button", { name: "From" }));

    // 1 июля 2026 — среда, поэтому сетка начинается 29 июня.
    expect(day("2026-06-29")).toBeTruthy();
    expect(document.querySelectorAll("[data-iso]").length).toBe(42);
  });

  it("refuses a day past max", async () => {
    const onChange = vi.fn();
    render(
      <DatePicker value="2026-07-15" onChange={onChange} max="2026-07-20" ariaLabel="To" />,
    );

    await userEvent.click(screen.getByRole("button", { name: "To" }));
    expect(day("2026-07-25").getAttribute("aria-disabled")).toBe("true");

    await userEvent.click(day("2026-07-25"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("refuses a day before min", async () => {
    const onChange = vi.fn();
    render(
      <DatePicker value="2026-07-15" onChange={onChange} min="2026-07-10" ariaLabel="To" />,
    );

    await userEvent.click(screen.getByRole("button", { name: "To" }));
    expect(day("2026-07-05").getAttribute("aria-disabled")).toBe("true");

    await userEvent.click(day("2026-07-05"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clears the value from the panel footer", async () => {
    const onChange = vi.fn();
    render(<DatePicker value="2026-07-15" onChange={onChange} ariaLabel="From" />);

    await userEvent.click(screen.getByRole("button", { name: "From" }));
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(onChange).toHaveBeenCalledWith("");
  });

  it("walks the month with the previous/next buttons", async () => {
    render(<DatePicker value="2026-07-15" onChange={vi.fn()} ariaLabel="From" />);

    await userEvent.click(screen.getByRole("button", { name: "From" }));
    await userEvent.click(screen.getByRole("button", { name: "Previous month" }));

    expect(day("2026-06-15")).toBeTruthy();
    expect(document.querySelector('[data-iso="2026-07-31"]')).toBeNull();
  });

  it("moves the keyboard cursor one day at a time", async () => {
    render(<DatePicker value="2026-07-15" onChange={vi.fn()} ariaLabel="From" />);

    await userEvent.click(screen.getByRole("button", { name: "From" }));
    expect(day("2026-07-15").getAttribute("aria-current")).toBe("date");

    await userEvent.keyboard("{ArrowRight}");
    expect(day("2026-07-16").getAttribute("aria-current")).toBe("date");
    expect(day("2026-07-15").getAttribute("aria-current")).toBeNull();

    await userEvent.keyboard("{ArrowDown}");
    expect(day("2026-07-23").getAttribute("aria-current")).toBe("date");
  });

  it("commits the cursor on Enter", async () => {
    const onChange = vi.fn();
    render(<DatePicker value="2026-07-15" onChange={onChange} ariaLabel="From" />);

    await userEvent.click(screen.getByRole("button", { name: "From" }));
    await userEvent.keyboard("{ArrowRight}{Enter}");

    expect(onChange).toHaveBeenCalledWith("2026-07-16");
  });

  it("keeps the cursor put when the next day is out of range", async () => {
    render(
      <DatePicker value="2026-07-20" onChange={vi.fn()} max="2026-07-20" ariaLabel="To" />,
    );

    await userEvent.click(screen.getByRole("button", { name: "To" }));
    await userEvent.keyboard("{ArrowRight}");

    expect(day("2026-07-20").getAttribute("aria-current")).toBe("date");
  });

  it("closes on Escape", async () => {
    render(<DatePicker value="2026-07-15" onChange={vi.fn()} ariaLabel="From" />);

    await userEvent.click(screen.getByRole("button", { name: "From" }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `cd frontend && yarn test:spa`
Expected: FAIL — `Failed to resolve import "./date-picker"`.

- [ ] **Step 3: Реализовать панель**

Создать `frontend/src/shared/presentation/components/date-picker/calendar-panel.tsx`:

```tsx
import { type CSSProperties, type Ref } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { inRange, monthGrid, monthOf, shiftMonth, toDate } from "@/shared/domain/calendar";
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
  onMonthChange: (ym: string) => void;
  onHover: (iso: string) => void;
  onPick: (iso: string) => void;
  onClear: () => void;
}

// 7 колонок по 36px плюс паддинги. Фиксированное число, а не measured: панель
// не наследует ширину триггера, и её нужно знать до отрисовки, чтобы вписать
// в вьюпорт.
const PANEL_WIDTH = 272;
const PANEL_GAP = 6;
const EDGE = 8;

// Локализация подписей — только здесь. Домен остаётся детерминированным.
const MONTH_FMT = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const WEEKDAY_FMT = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const DAY_FMT = new Intl.DateTimeFormat(undefined, { day: "numeric" });
const FULL_FMT = new Intl.DateTimeFormat(undefined, { dateStyle: "long" });

// id ячейки строится от id панели, чтобы два пикера на одном экране не выдали
// одинаковых id.
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
  "rounded px-2 py-0.5 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white";

function dayClass(state: {
  enabled: boolean;
  selected: boolean;
  highlighted: boolean;
  outside: boolean;
}): string {
  if (!state.enabled) return "cursor-not-allowed text-neutral-700";
  if (state.selected) return "bg-cyan-400/20 text-cyan-200";
  if (state.highlighted) return "bg-white/10 text-white";
  return state.outside
    ? "text-neutral-600 hover:bg-white/5"
    : "text-neutral-200 hover:bg-white/5";
}

// CalendarPanel рендерится порталом в <body>: портал выходит из любого
// родительского stacking context — backdrop-blur соседних панелей иначе
// затянул бы календарь под себя. Позиция фиксированная, привязана к
// измеренному rect триггера.
export default function CalendarPanel({
  id,
  panelRef,
  rect,
  month,
  value,
  cursor,
  min,
  max,
  onMonthChange,
  onHover,
  onPick,
  onClear,
}: CalendarPanelProps) {
  const anim = useResolvedVariants(scaleFade);
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
      style={panelStyle(rect)}
      variants={anim}
      initial="hidden"
      animate="visible"
      exit="hidden"
      transition={quick}
      className="z-[1000] origin-top rounded-md border border-white/10 bg-neutral-900/95 p-2 text-xs shadow-[0_12px_30px_rgba(0,0,0,0.45)] backdrop-blur-md"
    >
      {/* Фокус остаётся на триггере, поэтому стрелки сами по себе ничего не
          озвучивают. Живой регион проговаривает каждый ход курсора — без него
          замена нативного инпута была бы регрессией доступности. */}
      <span aria-live="polite" className="sr-only">
        {FULL_FMT.format(toDate(cursor))}
      </span>

      <div className="flex items-center justify-between pb-1">
        <button
          type="button"
          tabIndex={-1}
          aria-label="Previous month"
          onMouseDown={(e) => {
            e.preventDefault();
            onMonthChange(shiftMonth(month, -1));
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
            onMonthChange(shiftMonth(month, 1));
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
              tabIndex={-1}
              aria-label={FULL_FMT.format(toDate(iso))}
              aria-pressed={iso === value}
              aria-current={iso === cursor ? "date" : undefined}
              aria-disabled={enabled ? undefined : true}
              onMouseEnter={() => enabled && onHover(iso)}
              onMouseDown={(e) => {
                // mousedown, а не click: иначе триггер потеряет фокус до
                // коммита (тот же порядок событий, что в dropdown-menu).
                e.preventDefault();
                if (enabled) onPick(iso);
              }}
              className={`rounded py-1 text-center transition-colors ${dayClass({
                enabled,
                selected: iso === value,
                highlighted: iso === cursor,
                outside: monthOf(iso) !== month,
              })}`}
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
        className="mt-1 w-full rounded px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-neutral-500 transition-colors hover:bg-white/5 hover:text-neutral-300"
      >
        Clear
      </button>
    </motion.div>,
    document.body,
  );
}
```

- [ ] **Step 4: Реализовать пикер**

Создать `frontend/src/shared/presentation/components/date-picker/date-picker.tsx`:

```tsx
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
```

- [ ] **Step 5: Убедиться, что тесты проходят**

Run: `cd frontend && yarn test:spa`
Expected: PASS — все 11 тестов `DatePicker` зелёные, `audit-table.spec.tsx` и остальные не сломаны.

Если тест `commits the cursor on Enter` падает из-за того, что `userEvent` синтезирует click по Enter на кнопке несмотря на `preventDefault` — это настоящий баг, а не проблема теста: панель откроется заново после коммита. Починка в этом случае — вызывать `commit` из `onKeyDown` и одновременно ставить флаг, который гасит следующий `onClick`; но сначала проверить, воспроизводится ли вообще.

- [ ] **Step 6: Линт**

Run: `cd frontend && yarn lint`
Expected: без ошибок. Если `max-lines` сработает на `date-picker.tsx` — вынести обработчик клавиатуры в `use-calendar-keyboard.ts` рядом, по образцу `dropdown/use-dropdown-keyboard.ts`, передав туда `{ open, cursor, month, min, max, onOpen, onClose, onCommit, onMove, onMonthChange }`. Заранее не дробить.

- [ ] **Step 7: Коммит**

```bash
cd frontend && git add src/shared/presentation/components/date-picker/
git commit -m "feat(shared): custom date picker popover"
```

---

## Task 3: Подключить пикер к фильтрам аудита

**Files:**
- Modify: `frontend/src/audit/presentation/components/audit-filters.tsx` (строки 69-85 — блок с двумя `<input type="date">`)

**Interfaces:**
- Consumes из Task 2: default-экспорт `DatePicker` (`@/shared/presentation/components/date-picker/date-picker`).
- Consumes из Task 1: `todayISO` (`@/shared/domain/calendar`).
- Produces: ничего нового. `AuditFilters`, `toBound()` в `audit-gateway.ts:45-48`, `ExportButton` и бэкенд остаются нетронутыми — значение по-прежнему `YYYY-MM-DD`.

- [ ] **Step 1: Заменить нативные инпуты**

В `frontend/src/audit/presentation/components/audit-filters.tsx` добавить к существующим импортам:

```tsx
import { todayISO } from "@/shared/domain/calendar";
import DatePicker from "@/shared/presentation/components/date-picker/date-picker";
```

Заменить блок со строки 69 (`{/* Native date inputs: ... */}`) по строку 85 (закрывающий `</Field>` поля `To`) на:

```tsx
      {/* Собственный пикер вместо <input type="date">: браузерный выглядит
          по-разному в каждом движке и не вписывается в тёмную вёрстку. Формат
          значения тот же — "YYYY-MM-DD", поэтому toBound() в гейтвее и весь
          остальной код фильтров не меняются.

          Взаимные границы выражены через уже имеющееся состояние фильтров:
          невозможно собрать запрос, который всегда пуст, и невозможно
          запросить будущее — в журнале его нет. */}
      <Field label="From">
        <DatePicker
          ariaLabel="From"
          value={value.from}
          onChange={set("from")}
          max={value.to || todayISO()}
        />
      </Field>
      <Field label="To">
        <DatePicker
          ariaLabel="To"
          value={value.to}
          onChange={set("to")}
          min={value.from}
          max={todayISO()}
        />
      </Field>
```

- [ ] **Step 2: Проверить, что типы сходятся**

Run: `cd frontend && yarn typecheck`
Expected: PASS. `set("from")` уже имеет тип `(v: string) => void` (строка 35), что совпадает с `onChange` пикера — адаптера не нужно.

- [ ] **Step 3: Прогнать полный гейт**

Run: `cd frontend && yarn lint && yarn test && yarn test:spa`
Expected: PASS во всех трёх. `FIELD_CLASS` останется в использовании тремя оставшимися полями (Action, Entity, Actor id) — если нет, ESLint пожалуется на неиспользуемую константу.

- [ ] **Step 4: Проверить руками в браузере**

Run: `cd frontend && yarn dev`, открыть `/admin/audit`.

Проверить:
1. Клик по `From` открывает календарь под полем, не под соседними панелями.
2. Дни после сегодняшнего — приглушены и не выбираются.
3. Выбрав `From = 20-е`, открыть `To`: дни до 20-го приглушены.
4. Выбрав `To = 25-е`, открыть `From`: дни после 25-го приглушены.
5. Таблица перезапрашивается при выборе — `queryKey: ["audit", filters]` в `use-audit-log.ts:10` реагирует на смену фильтров.
6. `Clear` в футере возвращает поле в `any`, журнал показывает записи снова без ограничения по дате.
7. `Export CSV` скачивает файл, ограниченный выбранным диапазоном.
8. На узком окне (~380px) панель не уезжает за правый край экрана.
9. Tab доводит фокус до кнопки `From`, `↓` открывает, стрелки водят курсор, `Enter` выбирает, `Esc` закрывает.
10. В системных настройках включить «уменьшить движение» и убедиться, что панель появляется без масштабирования, только через прозрачность.

- [ ] **Step 5: Коммит**

```bash
cd frontend && git add src/audit/presentation/components/audit-filters.tsx
git commit -m "feat(audit): use the custom date picker in the journal filters"
```

---

## Self-Review — покрытие спеки

| Раздел спеки | Задача |
| --- | --- |
| Контракт данных не меняется | Task 3, Step 2 (typecheck подтверждает совпадение сигнатур) |
| `calendar.ts`, три решения о датах | Task 1, Step 3; проверяются тестами `toDate keeps the calendar day`, `ISO strings sort chronologically` |
| `monthGrid` — 42 ячейки с понедельника | Task 1, тесты `six full weeks` + `pads back to the Monday` |
| Форматирования нет в домене | Task 1 (домен без `Intl`), Task 2 (все четыре `Intl`-форматтера в `calendar-panel.tsx`) |
| Состояние `open`/`month`/`cursor`, переинициализация при открытии | Task 2, Step 4, `openPanel` |
| Таблица клавиатуры | Task 2, Step 4, `onKeyDown`; тесты движения курсора, `Enter`, границы, `Escape` |
| Портал, stacking context, motion-пресеты, reduced-motion | Task 2, Step 3 |
| Горизонтальный клэмп панели | Task 2, Step 3, `panelStyle`; проверка руками — Task 3, Step 4, пункт 8 |
| Доступность: полные `aria-label`, `aria-pressed`, `aria-current`, live-регион | Task 2, Step 3 |
| `data-iso` для тестов | Task 2, Step 3; используется хелпером `day()` в тесте |
| `Clear` в футере | Task 2, Step 3 + тест `clears the value` |
| Взаимные границы `From`/`To` и запрет будущего | Task 3, Step 1 |
| Соглашения двух раннеров | Global Constraints; Task 1 (относительный `./calendar.ts`), Task 2 (явные импорты vitest + `afterEach(cleanup)`) |
| Скипнутое (range, пресеты, ввод текстом, вертикальный флип, воскресная неделя, время дня) | Задач нет намеренно |
