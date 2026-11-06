import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { gerarExcel } from "./excel";
import { gerarPdfConsolidado } from "./pdf";
import type { Meta, RelatorioEmitido } from "./dados";

export type TipoArquivo = "excel" | "pdf";
export const MIME: Record<TipoArquivo, string> = {
  excel: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};
const EXT: Record<TipoArquivo, string> = { excel: "xlsx", pdf: "pdf" };

export interface VersaoCarregada { id: string; meta: Meta; dados: RelatorioEmitido }

export async function carregarVersao(sb: SupabaseClient, mes: string, versao: number): Promise<VersaoCarregada | null> {
  const { data: v } = await sb.from("fechamento_versoes").select("id, versao, tipo, gerado_em, gerado_por, dados")
    .eq("competencia", mes + "-01").eq("versao", versao).maybeSingle();
  if (!v) return null;
  let autor: string | null = null;
  if (v.gerado_por) autor = (await sb.from("usuarios").select("nome").eq("id", v.gerado_por).maybeSingle()).data?.nome ?? null;
  return {
    id: v.id,
    meta: { mes, versao: v.versao, tipo: v.tipo, emitidoEm: v.gerado_em, emitidoPor: autor ?? (v.gerado_por ? null : "sistema (fechamento automático)") },
    dados: v.dados as RelatorioEmitido,
  };
}

export function nomeArquivo(meta: Meta, tipo: TipoArquivo, sufixo = "consolidado"): string {
  const v = meta.versao === null ? "previa" : `v${meta.versao}`;
  return `auditoria-${meta.mes}-${v}-${sufixo}.${EXT[tipo]}`;
}

export async function gerarArquivo(tipo: TipoArquivo, dados: RelatorioEmitido, meta: Meta): Promise<Uint8Array> {
  return tipo === "excel" ? new Uint8Array(await gerarExcel(dados, meta)) : gerarPdfConsolidado(dados, meta);
}

/**
 * Devolve o caminho do arquivo da versão no storage privado. Se ainda não foi
 * gerado (ex.: fechamento automático), gera agora a partir dos dados
 * congelados da versão e guarda — nunca substitui um arquivo já guardado.
 */
export async function arquivoDaVersao(sb: SupabaseClient, v: VersaoCarregada, tipo: TipoArquivo): Promise<string> {
  const { data: existente } = await sb.from("fechamento_arquivos").select("caminho").eq("versao_id", v.id).eq("tipo", tipo).maybeSingle();
  if (existente) return existente.caminho;
  const caminho = `fechamento/${v.meta.mes}/v${v.meta.versao}/${nomeArquivo(v.meta, tipo)}`;
  const bytes = await gerarArquivo(tipo, v.dados, v.meta);
  const { error: errUp } = await sb.storage.from("relatorios").upload(caminho, bytes, { contentType: MIME[tipo], upsert: false });
  if (errUp && !/exists|duplicate/i.test(errUp.message)) throw new Error(errUp.message);
  const { error } = await sb.rpc("registrar_arquivo_fechamento", { p_versao_id: v.id, p_tipo: tipo, p_caminho: caminho });
  if (error) throw new Error(error.message);
  return caminho;
}
