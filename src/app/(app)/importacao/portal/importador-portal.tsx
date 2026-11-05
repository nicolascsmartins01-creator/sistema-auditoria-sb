"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Aviso, Botao, classesInput, Etiqueta } from "@/components/ui";
import { formatarData, formatarMoeda } from "@/lib/formato";
import { processarPortal, type EstadoPortal } from "./actions";
import type { SituacaoLinha } from "@/lib/portal/validar";

const INICIAL: EstadoPortal = { etapa: "inicio", versao: 0 };
const ROTULO: Record<SituacaoLinha, { t: string; cor: "verde" | "amarelo" | "vermelho" }> = {
  ok: { t: "Cadastrada", cor: "verde" },
  inativa: { t: "Loja inativa", cor: "amarelo" },
  sem_cadastro: { t: "LUC não cadastrada", cor: "vermelho" },
};

export function ImportadorPortal() {
  const [estado, acao] = useActionState(processarPortal, INICIAL);
  const [pendente, iniciar] = useTransition();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [substituir, setSubstituir] = useState(false);
  const [filtro, setFiltro] = useState<SituacaoLinha | "todas">("todas");

  function enviar(passo: "previa" | "confirmar") {
    if (!arquivo) return;
    const fd = new FormData();
    fd.set("passo", passo);
    fd.set("arquivo", arquivo);
    if (substituir) fd.set("substituir", "sim");
    iniciar(() => acao(fd));
  }

  if (estado.etapa === "concluida" && estado.resumo) {
    const r = estado.resumo;
    return (
      <div className="space-y-4">
        <Aviso tipo="sucesso">
          <p className="font-semibold">Venda informada de {r.competencia.slice(5, 7)}/{r.competencia.slice(0, 4)} importada{r.substituiu ? " (substituindo a anterior)" : ""}.</p>
          <p>{r.linhas} loja(s) · total {formatarMoeda(r.total)}{r.sem_loja ? ` · ${r.sem_loja} LUC(s) sem cadastro guardada(s)` : ""}.</p>
          <p className="mt-1">O PDF original foi arquivado e a importação está no histórico.</p>
        </Aviso>
        <div className="flex gap-4">
          <Link href={`/vendas-informadas?mes=${r.competencia.slice(0, 7)}`} className="text-azul underline">Ver venda informada do mês</Link>
          <a href="/importacao/portal" className="text-azul underline">Importar outro PDF</a>
        </div>
      </div>
    );
  }

  const p = estado.previa;
  const linhas = p ? p.linhas.filter((l) => filtro === "todas" || l.situacao === filtro) : [];

  return (
    <div className="space-y-4">
      <input type="file" accept="application/pdf,.pdf" aria-label="PDF do portal" className={`${classesInput} py-2`}
        onChange={(e) => { setArquivo(e.target.files?.[0] ?? null); setSubstituir(false); }} />
      <Botao type="button" disabled={!arquivo || pendente} onClick={() => enviar("previa")}>
        {pendente && !p ? "Lendo o PDF…" : "Ler e conferir o PDF"}
      </Botao>
      {estado.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}

      {p && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Prévia: {estado.arquivo}</h3>
          <dl className="grid gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm sm:grid-cols-4">
            <div><dt className="text-gray-500">Mês (cabeçalho)</dt><dd className="text-lg font-semibold">{p.rotulo}</dd></div>
            <div><dt className="text-gray-500">Período</dt><dd>{formatarData(p.inicio)} a {formatarData(p.fim)}</dd></div>
            <div><dt className="text-gray-500">Soma das {p.linhas.length} linhas</dt><dd className="font-semibold">{formatarMoeda(p.somaCentavos / 100)}</dd></div>
            <div><dt className="text-gray-500">Linha TOTAL do PDF</dt>
              <dd className="font-semibold">{formatarMoeda(p.totalCentavos / 100)}{" "}
                {p.somaCentavos === p.totalCentavos ? <Etiqueta cor="verde">confere</Etiqueta> : <Etiqueta cor="vermelho">não confere</Etiqueta>}</dd></div>
          </dl>
          {p.erros.map((e, i) => <Aviso key={"e" + i} tipo="erro">{e}</Aviso>)}
          {p.avisos.map((a, i) => <Aviso key={"a" + i} tipo="alerta">{a}</Aviso>)}

          <div className="flex flex-wrap gap-2 text-sm">
            {(["todas", "ok", "sem_cadastro", "inativa"] as const).map((s) => (
              <button key={s} type="button" onClick={() => setFiltro(s)}
                className={`rounded-full border px-3 py-1.5 ${filtro === s ? "border-azul bg-azul text-white" : "bg-white"}`}>
                {s === "todas" ? `Todas (${p.linhas.length})` : `${ROTULO[s].t} (${p.linhas.filter((l) => l.situacao === s).length})`}
              </button>
            ))}
          </div>
          <div className="max-h-[28rem] overflow-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 text-left text-gray-600">
                <tr><th className="px-3 py-2">Nº LUC</th><th className="px-3 py-2">Nome no PDF</th><th className="px-3 py-2 text-right">Valor</th><th className="px-3 py-2">Cadastro</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {linhas.map((l) => (
                  <tr key={l.luc}>
                    <td className="px-3 py-1.5 font-medium">{l.luc}</td>
                    <td className="px-3 py-1.5">{l.nome}{l.loja && l.loja.nome.toUpperCase() !== l.nome.toUpperCase() && <span className="block text-xs text-gray-500">no cadastro: {l.loja.nome}</span>}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatarMoeda(l.centavos / 100)}</td>
                    <td className="px-3 py-1.5"><Etiqueta cor={ROTULO[l.situacao].cor}>{ROTULO[l.situacao].t}</Etiqueta></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {p.podeImportar ? (
            <div className="space-y-3 rounded-lg border border-green-300 bg-green-50 p-4">
              {p.existente && (
                <label className="flex items-start gap-2 text-sm text-amber-900">
                  <input type="checkbox" className="mt-0.5 h-5 w-5" checked={substituir} onChange={(e) => setSubstituir(e.target.checked)} />
                  <span>Confirmo a <strong>substituição</strong> da venda informada de {p.rotulo} já importada
                    (total anterior {formatarMoeda(p.existente.totalCentavos / 100)} → novo {formatarMoeda(p.totalCentavos / 100)}).</span>
                </label>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <p className="flex-1 text-sm text-green-900">Serão gravadas {p.linhas.length} linha(s) de {p.rotulo}, total {formatarMoeda(p.totalCentavos / 100)}.</p>
                <Botao type="button" disabled={pendente || (!!p.existente && !substituir)} onClick={() => enviar("confirmar")}>
                  {pendente ? "Gravando…" : "Confirmar importação"}
                </Botao>
              </div>
            </div>
          ) : (
            <Aviso tipo="erro">O PDF não pode ser importado enquanto houver erros. Nada foi gravado.</Aviso>
          )}
        </div>
      )}
    </div>
  );
}
