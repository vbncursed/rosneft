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
