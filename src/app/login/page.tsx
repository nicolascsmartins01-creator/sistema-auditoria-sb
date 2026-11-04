"use client";

import { useActionState } from "react";
import { entrar } from "./actions";
import { Aviso, Campo, Entrada } from "@/components/ui";
import { BotaoEnviar } from "@/components/botao-enviar";
import { ESTADO_INICIAL } from "@/lib/acoes";

export default function PaginaLogin() {
  const [estado, acao] = useActionState(entrar, ESTADO_INICIAL);
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-sm font-medium uppercase tracking-wide text-azul">Shopping Benfica</p>
          <h1 className="text-2xl font-bold text-gray-900">Auditoria de Vendas</h1>
        </div>
        <form action={acao} className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <Campo rotulo="Usuário ou e-mail">
            <Entrada name="login" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required autoFocus />
          </Campo>
          <Campo rotulo="Senha">
            <Entrada name="senha" type="password" autoComplete="current-password" required />
          </Campo>
          {estado.mensagem && <Aviso tipo="erro">{estado.mensagem}</Aviso>}
          <BotaoEnviar className="w-full" textoAguarde="Entrando…">Entrar</BotaoEnviar>
          <p className="text-center text-xs text-gray-500">Esqueceu a senha? Peça ao Administrador para redefini-la.</p>
        </form>
      </div>
    </main>
  );
}
