import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/env";

/**
 * Cliente com a chave secreta (ignora RLS). Usado APENAS no servidor e APENAS
 * para operações do serviço de login que o usuário comum não pode fazer:
 * criar conta, redefinir senha, bloquear login de usuário desativado.
 * Nunca use para ler ou gravar dados de negócio.
 */
export function criarClienteAdmin() {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!chave) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada.");
  return createClient(SUPABASE_URL(), chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** A chave secreta está configurada? (sem ela, criar/desativar usuários não funciona) */
export function adminConfigurado(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export const MSG_SEM_CHAVE_ADMIN =
  "Configuração pendente: a chave secreta do Supabase (SUPABASE_SERVICE_ROLE_KEY) não está configurada no servidor.";
