import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { calcularPaineis, mesesAte, type Paineis, type LojaPainel } from "@/lib/paineis";
import { mesSeguinte } from "@/lib/prazos";

/** Lê todas as linhas (o Supabase devolve no máximo 1.000 por consulta). */
async function todas<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const saida: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await consulta(de, de + 999);
    if (error) throw new Error(error.message);
    saida.push(...(data ?? []));
    if (!data || data.length < 1000) return saida;
  }
}

/** Dados dos painéis (somente Analista/Administrador — o banco não entrega venda informada ao Auditor). */
export async function carregarPaineis(sb: SupabaseClient, ate: string, n: number): Promise<{ paineis: Paineis; lojas: LojaPainel[] }> {
  const meses = mesesAte(ate, n);
  const inicio = meses[0] + "-01";
  const fim = mesSeguinte(ate) + "-01";
  type L = { id: string; luc: string; nome_fantasia: string; auditada: boolean; ativa: boolean; segmentos: { nome: string } | null };
  const [lojasDb, inf, lancs] = await Promise.all([
    todas<L>((de, a) => sb.from("lojas").select("id, luc, nome_fantasia, auditada, ativa, segmentos(nome)").order("luc").range(de, a) as never),
    todas<{ loja_id: string; competencia: string; valor: string }>((de, a) =>
      sb.from("vendas_informadas").select("loja_id, competencia, valor").gte("competencia", inicio).lt("competencia", fim).not("loja_id", "is", null).order("id").range(de, a) as never),
    todas<{ id: string; loja_id: string; data_venda: string; valor: string }>((de, a) =>
      sb.from("lancamentos").select("id, loja_id, data_venda, valor").eq("situacao", "valido").gte("data_venda", inicio).lt("data_venda", fim).order("id").range(de, a) as never),
  ]);
  const lojas: LojaPainel[] = lojasDb.map((l) => ({ id: l.id, luc: l.luc, nome: l.nome_fantasia, segmento: l.segmentos?.nome ?? null, auditada: l.auditada, ativa: l.ativa }));
  const paineis = calcularPaineis(
    meses, lojas,
    inf.map((i) => ({ loja_id: i.loja_id, competencia: i.competencia, centavos: Math.round(Number(i.valor) * 100) })),
    lancs.map((l) => ({ id: l.id, loja_id: l.loja_id, data: l.data_venda, centavos: Math.round(Number(l.valor) * 100) })),
  );
  return { paineis, lojas };
}
