"use client";

import { useActionState } from "react";
import { alterarMinhaSenha } from "./actions";
import { Aviso, Campo, Cartao, Entrada, Titulo } from "@/components/ui";
import { BotaoEnviar } from "@/components/botao-enviar";
import { ESTADO_INICIAL } from "@/lib/acoes";

export default function MinhaConta() {
  const [estado, enviar] = useActionState(alterarMinhaSenha, ESTADO_INICIAL);
  return (
    <>
      <Titulo>Minha conta</Titulo>
      <Cartao titulo="Alterar minha senha" className="max-w-md">
        <form action={enviar} className="space-y-4">
          <Campo rotulo="Senha atual"><Entrada name="atual" type="password" autoComplete="current-password" required /></Campo>
          <Campo rotulo="Nova senha"><Entrada name="nova" type="password" autoComplete="new-password" required /></Campo>
          <Campo rotulo="Confirme a nova senha"><Entrada name="confirma" type="password" autoComplete="new-password" required /></Campo>
          {estado.mensagem && <Aviso tipo={estado.ok ? "sucesso" : "erro"}>{estado.mensagem}</Aviso>}
          <BotaoEnviar>Alterar senha</BotaoEnviar>
        </form>
      </Cartao>
    </>
  );
}
