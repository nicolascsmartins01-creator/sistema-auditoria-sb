"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatarMoeda, formatarPercentual, semAcento } from "@/lib/formato";
import { classesInput, Etiqueta } from "@/components/ui";

export interface LinhaLoja {
  id: string;
  luc: string;
  nome_fantasia: string;
  piso?: string | null;
  localizacao: string | null;
  segmento: string | null;
  auditada: boolean;
  ativa: boolean;
  percentual: number | null;
  minimo: number | null;
  tem13: boolean;
  aDefinir: boolean;
}

export function ListaLojas({ lojas, segmentos, mostrarValores, anoAtual, filtrosIniciais }: {
  lojas: LinhaLoja[];
  segmentos: string[];
  mostrarValores: boolean;
  anoAtual: number;
  filtrosIniciais: { situacao?: string; auditada?: string; pendencia?: string };
}) {
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState(filtrosIniciais.situacao ?? "ativas");
  const [auditada, setAuditada] = useState(filtrosIniciais.auditada ?? "todas");
  const [segmento, setSegmento] = useState("");
  const [pendencia, setPendencia] = useState(filtrosIniciais.pendencia ?? "");

  const filtradas = useMemo(() => {
    const termo = semAcento(busca.trim());
    return lojas
      .filter((l) => situacao === "todas" || (situacao === "ativas" ? l.ativa : !l.ativa))
      .filter((l) => auditada === "todas" || (auditada === "sim" ? l.auditada : !l.auditada))
      .filter((l) => !segmento || l.segmento === segmento)
      .filter((l) =>
        !pendencia ||
        (pendencia === "percentual" && l.percentual === null) ||
        (pendencia === "minimo" && l.minimo === null) ||
        (pendencia === "13" && !l.tem13) ||
        (pendencia === "a-definir" && l.aDefinir))
      .filter((l) => !termo || semAcento(`${l.nome_fantasia} ${l.luc} ${l.localizacao ?? ""}`).includes(termo))
      .sort((a, b) => a.nome_fantasia.localeCompare(b.nome_fantasia, "pt-BR"));
  }, [lojas, busca, situacao, auditada, segmento, pendencia]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
        <input type="search" placeholder="Buscar por nome, LUC ou localização" value={busca}
          onChange={(e) => setBusca(e.target.value)} className={`${classesInput} lg:col-span-2`} aria-label="Buscar loja" />
        <select value={situacao} onChange={(e) => setSituacao(e.target.value)} className={classesInput} aria-label="Situação">
          <option value="ativas">Ativas</option>
          <option value="inativas">Inativas</option>
          <option value="todas">Ativas e inativas</option>
        </select>
        <select value={auditada} onChange={(e) => setAuditada(e.target.value)} className={classesInput} aria-label="Auditada">
          <option value="todas">Auditadas e não auditadas</option>
          <option value="sim">Somente auditadas</option>
          <option value="nao">Somente não auditadas</option>
        </select>
        <select value={segmento} onChange={(e) => setSegmento(e.target.value)} className={classesInput} aria-label="Segmento">
          <option value="">Todos os segmentos</option>
          {segmentos.map((s) => <option key={s}>{s}</option>)}
        </select>
        {mostrarValores && (
          <select value={pendencia} onChange={(e) => setPendencia(e.target.value)} className={`${classesInput} lg:col-span-2`} aria-label="Pendência">
            <option value="">Sem filtro de pendência</option>
            <option value="percentual">Sem percentual vigente</option>
            <option value="minimo">Sem aluguel mínimo vigente</option>
            <option value="13">Sem 13º aluguel de {anoAtual}</option>
            <option value="a-definir">Com vigência a definir</option>
          </select>
        )}
      </div>

      <p className="text-sm text-gray-600">{filtradas.length} loja(s)</p>

      <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {filtradas.map((l) => (
          <li key={l.id}>
            <Link href={`/lojas/${l.id}`} className="flex flex-col gap-1 px-4 py-3 hover:bg-azul-claro sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900">
                  {l.nome_fantasia}{" "}
                  {!l.ativa && <Etiqueta cor="vermelho">Inativa</Etiqueta>}{" "}
                  {!l.auditada && <Etiqueta cor="cinza">Não auditada</Etiqueta>}{" "}
                  {mostrarValores && l.aDefinir && <Etiqueta cor="amarelo">vigência a definir</Etiqueta>}
                </p>
                <p className="text-sm text-gray-500">
                  {l.luc}{l.piso ? ` · Piso ${l.piso}` : ""}{l.localizacao ? ` · ${l.localizacao}` : ""}{l.segmento ? ` · ${l.segmento}` : ""}
                </p>
              </div>
              {mostrarValores && (
                <div className="flex gap-4 text-sm sm:w-72 sm:justify-end">
                  <span className={l.percentual === null ? "text-amber-700" : "text-gray-700"}>
                    {l.percentual === null ? "sem %" : formatarPercentual(l.percentual)}
                  </span>
                  <span className={l.minimo === null ? "text-amber-700" : "text-gray-700"}>
                    {l.minimo === null ? "sem mínimo" : formatarMoeda(l.minimo)}
                  </span>
                </div>
              )}
            </Link>
          </li>
        ))}
        {filtradas.length === 0 && <li className="px-4 py-6 text-center text-gray-500">Nenhuma loja encontrada.</li>}
      </ul>
    </div>
  );
}
