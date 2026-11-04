"use client";

import { useEffect, useState } from "react";
import { hojeFortaleza } from "@/lib/formato";
import { diaPadrao } from "@/lib/prazos";
import { SeletorLoja } from "./seletor-loja";
import { Calendario } from "./calendario";
import { FormLancamento } from "./form-lancamento";
import { DetalheDia } from "./detalhe-dia";

export interface LojaLanc { id: string; luc: string; nome: string; localizacao: string | null }

/** Informação de um dia já lançado (vinda do servidor ou da fila do aparelho). */
export interface InfoDia {
  situacao: "valido" | "em_analise" | "pendente_envio";
  auditor_nome: string | null;
  proprio: boolean;
  lancamento_id: string | null;
  valor: number | null;
}

type Passo =
  | { tela: "loja" }
  | { tela: "calendario"; lojaId: string; mes: string; aviso?: string }
  | { tela: "valor"; lojaId: string; dia: string }
  | { tela: "detalhe"; lojaId: string; dia: string; info: InfoDia };

const CHAVE_ULTIMA = "auditoria:ultima-loja";

function lerUltima(): string | null {
  try { return localStorage.getItem(CHAVE_ULTIMA); } catch { return null; }
}

/**
 * Fluxo do auditor numa única tela (funciona sem internet depois de aberta):
 * 1. loja → 2. calendário → 3. valor + fotos → confirmação → volta ao calendário.
 * Os passos ficam no histórico do navegador: o botão "voltar" do celular funciona.
 */
export function AppLancamento({ lojas, podeEditar }: { lojas: LojaLanc[]; podeEditar: boolean }) {
  const [passo, setPasso] = useState<Passo>({ tela: "loja" });
  const [ultima, setUltima] = useState<string | null>(null);
  const hoje = hojeFortaleza();

  useEffect(() => {
    setUltima(lerUltima());
    const inicial = (history.state?.passo as Passo | undefined) ?? { tela: "loja" };
    setPasso(inicial);
    history.replaceState({ ...history.state, passo: inicial }, "");
    const voltar = (e: PopStateEvent) => setPasso((e.state?.passo as Passo) ?? { tela: "loja" });
    window.addEventListener("popstate", voltar);
    return () => window.removeEventListener("popstate", voltar);
  }, []);

  function ir(p: Passo, substituir = false) {
    setPasso(p);
    window.scrollTo(0, 0);
    if (substituir) history.replaceState({ ...history.state, passo: p }, "");
    else history.pushState({ ...history.state, passo: p }, "");
  }

  function escolherLoja(id: string) {
    try { localStorage.setItem(CHAVE_ULTIMA, id); } catch { /* sem armazenamento: ignora */ }
    setUltima(id);
    ir({ tela: "calendario", lojaId: id, mes: diaPadrao(hoje).slice(0, 7) });
  }

  const loja = "lojaId" in passo ? lojas.find((l) => l.id === passo.lojaId) : undefined;
  if (passo.tela !== "loja" && !loja) {
    return <SeletorLoja lojas={lojas} ultimaId={ultima} onEscolher={escolherLoja} />;
  }

  switch (passo.tela) {
    case "loja":
      return <SeletorLoja lojas={lojas} ultimaId={ultima} onEscolher={escolherLoja} />;
    case "calendario":
      return (
        <Calendario loja={loja!} mes={passo.mes} hoje={hoje} aviso={passo.aviso}
          onTrocarLoja={() => ir({ tela: "loja" })}
          onMes={(mes) => ir({ tela: "calendario", lojaId: loja!.id, mes }, true)}
          onLancar={(dia) => ir({ tela: "valor", lojaId: loja!.id, dia })}
          onDetalhe={(dia, info) => ir({ tela: "detalhe", lojaId: loja!.id, dia, info })} />
      );
    case "valor":
      return (
        <FormLancamento loja={loja!} dia={passo.dia} onCancelar={() => history.back()}
          onConcluido={(aviso) => ir({ tela: "calendario", lojaId: loja!.id, mes: passo.dia.slice(0, 7), aviso }, true)} />
      );
    case "detalhe":
      return <DetalheDia loja={loja!} dia={passo.dia} info={passo.info} podeEditar={podeEditar} onVoltar={() => history.back()} />;
  }
}
