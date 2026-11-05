"use client";

import { useActionState } from "react";
import { Aviso, Campo, Entrada, Selecao } from "@/components/ui";
import { BotaoEnviar } from "@/components/botao-enviar";
import { ESTADO_INICIAL, type EstadoAcao } from "@/lib/acoes";

export function FormFeriado({ acao }: { acao: (e: EstadoAcao, f: FormData) => Promise<EstadoAcao> }) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  return (
    <form action={enviar} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr_10rem_auto] sm:items-end">
        <Campo rotulo="Data"><Entrada type="date" name="data" required /></Campo>
        <Campo rotulo="Descrição"><Entrada name="descricao" required placeholder="Ex.: Carnaval (ponto facultativo)" /></Campo>
        <Campo rotulo="Esfera">
          <Selecao name="esfera" defaultValue="municipal">
            <option value="nacional">Nacional</option><option value="estadual">Estadual (CE)</option><option value="municipal">Municipal (Fortaleza)</option>
          </Selecao>
        </Campo>
        <BotaoEnviar>Incluir</BotaoEnviar>
      </div>
      {estado.mensagem && <Aviso tipo={estado.ok ? "sucesso" : "erro"}>{estado.mensagem}</Aviso>}
    </form>
  );
}
