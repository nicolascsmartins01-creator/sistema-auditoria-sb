import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Perfil } from "@/lib/perfis";

export interface UsuarioAtual {
  id: string;
  nome: string;
  login: string;
  perfil: Perfil;
}

/** Usuário logado e ATIVO (ou null). Uma consulta por requisição. */
export const usuarioAtual = cache(async (): Promise<UsuarioAtual | null> => {
  const sb = await criarClienteServidor();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb
    .from("usuarios")
    .select("id, nome, login, perfil, ativo")
    .eq("id", user.id)
    .maybeSingle();
  if (!data || !data.ativo) return null;
  return { id: data.id, nome: data.nome, login: data.login, perfil: data.perfil as Perfil };
});

/**
 * Exige login (e, opcionalmente, um dos perfis). Usado nas páginas e ações.
 * Obs.: é uma camada a mais — a proteção definitiva está nas regras do banco.
 */
export async function exigirUsuario(perfis?: Perfil[]): Promise<UsuarioAtual> {
  const u = await usuarioAtual();
  if (!u) redirect("/login");
  if (perfis && !perfis.includes(u.perfil)) redirect("/?aviso=sem-permissao");
  return u;
}

export const PERFIS_ANALISTA: Perfil[] = ["analista", "administrador"];
export const PERFIS_ADMIN: Perfil[] = ["administrador"];
