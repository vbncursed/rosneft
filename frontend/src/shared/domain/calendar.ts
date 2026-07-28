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

const HUMAN = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

// parseDateInput читает то, что человек набирает руками: 29/07/2026, 29.07.2026
// или ISO — последний потому, что дату часто копируют из журнала или тикета.
// Возвращает "" на всё, что прочитать не удалось, включая пустую строку: для
// поля в процессе набора «ещё не дата» и «ошибка» — одно и то же состояние, и
// исключение здесь только мешало бы.
export function parseDateInput(text: string): string {
  const t = text.trim();
  const human = HUMAN.exec(t);
  const iso = human ? `${human[3]}-${pad(+human[2])}-${pad(+human[1])}` : t;
  if (!ISO.test(iso)) return "";
  // Обратная сверка отсекает несуществующие дни: new Date(2026, 1, 31) молча
  // становится 3 марта, и фильтр уехал бы на дату, которую никто не набирал.
  return toISO(toDate(iso)) === iso ? iso : "";
}

// formatDateInput — обратная сторона parseDateInput: показанное в поле должно
// набираться обратно, иначе правка поверх текста ломается.
export function formatDateInput(iso: string): string {
  if (!ISO.test(iso)) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// formatTimestamp — момент события в журнале, в локальной зоне читателя.
// Формат фиксированный, а не локальный: toLocaleString() давал бы то
// 7/28/2026 10:13:20 PM, то 28.07.2026, 22:13:20 в зависимости от браузера, и
// dd/mm против mm/dd в журнале аудита — это не косметика, а разные даты.
// 24 часа по той же причине: AM/PM здесь нечего добавить.
export function formatTimestamp(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at;
  const date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  return `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
