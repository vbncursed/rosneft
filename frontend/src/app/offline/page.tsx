"use client";

export default function OfflinePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-xl font-medium">No connection</h1>
      <p className="max-w-sm text-sm opacity-70">
        This app needs a connection — territories and models load from the server.
        Check your network and try again.
      </p>
      <button
        type="button"
        onClick={() => location.reload()}
        className="rounded border border-current px-4 py-2 text-sm"
      >
        Retry
      </button>
    </main>
  );
}
