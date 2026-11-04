import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LojaCadastrada } from "@/lib/importacao-lojas/validar";

/** Cadastro atual completo (lojas + vigências + 13º) para comparar com a planilha. */
export async function carregarCadastroParaImportacao(sb: SupabaseClient): Promise<LojaCadastrada[]> {
  const [lojas, pcts, mins, dez] = await Promise.all([
    sb.from("lojas").select("id, luc, nome_fantasia, localizacao, auditada, ativa, atualizado_em, segmentos(nome)").order("atualizado_em", { ascending: false }),
    sb.from("loja_percentuais").select("loja_id, vigencia_inicio, percentual"),
    sb.from("loja_alugueis_minimos").select("loja_id, vigencia_inicio, valor"),
    sb.from("loja_aluguel_dezembro").select("loja_id, ano, valor"),
  ]);
  for (const r of [lojas, pcts, mins, dez]) if (r.error) throw new Error(r.error.message);
  const agrupar = <T extends { loja_id: string }>(xs: T[]) => {
    const m = new Map<string, T[]>();
    for (const x of xs) m.set(x.loja_id, [...(m.get(x.loja_id) ?? []), x]);
    return m;
  };
  const gp = agrupar(pcts.data!), gm = agrupar(mins.data!), gd = agrupar(dez.data!);
  return lojas.data!.map((l) => ({
    id: l.id, luc: l.luc, nome_fantasia: l.nome_fantasia, localizacao: l.localizacao,
    segmento: (l.segmentos as unknown as { nome: string } | null)?.nome ?? null,
    auditada: l.auditada, ativa: l.ativa,
    percentuais: (gp.get(l.id) ?? []).map((p) => ({ vigencia_inicio: p.vigencia_inicio, percentual: Number(p.percentual) })),
    minimos: (gm.get(l.id) ?? []).map((m) => ({ vigencia_inicio: m.vigencia_inicio, valor: Number(m.valor) })),
    dezembro: (gd.get(l.id) ?? []).map((d) => ({ ano: d.ano, valor: Number(d.valor) })),
  }));
}
