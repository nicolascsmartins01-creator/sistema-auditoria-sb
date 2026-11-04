import ExcelJS from "exceljs";
import Papa from "papaparse";

export type Celula = string | number | boolean | Date | null;

export const LIMITE_LINHAS = 2000;
export const LIMITE_BYTES = 5 * 1024 * 1024;

/**
 * Lê a primeira aba de um .xlsx ou um .csv e devolve as linhas como matriz.
 * Células numéricas formatadas como percentual no Excel (0,065 exibido como 6,5%)
 * são convertidas para pontos percentuais (6.5).
 */
export async function lerPlanilha(nomeArquivo: string, conteudo: ArrayBuffer): Promise<Celula[][]> {
  const nome = nomeArquivo.toLowerCase();
  if (nome.endsWith(".csv") || nome.endsWith(".txt")) return lerCsv(conteudo);
  if (nome.endsWith(".xlsx")) return lerXlsx(conteudo);
  if (nome.endsWith(".xls")) {
    throw new Error("Formato .xls (Excel antigo) não suportado. Salve como .xlsx ou .csv.");
  }
  throw new Error("Envie um arquivo .xlsx ou .csv.");
}

function decodificarTexto(conteudo: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(conteudo).replace(/^﻿/, "");
  } catch {
    // CSV salvo pelo Excel em português costuma vir em Windows-1252.
    return new TextDecoder("windows-1252").decode(conteudo);
  }
}

function lerCsv(conteudo: ArrayBuffer): Celula[][] {
  const texto = decodificarTexto(conteudo);
  const r = Papa.parse<string[]>(texto, { skipEmptyLines: "greedy", delimitersToGuess: [";", ",", "\t", "|"] });
  return r.data.map((linha) => linha.map((c) => (c.trim() === "" ? null : c.trim())));
}

async function lerXlsx(conteudo: ArrayBuffer): Promise<Celula[][]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(conteudo);
  } catch {
    throw new Error("Não foi possível abrir o arquivo. Verifique se é um .xlsx válido.");
  }
  const ws = wb.worksheets.find((w) => w.state === "visible") ?? wb.worksheets[0];
  if (!ws) throw new Error("A planilha está vazia.");
  const linhas: Celula[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, numero) => {
    const valores: Celula[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      valores[col - 1] = valorDaCelula(cell);
    });
    linhas[numero - 1] = valores;
  });
  // preenche linhas vazias intermediárias e remove as vazias do fim
  for (let i = 0; i < linhas.length; i++) linhas[i] = linhas[i] ?? [];
  while (linhas.length && linhas[linhas.length - 1].every((c) => c === null || c === undefined)) linhas.pop();
  return linhas.map((l) => Array.from(l, (c) => (c === undefined ? null : c)));
}

function valorDaCelula(cell: ExcelJS.Cell): Celula {
  let v: unknown = cell.value;
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && !(v instanceof Date)) {
    const o = v as Record<string, unknown>;
    if ("result" in o) v = o.result;                       // fórmula
    else if ("richText" in o) v = (o.richText as { text: string }[]).map((t) => t.text).join("");
    else if ("text" in o) v = o.text;                      // hyperlink
    else if ("error" in o) return null;
  }
  if (typeof v === "number") {
    const fmt = cell.numFmt ?? "";
    return fmt.includes("%") ? Math.round(v * 100 * 1e6) / 1e6 : v;
  }
  if (typeof v === "string") return v.trim() === "" ? null : v.trim();
  if (typeof v === "boolean" || v instanceof Date) return v;
  return v === null || v === undefined ? null : String(v);
}
