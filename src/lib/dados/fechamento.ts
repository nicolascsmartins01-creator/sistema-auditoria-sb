import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { carregarConciliacao } from "@/lib/dados/conciliacao";
import { mesSeguinte } from "@/lib/prazos";

export type SituacaoMes = "aberto" | "revisao" | "fechado" | "reaberto";

export interface EstadoMes {
  competencia: string;
  situacao: SituacaoMes;
  prazo_lancamento: string;        // timestamptz (23:59:59 do dia 5)
  quinto_dia_util: string;         // aaaa-mm-dd
  fechamento_automatico: string;   // timestamptz (23:59:59 do 5º dia útil)
  versao_atual: number | null;
}

export const NOMES_SITUACAO: Record<SituacaoMes, { nome: string; cor: "verde" | "amarelo" | "vermelho" | "azul" }> = {
  aberto: { nome: "Aberto para lançamentos", cor: "verde" },
  revisao: { nome: "Em revisão (lançamentos travados)", cor: "amarelo" },
  fechado: { nome: "Fechado", cor: "vermelho" },
  reaberto: { nome: "Reaberto", cor: "azul" },
};

export async function estadoMes(sb: SupabaseClient, mes: string): Promise<EstadoMes> {
  const { data, error } = await sb.rpc("estado_mes", { p_competencia: mes + "-01" });
  if (error) throw new Error(error.message);
  return data as EstadoMes;
}

/** Grava as versões automáticas que estiverem vencidas (o bloqueio já vale pela data). */
export async function processarFechamentosAutomaticos(sb: SupabaseClient): Promise<void> {
  await sb.rpc("fechar_meses_vencidos");
}

export interface Pendencia { texto: string; qtd: number; href?: string; grave?: boolean }

/** Pendências mostradas antes do fechamento antecipado. */
export async function pendenciasDoMes(sb: SupabaseClient, mes: string): Promise<Pendencia[]> {
  const inicio = mes + "-01";
  const [emAnalise, informado, semLoja, pendPct, pendMin, conc] = await Promise.all([
    sb.from("lancamentos").select("id", { count: "exact", head: true }).eq("situacao", "em_analise").gte("data_venda", inicio).lt("data_venda", mesSeguinte(mes) + "-01"),
    sb.from("vendas_informadas").select("id", { count: "exact", head: true }).eq("competencia", inicio),
    sb.from("vendas_informadas").select("id", { count: "exact", head: true }).eq("competencia", inicio).is("loja_id", null),
    sb.from("loja_percentuais").select("loja_id", { count: "exact", head: true }).is("vigencia_inicio", null),
    sb.from("loja_alugueis_minimos").select("loja_id", { count: "exact", head: true }).is("vigencia_inicio", null),
    carregarConciliacao(sb, mes),
  ]);
  const p: Pendencia[] = [
    { texto: "PDF do portal (venda informada) ainda não importado para o mês", qtd: informado.count ? 0 : 1, href: "/importacao/portal", grave: true },
    { texto: "lançamento(s) recebido(s) após 72 h aguardando análise", qtd: emAnalise.count ?? 0, href: `/lancamentos?situacao=em_analise`, grave: true },
    { texto: "loja(s) auditada(s) sem nenhum dia auditado no mês", qtd: conc.semAuditoria.length, href: `/conciliacao?mes=${mes}` },
    { texto: "loja(s) com dias auditados, mas sem venda informada", qtd: conc.semInformado.length, href: `/conciliacao?mes=${mes}` },
    { texto: "LUC(s) do PDF sem loja cadastrada", qtd: semLoja.count ?? 0, href: `/vendas-informadas?mes=${mes}` },
    { texto: "valor(es) de percentual/mínimo com vigência a definir", qtd: (pendPct.count ?? 0) + (pendMin.count ?? 0), href: "/lojas?pendencia=a-definir" },
  ];
  return p.filter((x) => x.qtd > 0);
}
