"use client";

import { useActionState } from "react";
import { Aviso, Entrada } from "@/components/ui";
import { BotaoEnviar } from "@/components/botao-enviar";
import { ESTADO_INICIAL, type EstadoAcao } from "@/lib/acoes";

type Acao = (e: EstadoAcao, f: FormData) => Promise<EstadoAcao>;

export function FormSegmento({ acao, valor, textoBotao }: { acao: Acao; valor?: string; textoBotao: string }) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  return (
    <form action={enviar} className="flex-1 space-y-2">
      <div className="flex gap-2">
        <Entrada name="nome" defaultValue={valor} required aria-label="Nome do segmento" placeholder="Nome do segmento" />
        <BotaoEnviar variante={valor ? "secundario" : "primario"}>{textoBotao}</BotaoEnviar>
      </div>
      {estado.mensagem && !estado.ok && <Aviso tipo="erro">{estado.mensagem}</Aviso>}
    </form>
  );
}
