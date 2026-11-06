/**
 * Escolha de colunas da planilha de lojas: o usuário indica qual coluna da
 * planilha corresponde a cada campo do sistema. Campo sem coluna escolhida
 * NÃO é lido nem alterado.
 */
import { COLUNAS, mapearCabecalho, type ChaveColuna } from "./colunas";
import type { Celula } from "./ler-planilha";
import { celulaVazia, formatarData } from "@/lib/formato";

export type CampoFixo = "vigencia" | "percentual_vigencia" | "minimo_vigencia" | "ano_13";

export interface Mapeamento {
  /** Índice (0 = primeira linha) da linha de títulos na planilha. */
  linhaCabecalho: number;
  /** Campo do sistema → índice da coluna na planilha (0 = coluna A). Dois campos podem usar a mesma coluna. */
  colunas: Partial<Record<ChaveColuna, number>>;
  /** Valores fixos para todas as linhas, quando a planilha não tem a coluna. */
  fixos?: {
    vigencia?: string;            // "aaaa-mm-dd"
    percentual_vigencia?: string; // "aaaa-mm-dd"
    minimo_vigencia?: string;     // "aaaa-mm-dd"
    ano_13?: number;
  };
}

export interface ColunaPlanilha {
  indice: number;
  letra: string;
  titulo: string;
  exemplos: string[];
}

