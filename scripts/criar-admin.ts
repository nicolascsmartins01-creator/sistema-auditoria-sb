/**
 * Cria o PRIMEIRO Administrador num projeto Supabase novo (produção ou homologação).
 * Uso (no computador de quem faz a implantação, nunca no navegador):
 *
 *   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/criar-admin.ts "Nome Completo" login.do.admin "SenhaForte123"
 *
 * Depois disso, os demais usuários são criados pela tela Usuários.
 */
import { createClient } from "@supabase/supabase-js";
import { emailDoLogin, normalizarLogin, SENHA_MINIMA, validarLogin } from "../src/lib/perfis";

async function main() {
  const [nome, loginBruto, senha] = process.argv.slice(2);
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!nome || !loginBruto || !senha) throw new Error('Uso: npx tsx scripts/criar-admin.ts "Nome" login senha');
  if (!url || !chave) throw new Error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  const login = normalizarLogin(loginBruto);
  const erroLogin = validarLogin(login);
  if (erroLogin) throw new Error(erroLogin);
  if (senha.length < SENHA_MINIMA) throw new Error(`Senha com menos de ${SENHA_MINIMA} caracteres.`);

  const sb = createClient(url, chave, { auth: { persistSession: false } });
  const { count } = await sb.from("usuarios").select("*", { count: "exact", head: true }).eq("perfil", "administrador");
  if (count) throw new Error("Já existe Administrador. Crie novos usuários pela tela Usuários.");

  const { data, error } = await sb.auth.admin.createUser({ email: emailDoLogin(login), password: senha, email_confirm: true, user_metadata: { nome } });
  if (error || !data.user) throw new Error(error?.message ?? "falha ao criar login");
  const { error: e2 } = await sb.from("usuarios").insert({ id: data.user.id, nome, login, perfil: "administrador" });
  if (e2) {
    await sb.auth.admin.deleteUser(data.user.id);
    throw new Error(e2.message);
  }
  console.log(`Administrador "${nome}" criado. Login: ${login}`);
}

main().catch((e) => { console.error("Erro:", e.message); process.exit(1); });
