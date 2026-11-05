/**
 * Leitura do PDF mensal do portal (E.net / Ease Controller) pelo TEXTO do
 * arquivo — sem OCR e sem IA.
 *
 * Como funciona:
 *  1. Extrai os pedaços de texto de cada página com a posição (x, y).
 *  2. Agrupa em linhas pela altura (y) e ordena da esquerda para a direita.
 *  3. Em cada página acha o cabeçalho "Nº LUC | NOME FANTASIA | MÊS/ANO" e usa
 *     a posição das colunas para separar LUC, nome e valor de cada linha.
 *  4. Lê o período ("Data Início: ...; Data Término: ...") e a linha "TOTAL:".
 * A conferência (soma × TOTAL, lojas) fica em validar.ts.
 */
import { getDocumentProxy } from "unpdf";
import { lerNumeroBR } from "@/lib/formato";

export interface LinhaPdf { luc: string; nome: string; centavos: number; pagina: number }

export type ResultadoPdf =
  | {
      ok: true;
      inicio: string; fim: string;          // aaaa-mm-dd
      rotuloMes: string;                    // ex.: SET/2026
      ano: number; mes: number;
      linhas: LinhaPdf[];
      totalCentavos: number;
      paginas: number;
      linhasNaoReconhecidas: string[];      // linhas com valor que não puderam ser lidas
    }
  | { ok: false; erro: string };

interface Pedaco { texto: string; x: number; y: number; fim: number }

export const ABREV_MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
const RE_VALOR = /^-?\d{1,3}(\.\d{3})*,\d{2}$/;
const RE_MES = /^([A-ZÇ]{3})\/(\d{4})$/;
const RE_PERIODO = /Data\s+In[íi]cio:?\s*(\d{2})\/(\d{2})\/(\d{4}).*?Data\s+T[ée]rmino:?\s*(\d{2})\/(\d{2})\/(\d{4})/i;

const centavosDe = (t: string) => Math.round((lerNumeroBR(t) as number) * 100);
const normalizar = (s: string) => s.replace(/\s+/g, " ").trim();

/** Agrupa os pedaços em linhas (tolerância de 2,5 pontos na altura). */
function agruparLinhas(pedacos: Pedaco[]): Pedaco[][] {
  const ordenados = [...pedacos].sort((a, b) => b.y - a.y || a.x - b.x);
  const linhas: Pedaco[][] = [];
  for (const p of ordenados) {
    const ultima = linhas.at(-1);
    if (ultima && Math.abs(ultima[0].y - p.y) <= 2.5) ultima.push(p);
    else linhas.push([p]);
  }
  return linhas.map((l) => l.sort((a, b) => a.x - b.x));
}

/** Junta pedaços vizinhos de uma linha numa string (com espaço onde há distância). */
function juntar(ps: Pedaco[]): string {
  let s = "";
  let fimAnterior: number | null = null;
  for (const p of ps) {
    if (fimAnterior !== null && p.x - fimAnterior > 1) s += " ";
    s += p.texto;
    fimAnterior = p.fim;
  }
  return normalizar(s);
}

export async function lerPdfPortal(conteudo: Uint8Array): Promise<ResultadoPdf> {
  let doc;
  try {
    doc = await getDocumentProxy(new Uint8Array(conteudo));
  } catch {
    return { ok: false, erro: "Não foi possível abrir o arquivo. Confira se é o PDF do portal." };
  }

  let periodo: RegExpExecArray | null = null;
  let rotuloMes: string | null = null;
  let totalCentavos: number | null = null;
  const linhas: LinhaPdf[] = [];
  const naoReconhecidas: string[] = [];
  let textoTotal = 0;

  for (let n = 1; n <= doc.numPages; n++) {
    const pagina = await doc.getPage(n);
    const conteudoPg = await pagina.getTextContent();
    const pedacos: Pedaco[] = [];
    for (const it of conteudoPg.items as { str?: string; transform?: number[]; width?: number }[]) {
      if (!it.str || !it.transform || !it.str.trim()) continue;
      pedacos.push({ texto: it.str, x: it.transform[4], y: it.transform[5], fim: it.transform[4] + (it.width ?? 0) });
    }
    textoTotal += pedacos.length;
    const lns = agruparLinhas(pedacos);

    // colunas pelo cabeçalho da página
    let xNome: number | null = null;
    let xValor: number | null = null;
    let iCab = -1;
    lns.forEach((l, i) => {
      const t = juntar(l).toUpperCase();
      if (iCab < 0 && t.includes("LUC") && t.includes("NOME FANTASIA")) {
        iCab = i;
        const pNome = l.find((p) => p.texto.toUpperCase().includes("NOME"));
        const pMes = l.find((p) => RE_MES.test(p.texto.trim().toUpperCase()));
        xNome = pNome?.x ?? null;
        xValor = pMes ? pMes.x : null;
        if (pMes) rotuloMes ??= pMes.texto.trim().toUpperCase();
      }
      if (!periodo) periodo = RE_PERIODO.exec(juntar(l));
    });

    for (let i = iCab + 1; i < lns.length && iCab >= 0; i++) {
      const l = lns[i];
      const t = juntar(l);
      const ultimo = l.at(-1)!;
      const temValor = RE_VALOR.test(ultimo.texto.trim());
      if (/^TOTAL\b/i.test(t)) {
        if (temValor) totalCentavos = centavosDe(ultimo.texto.trim());
        else naoReconhecidas.push(t);
        continue;
      }
      if (!temValor) continue; // rodapé, linhas sem valor
      const resto = l.slice(0, -1);
      const limiteNome = (xNome ?? 0) - 2;
      const luc = juntar(resto.filter((p) => p.x < limiteNome));
      const nome = juntar(resto.filter((p) => p.x >= limiteNome && (xValor === null || p.x < xValor - 2 || p.fim < xValor)));
      if (!luc) { naoReconhecidas.push(t); continue; }
      linhas.push({ luc, nome, centavos: centavosDe(ultimo.texto.trim()), pagina: n });
    }
  }

  if (!textoTotal) return { ok: false, erro: "O PDF não tem texto (parece ser uma imagem/escaneado). Use o PDF gerado pelo portal." };
  if (!periodo) return { ok: false, erro: 'Não encontrei o período no cabeçalho ("Data Início: ...; Data Término: ...").' };
  if (!rotuloMes) return { ok: false, erro: 'Não encontrei o cabeçalho da tabela ("Nº LUC | NOME FANTASIA | MÊS/ANO").' };
  if (totalCentavos === null) return { ok: false, erro: 'Não encontrei a linha "TOTAL:" no final do relatório.' };

  const [, d1, m1, a1, d2, m2, a2] = periodo as RegExpExecArray;
  const inicio = `${a1}-${m1}-${d1}`;
  const fim = `${a2}-${m2}-${d2}`;
  const mr = RE_MES.exec(rotuloMes as string)!;
  const mes = ABREV_MESES.indexOf(mr[1]) + 1;
  const ano = Number(mr[2]);
  return {
    ok: true, inicio, fim, rotuloMes: rotuloMes as string, ano, mes,
    linhas, totalCentavos, paginas: doc.numPages, linhasNaoReconhecidas: naoReconhecidas,
  };
}
