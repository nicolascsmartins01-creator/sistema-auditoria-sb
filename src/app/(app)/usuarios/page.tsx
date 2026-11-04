import Link from "next/link";
import { exigirUsuario, PERFIS_ADMIN } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { NOMES_PERFIL, DOMINIO_LOGIN_TECNICO, type Perfil } from "@/lib/perfis";
import { formatarData } from "@/lib/formato";
import { Cartao, Etiqueta, Titulo } from "@/components/ui";
import { FormNovoUsuario } from "./formularios";
import { criarUsuario } from "./actions";

export default async function PaginaUsuarios() {
  await exigirUsuario(PERFIS_ADMIN);
  const sb = await criarClienteServidor();
  const { data } = await sb.from("usuarios").select("id, nome, login, perfil, ativo, criado_em").order("nome");
  const usuarios = data ?? [];

  return (
    <>
      <Titulo>Usuários</Titulo>
      <div className="space-y-5">
        <Cartao titulo={`Usuários cadastrados (${usuarios.length})`}>
          <ul className="divide-y divide-gray-100">
            {usuarios.map((u) => (
              <li key={u.id}>
                <Link href={`/usuarios/${u.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 hover:bg-azul-claro">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{u.nome}</span>
                    <span className="block text-sm text-gray-500">{u.login.replace(`@${DOMINIO_LOGIN_TECNICO}`, "")}</span>
                  </span>
                  <Etiqueta cor={u.perfil === "administrador" ? "azul" : u.perfil === "analista" ? "amarelo" : "cinza"}>
                    {NOMES_PERFIL[u.perfil as Perfil]}
                  </Etiqueta>
                  {!u.ativo && <Etiqueta cor="vermelho">Desativado</Etiqueta>}
                  <span className="text-xs text-gray-500">desde {formatarData(u.criado_em)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Cartao>
        <Cartao titulo="Novo usuário">
          <FormNovoUsuario acao={criarUsuario} />
        </Cartao>
        <Cartao titulo="O que cada perfil pode fazer">
          <ul className="space-y-2 text-sm text-gray-700">
            <li><strong>Auditor:</strong> busca loja, vê o calendário e lança a venda auditada (valor e fotos). Não vê valores informados, alertas nem conciliação.</li>
            <li><strong>Analista:</strong> tudo do Auditor, mais cadastro de lojas, importações, edição de lançamentos, conciliação, alertas, relatórios e fechamento.</li>
            <li><strong>Administrador:</strong> tudo do Analista, mais usuários e feriados.</li>
          </ul>
        </Cartao>
      </div>
    </>
  );
}
