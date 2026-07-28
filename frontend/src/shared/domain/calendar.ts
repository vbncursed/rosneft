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
