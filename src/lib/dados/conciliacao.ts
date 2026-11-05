import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { conciliarMes, type EntradaLoja, type ResultadoConciliacao } from "@/lib/conciliacao";
import { mesSeguinte } from "@/lib/prazos";

/** Último mês com venda informada importada (aaaa-mm), ou null. */
export async function ultimoMesComInformado(sb: SupabaseClient): Promise<string | null> {
  const { data } = await sb.from("vendas_informadas").select("competencia").order("competencia", { ascending: false }).limit(1);
  return (data?.[0]?.competencia as string | undefined)?.slice(0, 7) ?? null;
}

/**
 * Monta a conciliação do mês (somente Analista/Administrador: as regras do
 * banco não devolvem venda informada para o Auditor).
 * Entram as lojas auditadas e qualquer loja com lançamento no mês.
 */
export async function carregarConciliacao(sb: SupabaseClient, mes: string): Promise<ResultadoConciliacao> {
  const inicio = mes + "-01";
  const fim = mesSeguinte(mes) + "-01";
  const [lojas, informadas, lancs] = await Promise.all([
    sb.from("lojas").select("id, luc, nome_fantasia, auditada, ativa"),
    sb.from("vendas_informadas").select("loja_id, valor").eq("competencia", inicio).not("loja_id", "is", null),
    sb.from("lancamentos").select("id, loja_id, data_venda, valor").eq("situacao", "valido").gte("data_venda", inicio).lt("data_venda", fim),
  ]);
  for (const r of [lojas, informadas, lancs]) if (r.error) throw new Error(r.error.message);

  const informado = new Map<string, number>();
  for (const v of informadas.data!) informado.set(v.loja_id, (informado.get(v.loja_id) ?? 0) + Math.round(Number(v.valor) * 100));
  const dias = new Map<string, EntradaLoja["dias"]>();
  for (const l of lancs.data!) {
    const lista = dias.get(l.loja_id) ?? [];
    lista.push({ lancamento_id: l.id, data: l.data_venda, centavos: Math.round(Number(l.valor) * 100) });
    dias.set(l.loja_id, lista);
  }
  const entradas: EntradaLoja[] = lojas.data!
    .filter((l) => (l.auditada && l.ativa) || dias.has(l.id))
    .map((l) => ({
      loja_id: l.id, luc: l.luc, nome: l.nome_fantasia,
      informadoCentavos: informado.has(l.id) ? informado.get(l.id)! : null,
      dias: dias.get(l.id) ?? [],
    }));
  return conciliarMes(mes, entradas);
}
