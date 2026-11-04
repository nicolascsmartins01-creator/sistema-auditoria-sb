"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import { Aviso, Botao, classesInput, Etiqueta } from "@/components/ui";
import { processarImportacao, type EstadoImportacao } from "./actions";
import type { ResultadoLinha, Situacao } from "@/lib/importacao-lojas/validar";
import { avisosMapeamento, TITULO_CAMPO, validarMapeamento, type ColunaPlanilha, type Mapeamento } from "@/lib/importacao-lojas/mapeamento";
import type { ChaveColuna } from "@/lib/importacao-lojas/colunas";
import { MESES } from "@/lib/formato";

const INICIAL: EstadoImportacao = { etapa: "inicio", versao: 0 };
const NOMES: Record<Situacao, string> = { nova: "Nova", atualizacao: "Atualização", sem_alteracao: "Sem alteração", erro: "Erro" };
const CORES = { nova: "verde", atualizacao: "azul", sem_alteracao: "cinza", erro: "vermelho" } as const;

type Tela = "arquivo" | "mapeamento" | "previa";

export function Importador() {
  const [estado, acao] = useActionState(processarImportacao, INICIAL);
  const [pendente, iniciar] = useTransition();
  // O arquivo e a escolha de colunas ficam guardados na tela; o servidor relê
  // e revalida o arquivo a cada passo.
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [mapa, setMapa] = useState<Mapeamento | null>(null);
  const [colunas, setColunas] = useState<ColunaPlanilha[]>([]);
  const [tela, setTela] = useState<Tela>("arquivo");
  const [filtro, setFiltro] = useState<Situacao | "todas">("todas");

  useEffect(() => {
    if (estado.etapa === "mapeamento" && estado.sugestao && estado.colunas) {
      setColunas(estado.colunas);
      setMapa(estado.sugestao);
      setTela("mapeamento");
    } else if (estado.etapa === "previa") {
      setFiltro("todas");
      setTela("previa");
    } else if (estado.etapa === "inicio") {
      setTela("arquivo");
    }
  }, [estado.versao]); // eslint-disable-line react-hooks/exhaustive-deps

  function enviar(passo: "ler" | "previa" | "confirmar") {
    if (!arquivo) return;
    const fd = new FormData();
    fd.set("passo", passo);
    fd.set("arquivo", arquivo);
    if (mapa) fd.set("mapeamento", JSON.stringify(mapa));
    iniciar(() => acao(fd));
  }

  if (estado.etapa === "concluida" && estado.resumo) {
    const s = estado.resumo;
    return (
      <div className="space-y-4">
        <Aviso tipo="sucesso">
          <p className="font-semibold">Importação concluída ({estado.arquivo}).</p>
          <p>{s.lojas_criadas} loja(s) criada(s) · {s.lojas_atualizadas} atualizada(s) · {s.vigencias_gravadas} vigência(s) gravada(s) · {s.alugueis_13_gravados} 13º aluguel(is).</p>
          <p className="mt-1">O arquivo original foi arquivado e todas as alterações estão no histórico.</p>
        </Aviso>
        <div className="flex gap-4">
          <Link href="/lojas" className="text-azul underline">Ver lojas</Link>
          <a href="/importacao/lojas" className="text-azul underline">Nova importação</a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Passos atual={tela} />

      {/* 1. arquivo */}
      <div className="space-y-3">
        <input type="file" name="arquivo" aria-label="Arquivo da planilha"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          className={`${classesInput} py-2`}
          onChange={(e) => { setArquivo(e.target.files?.[0] ?? null); setTela("arquivo"); setMapa(null); }} />
        {tela === "arquivo" && (
          <Botao type="button" disabled={!arquivo || pendente} onClick={() => enviar("ler")}>
            {pendente ? "Lendo…" : "Ler colunas da planilha"}
          </Botao>
        )}
      </div>

      {estado.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}

      {/* 2. escolha de colunas */}
      {tela === "mapeamento" && mapa && (
        <EditorMapeamento colunas={colunas} mapa={mapa} setMapa={setMapa} totalLinhas={estado.totalLinhas}
          pendente={pendente} onAnalisar={() => enviar("previa")} />
      )}

      {/* 3. prévia */}
      {tela === "previa" && estado.resultado && (
        <Previa resultado={estado.resultado} arquivo={estado.arquivo!} filtro={filtro} setFiltro={setFiltro}
          pendente={pendente} onVoltar={() => setTela("mapeamento")} onConfirmar={() => enviar("confirmar")} />
      )}
    </div>
  );
}

function Passos({ atual }: { atual: Tela }) {
  const passos: [Tela, string][] = [["arquivo", "Arquivo"], ["mapeamento", "Colunas"], ["previa", "Prévia e confirmação"]];
  const idx = passos.findIndex(([t]) => t === atual);
  return (
    <ol className="flex flex-wrap gap-2 text-sm">
      {passos.map(([t, nome], i) => (
        <li key={t} className={`rounded-full px-3 py-1 ${i === idx ? "bg-azul text-white" : i < idx ? "bg-azul-claro text-azul" : "bg-gray-100 text-gray-500"}`}>
          {i + 1}. {nome}
        </li>
      ))}
    </ol>
  );
}

const GRUPOS: { titulo: string; campos: ChaveColuna[] }[] = [
  { titulo: "Identificação", campos: ["luc"] },
  { titulo: "Cadastro", campos: ["nome_fantasia", "localizacao", "segmento", "auditada", "ativa"] },
  { titulo: "Percentual de participação", campos: ["percentual", "percentual_vigencia"] },
  { titulo: "Aluguel mínimo", campos: ["aluguel_minimo", "minimo_vigencia"] },
  { titulo: "13º aluguel", campos: ["valor_13", "ano_13"] },
];
const CAMPO_FIXO: Partial<Record<ChaveColuna, "mes" | "ano">> = { percentual_vigencia: "mes", minimo_vigencia: "mes", ano_13: "ano" };
const NAO_LER = "";
const FIXO = "fixo";

function EditorMapeamento({ colunas, mapa, setMapa, totalLinhas, pendente, onAnalisar }: {
  colunas: ColunaPlanilha[]; mapa: Mapeamento; setMapa: (m: Mapeamento) => void; totalLinhas?: number;
  pendente: boolean; onAnalisar: () => void;
}) {
  const problemas = validarMapeamento(mapa);
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const mesPadrao = `${anoAtual}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`;

  function valorSelect(c: ChaveColuna): string {
    if (mapa.colunas[c] !== undefined) return String(mapa.colunas[c]);
    if (mapa.fixos?.[c as keyof NonNullable<Mapeamento["fixos"]>] !== undefined) return FIXO;
    return NAO_LER;
  }

  function mudar(c: ChaveColuna, v: string) {
    const colunasNovas = { ...mapa.colunas };
    const fixos = { ...(mapa.fixos ?? {}) } as Record<string, string | number | undefined>;
    delete colunasNovas[c];
    delete fixos[c];
    if (v === FIXO) fixos[c] = CAMPO_FIXO[c] === "ano" ? anoAtual : mesPadrao;
    else if (v !== NAO_LER) colunasNovas[c] = Number(v);
    setMapa({ ...mapa, colunas: colunasNovas, fixos: fixos as Mapeamento["fixos"] });
  }

  function mudarFixo(c: ChaveColuna, v: string | number) {
    setMapa({ ...mapa, fixos: { ...(mapa.fixos ?? {}), [c]: v } });
  }

  const escolhidos = Object.keys(mapa.colunas).length;

  return (
    <div className="space-y-4">
      <Aviso tipo="info">
        Escolha, para cada campo do sistema, a coluna da sua planilha que tem essa informação.
        Campo marcado como <strong>“não ler / não atualizar”</strong> fica exatamente como está no cadastro.
        {totalLinhas !== undefined && <> A planilha tem <strong>{totalLinhas}</strong> linha(s) de dados.</>}
      </Aviso>

      <div className="flex flex-wrap gap-2 text-sm">
        <Botao type="button" variante="secundario" className="min-h-9 text-sm"
          onClick={() => setMapa({ ...mapa, colunas: mapa.colunas.luc !== undefined ? { luc: mapa.colunas.luc } : {}, fixos: {} })}>
          Desmarcar tudo (exceto LUC)
        </Botao>
      </div>

      {GRUPOS.map((g) => (
        <fieldset key={g.titulo} className="rounded-lg border border-gray-200 p-3">
          <legend className="px-1 text-sm font-semibold text-gray-700">{g.titulo}</legend>
          <div className="space-y-3">
            {g.campos.map((c) => {
              const v = valorSelect(c);
              const col = v !== NAO_LER && v !== FIXO ? colunas.find((x) => x.indice === Number(v)) : undefined;
              return (
                <div key={c} className="grid gap-2 sm:grid-cols-[14rem_1fr] sm:items-center">
                  <label htmlFor={`map-${c}`} className="text-sm font-medium text-gray-800">
                    {TITULO_CAMPO[c]}{c === "luc" && <span className="text-red-700"> *</span>}
                  </label>
                  <div className="space-y-1">
                    <select id={`map-${c}`} value={v} onChange={(e) => mudar(c, e.target.value)}
                      className={`${classesInput} ${v === NAO_LER ? "text-gray-500" : "font-medium"}`}>
                      <option value={NAO_LER}>{c === "luc" ? "— escolha a coluna —" : "— não ler / não atualizar —"}</option>
                      {CAMPO_FIXO[c] && <option value={FIXO}>{CAMPO_FIXO[c] === "ano" ? "Mesmo ano para todas as linhas…" : "Mesmo mês para todas as linhas…"}</option>}
                      {colunas.map((x) => <option key={x.indice} value={x.indice}>Coluna {x.letra} – {x.titulo}</option>)}
                    </select>
                    {col && col.exemplos.length > 0 && <p className="text-xs text-gray-500">Exemplos: {col.exemplos.join(" · ")}</p>}
                    {v === FIXO && CAMPO_FIXO[c] === "mes" && (
                      <SeletorMesFixo valor={String(mapa.fixos?.[c as "percentual_vigencia" | "minimo_vigencia"] ?? mesPadrao)}
                        anoAtual={anoAtual} onChange={(d) => mudarFixo(c, d)} />
                    )}
                    {v === FIXO && CAMPO_FIXO[c] === "ano" && (
                      <select aria-label="Ano fixo" value={mapa.fixos?.ano_13 ?? anoAtual} onChange={(e) => mudarFixo(c, Number(e.target.value))} className={classesInput}>
                        {[anoAtual - 1, anoAtual, anoAtual + 1, anoAtual + 2].map((a) => <option key={a}>{a}</option>)}
                      </select>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}

      {avisosMapeamento(mapa).map((a) => <Aviso key={a} tipo="info">{a}</Aviso>)}
      {problemas.length > 0 && (
        <Aviso tipo="alerta"><ul className="list-disc pl-4">{problemas.map((p) => <li key={p}>{p}</li>)}</ul></Aviso>
      )}
      <Botao type="button" disabled={problemas.length > 0 || pendente} onClick={onAnalisar}>
        {pendente ? "Analisando…" : `Analisar com ${escolhidos} coluna(s) escolhida(s)`}
      </Botao>
      <p className="text-xs text-gray-500">Nada é gravado nesta etapa: primeiro você confere a prévia.</p>
    </div>
  );
}

function SeletorMesFixo({ valor, anoAtual, onChange }: { valor: string; anoAtual: number; onChange: (d: string) => void }) {
  const ano = Number(valor.slice(0, 4));
  const mes = Number(valor.slice(5, 7));
  const montar = (a: number, m: number) => `${a}-${String(m).padStart(2, "0")}-01`;
  return (
    <div className="grid grid-cols-2 gap-2">
      <select aria-label="Mês da vigência" value={mes} onChange={(e) => onChange(montar(ano, Number(e.target.value)))} className={classesInput}>
        {MESES.map((m, i) => <option key={m} value={i + 1}>{String(i + 1).padStart(2, "0")} – {m}</option>)}
      </select>
      <select aria-label="Ano da vigência" value={ano} onChange={(e) => onChange(montar(Number(e.target.value), mes))} className={classesInput}>
        {Array.from({ length: 6 }, (_, i) => anoAtual - 3 + i).map((a) => <option key={a}>{a}</option>)}
      </select>
    </div>
  );
}

function Previa({ resultado: r, arquivo, filtro, setFiltro, pendente, onVoltar, onConfirmar }: {
  resultado: NonNullable<EstadoImportacao["resultado"]>; arquivo: string; filtro: Situacao | "todas";
  setFiltro: (s: Situacao | "todas") => void; pendente: boolean; onVoltar: () => void; onConfirmar: () => void;
}) {
  const linhas: ResultadoLinha[] = r.linhas.filter((l) => filtro === "todas" || l.situacao === filtro);
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Prévia: {arquivo}</h3>
      {r.camposLidos.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
          <p className="font-medium text-gray-800">Campos lidos e atualizados:</p>
          <ul className="mt-1 list-disc pl-5 text-gray-700">{r.camposLidos.map((c) => <li key={c}>{c}</li>)}</ul>
          <p className="mt-1 text-gray-600">Os demais campos ficam como estão no cadastro.</p>
        </div>
      )}
      {r.errosGerais.map((e, i) => <Aviso key={i} tipo="erro">{e}</Aviso>)}
      {r.avisosGerais.map((e, i) => <Aviso key={i} tipo="alerta">{e}</Aviso>)}

      <div className="flex flex-wrap gap-2 text-sm">
        {(["todas", "nova", "atualizacao", "sem_alteracao", "erro"] as const).map((s) => (
          <button key={s} type="button" onClick={() => setFiltro(s)}
            className={`rounded-full border px-3 py-1.5 ${filtro === s ? "border-azul bg-azul text-white" : "bg-white"}`}>
            {s === "todas" ? `Todas (${r.totais.linhas})` : `${NOMES[s]} (${r.totais[s]})`}
          </button>
        ))}
      </div>

      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
        {linhas.map((l) => (
          <li key={l.linha} className="px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-gray-500">Linha {l.linha}</span>
              <Etiqueta cor={CORES[l.situacao]}>{NOMES[l.situacao]}</Etiqueta>
              <span className="font-medium">{l.luc || "(sem LUC)"}</span>
              <span className="text-gray-700">{l.nome}</span>
            </div>
            {l.erros.map((e, i) => <p key={"e" + i} className="text-red-700">✖ {e}</p>)}
            {l.mudancas.map((m, i) => <p key={"m" + i} className="text-gray-700">• {m}</p>)}
            {l.avisos.map((a, i) => <p key={"a" + i} className="text-amber-800">⚠ {a}</p>)}
          </li>
        ))}
        {!linhas.length && <li className="px-3 py-4 text-center text-gray-500">Nenhuma linha neste filtro.</li>}
      </ul>

      {r.podeImportar ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-green-300 bg-green-50 p-3">
          <p className="flex-1 text-sm text-green-900">
            Serão gravadas {r.totais.nova} loja(s) nova(s) e {r.totais.atualizacao} atualização(ões).
            {r.totais.sem_alteracao > 0 && ` ${r.totais.sem_alteracao} linha(s) sem alteração serão ignoradas.`}
          </p>
          <Botao type="button" disabled={pendente} onClick={onConfirmar}>{pendente ? "Gravando…" : "Confirmar importação"}</Botao>
        </div>
      ) : (
        <Aviso tipo="erro">
          {r.totais.erro > 0 || r.errosGerais.length
            ? "Corrija os erros (na planilha ou na escolha de colunas) e analise novamente. A importação é tudo ou nada: nenhuma linha é gravada enquanto houver erro."
            : "Nada a importar: todas as linhas já estão iguais ao cadastro."}
        </Aviso>
      )}
      <Botao variante="secundario" type="button" onClick={onVoltar}>← Voltar e alterar colunas</Botao>
    </div>
  );
}