export function letraColuna(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

const vazio = (c: Celula | undefined) => celulaVazia(c);

function textoExemplo(c: Celula | undefined): string {
  if (vazio(c)) return "";
  if (c instanceof Date) {
    const d = new Date(c.getTime() + 12 * 3600 * 1000);
    return d.toISOString().slice(0, 10).split("-").reverse().join("/");
  }
  return String(c).trim().slice(0, 40);
}

/** Quantas linhas do topo são examinadas à procura da linha de títulos. */
const LINHAS_TOPO = 30;

/** Acha a linha de títulos: a que tem a LUC e mais títulos reconhecidos entre as primeiras linhas. */
export function acharLinhaCabecalho(matriz: Celula[][]): number {
  let melhor = -1, pontos = 0;
  matriz.slice(0, LINHAS_TOPO).forEach((l, i) => {
    const m = mapearCabecalho(l);
    const p = Object.keys(m.indice).length + (m.indice.luc !== undefined ? 10 : 0);
    if (p > pontos) { melhor = i; pontos = p; }
  });
  if (melhor >= 0 && pontos >= 2) return melhor;
  // nada reconhecido: primeira linha com 2+ células preenchidas (o usuário escolhe as colunas)
  return matriz.slice(0, LINHAS_TOPO).findIndex((l) => l.filter((c) => !vazio(c)).length >= 2);
}

/** Lê os títulos da planilha e sugere a correspondência pelos nomes das colunas. */
export function analisarCabecalho(matriz: Celula[][]):
  | { ok: true; linhaCabecalho: number; colunas: ColunaPlanilha[]; sugestao: Mapeamento; totalLinhas: number }
  | { ok: false; erro: string } {
  const idx = acharLinhaCabecalho(matriz);
  if (idx < 0) return { ok: false, erro: "Não encontrei a linha de títulos das colunas. Confira se a planilha não está vazia." };

  const titulos = matriz[idx];
  const corpo = matriz.slice(idx + 1).filter((l) => l.some((c) => !vazio(c)));
  const largura = Math.max(titulos.length, ...corpo.slice(0, 50).map((l) => l.length));
  const colunas: ColunaPlanilha[] = [];
  for (let i = 0; i < largura; i++) {
    const exemplos = corpo.map((l) => textoExemplo(l[i])).filter(Boolean).slice(0, 3);
    if (vazio(titulos[i]) && !exemplos.length) continue;
    colunas.push({
      indice: i,
      letra: letraColuna(i),
      titulo: vazio(titulos[i]) ? "(sem título)" : String(titulos[i]).replace(/\s+/g, " ").trim(),
      exemplos,
    });
  }
  const auto = mapearCabecalho(titulos).indice;
  return {
    ok: true,
    linhaCabecalho: idx,
    colunas,
    sugestao: { linhaCabecalho: idx, colunas: auto, fixos: {} },
    totalLinhas: corpo.length,
  };
}

export const TITULO_CAMPO: Record<ChaveColuna, string> = Object.fromEntries(
  COLUNAS.map((c) => [c.chave, c.titulo.replace(/\s*\((mm\/aaaa|dd\/mm\/aaaa)\)/, "")]),
) as Record<ChaveColuna, string>;

/** Confere se a escolha de colunas permite importar. Devolve a lista de problemas (vazia = ok). */
export function validarMapeamento(m: Mapeamento): string[] {
  const erros: string[] = [];
  const f = m.fixos ?? {};
  if (m.colunas.luc === undefined) erros.push("Escolha a coluna da LUC (é ela que identifica a loja).");
  const outros = (Object.keys(m.colunas) as ChaveColuna[]).filter((k) => k !== "luc");
  if (!outros.length && !Object.values(f).some(Boolean)) erros.push("Escolha pelo menos um campo para ler além da LUC.");
  return erros;
}

export type FonteVigencia = { tipo: "coluna"; indice: number } | { tipo: "fixa"; data: string };

/**
 * De onde vem a vigência do percentual/mínimo, em ordem de prioridade: coluna própria,
 * data fixa própria, coluna geral "Vigência", data fixa geral. Numa linha, a primeira
 * fonte com valor é usada (coluna própria vazia → cai na coluna geral).
 */
export function fontesVigencia(m: Mapeamento, campo: "percentual_vigencia" | "minimo_vigencia"): FonteVigencia[] {
  const f = m.fixos ?? {};
  const fontes: FonteVigencia[] = [];
  if (m.colunas[campo] !== undefined) fontes.push({ tipo: "coluna", indice: m.colunas[campo]! });
  if (f[campo]) fontes.push({ tipo: "fixa", data: f[campo]! });
  if (m.colunas.vigencia !== undefined) fontes.push({ tipo: "coluna", indice: m.colunas.vigencia });
  if (f.vigencia) fontes.push({ tipo: "fixa", data: f.vigencia });
  return fontes;
}

/** Fonte principal (para descrever a escolha na tela). */
export function origemVigencia(m: Mapeamento, campo: "percentual_vigencia" | "minimo_vigencia"): FonteVigencia | { tipo: "nenhuma" } {
  return fontesVigencia(m, campo)[0] ?? { tipo: "nenhuma" };
}

/** Avisos (não impedem a importação) sobre a escolha de colunas. */
export function avisosMapeamento(m: Mapeamento): string[] {
  const a: string[] = [];
  if (m.colunas.percentual !== undefined && origemVigencia(m, "percentual_vigencia").tipo === "nenhuma")
    a.push("Percentual sem vigência: será gravado como “vigência a definir” (informe a data depois na página da loja).");
  if (m.colunas.aluguel_minimo !== undefined && origemVigencia(m, "minimo_vigencia").tipo === "nenhuma")
    a.push("Aluguel mínimo sem vigência: será gravado como “vigência a definir” (informe a data depois na página da loja).");
  if (m.colunas.valor_13 !== undefined && m.colunas.ano_13 === undefined && !m.fixos?.ano_13)
    a.push("13º aluguel sem o ano: os valores do 13º não serão lidos. Escolha a coluna do ano ou um ano fixo.");
  return a;
}

/** Lista legível dos campos que serão lidos e atualizados. */
export function descreverMapeamento(m: Mapeamento): string[] {
  const linhas: string[] = [];
  for (const col of COLUNAS) {
    const k = col.chave;
    if (k === "percentual_vigencia" || k === "minimo_vigencia" || k === "vigencia") continue;
    const i = m.colunas[k];
    if (k === "ano_13") {
      if (m.colunas.valor_13 === undefined) continue;
      if (i !== undefined) linhas.push(`${TITULO_CAMPO[k]} ← coluna ${letraColuna(i)}`);
      else if (m.fixos?.ano_13) linhas.push(`${TITULO_CAMPO[k]}: ${m.fixos.ano_13} para todas as linhas`);
      continue;
    }
    if (i === undefined) continue;
    linhas.push(`${TITULO_CAMPO[k]} ← coluna ${letraColuna(i)}`);
    if (k === "percentual" || k === "aluguel_minimo") {
      const o = origemVigencia(m, k === "percentual" ? "percentual_vigencia" : "minimo_vigencia");
      const nome = k === "percentual" ? "Vigência do percentual" : "Vigência do aluguel mínimo";
      linhas.push(o.tipo === "coluna" ? `${nome} ← coluna ${letraColuna(o.indice)}`
        : o.tipo === "fixa" ? `${nome}: ${formatarData(o.data)} para todas as linhas` : `${nome}: a definir depois`);
    }
  }
  return linhas;
}
