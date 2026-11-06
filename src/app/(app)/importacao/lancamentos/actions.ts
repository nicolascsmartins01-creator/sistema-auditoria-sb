"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { exigirUsuario, PERFIS_ANALISTA } from "@/lib/sessao";
import { mensagemErroBanco } from "@/lib/acoes";
import { hojeFortaleza } from "@/lib/formato";
import { mesSeguinte } from "@/lib/prazos";
import { LIMITE_BYTES, lerPlanilha, type Celula } from "@/lib/importacao-lojas/ler-planilha";
import type { ColunaPlanilha } from "@/lib/importacao-lojas/mapeamento";
import { analisarPlanilhaLanc, lerData, validarLancamentosLote, type MapaLanc, type ResultadoLanc } from "@/lib/importacao-lancamentos/validar";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface EstadoLote {
  etapa: "inicio" | "colunas" | "previa" | "concluida";
  versao: number;
  erro?: string;
  arquivo?: string;
  colunas?: ColunaPlanilha[];
  sugestao?: MapaLanc;
  totalLinhas?: number;
  resultado?: ResultadoLanc;
  resumo?: { linhas: number; total: number; meses: Record<string, number> };
}

const esquema = z.object({
  linhaCabecalho: z.number().int().min(0).max(50),
  colunas: z.partialRecord(z.enum(["luc", "data", "valor", "auditor"]), z.number().int().min(0).max(500)),
});

async function contexto(sb: SupabaseClient, matriz: Celula[][], mapa: MapaLanc) {
  const datas = matriz.slice(mapa.linhaCabecalho + 1).map((l) => (mapa.colunas.data === undefined ? null : lerData(l[mapa.colunas.data]))).filter((d): d is string => !!d).sort();
  const meses = [...new Set(datas.map((d) => d.slice(0, 7)))];
  const [lojas, usuarios, lancs, estados] = await Promise.all([
    sb.from("lojas").select("id, luc, nome_fantasia, ativa, auditada"),
    sb.from("usuarios").select("login").eq("ativo", true),
    datas.length
      ? sb.from("lancamentos").select("loja_id, data_venda").neq("situacao", "recusado").gte("data_venda", datas[0]).lt("data_venda", mesSeguinte(datas.at(-1)!.slice(0, 7)) + "-01")
      : Promise.resolve({ data: [] as { loja_id: string; data_venda: string }[] }),
    Promise.all(meses.map(async (m) => [m, (await sb.rpc("estado_mes", { p_competencia: m + "-01" })).data?.situacao] as const)),
  ]);
  return {
    lojas: (lojas.data ?? []).map((l) => ({ id: l.id, luc: l.luc, nome: l.nome_fantasia, ativa: l.ativa, auditada: l.auditada })),
    jaLancados: new Set((lancs.data ?? []).map((x) => `${x.loja_id}|${x.data_venda}`)),
    mesesFechados: new Set(estados.filter(([, s]) => s === "fechado").map(([m]) => m)),
    hoje: hojeFortaleza(),
    logins: new Set((usuarios.data ?? []).map((u) => u.login)),
  };
}

/** Passos: "ler" (colunas), "previa" (valida, nada gravado), "confirmar" (revalida, arquiva e grava tudo ou nada). */
export async function processarLote(anterior: EstadoLote, f: FormData): Promise<EstadoLote> {
  await exigirUsuario(PERFIS_ANALISTA);
  const versao = anterior.versao + 1;
  const arquivo = f.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { etapa: "inicio", versao, erro: "Escolha o arquivo da planilha." };
  if (arquivo.size > LIMITE_BYTES) return { etapa: "inicio", versao, erro: "Arquivo muito grande (limite de 5 MB)." };
  const conteudo = await arquivo.arrayBuffer();
  let matriz: Celula[][];
  try { matriz = await lerPlanilha(arquivo.name, conteudo); } catch (e) { return { etapa: "inicio", versao, erro: (e as Error).message }; }

  const passo = String(f.get("passo"));
  if (passo === "ler") {
    const a = analisarPlanilhaLanc(matriz);
    if (!a.ok) return { etapa: "inicio", versao, erro: a.erro };
    return { etapa: "colunas", versao, arquivo: arquivo.name, colunas: a.colunas, sugestao: a.sugestao, totalLinhas: a.totalLinhas };
  }
  let mapa: MapaLanc;
  try { mapa = esquema.parse(JSON.parse(String(f.get("mapa")))) as MapaLanc; } catch { return { etapa: "colunas", versao, erro: "Escolha de colunas inválida." }; }

  const sb = await criarClienteServidor();
  const resultado = validarLancamentosLote(matriz, mapa, await contexto(sb, matriz, mapa));
  if (passo === "previa") return { etapa: "previa", versao, arquivo: arquivo.name, resultado };
  if (!resultado.podeImportar) return { etapa: "previa", versao, arquivo: arquivo.name, resultado, erro: "A planilha tem erros e não pode ser importada." };

  const caminho = `lancamentos/${hojeFortaleza()}/${crypto.randomUUID()}-${arquivo.name.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(-80)}`;
  const { error: errUp } = await sb.storage.from("importacoes").upload(caminho, conteudo, { contentType: arquivo.type || "application/octet-stream", upsert: false });
  if (errUp) return { etapa: "previa", versao, arquivo: arquivo.name, resultado, erro: `Falha ao arquivar a planilha: ${errUp.message}` };
  const { data, error } = await sb.rpc("importar_lancamentos", { p_arquivo_nome: arquivo.name, p_arquivo_path: caminho, p_linhas: resultado.paraGravar });
  if (error) return { etapa: "previa", versao, arquivo: arquivo.name, resultado, erro: mensagemErroBanco(error) };
  revalidatePath("/lancamentos");
  revalidatePath("/importacao");
  return { etapa: "concluida", versao, arquivo: arquivo.name, resumo: data };
}
