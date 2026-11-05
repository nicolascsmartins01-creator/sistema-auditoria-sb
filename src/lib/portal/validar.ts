/**
 * Conferência do PDF do portal antes de gravar (função pura).
 * Erros (bloqueiam): soma das linhas ≠ TOTAL, período que não é um mês
 * inteiro, mês do cabeçalho diferente do período, LUC repetida, linha com
 * valor que não pôde ser lida, nenhuma linha.
 * Avisos (não bloqueiam, mas aparecem): LUC não cadastrada, LUC de loja
 * inativa, loja ativa cadastrada que não aparece no PDF.
 */
import { formatarMoeda } from "@/lib/formato";
import type { ResultadoPdf } from "./ler-pdf";

type PdfOk = Extract<ResultadoPdf, { ok: true }>;

export interface LojaCadastro { id: string; luc: string; nome: string; ativa: boolean }
export interface MesExistente { totalCentavos: number; linhas: number; importadoEm: string; arquivo: string }

export type SituacaoLinha = "ok" | "sem_cadastro" | "inativa";

export interface LinhaPrevia {
  luc: string; nome: string; centavos: number; pagina: number;
  loja: { id: string; nome: string } | null;
  situacao: SituacaoLinha;
}

export interface PreviaPortal {
  erros: string[];
  avisos: string[];
  competencia: string;          // aaaa-mm-01
  ano: number; mes: number; rotulo: string;
  inicio: string; fim: string;
  totalCentavos: number; somaCentavos: number;
  linhas: LinhaPrevia[];
  lojasAusentes: { luc: string; nome: string }[];
  existente: MesExistente | null;
  podeImportar: boolean;
}

const dataBR = (iso: string) => iso.split("-").reverse().join("/");
const resumirLista = (itens: string[], max = 10) =>
  itens.slice(0, max).join("; ") + (itens.length > max ? `; e mais ${itens.length - max}` : "");

export function validarPdfPortal(r: PdfOk, cadastro: LojaCadastro[], existente: MesExistente | null): PreviaPortal {
  const erros: string[] = [];
  const avisos: string[] = [];
  const mm = String(r.mes).padStart(2, "0");
  const competencia = `${r.ano}-${mm}-01`;
  const ultimoDia = `${r.ano}-${mm}-${String(new Date(Date.UTC(r.ano, r.mes, 0)).getUTCDate()).padStart(2, "0")}`;

  if (r.mes < 1) erros.push(`Mês do cabeçalho da tabela não reconhecido: "${r.rotuloMes}".`);
  if (r.inicio !== competencia || r.fim !== ultimoDia) {
    erros.push(`O período do PDF (${dataBR(r.inicio)} a ${dataBR(r.fim)}) não corresponde ao mês inteiro de ${r.rotuloMes} (${dataBR(competencia)} a ${dataBR(ultimoDia)}).`);
  }
  if (!r.linhas.length) erros.push("Nenhuma linha de loja encontrada no PDF.");
  for (const t of r.linhasNaoReconhecidas) erros.push(`Linha não reconhecida no PDF: "${t}".`);

  const soma = r.linhas.reduce((s, l) => s + l.centavos, 0);
  if (soma !== r.totalCentavos) {
    erros.push(`A soma das linhas (${formatarMoeda(soma / 100)}) não bate com a linha TOTAL do PDF (${formatarMoeda(r.totalCentavos / 100)}): diferença de ${formatarMoeda((soma - r.totalCentavos) / 100)}. Importação recusada.`);
  }

  const vistos = new Map<string, number>();
  for (const l of r.linhas) vistos.set(l.luc, (vistos.get(l.luc) ?? 0) + 1);
  const repetidas = [...vistos].filter(([, n]) => n > 1).map(([luc]) => luc);
  if (repetidas.length) erros.push(`LUC repetida no PDF: ${repetidas.join(", ")}.`);

  // a loja ativa com a LUC tem prioridade (mesma regra do cadastro)
  const porLuc = new Map<string, LojaCadastro>();
  for (const c of cadastro) {
    const atual = porLuc.get(c.luc);
    if (!atual || (!atual.ativa && c.ativa)) porLuc.set(c.luc, c);
  }

  const linhas: LinhaPrevia[] = r.linhas.map((l) => {
    const c = porLuc.get(l.luc);
    return {
      ...l,
      loja: c ? { id: c.id, nome: c.nome } : null,
      situacao: !c ? "sem_cadastro" : c.ativa ? "ok" : "inativa",
    };
  });

  const semCadastro = linhas.filter((l) => l.situacao === "sem_cadastro");
  if (semCadastro.length) {
    avisos.push(`${semCadastro.length} LUC(s) do PDF não estão cadastradas: ${resumirLista(semCadastro.map((l) => `${l.luc} (${l.nome})`))}. ` +
      "Veja todas no filtro “LUC não cadastrada” abaixo. Os valores serão guardados com a LUC e ligados à loja quando ela for cadastrada.");
  }
  const inativas = linhas.filter((l) => l.situacao === "inativa");
  if (inativas.length) avisos.push(`${inativas.length} LUC(s) do PDF pertencem a loja(s) inativa(s): ${resumirLista(inativas.map((l) => l.luc))}.`);

  const lucsPdf = new Set(r.linhas.map((l) => l.luc));
  const lojasAusentes = cadastro.filter((c) => c.ativa && !lucsPdf.has(c.luc)).map((c) => ({ luc: c.luc, nome: c.nome }));
  if (lojasAusentes.length) {
    avisos.push(`${lojasAusentes.length} loja(s) ativa(s) do cadastro não aparecem no PDF: ${resumirLista(lojasAusentes.map((l) => `${l.luc} (${l.nome})`), 20)}.`);
  }
  if (existente) {
    avisos.push(`Já existe venda informada de ${r.rotuloMes} (arquivo "${existente.arquivo}", total ${formatarMoeda(existente.totalCentavos / 100)}). ` +
      "Para gravar este arquivo é preciso confirmar a substituição; a versão anterior fica registrada no histórico.");
  }

  return {
    erros, avisos, competencia, ano: r.ano, mes: r.mes, rotulo: r.rotuloMes, inicio: r.inicio, fim: r.fim,
    totalCentavos: r.totalCentavos, somaCentavos: soma, linhas, lojasAusentes, existente,
    podeImportar: erros.length === 0,
  };
}
