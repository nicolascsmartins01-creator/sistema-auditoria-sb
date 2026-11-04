/**
 * Formatação e leitura de valores no padrão brasileiro.
 * Moeda: R$ 1.234,56 · Datas: dd/mm/aaaa · Fuso: America/Fortaleza.
 */

export const FUSO = "America/Fortaleza";

export const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
] as const;

const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const fmtMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Converte para número; aceita number ou string vinda do banco ("1234.56"). */
function paraNumero(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 1234.5 → "R$ 1.234,50". Vazio → "—". */
export function formatarMoeda(v: number | string | null | undefined): string {
  const n = paraNumero(v);
  return n === null ? "—" : fmtMoeda.format(n).replace(/ /g, " ");
}

/** 1234.5 → "1.234,50" (sem símbolo). */
export function formatarValor(v: number | string | null | undefined, casas = 2): string {
  const n = paraNumero(v);
  if (n === null) return "";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(n);
}

/** 6.5 → "6,50%" (até 4 casas, mínimo 2). */
export function formatarPercentual(v: number | string | null | undefined): string {
  const n = paraNumero(v);
  if (n === null) return "—";
  return (
    new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(n) + "%"
  );
}

/** "2026-09-30" → "30/09/2026". Não sofre efeito de fuso (data pura). */
export function formatarData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** "2026-09-01" → "09/2026". */
export function formatarMesAno(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  return m ? `${m[2]}/${m[1]}` : iso;
}

/** Data e hora de um evento, no fuso de Fortaleza: "04/11/2026 14:35". */
export function formatarDataHora(ts: string | Date | null | undefined): string {
  if (!ts) return "—";
  const d = typeof ts === "string" ? new Date(ts) : ts;
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? "";
  return `${p("day")}/${p("month")}/${p("year")} ${p("hour")}:${p("minute")}`;
}

/** Data de hoje em Fortaleza, "aaaa-mm-dd". */
export function hojeFortaleza(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

/** Primeiro dia do mês atual em Fortaleza, "aaaa-mm-01". */
export function inicioMesAtualFortaleza(agora: Date = new Date()): string {
  return hojeFortaleza(agora).slice(0, 8) + "01";
}

/**
 * Lê um número escrito no padrão brasileiro (ou vindo do Excel como número).
 *   "1.234,56" → 1234.56 · "1234,56" → 1234.56 · "R$ 10,00" → 10 · "6,5%" → 6.5
 *   "1.500" → 1500 (ponto é separador de milhar) · "6.5" → 6.5
 * Vazio → null. Inválido → NaN.
 */
export function lerNumeroBR(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : NaN;
  let s = String(valor).replace(/[ \s]/g, "").replace(/^R\$/i, "").replace(/%$/, "");
  if (s === "") return null;
  let negativo = false;
  if (s.startsWith("-")) { negativo = true; s = s.slice(1); }
  let n: number;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) n = Number(s.replace(/\./g, "").replace(",", "."));
  else if (/^\d+(,\d+)?$/.test(s)) n = Number(s.replace(",", "."));
  else if (/^\d+\.\d+$/.test(s)) n = Number(s);
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) n = Number(s.replace(/,/g, "")); // 1,234.56 (planilha em inglês)
  else return NaN;
  return negativo ? -n : n;
}

/** Arredonda para centavos e devolve texto para o banco: 1234.5 → "1234.50". */
export function paraDecimalBanco(n: number, casas = 2): string {
  const fator = 10 ** casas;
  return (Math.round(n * fator) / fator).toFixed(casas);
}

/**
 * Lê um mês/ano de vigência e devolve "aaaa-mm-01".
 * Aceita: "09/2026", "9/2026", "01/09/2026" (só dia 01), "2026-09", "2026-09-01",
 * "set/2026", "setembro/2026" e datas do Excel (dia 1).
 */
export function lerMesAno(valor: unknown): { ok: true; data: string } | { ok: false; erro: string } {
  const invalido = { ok: false as const, erro: "use o formato mm/aaaa (ex.: 09/2026)" };
  if (valor === null || valor === undefined || valor === "") return { ok: false, erro: "vazio" };
  let ano: number, mes: number, dia = 1;
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return invalido;
    ano = valor.getUTCFullYear(); mes = valor.getUTCMonth() + 1; dia = valor.getUTCDate();
  } else {
    const s = String(valor).trim().toLowerCase();
    let m: RegExpExecArray | null;
    if ((m = /^(\d{1,2})[/.-](\d{4})$/.exec(s))) { mes = +m[1]; ano = +m[2]; }
    else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) { dia = +m[1]; mes = +m[2]; ano = +m[3]; }
    else if ((m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(s))) { ano = +m[1]; mes = +m[2]; dia = m[3] ? +m[3] : 1; }
    else if ((m = /^([a-zç]{3,9})[/.\- ]+(\d{4})$/.exec(s))) {
      const nome = m[1].normalize("NFD").replace(/[̀-ͯ]/g, "");
      const idx = MESES_ABREV.findIndex((a) => nome.startsWith(a.normalize("NFD").replace(/[̀-ͯ]/g, "")));
      if (idx < 0) return invalido;
      mes = idx + 1; ano = +m[2];
    } else return invalido;
  }
  if (mes < 1 || mes > 12 || ano < 2000 || ano > 2100) return invalido;
  if (dia !== 1) return { ok: false, erro: "a vigência deve começar no dia 1º do mês" };
  return { ok: true, data: `${ano}-${String(mes).padStart(2, "0")}-01` };
}

/** "S", "Sim", "N", "Não", true/false. Vazio → null. Inválido → undefined. */
export function lerSimNao(valor: unknown): boolean | null | undefined {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "boolean") return valor;
  const s = String(valor).trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (["s", "sim", "x", "1", "true", "verdadeiro"].includes(s)) return true;
  if (["n", "nao", "0", "false", "falso"].includes(s)) return false;
  return undefined;
}

/** Normaliza uma LUC: remove espaços nas pontas e espaços repetidos (mantém maiúsculas/minúsculas). */
export function normalizarLuc(luc: unknown): string {
  return String(luc ?? "").replace(/ /g, " ").trim().replace(/\s+/g, " ");
}

/** Texto para comparação de buscas: minúsculas e sem acentos. */
export function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
