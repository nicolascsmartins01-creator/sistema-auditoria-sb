/**
 * Prepara um banco de teste do zero: imitação do Supabase + migrações + dados
 * fictícios + 3 usuários (um de cada perfil) e um usuário desativado.
 * Conexão: variável TEST_DATABASE_URL (padrão: Postgres local na porta 54329).
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const URL_BASE = process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:54329/postgres";
const NOME_BANCO = "auditoria_teste";

export const USUARIOS = {
  admin: "00000000-0000-4000-8000-000000000001",
  analista: "00000000-0000-4000-8000-000000000002",
  auditor: "00000000-0000-4000-8000-000000000003",
  inativo: "00000000-0000-4000-8000-000000000004",
} as const;

export async function criarBancoTeste(): Promise<Client> {
  const adm = new Client({ connectionString: URL_BASE });
  await adm.connect();
  await adm.query(`drop database if exists ${NOME_BANCO} with (force)`);
  await adm.query(`create database ${NOME_BANCO}`);
  await adm.end();

  const url = new URL(URL_BASE);
  url.pathname = "/" + NOME_BANCO;
  const db = new Client({ connectionString: url.toString() });
  await db.connect();
  await db.query(readFileSync(path.join(RAIZ, "test/db/supabase-shim.sql"), "utf8"));
  const dir = path.join(RAIZ, "supabase/migrations");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.query(readFileSync(path.join(dir, f), "utf8"));
  }
  await db.query(readFileSync(path.join(RAIZ, "supabase/seed.sql"), "utf8"));
  await db.query(`
    insert into auth.users (id, email) values
      ('${USUARIOS.admin}', 'admin@teste'), ('${USUARIOS.analista}', 'analista@teste'),
      ('${USUARIOS.auditor}', 'auditor@teste'), ('${USUARIOS.inativo}', 'inativo@teste');
    insert into public.usuarios (id, nome, login, perfil, ativo) values
      ('${USUARIOS.admin}', 'Admin Teste', 'admin.teste', 'administrador', true),
      ('${USUARIOS.analista}', 'Analista Teste', 'analista.teste', 'analista', true),
      ('${USUARIOS.auditor}', 'Auditor Teste', 'auditor.teste', 'auditor', true),
      ('${USUARIOS.inativo}', 'Inativo Teste', 'inativo.teste', 'analista', false);
  `);
  return db;
}

/**
 * Executa consultas como se fosse o usuário logado (mesmo mecanismo do Supabase:
 * papel "authenticated" + identificação no token). Tudo é desfeito ao final.
 */
export async function como<T>(db: Client, usuarioId: string, fn: (q: Client["query"]) => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: usuarioId, role: "authenticated" })]);
    return await fn(db.query.bind(db) as Client["query"]);
  } finally {
    await db.query("rollback");
  }
}

/** Igual a `como`, mas confirma (commit) as alterações. */
export async function comoConfirmando<T>(db: Client, usuarioId: string, fn: (q: Client["query"]) => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: usuarioId, role: "authenticated" })]);
    const r = await fn(db.query.bind(db) as Client["query"]);
    await db.query("commit");
    return r;
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}
