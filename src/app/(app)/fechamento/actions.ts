"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { exigirUsuario, PERFIS_ANALISTA } from "@/lib/sessao";
import { mensagemErroBanco, type EstadoAcao } from "@/lib/acoes";
import { arquivoDaVersao, carregarVersao } from "@/lib/relatorio/arquivos";

export async function realizarFechamento(mes: string, _: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  await exigirUsuario(PERFIS_ANALISTA);
  if (f.get("confirmo") !== "sim") return { mensagem: "Marque a confirmação para realizar o fechamento." };
  const sb = await criarClienteServidor();
  const { data, error } = await sb.rpc("fechar_mes", { p_competencia: mes + "-01" });
  if (error) return { mensagem: mensagemErroBanco(error) };
  // gera e guarda os arquivos oficiais da versão (Excel e PDF consolidado)
  try {
    const v = await carregarVersao(sb, mes, data.versao);
    if (v) await Promise.all([arquivoDaVersao(sb, v, "excel"), arquivoDaVersao(sb, v, "pdf")]);
  } catch { /* se falhar, são gerados no primeiro download */ }
  revalidatePath("/fechamento");
  redirect(`/fechamento/${mes}/v/${data.versao}?emitido=1`);
}

export async function reabrirMes(mes: string, _: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  await exigirUsuario(PERFIS_ANALISTA);
  const motivo = String(f.get("motivo") ?? "").trim();
  if (!motivo) return { mensagem: "Informe o motivo da reabertura." };
  const sb = await criarClienteServidor();
  const { error } = await sb.rpc("reabrir_mes", { p_competencia: mes + "-01", p_motivo: motivo });
  if (error) return { mensagem: mensagemErroBanco(error) };
  revalidatePath("/fechamento");
  redirect(`/fechamento/${mes}?reaberto=1`);
}
