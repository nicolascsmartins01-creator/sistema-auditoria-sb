"use client";

import { useActionState } from "react";
import { Aviso, Campo, Entrada } from "@/components/ui";
import { BotaoEnviar } from "@/components/botao-enviar";
import { ESTADO_INICIAL, type EstadoAcao } from "@/lib/acoes";

type Acao = (e: EstadoAcao, f: FormData) => Promise<EstadoAcao>;

export function FormFechar({ acao, rotulo, refechamento }: { acao: Acao; rotulo: string; refechamento: boolean }) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  return (
    <form action={enviar} className="space-y-3">
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirmo" value="sim" required className="mt-0.5 h-5 w-5" />
        <span>Confirmo o {refechamento ? "novo fechamento" : "fechamento"} de <strong>{rotulo}</strong>. O mês ficará bloqueado para lançamentos,
          edições e importação do informado, e o relatório será emitido como versão {refechamento ? "nova (as anteriores continuam consultáveis)" : "1"}.</span>
      </label>
      {estado.mensagem && <Aviso tipo={estado.ok ? "sucesso" : "erro"}>{estado.mensagem}</Aviso>}
      <BotaoEnviar variante="perigo">Realizar fechamento</BotaoEnviar>
    </form>
  );
}

export function FormReabrir({ acao }: { acao: Acao }) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  return (
    <form action={enviar} className="space-y-3">
      <Campo rotulo="Motivo da reabertura (obrigatório)">
        <Entrada name="motivo" required placeholder="Ex.: lojista enviou correção da venda informada" />
      </Campo>
      {estado.mensagem && <Aviso tipo={estado.ok ? "sucesso" : "erro"}>{estado.mensagem}</Aviso>}
      <BotaoEnviar variante="secundario">Reabrir o mês</BotaoEnviar>
    </form>
  );
}
