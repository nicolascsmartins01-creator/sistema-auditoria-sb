import { notFound } from "next/navigation";
import { exigirUsuario, PERFIS_ADMIN } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { DOMINIO_LOGIN_TECNICO, type Perfil } from "@/lib/perfis";
import { formatarDataHora } from "@/lib/formato";
import { Aviso, Cartao, Etiqueta, Titulo } from "@/components/ui";
import { ListaTrilha } from "@/components/lista-trilha";
import type { RegistroTrilha } from "@/lib/trilha";
import { FormEditarUsuario, FormSenha, FormSituacao } from "../formularios";
import { alterarSituacao, atualizarUsuario, redefinirSenha } from "../actions";

export default async function PaginaUsuario({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ criado?: string }>;
}) {
  const eu = await exigirUsuario(PERFIS_ADMIN);
  const { id } = await params;
  const { criado } = await searchParams;
  const sb = await criarClienteServidor();
  const [{ data: u }, { data: trilha }, { data: todos }] = await Promise.all([
    sb.from("usuarios").select("*").eq("id", id).maybeSingle(),
    sb.from("trilha_auditoria").select("*").eq("tabela", "usuarios").eq("registro_id", id).order("ocorrido_em", { ascending: false }).limit(50),
    sb.from("usuarios").select("id, nome"),
  ]);
  if (!u) notFound();
  const proprio = u.id === eu.id;

  return (
    <div className="space-y-5">
      <Titulo voltar={{ href: "/usuarios", texto: "Usuários" }}>
        {u.nome} {!u.ativo && <Etiqueta cor="vermelho">Desativado</Etiqueta>}
      </Titulo>
      {criado && <Aviso tipo="sucesso">Usuário criado. Entregue o login e a senha inicial a ele.</Aviso>}
      <Cartao titulo="Dados">
        <p className="mb-4 text-sm text-gray-600">
          Login: <strong>{u.login.replace(`@${DOMINIO_LOGIN_TECNICO}`, "")}</strong> · criado em {formatarDataHora(u.criado_em)}
        </p>
        <FormEditarUsuario acao={atualizarUsuario.bind(null, id)} nome={u.nome} perfil={u.perfil as Perfil} proprio={proprio} />
      </Cartao>
      {!proprio && (
        <div className="grid gap-5 md:grid-cols-2">
          <Cartao titulo="Senha"><FormSenha acao={redefinirSenha.bind(null, id)} /></Cartao>
          <Cartao titulo="Situação">
            <p className="mb-3 text-sm text-gray-600">
              {u.ativo ? "Ativo: pode entrar no sistema." : "Desativado: não consegue entrar. Todo o histórico dele é mantido."}
            </p>
            <FormSituacao acao={alterarSituacao.bind(null, id, !u.ativo)} ativo={u.ativo} />
          </Cartao>
        </div>
      )}
      <Cartao titulo="Histórico">
        <ListaTrilha registros={(trilha ?? []) as RegistroTrilha[]} usuarios={new Map((todos ?? []).map((x) => [x.id, x.nome]))} />
      </Cartao>
    </div>
  );
}
