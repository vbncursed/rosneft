import { memo } from "react";

interface ResetCameraButtonProps {
  onReset: () => void;
}

function ResetCameraButtonImpl({ onReset }: ResetCameraButtonProps) {
  return (
    <button
      type="button"
      onClick={onReset}
      className="rounded-lg border border-white/25 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
    >
      Reset camera
    </button>
  );
}

export default memo(ResetCameraButtonImpl);
