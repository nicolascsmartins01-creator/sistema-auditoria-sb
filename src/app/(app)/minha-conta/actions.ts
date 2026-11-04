"use server";

import { criarClienteServidor } from "@/lib/supabase/servidor";
import { exigirUsuario } from "@/lib/sessao";
import { SENHA_MINIMA } from "@/lib/perfis";
import type { EstadoAcao } from "@/lib/acoes";

export async function alterarMinhaSenha(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const u = await exigirUsuario();
  const atual = String(f.get("atual") ?? "");
  const nova = String(f.get("nova") ?? "");
  const confirma = String(f.get("confirma") ?? "");
  if (nova.length < SENHA_MINIMA) return { mensagem: `A nova senha deve ter pelo menos ${SENHA_MINIMA} caracteres.` };
  if (nova !== confirma) return { mensagem: "A confirmação não confere com a nova senha." };
  const sb = await criarClienteServidor();
  const { data: { user } } = await sb.auth.getUser();
  // confere a senha atual antes de trocar
  const { error: errAtual } = await sb.auth.signInWithPassword({ email: user!.email!, password: atual });
  if (errAtual) return { mensagem: "Senha atual incorreta." };
  const { error } = await sb.auth.updateUser({ password: nova });
  if (error) return { mensagem: `Não foi possível alterar: ${error.message}` };
  await sb.rpc("registrar_evento", { p_acao: "SENHA_ALTERADA", p_tabela: "usuarios", p_registro_id: u.id });
  return { ok: true, mensagem: "Senha alterada." };
}
