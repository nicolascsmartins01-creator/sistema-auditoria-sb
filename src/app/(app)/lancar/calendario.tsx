"use client";

import { useEffect, useState } from "react";
import { clienteNavegador } from "@/lib/supabase/navegador";
import { useFila } from "@/lib/offline/use-fila";
import { formatarData, MESES } from "@/lib/formato";
import { diaDaSemana, diaPadrao, diasDoMes, estadoDia, mesAnterior, mesSeguinte, prazoLancamento } from "@/lib/prazos";
import { Aviso } from "@/components/ui";
import type { InfoDia, LojaLanc } from "./app-lancamento";

const SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

interface Linha { data_venda: string; situacao: "valido" | "em_analise"; auditor_nome: string; proprio: boolean; lancamento_id: string | null; valor: string | null }

const chaveCache = (loja: string, mes: string) => `auditoria:dias:${loja}:${mes}`;

/** Passo 2: calendário do mês, abrindo no dia anterior. */
export function Calendario({ loja, mes, hoje, aviso, onTrocarLoja, onMes, onLancar, onDetalhe }: {
  loja: LojaLanc; mes: string; hoje: string; aviso?: string;
  onTrocarLoja: () => void; onMes: (mes: string) => void;
  onLancar: (dia: string) => void; onDetalhe: (dia: string, info: InfoDia) => void;
}) {
  const [dias, setDias] = useState<Record<string, InfoDia>>({});
  const [carregando, setCarregando] = useState(true);
  const [daCache, setDaCache] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [fechado, setFechado] = useState(false);
  const { itens } = useFila();
  const padrao = diaPadrao(hoje);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setErro(null);
    const [ano, m] = mes.split("-").map(Number);
    setFechado(false);
    Promise.resolve(clienteNavegador().rpc("estado_mes", { p_competencia: mes + "-01" }))
      .then(({ data }) => { if (!cancelado && data) setFechado(data.situacao === "fechado"); })
      .catch(() => { /* sem internet: o servidor confere ao receber */ });
    const aplicar = (linhas: Linha[]) => {
      const mapa: Record<string, InfoDia> = {};
      for (const l of linhas) mapa[l.data_venda] = {
        situacao: l.situacao, auditor_nome: l.auditor_nome, proprio: l.proprio,
        lancamento_id: l.lancamento_id, valor: l.valor === null ? null : Number(l.valor),
      };
      setDias(mapa);
    };
    Promise.resolve(clienteNavegador().rpc("dias_lancados", { p_loja_id: loja.id, p_ano: ano, p_mes: m }))
      .then(({ data, error }) => {
        if (cancelado) return;
        if (error) throw error;
        aplicar(data as Linha[]);
        setDaCache(false);
        try { localStorage.setItem(chaveCache(loja.id, mes), JSON.stringify(data)); } catch { /* ignora */ }
      })
      .catch(() => {
        if (cancelado) return;
        try {
          const salvo = localStorage.getItem(chaveCache(loja.id, mes));
          if (salvo) { aplicar(JSON.parse(salvo)); setDaCache(true); return; }
        } catch { /* ignora */ }
        setErro("Sem conexão: não foi possível ver quais dias já foram lançados.");
      })
      .finally(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
  }, [loja.id, mes, itens.length]);

  // lançamentos guardados no aparelho, ainda não enviados
  const naFila: Record<string, InfoDia> = {};
  for (const i of itens) if (i.loja_id === loja.id && !i.erro) naFila[i.data_venda] = {
    situacao: "pendente_envio", auditor_nome: null, proprio: true, lancamento_id: null, valor: i.valor,
  };

  const lista = diasDoMes(mes);
  const vazios = diaDaSemana(lista[0]);
  const [ano, m] = mes.split("-").map(Number);
  const prazo = prazoLancamento(mes + "-01");
  const podeAvancar = mesSeguinte(mes) <= hoje.slice(0, 7);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold leading-tight">{loja.nome}</h1>
          <p className="text-sm text-gray-500">{loja.luc}{loja.localizacao ? ` · ${loja.localizacao}` : ""}</p>
        </div>
        <button onClick={onTrocarLoja} className="min-h-11 shrink-0 rounded-lg border border-azul px-3 text-sm text-azul">Trocar loja</button>
      </div>

      {aviso && <Aviso tipo={aviso.startsWith("Guardado") ? "alerta" : "sucesso"}>{aviso}</Aviso>}

      <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-2 py-1 shadow-sm">
        <button onClick={() => onMes(mesAnterior(mes))} className="min-h-12 min-w-12 text-2xl text-azul" aria-label="Mês anterior">‹</button>
        <span className="text-lg font-semibold">{MESES[m - 1][0].toUpperCase() + MESES[m - 1].slice(1)} de {ano}</span>
        <button onClick={() => onMes(mesSeguinte(mes))} disabled={!podeAvancar} className="min-h-12 min-w-12 text-2xl text-azul disabled:text-gray-300" aria-label="Próximo mês">›</button>
      </div>

      {erro && <Aviso tipo="alerta">{erro}</Aviso>}
      {fechado && <Aviso tipo="alerta">Este mês foi fechado: não aceita mais lançamentos.</Aviso>}
      {daCache && <Aviso tipo="info">Sem internet: mostrando os dias salvos da última consulta.</Aviso>}

      <div className={`rounded-xl border border-gray-200 bg-white p-2 shadow-sm ${carregando ? "opacity-60" : ""}`}>
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-gray-500">
          {SEMANA.map((s, i) => <div key={i} className="py-1">{s}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: vazios }, (_, i) => <div key={"v" + i} />)}
          {lista.map((d) => {
            const info = naFila[d] ?? dias[d];
            const estado = estadoDia(d, hoje);
            const num = Number(d.slice(8));
            const selecionado = d === padrao;
            let classe = "bg-gray-100 text-gray-400";
            let icone = "";
            let rotulo = `Dia ${num}`;
            let acao: (() => void) | undefined;
            if (info) {
              acao = () => onDetalhe(d, info);
              if (info.situacao === "pendente_envio") { classe = "bg-amber-100 text-amber-900 border border-amber-300"; icone = "⏳"; rotulo += ", aguardando envio"; }
              else if (info.situacao === "em_analise") { classe = "bg-amber-50 text-amber-900 border border-amber-300"; icone = "🔒"; rotulo += ", em análise"; }
              else { classe = "bg-green-100 text-green-900 border border-green-300"; icone = "🔒"; rotulo += ", lançado"; }
            } else if (estado === "aberto" && !fechado) {
              classe = "bg-white text-gray-900 border border-gray-300 active:bg-azul-claro";
              acao = () => onLancar(d);
              rotulo += ", livre";
            } else {
              rotulo += estado === "hoje" ? ", hoje (lança amanhã)" : estado === "futuro" ? ", futuro" : ", fora do prazo";
            }
            return (
              <button key={d} onClick={acao} disabled={!acao || carregando} aria-label={rotulo}
                className={`flex aspect-square min-h-12 flex-col items-center justify-center rounded-lg text-base font-semibold ${classe} ${selecionado ? "ring-2 ring-azul ring-offset-1" : ""}`}>
                <span>{num}</span>
                {icone && <span className="text-xs leading-none">{icone}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {(() => {
        const info = naFila[padrao] ?? dias[padrao];
        if (carregando || fechado || padrao.slice(0, 7) !== mes || info || estadoDia(padrao, hoje) !== "aberto") return null;
        return (
          <button onClick={() => onLancar(padrao)} className="min-h-14 w-full rounded-xl bg-azul text-lg font-semibold text-white shadow active:bg-azul-escuro">
            Lançar {formatarData(padrao)} (ontem)
          </button>
        );
      })()}

      <ul className="grid grid-cols-2 gap-2 text-xs text-gray-600">
        <li><span className="mr-1 inline-block h-3 w-3 rounded border border-gray-300 bg-white align-middle" /> Livre (toque para lançar)</li>
        <li><span className="mr-1 inline-block h-3 w-3 rounded bg-green-100 align-middle" /> 🔒 Lançado</li>
        <li><span className="mr-1 inline-block h-3 w-3 rounded bg-amber-100 align-middle" /> ⏳ Aguardando envio</li>
        <li><span className="mr-1 inline-block h-3 w-3 rounded bg-gray-100 align-middle" /> Bloqueado</li>
      </ul>
      <p className="text-xs text-gray-500">
        Lançamentos de {String(m).padStart(2, "0")}/{ano} podem ser feitos até {formatarData(prazo)} às 23:59. O dia de hoje só pode ser lançado amanhã.
      </p>
    </div>
  );
}
