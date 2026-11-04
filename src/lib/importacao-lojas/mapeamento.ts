/**
 * Escolha de colunas da planilha de lojas: o usuário indica qual coluna da
 * planilha corresponde a cada campo do sistema. Campo sem coluna escolhida
 * NÃO é lido nem alterado.
 */
import { COLUNAS, mapearCabecalho, type ChaveColuna } from "./colunas";
import type { Celula } from "./ler-planilha";

export interface Mapeamento {
  /** Índice (0 = primeira linha) da linha de títulos na planilha. */
  linhaCabecalho: number;
  /** Campo do sistema → índice da coluna na planilha (0 = coluna A). */
  colunas: Partial<Record<ChaveColuna, number>>;
  /** Valores fixos para todas as linhas, quando a planilha não tem a coluna. */
  fixos?: {
    percentual_vigencia?: string; // "aaaa-mm-01"
    minimo_vigencia?: string;     // "aaaa-mm-01"
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

const vazio = (c: Celula | undefined) => c === null || c === undefined || String(c).trim() === "";

function textoExemplo(c: Celula | undefined): string {
  if (vazio(c)) return "";
  if (c instanceof Date) return c.toISOString().slice(0, 10).split("-").reverse().join("/");
  return String(c).trim().slice(0, 40);
}

/** Lê os títulos da planilha e sugere a correspondência pelos nomes das colunas. */
export function analisarCabecalho(matriz: Celula[][]):
  | { ok: true; linhaCabecalho: number; colunas: ColunaPlanilha[]; sugestao: Mapeamento; totalLinhas: number }
  | { ok: false; erro: string } {
  const primeiras = matriz.slice(0, 10);
  let idx = primeiras.findIndex((l) => mapearCabecalho(l).indice.luc !== undefined);
  if (idx < 0) idx = primeiras.findIndex((l) => l.filter((c) => !vazio(c)).length >= 2);
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
      titulo: vazio(titulos[i]) ? "(sem título)" : String(titulos[i]).trim(),
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
  COLUNAS.map((c) => [c.chave, c.titulo.replace(/\s*\(mm\/aaaa\)/, "")]),
) as Record<ChaveColuna, string>;

/** Confere se a escolha de colunas faz sentido. Devolve a lista de problemas (vazia = ok). */
export function validarMapeamento(m: Mapeamento): string[] {
  const erros: string[] = [];
  const c = m.colunas;
  const f = m.fixos ?? {};
  const tem = (k: ChaveColuna) => c[k] !== undefined;
  if (!tem("luc")) erros.push("Escolha a coluna da LUC (é ela que identifica a loja).");
  const outros = (Object.keys(c) as ChaveColuna[]).filter((k) => k !== "luc");
  const temFixoUtil = (tem("percentual") && f.percentual_vigencia) || (tem("aluguel_minimo") && f.minimo_vigencia) || (tem("valor_13") && f.ano_13);
  if (!outros.length && !temFixoUtil) erros.push("Escolha pelo menos um campo para ler e atualizar além da LUC.");

  const usadas = new Map<number, ChaveColuna>();
  for (const [k, i] of Object.entries(c) as [ChaveColuna, number][]) {
    if (usadas.has(i)) erros.push(`A mesma coluna foi escolhida para "${TITULO_CAMPO[usadas.get(i)!]}" e "${TITULO_CAMPO[k]}".`);
    else usadas.set(i, k);
  }

  // Valor sem vigência é permitido: fica com "vigência a definir" na loja.
  const par = (valor: ChaveColuna, vig: "percentual_vigencia" | "minimo_vigencia", nome: string) => {
    if (!tem(valor) && tem(vig)) erros.push(`${nome}: foi escolhida a coluna de vigência, mas não a do valor.`);
  };
  par("percentual", "percentual_vigencia", "Percentual");
  par("aluguel_minimo", "minimo_vigencia", "Aluguel mínimo");
  const temAno = tem("ano_13") || Boolean(f.ano_13);
  if (tem("valor_13") && !temAno) erros.push("13º aluguel: escolha a coluna do ano ou um ano fixo para todas as linhas.");
  if (!tem("valor_13") && tem("ano_13")) erros.push("13º aluguel: foi escolhida a coluna do ano, mas não a do valor.");
  return erros;
}

/** Avisos (não impedem a importação) sobre a escolha de colunas. */
export function avisosMapeamento(m: Mapeamento): string[] {
  const a: string[] = [];
  const f = m.fixos ?? {};
  if (m.colunas.percentual !== undefined && m.colunas.percentual_vigencia === undefined && !f.percentual_vigencia)
    a.push("Percentual sem início de vigência: será gravado como “vigência a definir” e o mês poderá ser informado depois na página da loja.");
  if (m.colunas.aluguel_minimo !== undefined && m.colunas.minimo_vigencia === undefined && !f.minimo_vigencia)
    a.push("Aluguel mínimo sem início de vigência: será gravado como “vigência a definir” e o mês poderá ser informado depois na página da loja.");
  return a;
}

/** Lista legível dos campos que serão lidos e atualizados. */
export function descreverMapeamento(m: Mapeamento): string[] {
  const f = m.fixos ?? {};
  const fmtMes = (d: string) => `${d.slice(5, 7)}/${d.slice(0, 4)}`;
  return COLUNAS.filter((col) => m.colunas[col.chave] !== undefined || (col.chave === "percentual_vigencia" && f.percentual_vigencia && m.colunas.percentual !== undefined)
    || (col.chave === "minimo_vigencia" && f.minimo_vigencia && m.colunas.aluguel_minimo !== undefined)
    || (col.chave === "ano_13" && f.ano_13 && m.colunas.valor_13 !== undefined))
    .map((col) => {
      const i = m.colunas[col.chave];
      if (i !== undefined) return `${TITULO_CAMPO[col.chave]} ← coluna ${letraColuna(i)}`;
      if (col.chave === "percentual_vigencia") return `${TITULO_CAMPO[col.chave]}: ${fmtMes(f.percentual_vigencia!)} para todas as linhas`;
      if (col.chave === "minimo_vigencia") return `${TITULO_CAMPO[col.chave]}: ${fmtMes(f.minimo_vigencia!)} para todas as linhas`;
      return `${TITULO_CAMPO[col.chave]}: ${f.ano_13} para todas as linhas`;
    })
    .concat(m.colunas.percentual !== undefined && m.colunas.percentual_vigencia === undefined && !f.percentual_vigencia
      ? [`${TITULO_CAMPO.percentual_vigencia}: a definir depois`] : [])
    .concat(m.colunas.aluguel_minimo !== undefined && m.colunas.minimo_vigencia === undefined && !f.minimo_vigencia
      ? [`${TITULO_CAMPO.minimo_vigencia}: a definir depois`] : []);
}
