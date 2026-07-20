"use client";

import { useEffect, useState } from "react";
import type { Range } from "@/metrics/domain/panel";
import type { Series } from "@/metrics/domain/series";

const POLL_MS = 30_000;

/**
 * Тянет одну панель и перезапрашивает раз в 30 секунд. Поллинг замирает,
 * когда вкладка скрыта: страница висит открытой часами, и незачем долбить
 * Prometheus, пока на неё никто не смотрит.
 */
export function usePanelSeries(panelId: string, range: Range) {
  const [series, setSeries] = useState<Series[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();

    async function load() {
      try {
        const res = await fetch(
          `/api/metrics/query?panel=${encodeURIComponent(panelId)}&range=${range}`,
          { signal: ac.signal, cache: "no-store" },
        );
        if (!res.ok) throw new Error(String(res.status));
        setSeries(await res.json());
        setError(false);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError(true);
      } finally {
        setLoading(false);
      }
    }

    function tick() {
      if (document.visibilityState === "visible") void load();
    }

    // Вкладку вернули — не ждём остатка интервала, обновляем сразу.
    function onVisible() {
      if (document.visibilityState === "visible") void load();
    }

    void load();
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      ac.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [panelId, range]);

  return { series, error, loading };
}
