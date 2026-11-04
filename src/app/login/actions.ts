"use server";

import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { emailDoLogin } from "@/lib/perfis";
import type { EstadoAcao } from "@/lib/acoes";

export async function entrar(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const login = String(form.get("login") ?? "").trim();
  const senha = String(form.get("senha") ?? "");
  if (!login || !senha) return { mensagem: "Informe usuário e senha." };

  const sb = await criarClienteServidor();
  const { data: sessao, error } = await sb.auth.signInWithPassword({ email: emailDoLogin(login), password: senha });
  if (error) {
    if (error.code === "user_banned") return { mensagem: "Usuário desativado. Procure o Administrador." };
    return { mensagem: "Usuário ou senha incorretos." };
  }
  const { data } = await sb.from("usuarios").select("ativo").eq("id", sessao.user.id).maybeSingle();
  if (!data?.ativo) {
    await sb.auth.signOut();
    return { mensagem: "Usuário desativado ou sem cadastro. Procure o Administrador." };
  }
  redirect("/");
}

export async function sair() {
  const sb = await criarClienteServidor();
  await sb.auth.signOut();
  redirect("/login");
}
