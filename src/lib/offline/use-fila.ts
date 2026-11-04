"use client";

import { useCallback, useEffect, useState } from "react";
import { EVENTO_FILA, listarFila, processarFila, type ItemFila } from "./fila";

/** Estado da fila no aparelho; tenta enviar ao abrir, ao voltar a internet e a cada 30 s. */
export function useFila() {
  const [itens, setItens] = useState<ItemFila[]>([]);
  const [online, setOnline] = useState(true);

  const recarregar = useCallback(() => { listarFila().then(setItens).catch(() => setItens([])); }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    recarregar();
    processarFila();
    const aoMudar = () => recarregar();
    const aoVoltar = () => { setOnline(true); processarFila(); };
    const aoCair = () => setOnline(false);
    window.addEventListener(EVENTO_FILA, aoMudar);
    window.addEventListener("online", aoVoltar);
    window.addEventListener("offline", aoCair);
    const t = setInterval(() => processarFila(), 30000);
    return () => {
      window.removeEventListener(EVENTO_FILA, aoMudar);
      window.removeEventListener("online", aoVoltar);
      window.removeEventListener("offline", aoCair);
      clearInterval(t);
    };
  }, [recarregar]);

  return { itens, online, pendentes: itens.filter((i) => !i.erro), recusados: itens.filter((i) => i.erro) };
}
