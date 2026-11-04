import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface LojaResumo {
  id: string;
  luc: string;
  nome_fantasia: string;
  localizacao: string | null;
  segmento_id: number | null;
  segmento: string | null;
  auditada: boolean;
  ativa: boolean;
  atualizado_em: string;
}

export async function listarLojas(sb: SupabaseClient): Promise<LojaResumo[]> {
  const { data, error } = await sb
    .from("lojas")
    .select("id, luc, nome_fantasia, localizacao, segmento_id, auditada, ativa, atualizado_em, segmentos(nome)")
    .order("nome_fantasia");
  if (error) throw new Error(error.message);
  return (data ?? []).map((l) => {
    const seg = l.segmentos as unknown as { nome: string } | null;
    return {
      id: l.id, luc: l.luc, nome_fantasia: l.nome_fantasia, localizacao: l.localizacao,
      segmento_id: l.segmento_id, segmento: seg?.nome ?? null, auditada: l.auditada, ativa: l.ativa,
      atualizado_em: l.atualizado_em,
    };
  });
}

export interface Vigentes { percentual: number | null; minimo: number | null }

/**
 * Percentual e aluguel mínimo vigentes de cada loja num mês ("aaaa-mm-01").
 * Só retorna dados para Analista/Administrador (as regras do banco bloqueiam o Auditor).
 */
export async function vigentesPorLoja(sb: SupabaseClient, mesRef: string): Promise<Map<string, Vigentes>> {
  const [pct, min] = await Promise.all([
    sb.from("loja_percentuais").select("loja_id, vigencia_inicio, percentual").lte("vigencia_inicio", mesRef).order("vigencia_inicio"),
    sb.from("loja_alugueis_minimos").select("loja_id, vigencia_inicio, valor").lte("vigencia_inicio", mesRef).order("vigencia_inicio"),
  ]);
  const mapa = new Map<string, Vigentes>();
  const pegar = (id: string) => mapa.get(id) ?? mapa.set(id, { percentual: null, minimo: null }).get(id)!;
  // ordenado por vigência: o último de cada loja é o vigente
  for (const p of pct.data ?? []) pegar(p.loja_id).percentual = Number(p.percentual);
  for (const m of min.data ?? []) pegar(m.loja_id).minimo = Number(m.valor);
  return mapa;
}
