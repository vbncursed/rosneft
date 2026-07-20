// Знак приложения: каркас многогранника, пять вершин цветом рельефа и верхняя
// вершина цветом отметки — так же, как выделенное размещение в редакторе.
//
// Цвета жёсткие: браузер рендерит иконку вне CSS-контекста страницы, поэтому
// currentColor и prefers-color-scheme здесь не работают. Светлые версии
// читаются и на светлой, и на тёмной панели вкладок.
const RELIEF = "#2FD79A";
const MARKER = "#FF7A45";

export const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <g fill="none" stroke="${RELIEF}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">
    <path d="M32 8 11 20v24l21 12 21-12V20Z"/>
    <path d="M32 8v24M32 32 11 44M32 32l21 12" stroke-width="3" opacity=".5"/>
  </g>
  <g fill="${RELIEF}">
    <circle cx="11" cy="20" r="4.5"/><circle cx="53" cy="20" r="4.5"/>
    <circle cx="11" cy="44" r="4.5"/><circle cx="53" cy="44" r="4.5"/>
    <circle cx="32" cy="56" r="4.5"/>
  </g>
  <circle cx="32" cy="8" r="6" fill="${MARKER}"/>
</svg>`;

/** Фон плитки на iPadOS: альфа там не поддерживается, нужен непрозрачный цвет. */
export const MARK_BACKDROP = "#0E1211";

export function markDataUri(): string {
  return `data:image/svg+xml;base64,${Buffer.from(MARK_SVG).toString("base64")}`;
}
