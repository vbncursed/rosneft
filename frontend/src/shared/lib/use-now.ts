import { useEffect, useState } from "react";

/**
 * The current time, read once per render pass and refreshed every `everyMs`
 * (default 30 s), so every row of a list is measured against one instant and
 * a screen left open still crosses midnight. Not a call to `new Date()` in
 * render, which is impure.
 */
export function useNow(everyMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}
