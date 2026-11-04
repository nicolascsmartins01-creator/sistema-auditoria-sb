"use client";

import { useEffect, useState } from "react";
import { useFila } from "@/lib/offline/use-fila";
import { processarFila, removerDaFila } from "@/lib/offline/fila";
import { formatarData, formatarMoeda } from "@/lib/formato";

/** Faixa fixa no topo: sem internet, lançamentos aguardando envio e recusados. */
export function FaixaSincronizacao() {
  const { online, pendentes, recusados } = useFila();
  const [enviados, setEnviados] = useState(0);

  useEffect(() => {
    const aoEnviar = (e: Event) => {
      setEnviados((e as CustomEvent<number>).detail);
      setTimeout(() => setEnviados(0), 6000);
    };
    window.addEventListener("lancamentos-enviados", aoEnviar);
    return () => window.removeEventListener("lancamentos-enviados", aoEnviar);
  }, []);

  if (online && !pendentes.length && !recusados.length && !enviados) return null;
  return (
    <div className="space-y-1">
      {!online && <div className="bg-gray-800 px-4 py-2 text-center text-sm text-white">Sem internet. Você pode continuar lançando: tudo fica guardado no aparelho.</div>}
      {pendentes.length > 0 && (
        <div className="flex items-center justify-center gap-3 bg-amber-100 px-4 py-2 text-sm text-amber-900">
          <span>⏳ {pendentes.length} lançamento(s) aguardando envio.</span>
          {online && <button onClick={() => processarFila()} className="font-semibold underline">Enviar agora</button>}
        </div>
      )}
      {enviados > 0 && <div className="bg-green-100 px-4 py-2 text-center text-sm text-green-900">✓ {enviados} lançamento(s) guardado(s) no aparelho foram enviados.</div>}
      {recusados.map((r) => (
        <div key={r.cliente_id} className="flex flex-wrap items-center justify-center gap-2 bg-red-100 px-4 py-2 text-sm text-red-900">
          <span>Não foi aceito: {r.loja_nome} — {formatarData(r.data_venda)} — {formatarMoeda(r.valor)}. Motivo: {r.erro?.replace(/^.*?ERROR:\s*/, "")}</span>
          <button onClick={() => { if (confirm("Descartar este lançamento guardado no aparelho?")) removerDaFila(r.cliente_id); }} className="font-semibold underline">Descartar</button>
        </div>
      ))}
    </div>
  );
}
