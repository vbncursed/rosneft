import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Andrey 3D Viewer",
    short_name: "Andrey",
    description: "Интерактивный просмотр территорий и моделей",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    // Браузер предпочитает <meta name="theme-color"> из layout.tsx, где цвет
    // разделён на светлую и тёмную тему. Здесь значение запасное: манифест
    // такого разделения не поддерживает.
    theme_color: "#0a0a0a",
    icons: [
      // ponytail: purpose "any". Maskable-вариант нужен собственный отступ под
      // safe-zone — добавить, когда заказчик утвердит финальный знак.
      { src: "/icon", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
  };
}
