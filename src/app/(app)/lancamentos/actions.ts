"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { exigirUsuario, PERFIS_ANALISTA } from "@/lib/sessao";
import { mensagemErroBanco, type EstadoAcao } from "@/lib/acoes";
import { lerNumeroBR } from "@/lib/formato";

export async function editarLancamento(id: string, _: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  await exigirUsuario(PERFIS_ANALISTA);
  const valor = lerNumeroBR(f.get("valor"));
  const motivo = String(f.get("motivo") ?? "").trim();
  if (valor === null || Number.isNaN(valor) || valor < 0) return { mensagem: "Informe o valor (ex.: 1.234,56)." };
  if (!motivo) return { mensagem: "O motivo da edição é obrigatório." };
  const sb = await criarClienteServidor();
  const { error } = await sb.rpc("editar_lancamento", { p_id: id, p_valor: valor, p_motivo: motivo });
  if (error) return { mensagem: mensagemErroBanco(error) };
  revalidatePath(`/lancamentos/${id}`);
  return { ok: true, mensagem: "Lançamento atualizado. A alteração e o motivo foram registrados no histórico." };
}

export async function analisarLancamento(id: string, aprovar: boolean, _: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  await exigirUsuario(PERFIS_ANALISTA);
  const motivo = String(f.get("motivo") ?? "").trim();
  if (!motivo) return { mensagem: "Informe o motivo." };
  const sb = await criarClienteServidor();
  const { error } = await sb.rpc("analisar_lancamento", { p_id: id, p_aprovar: aprovar, p_motivo: motivo });
  if (error) return { mensagem: mensagemErroBanco(error) };
  revalidatePath(`/lancamentos/${id}`);
  revalidatePath("/lancamentos");
  return { ok: true, mensagem: aprovar ? "Lançamento aprovado: passa a valer." : "Lançamento recusado: o dia fica livre para novo lançamento." };
}
