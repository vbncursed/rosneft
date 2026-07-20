"use client";

import { useEffect } from "react";

/**
 * Регистрирует service worker после гидратации. Ничего не рендерит.
 * Регистрация молча не происходит без HTTPS, в приватном режиме и в старых
 * браузерах — приложение тогда работает как обычный сайт, установка просто
 * недоступна.
 */
export default function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Молча: работоспособность приложения от этого не зависит.
    });
  }, []);
  return null;
}
