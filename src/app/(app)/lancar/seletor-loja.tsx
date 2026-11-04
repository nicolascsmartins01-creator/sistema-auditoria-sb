"use client";

import { useMemo, useState } from "react";
import { semAcento } from "@/lib/formato";
import type { LojaLanc } from "./app-lancamento";

/** Passo 1: busca que filtra enquanto digita + lista em ordem alfabética. */
export function SeletorLoja({ lojas, ultimaId, onEscolher }: { lojas: LojaLanc[]; ultimaId: string | null; onEscolher: (id: string) => void }) {
  const [busca, setBusca] = useState("");
  const ultima = lojas.find((l) => l.id === ultimaId);
  const filtradas = useMemo(() => {
    const t = semAcento(busca.trim());
    return lojas
      .filter((l) => !t || semAcento(`${l.nome} ${l.luc} ${l.localizacao ?? ""}`).includes(t))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [lojas, busca]);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-bold">Lançar venda</h1>
      {ultima && !busca && (
        <button onClick={() => onEscolher(ultima.id)}
          className="flex w-full items-center justify-between rounded-xl bg-azul px-4 py-4 text-left text-white shadow">
          <span>
            <span className="block text-xs uppercase tracking-wide opacity-80">Continuar na última loja</span>
            <span className="block text-lg font-semibold">{ultima.nome}</span>
            <span className="block text-sm opacity-80">{ultima.luc}{ultima.localizacao ? ` · ${ultima.localizacao}` : ""}</span>
          </span>
          <span className="text-2xl">›</span>
        </button>
      )}
      <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} autoComplete="off"
        placeholder="Buscar loja (nome, LUC ou local)" aria-label="Buscar loja"
        className="block min-h-14 w-full rounded-xl border border-gray-300 bg-white px-4 text-lg shadow-sm focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/30" />
      <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {filtradas.map((l) => (
          <li key={l.id}>
            <button onClick={() => onEscolher(l.id)} className="flex min-h-16 w-full items-center justify-between px-4 py-3 text-left active:bg-azul-claro">
              <span>
                <span className="block text-lg font-medium text-gray-900">{l.nome}</span>
                <span className="block text-sm text-gray-500">{l.luc}{l.localizacao ? ` · ${l.localizacao}` : ""}</span>
              </span>
              <span className="text-2xl text-gray-300">›</span>
            </button>
          </li>
        ))}
        {!filtradas.length && <li className="px-4 py-6 text-center text-gray-500">Nenhuma loja encontrada.</li>}
      </ul>
    </div>
  );
}
