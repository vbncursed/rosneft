import { ImageResponse } from "next/og";
import { markDataUri, MARK_BACKDROP } from "@/shared/presentation/app-mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Отличия от icon.tsx: непрозрачный фон и поля — iOS не даёт альфы и сам
// скругляет углы, знак вплотную к краю обрежется.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          background: MARK_BACKDROP,
        }}
      >
        <img src={markDataUri()} alt="" width={132} height={132} />
      </div>
    ),
    size,
  );
}
