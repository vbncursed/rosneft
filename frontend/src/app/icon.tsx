import { MARK_SVG } from "@/shared/presentation/app-mark";

export const contentType = "image/svg+xml";

// Вкладка рисует favicon в 16 px на обычном экране. Растр 512→16 схлопывает
// тонкие рёбра каркаса в мутное кольцо, поэтому здесь отдаётся вектор: контуры
// остаются резкими на любом размере, а один и тот же знак идёт и во вкладку,
// и в манифест.
export default function Icon() {
  return new Response(MARK_SVG, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
