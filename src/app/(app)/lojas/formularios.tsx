"use client";

import { useActionState, useEffect, useRef } from "react";
import { Aviso, Botao, Campo, Entrada, Selecao } from "@/components/ui";
import { BotaoEnviar } from "@/components/botao-enviar";
import { ESTADO_INICIAL, type EstadoAcao } from "@/lib/acoes";
import { MESES } from "@/lib/formato";

type Acao = (estado: EstadoAcao, form: FormData) => Promise<EstadoAcao>;

function Mensagem({ estado }: { estado: EstadoAcao }) {
  if (!estado.mensagem) return null;
  return <Aviso tipo={estado.ok ? "sucesso" : "erro"}>{estado.mensagem}</Aviso>;
}

export interface DadosLoja {
  luc: string;
  nome_fantasia: string;
  localizacao: string | null;
  segmento_id: number | null;
  auditada: boolean;
  ativa: boolean;
}

export function FormLoja({ acao, loja, segmentos, textoBotao }: {
  acao: Acao; loja?: DadosLoja; segmentos: { id: number; nome: string }[]; textoBotao: string;
}) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  return (
    <form action={enviar} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Nº LUC" erro={estado.erros?.luc} ajuda='Exatamente como no portal (ex.: "LJ 101/102/102A", "Q 001C").'>
          <Entrada name="luc" defaultValue={loja?.luc} required autoCapitalize="characters" />
        </Campo>
        <Campo rotulo="Nome fantasia" erro={estado.erros?.nome_fantasia}>
          <Entrada name="nome_fantasia" defaultValue={loja?.nome_fantasia} required />
        </Campo>
        <Campo rotulo="Localização">
          <Entrada name="localizacao" defaultValue={loja?.localizacao ?? ""} placeholder="Ex.: Piso L1 – corredor A" />
        </Campo>
        <Campo rotulo="Segmento (opcional)">
          <Selecao name="segmento_id" defaultValue={loja?.segmento_id ?? ""}>
            <option value="">— sem segmento —</option>
            {segmentos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </Selecao>
        </Campo>
      </div>
      <div className="flex flex-wrap gap-6">
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" name="auditada" defaultChecked={loja?.auditada ?? true} className="h-5 w-5" />
          Loja auditada (entra na auditoria diária)
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" name="ativa" defaultChecked={loja?.ativa ?? true} className="h-5 w-5" />
          Ativa (desmarque para inativar; o histórico é mantido)
        </label>
      </div>
      <Mensagem estado={estado} />
      <BotaoEnviar>{textoBotao}</BotaoEnviar>
    </form>
  );
}

function SeletorMesAno({ anoPadrao, mesPadrao }: { anoPadrao: number; mesPadrao: number }) {
  const anos = Array.from({ length: 8 }, (_, i) => anoPadrao - 4 + i);
  return (
    <>
      <Campo rotulo="Mês">
        <Selecao name="mes" defaultValue={mesPadrao}>
          {MESES.map((m, i) => <option key={m} value={i + 1}>{String(i + 1).padStart(2, "0")} – {m.slice(0, 3)}</option>)}
        </Selecao>
      </Campo>
      <Campo rotulo="Ano">
        <Selecao name="ano" defaultValue={anoPadrao}>
          {anos.map((a) => <option key={a}>{a}</option>)}
        </Selecao>
      </Campo>
    </>
  );
}

/** Formulário de nova vigência (percentual ou aluguel mínimo). Mesmo mês já cadastrado = correção do valor. */
export function FormVigencia({ acao, tipo, anoAtual, mesAtual }: {
  acao: Acao; tipo: "percentual" | "minimo"; anoAtual: number; mesAtual: number;
}) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const campo = form.current?.querySelector<HTMLInputElement>("input[name=valor]");
    if (estado.ok && campo) campo.value = "";
  }, [estado]);
  return (
    <form ref={form} action={enviar} className="space-y-3 rounded-lg bg-gray-50 p-3">
      <p className="text-sm font-medium text-gray-700">Nova vigência (ou correção de um mês já cadastrado)</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:items-end">
        <SeletorMesAno anoPadrao={anoAtual} mesPadrao={mesAtual} />
        <Campo rotulo={tipo === "percentual" ? "Percentual (%)" : "Valor (R$)"}>
          <Entrada name="valor" inputMode="decimal" placeholder={tipo === "percentual" ? "6,5" : "12.500,00"} required />
        </Campo>
        <BotaoEnviar>Salvar</BotaoEnviar>
      </div>
      <Mensagem estado={estado} />
    </form>
  );
}

export function Form13({ acao, anoAtual }: { acao: Acao; anoAtual: number }) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  const anos = Array.from({ length: 5 }, (_, i) => anoAtual - 2 + i);
  return (
    <form action={enviar} className="space-y-3 rounded-lg bg-gray-50 p-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:items-end">
        <Campo rotulo="Ano">
          <Selecao name="ano" defaultValue={anoAtual}>{anos.map((a) => <option key={a}>{a}</option>)}</Selecao>
        </Campo>
        <Campo rotulo="13º aluguel (R$)">
          <Entrada name="valor" inputMode="decimal" placeholder="25.000,00" required />
        </Campo>
        <BotaoEnviar>Salvar</BotaoEnviar>
      </div>
      <Mensagem estado={estado} />
    </form>
  );
}

export function BotaoExcluir({ acao, pergunta }: { acao: () => Promise<void>; pergunta: string }) {
  return (
    <form action={acao} onSubmit={(e) => { if (!confirm(pergunta)) e.preventDefault(); }}>
      <Botao variante="discreto" className="min-h-0 text-sm text-red-700">Excluir</Botao>
    </form>
  );
}
