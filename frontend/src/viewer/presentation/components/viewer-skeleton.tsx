export default function ViewerSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-neutral-900 text-neutral-100">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-black/40 p-6 backdrop-blur">
        <p className="text-sm uppercase tracking-[0.2em] text-neutral-400">3D Viewer</p>
        <p className="mt-2 text-lg font-semibold">Loading interface...</p>
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-white/70" />
        </div>
      </div>
    </div>
  );
}
