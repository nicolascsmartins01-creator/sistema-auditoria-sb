"use client";

import { useActionState } from "react";
import { Aviso, Campo, Entrada } from "@/components/ui";
import { BotaoEnviar } from "@/components/botao-enviar";
import { ESTADO_INICIAL, type EstadoAcao } from "@/lib/acoes";

type Acao = (e: EstadoAcao, f: FormData) => Promise<EstadoAcao>;

export function FormEditarLancamento({ acao, valor }: { acao: Acao; valor: string }) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  return (
    <form action={enviar} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Novo valor (R$)"><Entrada name="valor" inputMode="decimal" defaultValue={valor} required /></Campo>
        <Campo rotulo="Motivo da edição (obrigatório)"><Entrada name="motivo" required placeholder="Ex.: valor conferido na foto do caixa 2" /></Campo>
      </div>
      {estado.mensagem && <Aviso tipo={estado.ok ? "sucesso" : "erro"}>{estado.mensagem}</Aviso>}
      <BotaoEnviar>Salvar edição</BotaoEnviar>
    </form>
  );
}

export function FormAnalise({ aprovar, recusar }: { aprovar: Acao; recusar: Acao }) {
  const [e1, a1] = useActionState(aprovar, ESTADO_INICIAL);
  const [e2, a2] = useActionState(recusar, ESTADO_INICIAL);
  const estado = e1.mensagem ? e1 : e2;
  return (
    <form className="space-y-3">
      <Campo rotulo="Motivo (obrigatório)"><Entrada name="motivo" required placeholder="Ex.: auditor sem internet no fim de semana" /></Campo>
      {estado.mensagem && <Aviso tipo={estado.ok ? "sucesso" : "erro"}>{estado.mensagem}</Aviso>}
      <div className="flex flex-wrap gap-3">
        <BotaoEnviar formAction={a1}>Aprovar (passa a valer)</BotaoEnviar>
        <BotaoEnviar formAction={a2} variante="perigo">Recusar</BotaoEnviar>
      </div>
    </form>
  );
}
