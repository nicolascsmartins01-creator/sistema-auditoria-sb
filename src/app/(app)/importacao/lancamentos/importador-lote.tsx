"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import { Aviso, Botao, classesInput, Etiqueta } from "@/components/ui";
import { formatarData, formatarMoeda } from "@/lib/formato";
import { CAMPOS_LANC, descreverValor, type CampoLanc, type MapaLanc } from "@/lib/importacao-lancamentos/validar";
import type { ColunaPlanilha } from "@/lib/importacao-lojas/mapeamento";
import { processarLote, type EstadoLote } from "./actions";

const INICIAL: EstadoLote = { etapa: "inicio", versao: 0 };

export function ImportadorLote() {
  const [estado, acao] = useActionState(processarLote, INICIAL);
  const [pendente, iniciar] = useTransition();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [mapa, setMapa] = useState<MapaLanc | null>(null);
  const [colunas, setColunas] = useState<ColunaPlanilha[]>([]);
  const [tela, setTela] = useState<"arquivo" | "colunas" | "previa">("arquivo");
  const [soErros, setSoErros] = useState(false);

  useEffect(() => {
    if (estado.etapa === "colunas" && estado.sugestao && estado.colunas) { setColunas(estado.colunas); setMapa(estado.sugestao); setTela("colunas"); }
    else if (estado.etapa === "previa") setTela("previa");
    else if (estado.etapa === "inicio") setTela("arquivo");
  }, [estado.versao]); // eslint-disable-line react-hooks/exhaustive-deps

  function enviar(passo: "ler" | "previa" | "confirmar") {
    if (!arquivo) return;
    const fd = new FormData();
    fd.set("passo", passo); fd.set("arquivo", arquivo);
    if (mapa) fd.set("mapa", JSON.stringify(mapa));
    iniciar(() => acao(fd));
  }

  if (estado.etapa === "concluida" && estado.resumo) {
    const r = estado.resumo;
    return (
      <div className="space-y-4">
        <Aviso tipo="sucesso">
          <p className="font-semibold">{r.linhas} lançamento(s) importado(s) de {estado.arquivo} · total {formatarMoeda(r.total)}.</p>
          <p>Por mês: {Object.entries(r.meses).map(([m, n]) => `${m.slice(5)}/${m.slice(0, 4)}: ${n}`).join(" · ")}. A planilha foi arquivada como comprovante.</p>
        </Aviso>
        <div className="flex gap-4"><Link href="/lancamentos" className="text-azul underline">Ver lançamentos</Link><a href="/importacao/lancamentos" className="text-azul underline">Nova importação</a></div>
      </div>
    );
  }

  const r = estado.resultado;
  const linhas = r ? r.linhas.filter((l) => !soErros || l.erros.length) : [];
  const faltando = CAMPOS_LANC.filter((c) => c.obrigatorio && mapa?.colunas[c.chave] === undefined);

  return (
    <div className="space-y-5">
      <input type="file" aria-label="Planilha de lançamentos" accept=".xlsx,.csv" className={`${classesInput} py-2`}
        onChange={(e) => { setArquivo(e.target.files?.[0] ?? null); setTela("arquivo"); setMapa(null); }} />
      {tela === "arquivo" && <Botao type="button" disabled={!arquivo || pendente} onClick={() => enviar("ler")}>{pendente ? "Lendo…" : "Ler colunas da planilha"}</Botao>}
      {estado.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}

      {tela === "colunas" && mapa && (
        <div className="space-y-3">
          <Aviso tipo="info">Escolha a coluna da planilha para cada campo.{estado.totalLinhas !== undefined && <> A planilha tem <strong>{estado.totalLinhas}</strong> linha(s).</>}</Aviso>
          {CAMPOS_LANC.map((c) => {
            const v = mapa.colunas[c.chave];
            const col = colunas.find((x) => x.indice === v);
            return (
              <div key={c.chave} className="grid gap-2 sm:grid-cols-[12rem_1fr] sm:items-center">
                <label htmlFor={`lote-${c.chave}`} className="text-sm font-medium">{c.titulo}{c.obrigatorio && <span className="text-red-700"> *</span>}</label>
                <div>
                  <select id={`lote-${c.chave}`} value={v ?? ""} className={classesInput}
                    onChange={(e) => {
                      const novo = { ...mapa.colunas };
                      if (e.target.value === "") delete novo[c.chave as CampoLanc]; else novo[c.chave as CampoLanc] = Number(e.target.value);
                      setMapa({ ...mapa, colunas: novo });
                    }}>
                    <option value="">{c.obrigatorio ? "— escolha a coluna —" : "— não usar (auditor = quem importa) —"}</option>
                    {colunas.map((x) => <option key={x.indice} value={x.indice}>Coluna {x.letra} – {x.titulo}</option>)}
                  </select>
                  {col && col.exemplos.length > 0 && <p className="text-xs text-gray-500">Exemplos: {col.exemplos.join(" · ")}</p>}
                </div>
              </div>
            );
          })}
          <Botao type="button" disabled={faltando.length > 0 || pendente} onClick={() => enviar("previa")}>{pendente ? "Analisando…" : "Analisar"}</Botao>
        </div>
      )}

      {tela === "previa" && r && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Prévia: {estado.arquivo}</h3>
          {r.errosGerais.map((e) => <Aviso key={e} tipo="erro">{e}</Aviso>)}
          <p className="text-sm text-gray-700">
            {r.totais.linhas} linha(s) · <strong className={r.totais.comErro ? "text-red-700" : "text-green-700"}>{r.totais.comErro} com erro</strong> · total válido {descreverValor(r.totais.valorCentavos)}
            {Object.keys(r.totais.porMes).length > 0 && ` · por mês: ${Object.entries(r.totais.porMes).map(([m, n]) => `${m.slice(5)}/${m.slice(0, 4)}: ${n}`).join(", ")}`}
          </p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={soErros} onChange={(e) => setSoErros(e.target.checked)} className="h-4 w-4" /> Mostrar só linhas com erro</label>
          <div className="max-h-[28rem] overflow-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 text-left text-gray-600"><tr><th className="px-3 py-2">Linha</th><th>LUC / loja</th><th>Data</th><th className="text-right">Valor</th><th className="px-3">Auditor</th><th>Situação</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {linhas.map((l) => (
                  <tr key={l.linha} className="align-top">
                    <td className="px-3 py-1.5 text-gray-500">{l.linha}</td>
                    <td>{l.luc}<span className="block text-xs text-gray-500">{l.loja}</span></td>
                    <td>{l.data ? formatarData(l.data) : "—"}</td>
                    <td className="text-right tabular-nums">{descreverValor(l.valorCentavos)}</td>
                    <td className="px-3">{l.auditor ?? <span className="text-gray-400">(você)</span>}</td>
                    <td>{l.erros.length ? <span className="text-red-700">{l.erros.join(" ")}</span> : <Etiqueta cor="verde">ok</Etiqueta>}
                      {l.avisos.map((a) => <span key={a} className="block text-xs text-amber-800">{a}</span>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {r.podeImportar ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-green-300 bg-green-50 p-3">
              <p className="flex-1 text-sm text-green-900">Serão gravados {r.totais.linhas} lançamento(s) com origem “planilha”. A planilha fica arquivada como comprovante.</p>
              <Botao type="button" disabled={pendente} onClick={() => enviar("confirmar")}>{pendente ? "Gravando…" : "Confirmar importação"}</Botao>
            </div>
          ) : <Aviso tipo="erro">Corrija os erros na planilha e analise de novo. Nenhuma linha é gravada enquanto houver erro.</Aviso>}
          <Botao variante="secundario" type="button" onClick={() => setTela("colunas")}>← Voltar e alterar colunas</Botao>
        </div>
      )}
    </div>
  );
}
