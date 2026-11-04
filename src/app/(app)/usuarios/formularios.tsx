"use client";

import { useActionState } from "react";
import { Aviso, Botao, Campo, Entrada, Selecao } from "@/components/ui";
import { BotaoEnviar } from "@/components/botao-enviar";
import { ESTADO_INICIAL, type EstadoAcao } from "@/lib/acoes";
import { NOMES_PERFIL, SENHA_MINIMA, type Perfil } from "@/lib/perfis";

type Acao = (e: EstadoAcao, f: FormData) => Promise<EstadoAcao>;

function Mensagem({ estado }: { estado: EstadoAcao }) {
  return estado.mensagem ? <Aviso tipo={estado.ok ? "sucesso" : "erro"}>{estado.mensagem}</Aviso> : null;
}

function SeletorPerfil({ valor }: { valor?: Perfil }) {
  return (
    <Selecao name="perfil" defaultValue={valor ?? "auditor"}>
      {(Object.keys(NOMES_PERFIL) as Perfil[]).map((p) => <option key={p} value={p}>{NOMES_PERFIL[p]}</option>)}
    </Selecao>
  );
}

function gerarSenha(): string {
  const c = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const a = new Uint32Array(10);
  crypto.getRandomValues(a);
  return Array.from(a, (n) => c[n % c.length]).join("");
}

function CampoSenha({ erro }: { erro?: string }) {
  return (
    <Campo rotulo="Senha inicial" erro={erro} ajuda={`Mínimo ${SENHA_MINIMA} caracteres. Anote e entregue ao usuário.`}>
      <div className="flex gap-2">
        <Entrada name="senha" required minLength={SENHA_MINIMA} autoComplete="new-password" />
        <Botao type="button" variante="secundario" onClick={(e) => {
          const input = (e.currentTarget.parentElement!.querySelector("input[name=senha]") as HTMLInputElement);
          input.value = gerarSenha();
        }}>Gerar</Botao>
      </div>
    </Campo>
  );
}

export function FormNovoUsuario({ acao }: { acao: Acao }) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  return (
    <form action={enviar} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Nome completo" erro={estado.erros?.nome}><Entrada name="nome" required /></Campo>
        <Campo rotulo="Login (usuário ou e-mail)" erro={estado.erros?.login} ajuda="Ex.: joao.silva — não pode ser alterado depois.">
          <Entrada name="login" required autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        </Campo>
        <Campo rotulo="Perfil" erro={estado.erros?.perfil}><SeletorPerfil /></Campo>
        <CampoSenha erro={estado.erros?.senha} />
      </div>
      <Mensagem estado={estado} />
      <BotaoEnviar>Criar usuário</BotaoEnviar>
    </form>
  );
}

export function FormEditarUsuario({ acao, nome, perfil, proprio }: { acao: Acao; nome: string; perfil: Perfil; proprio: boolean }) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  return (
    <form action={enviar} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Nome completo"><Entrada name="nome" defaultValue={nome} required /></Campo>
        <Campo rotulo="Perfil" ajuda={proprio ? "Você não pode alterar o seu próprio perfil." : undefined}>
          {proprio ? <><input type="hidden" name="perfil" value={perfil} /><Entrada value={NOMES_PERFIL[perfil]} disabled /></> : <SeletorPerfil valor={perfil} />}
        </Campo>
      </div>
      <Mensagem estado={estado} />
      <BotaoEnviar>Salvar</BotaoEnviar>
    </form>
  );
}

export function FormSituacao({ acao, ativo }: { acao: (e: EstadoAcao) => Promise<EstadoAcao>; ativo: boolean }) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  return (
    <form action={enviar} className="space-y-3" onSubmit={(e) => {
      if (ativo && !confirm("Desativar este usuário? Ele não conseguirá mais entrar. O histórico dele é mantido.")) e.preventDefault();
    }}>
      <Mensagem estado={estado} />
      <BotaoEnviar variante={ativo ? "perigo" : "primario"}>{ativo ? "Desativar usuário" : "Reativar usuário"}</BotaoEnviar>
    </form>
  );
}

export function FormSenha({ acao }: { acao: Acao }) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  return (
    <form action={enviar} className="space-y-3">
      <CampoSenha />
      <Mensagem estado={estado} />
      <BotaoEnviar variante="secundario">Redefinir senha</BotaoEnviar>
    </form>
  );
}
