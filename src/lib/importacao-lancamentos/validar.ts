/**
 * Lançamentos auditados em lote (planilha Excel/CSV) — validação linha a linha.
 * Função pura: recebe a planilha, a escolha de colunas e o contexto (lojas,
 * dias já lançados, meses fechados, hoje, logins) e devolve a prévia.
 * Qualquer erro bloqueia a importação inteira (tudo ou nada).
 */
import { formatarData, formatarMoeda, lerNumeroBR, normalizarLuc, paraDecimalBanco } from "@/lib/formato";
import type { Celula } from "@/lib/importacao-lojas/ler-planilha";
import { letraColuna, type ColunaPlanilha } from "@/lib/importacao-lojas/mapeamento";

export type CampoLanc = "luc" | "data" | "valor" | "auditor";

export const CAMPOS_LANC: { chave: CampoLanc; titulo: string; obrigatorio: boolean; ajuda: string; apelidos: string[] }[] = [
  { chave: "luc", titulo: "LUC", obrigatorio: true, ajuda: "Nº LUC da loja, como no cadastro.", apelidos: ["luc", "n luc", "no luc", "nº luc", "loja luc"] },
  { chave: "data", titulo: "Data da venda", obrigatorio: true, ajuda: "Dia da venda (dd/mm/aaaa).", apelidos: ["data", "data da venda", "dia", "data dd mm aaaa"] },
  { chave: "valor", titulo: "Venda líquida (R$)", obrigatorio: true, ajuda: "Valor auditado do dia (venda líquida).", apelidos: ["valor", "venda", "venda liquida", "venda liquida r", "valor r", "auditado"] },
  { chave: "auditor", titulo: "Auditor (login)", obrigatorio: false, ajuda: "Opcional. Login de quem auditou; vazio = quem está importando.", apelidos: ["auditor", "auditor login", "login", "usuario"] },
];

export interface MapaLanc { linhaCabecalho: number; colunas: Partial<Record<CampoLanc, number>> }

const norm = (t: unknown) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9º]+/g, " ").trim();
const vazio = (c: Celula | undefined) => c === null || c === undefined || String(c).trim() === "";
const texto = (c: Celula | undefined) => (vazio(c) ? "" : c instanceof Date ? c.toISOString().slice(0, 10) : String(c).trim());

/** Acha a linha de títulos, lista as colunas com exemplos e sugere a correspondência. */
export function analisarPlanilhaLanc(m: Celula[][]):
  | { ok: true; linhaCabecalho: number; colunas: ColunaPlanilha[]; sugestao: MapaLanc; totalLinhas: number }
  | { ok: false; erro: string } {
  const idx = m.slice(0, 10).findIndex((l) => l.filter((c) => !vazio(c)).length >= 2);
  if (idx < 0) return { ok: false, erro: "Não encontrei a linha de títulos. Confira se a planilha não está vazia." };
  const tit = m[idx];
  const corpo = m.slice(idx + 1).filter((l) => l.some((c) => !vazio(c)));
  const largura = Math.max(tit.length, ...corpo.slice(0, 50).map((l) => l.length));
  const colunas: ColunaPlanilha[] = [];
  const sugestao: MapaLanc = { linhaCabecalho: idx, colunas: {} };
  for (let i = 0; i < largura; i++) {
    const ex = corpo.map((l) => (l[i] instanceof Date ? formatarData((l[i] as Date).toISOString()) : texto(l[i]))).filter(Boolean).slice(0, 3);
    if (vazio(tit[i]) && !ex.length) continue;
    colunas.push({ indice: i, letra: letraColuna(i), titulo: vazio(tit[i]) ? "(sem título)" : String(tit[i]).trim(), exemplos: ex });
    const n = norm(tit[i]).replace(/\s*(r|opcional|dd mm aaaa)$/, "").trim();
    const campo = CAMPOS_LANC.find((c) => c.apelidos.some((a) => norm(a) === n || norm(a) === norm(tit[i])));
    if (campo && sugestao.colunas[campo.chave] === undefined) sugestao.colunas[campo.chave] = i;
  }
  return { ok: true, linhaCabecalho: idx, colunas, sugestao, totalLinhas: corpo.length };
}

/** "dd/mm/aaaa", "d/m/aaaa", "aaaa-mm-dd", "dd-mm-aaaa" ou data do Excel → "aaaa-mm-dd" (ou null). */
export function lerData(c: Celula | undefined): string | null {
  if (vazio(c)) return null;
  let a: number, m: number, d: number;
  if (c instanceof Date) { a = c.getUTCFullYear(); m = c.getUTCMonth() + 1; d = c.getUTCDate(); }
  else {
    const s = String(c).trim();
    let x: RegExpExecArray | null;
    if ((x = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s))) { d = +x[1]; m = +x[2]; a = +x[3]; }
    else if ((x = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) { a = +x[1]; m = +x[2]; d = +x[3]; }
    else return null;
  }
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d || a < 2000) return null;
  return dt.toISOString().slice(0, 10);
}

