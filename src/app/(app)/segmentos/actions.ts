"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { exigirUsuario, PERFIS_ANALISTA } from "@/lib/sessao";
import { mensagemErroBanco, type EstadoAcao } from "@/lib/acoes";

export async function criarSegmento(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  await exigirUsuario(PERFIS_ANALISTA);
  const nome = String(f.get("nome") ?? "").trim().replace(/\s+/g, " ");
  if (!nome) return { mensagem: "Informe o nome do segmento." };
  const sb = await criarClienteServidor();
  const { error } = await sb.from("segmentos").insert({ nome });
  if (error) return { mensagem: mensagemErroBanco(error) };
  revalidatePath("/segmentos");
  return { ok: true, mensagem: `Segmento "${nome}" criado.` };
}

export async function renomearSegmento(id: number, _: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  await exigirUsuario(PERFIS_ANALISTA);
  const nome = String(f.get("nome") ?? "").trim().replace(/\s+/g, " ");
  if (!nome) return { mensagem: "Informe o nome." };
  const sb = await criarClienteServidor();
  const { error } = await sb.from("segmentos").update({ nome }).eq("id", id);
  if (error) return { mensagem: mensagemErroBanco(error) };
  revalidatePath("/segmentos");
  return { ok: true, mensagem: "Salvo." };
}

export async function alternarSegmento(id: number, ativo: boolean): Promise<void> {
  await exigirUsuario(PERFIS_ANALISTA);
  const sb = await criarClienteServidor();
  await sb.from("segmentos").update({ ativo }).eq("id", id);
  revalidatePath("/segmentos");
}
