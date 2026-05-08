"use client";

import type { UploadStatus } from "@/upload/application/use-chunked-upload";

interface ProgressBarProps {
  status: UploadStatus;
  progress: number;
}

const LABELS: Record<UploadStatus, string> = {
  idle: "",
  initiating: "Initializing…",
  uploading: "Uploading chunks",
  finalizing: "Finalizing…",
  succeeded: "Done",
  failed: "Error",
  cancelled: "Cancelled",
};

export default function ProgressBar({ status, progress }: ProgressBarProps) {
  if (status === "idle") return null;
  const label =
    status === "uploading" ? `${(progress * 100).toFixed(0)}%` : LABELS[status];
  return (
    <div className="space-y-1">
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full bg-cyan-300 transition-[width] duration-200"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <p className="text-xs text-neutral-400">{label}</p>
    </div>
  );
}