export interface ContextoLanc {
  lojas: { id: string; luc: string; nome: string; ativa: boolean; auditada: boolean }[];
  jaLancados: Set<string>;        // "loja_id|aaaa-mm-dd"
  mesesFechados: Set<string>;     // "aaaa-mm"
  hoje: string;                   // aaaa-mm-dd (Fortaleza)
  logins: Set<string>;            // logins de usuários ativos
}

export interface LinhaLanc {
  linha: number; luc: string; loja: string | null; data: string | null; valorCentavos: number | null;
  auditor: string | null; erros: string[]; avisos: string[];
}

export interface ResultadoLanc {
  errosGerais: string[];
  linhas: LinhaLanc[];
  totais: { linhas: number; comErro: number; valorCentavos: number; porMes: Record<string, number> };
  podeImportar: boolean;
  paraGravar: { linha: number; luc: string; data: string; valor: string; auditor: string | null }[];
}

export function validarLancamentosLote(m: Celula[][], mapa: MapaLanc, ctx: ContextoLanc): ResultadoLanc {
  const errosGerais: string[] = [];
  for (const c of CAMPOS_LANC) if (c.obrigatorio && mapa.colunas[c.chave] === undefined) errosGerais.push(`Escolha a coluna "${c.titulo}".`);
  const usadas = Object.values(mapa.colunas);
  if (new Set(usadas).size !== usadas.length) errosGerais.push("A mesma coluna foi escolhida para dois campos.");
  const linhas: LinhaLanc[] = [];
  if (!errosGerais.length) {
    const pegar = (l: Celula[], k: CampoLanc) => (mapa.colunas[k] === undefined ? undefined : l[mapa.colunas[k]!]);
    const porLuc = new Map(ctx.lojas.filter((l) => l.ativa).map((l) => [l.luc, l]));
    const vistos = new Map<string, number>();
    m.slice(mapa.linhaCabecalho + 1).forEach((l, i) => {
      if (l.every((c) => vazio(c))) return;
      const numero = mapa.linhaCabecalho + i + 2;
      const erros: string[] = [];
      const avisos: string[] = [];
      const luc = normalizarLuc(pegar(l, "luc"));
      const loja = luc ? porLuc.get(luc) : undefined;
      if (!luc) erros.push("LUC vazia.");
      else if (!loja) erros.push(`Loja não encontrada: LUC "${luc}" não está entre as lojas ativas.`);
      else if (!loja.auditada) erros.push("Loja não está marcada como auditada.");

      const brutoData = pegar(l, "data");
      const data = lerData(brutoData);
      if (vazio(brutoData)) erros.push("Data vazia.");
      else if (!data) erros.push(`Data inválida: "${texto(brutoData)}" (use dd/mm/aaaa).`);
      else if (data >= ctx.hoje) erros.push(data === ctx.hoje ? "Data de hoje: só é possível lançar dias anteriores." : "Data futura.");
      else if (ctx.mesesFechados.has(data.slice(0, 7))) erros.push(`Mês ${data.slice(5, 7)}/${data.slice(0, 4)} está fechado.`);

      const brutoValor = pegar(l, "valor");
      const v = lerNumeroBR(brutoValor);
      let valorCentavos: number | null = null;
      if (v === null) erros.push("Valor vazio.");
      else if (Number.isNaN(v)) erros.push(`Valor inválido: "${texto(brutoValor)}".`);
      else if (v < 0) erros.push("Valor negativo.");
      else { valorCentavos = Math.round(v * 100); if (valorCentavos === 0) avisos.push("Valor zero (loja fechada no dia?)."); }

      if (loja && data) {
        const chave = `${loja.id}|${data}`;
        if (ctx.jaLancados.has(chave)) erros.push(`Dia já lançado: ${formatarData(data)} já tem lançamento para esta loja.`);
        if (vistos.has(chave)) erros.push(`Repetido na planilha (mesma loja e data da linha ${vistos.get(chave)}).`);
        else vistos.set(chave, numero);
      }

      const auditor = texto(pegar(l, "auditor")).toLowerCase() || null;
      if (auditor && !ctx.logins.has(auditor)) erros.push(`Auditor "${auditor}" não encontrado ou desativado.`);

      linhas.push({ linha: numero, luc, loja: loja?.nome ?? null, data, valorCentavos, auditor, erros, avisos });
    });
    if (!linhas.length) errosGerais.push("A planilha não tem linhas de lançamento abaixo dos títulos.");
  }
  const ok = linhas.filter((l) => !l.erros.length);
  const porMes: Record<string, number> = {};
  for (const l of ok) porMes[l.data!.slice(0, 7)] = (porMes[l.data!.slice(0, 7)] ?? 0) + 1;
  const comErro = linhas.length - ok.length;
  const podeImportar = !errosGerais.length && linhas.length > 0 && comErro === 0;
  return {
    errosGerais, linhas,
    totais: { linhas: linhas.length, comErro, valorCentavos: ok.reduce((s, l) => s + (l.valorCentavos ?? 0), 0), porMes },
    podeImportar,
    paraGravar: podeImportar ? ok.map((l) => ({ linha: l.linha, luc: l.luc, data: l.data!, valor: paraDecimalBanco(l.valorCentavos! / 100), auditor: l.auditor })) : [],
  };
}

export const descreverValor = (c: number | null) => (c === null ? "—" : formatarMoeda(c / 100));
