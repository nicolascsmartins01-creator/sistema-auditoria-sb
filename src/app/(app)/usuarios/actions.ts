"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { adminConfigurado, criarClienteAdmin, MSG_SEM_CHAVE_ADMIN } from "@/lib/supabase/admin";
import { exigirUsuario, PERFIS_ADMIN } from "@/lib/sessao";
import { mensagemErroBanco, type EstadoAcao } from "@/lib/acoes";
import { emailDoLogin, normalizarLogin, SENHA_MINIMA, validarLogin, type Perfil } from "@/lib/perfis";

const PERFIS: Perfil[] = ["auditor", "analista", "administrador"];
const BANIMENTO = "876000h"; // ~100 anos: login bloqueado enquanto desativado

export async function criarUsuario(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  await exigirUsuario(PERFIS_ADMIN);
  const nome = String(f.get("nome") ?? "").trim();
  const login = normalizarLogin(String(f.get("login") ?? ""));
  const perfil = String(f.get("perfil")) as Perfil;
  const senha = String(f.get("senha") ?? "");
  const erros: Record<string, string> = {};
  if (!nome) erros.nome = "Informe o nome.";
  const errLogin = validarLogin(login);
  if (errLogin) erros.login = errLogin;
  if (!PERFIS.includes(perfil)) erros.perfil = "Escolha o perfil.";
  if (senha.length < SENHA_MINIMA) erros.senha = `A senha deve ter pelo menos ${SENHA_MINIMA} caracteres.`;
  if (Object.keys(erros).length) return { erros, mensagem: "Corrija os campos destacados." };
  if (!adminConfigurado()) return { mensagem: MSG_SEM_CHAVE_ADMIN };

  const admin = criarClienteAdmin();
  const { data: criado, error: errAuth } = await admin.auth.admin.createUser({
    email: emailDoLogin(login), password: senha, email_confirm: true, user_metadata: { nome },
  });
  if (errAuth || !criado.user) {
    const msg = errAuth?.message ?? "";
    return { mensagem: /already|registered|exists/i.test(msg) ? "Já existe um usuário com este login." : `Não foi possível criar o login: ${msg}` };
  }
  // O registro do perfil é gravado com a sessão do Administrador (fica na trilha e passa pelas regras do banco).
  const sb = await criarClienteServidor();
  const { error } = await sb.from("usuarios").insert({ id: criado.user.id, nome, login, perfil });
  if (error) {
    await admin.auth.admin.deleteUser(criado.user.id);
    return { mensagem: mensagemErroBanco(error) };
  }
  revalidatePath("/usuarios");
  redirect(`/usuarios/${criado.user.id}?criado=1`);
}

export async function atualizarUsuario(id: string, _: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  await exigirUsuario(PERFIS_ADMIN);
  const nome = String(f.get("nome") ?? "").trim();
  const perfil = String(f.get("perfil")) as Perfil;
  if (!nome) return { mensagem: "Informe o nome." };
  if (!PERFIS.includes(perfil)) return { mensagem: "Perfil inválido." };
  const sb = await criarClienteServidor();
  const { error } = await sb.from("usuarios").update({ nome, perfil }).eq("id", id);
  if (error) return { mensagem: mensagemErroBanco(error) };
  revalidatePath(`/usuarios/${id}`);
  revalidatePath("/usuarios");
  return { ok: true, mensagem: "Dados salvos." };
}

export async function alterarSituacao(id: string, ativo: boolean): Promise<EstadoAcao> {
  await exigirUsuario(PERFIS_ADMIN);
  if (!adminConfigurado()) return { mensagem: MSG_SEM_CHAVE_ADMIN };
  const sb = await criarClienteServidor();
  const { data, error } = await sb.from("usuarios").update({ ativo }).eq("id", id).select("id");
  if (error) return { mensagem: mensagemErroBanco(error) };
  if (!data?.length) return { mensagem: "Usuário não encontrado." };
  // bloqueia (ou libera) o login no serviço de autenticação e encerra sessões abertas
  const admin = criarClienteAdmin();
  const { error: errBan } = await admin.auth.admin.updateUserById(id, { ban_duration: ativo ? "none" : BANIMENTO });
  revalidatePath(`/usuarios/${id}`);
  revalidatePath("/usuarios");
  if (errBan) return { mensagem: `Situação salva, mas o bloqueio de login falhou: ${errBan.message}. Tente novamente.` };
  return { ok: true, mensagem: ativo ? "Usuário reativado." : "Usuário desativado. Ele não consegue mais entrar; o histórico foi mantido." };
}

export async function redefinirSenha(id: string, _: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  await exigirUsuario(PERFIS_ADMIN);
  const senha = String(f.get("senha") ?? "");
  if (senha.length < SENHA_MINIMA) return { mensagem: `A senha deve ter pelo menos ${SENHA_MINIMA} caracteres.` };
  if (!adminConfigurado()) return { mensagem: MSG_SEM_CHAVE_ADMIN };
  const sb = await criarClienteServidor();
  // registra primeiro: a função do banco confere se quem pede é Administrador
  const { error: errLog } = await sb.rpc("registrar_evento", { p_acao: "SENHA_REDEFINIDA", p_tabela: "usuarios", p_registro_id: id });
  if (errLog) return { mensagem: mensagemErroBanco(errLog) };
  const { error } = await criarClienteAdmin().auth.admin.updateUserById(id, { password: senha });
  if (error) return { mensagem: `Não foi possível redefinir: ${error.message}` };
  return { ok: true, mensagem: "Senha redefinida. Informe a nova senha ao usuário." };
}
