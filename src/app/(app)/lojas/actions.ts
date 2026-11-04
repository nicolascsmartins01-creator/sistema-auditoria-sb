"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { exigirUsuario, PERFIS_ADMIN, PERFIS_ANALISTA } from "@/lib/sessao";
import { mensagemErroBanco, type EstadoAcao } from "@/lib/acoes";
import { lerNumeroBR, normalizarLuc, paraDecimalBanco } from "@/lib/formato";

const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function lerMesAnoForm(f: FormData): string | null {
  const mes = Number(f.get("mes"));
  const ano = Number(f.get("ano"));
  if (!Number.isInteger(mes) || mes < 1 || mes > 12 || !Number.isInteger(ano) || ano < 2000 || ano > 2100) return null;
  return `${ano}-${String(mes).padStart(2, "0")}-01`;
}

export async function salvarLoja(id: string | null, _: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  await exigirUsuario(PERFIS_ANALISTA);
  const dados = {
    luc: normalizarLuc(f.get("luc")),
    nome_fantasia: txt(f, "nome_fantasia"),
    localizacao: txt(f, "localizacao") || null,
    segmento_id: f.get("segmento_id") ? Number(f.get("segmento_id")) : null,
    auditada: f.get("auditada") === "on",
    ativa: f.get("ativa") === "on",
  };
  const erros: Record<string, string> = {};
  if (!dados.luc) erros.luc = "Informe a LUC.";
  if (!dados.nome_fantasia) erros.nome_fantasia = "Informe o nome fantasia.";
  if (Object.keys(erros).length) return { erros, mensagem: "Corrija os campos destacados." };

  const sb = await criarClienteServidor();
  if (id) {
    const { error } = await sb.from("lojas").update(dados).eq("id", id);
    if (error) return { mensagem: mensagemErroBanco(error) };
    revalidatePath(`/lojas/${id}`);
    revalidatePath("/lojas");
    return { ok: true, mensagem: "Dados da loja salvos." };
  }
  const { data, error } = await sb.from("lojas").insert(dados).select("id").single();
  if (error) return { mensagem: mensagemErroBanco(error) };
  revalidatePath("/lojas");
  redirect(`/lojas/${data.id}?criada=1`);
}

export async function salvarPercentual(lojaId: string, _: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  await exigirUsuario(PERFIS_ANALISTA);
  const vig = lerMesAnoForm(f);
  const p = lerNumeroBR(f.get("valor"));
  if (!vig) return { mensagem: "Escolha o mês e o ano de início da vigência." };
  if (p === null || Number.isNaN(p) || p < 0 || p > 100) return { mensagem: "Informe um percentual entre 0 e 100 (ex.: 6,5)." };
  const sb = await criarClienteServidor();
  const { error } = await sb.from("loja_percentuais")
    .upsert({ loja_id: lojaId, vigencia_inicio: vig, percentual: paraDecimalBanco(p, 4) }, { onConflict: "loja_id,vigencia_inicio" });
  if (error) return { mensagem: mensagemErroBanco(error) };
  revalidatePath(`/lojas/${lojaId}`);
  return { ok: true, mensagem: "Percentual salvo." };
}

export async function salvarMinimo(lojaId: string, _: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  await exigirUsuario(PERFIS_ANALISTA);
  const vig = lerMesAnoForm(f);
  const v = lerNumeroBR(f.get("valor"));
  if (!vig) return { mensagem: "Escolha o mês e o ano de início da vigência." };
  if (v === null || Number.isNaN(v) || v < 0) return { mensagem: "Informe o valor do aluguel mínimo (ex.: 12.500,00)." };
  const sb = await criarClienteServidor();
  const { error } = await sb.from("loja_alugueis_minimos")
    .upsert({ loja_id: lojaId, vigencia_inicio: vig, valor: paraDecimalBanco(v) }, { onConflict: "loja_id,vigencia_inicio" });
  if (error) return { mensagem: mensagemErroBanco(error) };
  revalidatePath(`/lojas/${lojaId}`);
  return { ok: true, mensagem: "Aluguel mínimo salvo." };
}

export async function salvar13(lojaId: string, _: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  await exigirUsuario(PERFIS_ANALISTA);
  const ano = Number(f.get("ano"));
  const v = lerNumeroBR(f.get("valor"));
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) return { mensagem: "Escolha o ano." };
  if (v === null || Number.isNaN(v) || v < 0) return { mensagem: "Informe o valor do 13º aluguel (ex.: 25.000,00)." };
  const sb = await criarClienteServidor();
  const { error } = await sb.from("loja_aluguel_dezembro")
    .upsert({ loja_id: lojaId, ano, valor: paraDecimalBanco(v) }, { onConflict: "loja_id,ano" });
  if (error) return { mensagem: mensagemErroBanco(error) };
  revalidatePath(`/lojas/${lojaId}`);
  return { ok: true, mensagem: "13º aluguel salvo." };
}

const TABELAS_VALORES = ["loja_percentuais", "loja_alugueis_minimos", "loja_aluguel_dezembro"] as const;

export async function excluirValor(tabela: (typeof TABELAS_VALORES)[number], id: string, lojaId: string): Promise<void> {
  await exigirUsuario(PERFIS_ANALISTA);
  if (!TABELAS_VALORES.includes(tabela)) return;
  const sb = await criarClienteServidor();
  await sb.from(tabela).delete().eq("id", id).eq("loja_id", lojaId);
  revalidatePath(`/lojas/${lojaId}`);
}

/** Informa o mês de início de um percentual/mínimo que estava com "vigência a definir". */
export async function definirMesVigencia(
  tabela: "loja_percentuais" | "loja_alugueis_minimos", id: string, lojaId: string, _: EstadoAcao, f: FormData,
): Promise<EstadoAcao> {
  await exigirUsuario(PERFIS_ANALISTA);
  if (tabela !== "loja_percentuais" && tabela !== "loja_alugueis_minimos") return { mensagem: "Operação inválida." };
  const vig = lerMesAnoForm(f);
  if (!vig) return { mensagem: "Escolha o mês e o ano." };
  const sb = await criarClienteServidor();
  const { data, error } = await sb.from(tabela).update({ vigencia_inicio: vig })
    .eq("id", id).eq("loja_id", lojaId).is("vigencia_inicio", null).select("id");
  if (error?.code === "23505") return { mensagem: "Já existe um valor cadastrado para esse mês. Exclua um dos dois ou escolha outro mês." };
  if (error) return { mensagem: mensagemErroBanco(error) };
  if (!data?.length) return { mensagem: "Registro não encontrado (talvez já tenha sido definido)." };
  revalidatePath(`/lojas/${lojaId}`);
  return { ok: true, mensagem: "Vigência definida." };
}

/** Exclui a loja (somente Administrador, motivo obrigatório; tudo fica na trilha). */
export async function excluirLoja(lojaId: string, _: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  await exigirUsuario(PERFIS_ADMIN);
  const motivo = String(f.get("motivo") ?? "").trim();
  if (!motivo) return { mensagem: "Informe o motivo da exclusão." };
  const sb = await criarClienteServidor();
  const { error } = await sb.rpc("excluir_loja", { p_loja_id: lojaId, p_motivo: motivo });
  if (error) return { mensagem: mensagemErroBanco(error) };
  revalidatePath("/lojas");
  redirect("/lojas?excluida=1");
}
