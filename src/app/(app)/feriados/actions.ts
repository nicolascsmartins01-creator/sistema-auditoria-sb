"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { exigirUsuario, PERFIS_ADMIN } from "@/lib/sessao";
import { mensagemErroBanco, type EstadoAcao } from "@/lib/acoes";

export async function incluirFeriado(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  await exigirUsuario(PERFIS_ADMIN);
  const data = String(f.get("data") ?? "");
  const descricao = String(f.get("descricao") ?? "").trim();
  const esfera = String(f.get("esfera") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { mensagem: "Informe a data." };
  if (!descricao) return { mensagem: "Informe a descrição." };
  if (!["nacional", "estadual", "municipal"].includes(esfera)) return { mensagem: "Escolha a esfera." };
  const sb = await criarClienteServidor();
  const { error } = await sb.from("feriados").insert({ data, descricao, esfera });
  if (error?.code === "23505") return { mensagem: "Já existe feriado nesta data." };
  if (error) return { mensagem: mensagemErroBanco(error) };
  revalidatePath("/feriados");
  return { ok: true, mensagem: "Feriado incluído. Os prazos de fechamento já consideram a nova data." };
}

export async function excluirFeriado(data: string): Promise<void> {
  await exigirUsuario(PERFIS_ADMIN);
  const sb = await criarClienteServidor();
  await sb.from("feriados").delete().eq("data", data);
  revalidatePath("/feriados");
}
