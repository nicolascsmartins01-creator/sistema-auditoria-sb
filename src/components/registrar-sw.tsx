"use client";

import { useEffect } from "react";

/** Registra o service worker (app instalável no celular e funcionamento sem internet). */
export function RegistrarServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => { /* sem suporte: segue sem */ });
    }
  }, []);
  return null;
}
