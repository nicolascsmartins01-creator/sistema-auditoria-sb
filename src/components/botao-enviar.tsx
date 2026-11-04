"use client";

import { useFormStatus } from "react-dom";
import { Botao } from "@/components/ui";
import type { ComponentProps } from "react";

/** Botão de envio que se desabilita e mostra "Aguarde…" enquanto o formulário é processado. */
export function BotaoEnviar({ children, textoAguarde = "Aguarde…", ...p }: ComponentProps<typeof Botao> & { textoAguarde?: string }) {
  const { pending } = useFormStatus();
  return (
    <Botao type="submit" disabled={pending || p.disabled} {...p}>
      {pending ? textoAguarde : children}
    </Botao>
  );
}
