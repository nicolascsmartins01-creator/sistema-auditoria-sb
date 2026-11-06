/** Colunas da planilha de cadastro de lojas (modelo para download e leitura). */

export type ChaveColuna =
  | "luc" | "nome_fantasia" | "area" | "piso" | "localizacao" | "segmento" | "auditada" | "ativa"
  | "vigencia" | "percentual" | "percentual_vigencia" | "aluguel_minimo" | "minimo_vigencia"
  | "ano_13" | "valor_13";

export interface Coluna {
  chave: ChaveColuna;
  titulo: string;          // como aparece no modelo
  obrigatoria: boolean;    // precisa ser escolhida na importação
  ajuda: string;
  exemplo: [string, string];
  apelidos?: string[];     // outros títulos aceitos (comparação sem acento e sem maiúsculas)
}

export const COLUNAS: Coluna[] = [
  { chave: "luc", titulo: "LUC", obrigatoria: true,
    apelidos: ["nº luc", "n luc", "no luc", "numero luc", "numero da luc", "cod luc", "codigo luc", "luc loja", "unidade", "loja luc"],
    ajuda: "Exatamente como aparece no relatório do portal (ex.: LJ 101/102/102A, Q 001C, ILHA 001/002, T1). Linhas sem LUC são ignoradas.",
    exemplo: ["LJ 901", "Q 950C"] },
  { chave: "nome_fantasia", titulo: "Loja", obrigatoria: false,
    apelidos: ["nome fantasia", "nome", "nome da loja", "operacao", "nome da operacao", "operacoes", "lojista", "marca", "fantasia"],
    ajuda: "Nome da loja. Se vier vazio numa loja nova, ela é cadastrada com a LUC como nome (ajuste depois).",
    exemplo: ["Loja Exemplo Calçados", "Quiosque Exemplo Sucos"] },
  { chave: "area", titulo: "Área (m²)", obrigatoria: false,
    apelidos: ["area", "area m2", "abl", "area abl", "area privativa", "area locavel", "m2", "metragem"],
    ajuda: "Área em m². Ex.: 120,50", exemplo: ["120,50", "9"] },
  { chave: "piso", titulo: "Piso", obrigatoria: false,
    apelidos: ["pavimento", "nivel", "andar"],
    ajuda: "Ex.: L1, L2, Térreo.", exemplo: ["L1", "L2"] },
  { chave: "localizacao", titulo: "Localização", obrigatoria: false, apelidos: ["localizacao", "local", "corredor", "ala"],
    ajuda: "Texto livre (corredor, referência).", exemplo: ["Corredor A", "Praça de alimentação"] },
  { chave: "segmento", titulo: "Segmento", obrigatoria: false, apelidos: ["ramo", "atividade", "ramo de atividade", "mix", "categoria"],
    ajuda: "Se não existir na lista, será criado.", exemplo: ["Calçados", "Alimentação"] },
  { chave: "auditada", titulo: "Auditada (S/N)", obrigatoria: false, apelidos: ["auditada"],
    ajuda: "S = entra na auditoria diária; N = não auditada. Vazio = S para loja nova.", exemplo: ["S", "N"] },
  { chave: "ativa", titulo: "Ativa (S/N)", obrigatoria: false, apelidos: ["ativa", "situacao"],
    ajuda: "N = inativa (some da busca, mas mantém o histórico). Vazio = S para loja nova.", exemplo: ["S", "S"] },
  { chave: "vigencia", titulo: "Vigência (início)", obrigatoria: false,
    apelidos: ["vigencia", "inicio vigencia", "inicio da vigencia", "data vigencia", "data de vigencia", "inicio", "data inicio",
      "data de inicio", "inicio contrato", "inicio do contrato", "vigencia inicio", "vigencia contrato", "periodo vigencia"],
    ajuda: "Data de início do contrato/reajuste, em qualquer dia (ex.: 15/03/2026). Vale para o percentual e o aluguel mínimo da linha.",
    exemplo: ["15/03/2026", "01/01/2026"] },
  { chave: "percentual", titulo: "Aluguel percentual (%)", obrigatoria: false,
    apelidos: ["percentual", "%", "percentual de participacao", "aluguel percentual", "% aluguel", "aluguel %", "taxa percentual",
      "percentual aluguel", "% faturamento", "percentual sobre faturamento", "perc", "perc aluguel"],
    ajuda: "Percentual sobre a venda. Ex.: 6,5 para 6,5% (também aceita 6,5% ou 0,065).", exemplo: ["6,5", "8"] },
  { chave: "percentual_vigencia", titulo: "Início vigência % (dd/mm/aaaa)", obrigatoria: false,
    apelidos: ["inicio vigencia %", "vigencia percentual", "inicio vigencia percentual", "vigencia %"],
    ajuda: "Só se o percentual tiver vigência diferente da coluna “Vigência (início)”.", exemplo: ["", ""] },
  { chave: "aluguel_minimo", titulo: "Aluguel mínimo (R$)", obrigatoria: false,
    apelidos: ["aluguel minimo", "minimo", "valor aluguel minimo", "valor do aluguel minimo", "aluguel minimo mensal", "amm",
      "valor minimo", "aluguel fixo", "valor do aluguel"],
    ajuda: "Valor em reais. Ex.: 12.500,00", exemplo: ["12.500,00", "3.200,00"] },
  { chave: "minimo_vigencia", titulo: "Início vigência mínimo (dd/mm/aaaa)", obrigatoria: false,
    apelidos: ["inicio vigencia minimo", "vigencia minimo", "vigencia aluguel minimo"],
    ajuda: "Só se o mínimo tiver vigência diferente da coluna “Vigência (início)”.", exemplo: ["", ""] },
  { chave: "ano_13", titulo: "Ano do 13º", obrigatoria: false, apelidos: ["ano 13", "ano do 13", "ano 13o"],
    ajuda: "Ano do dezembro em que vale o 13º aluguel.", exemplo: ["2026", ""] },
  { chave: "valor_13", titulo: "Aluguel 13º (R$)", obrigatoria: false,
    apelidos: ["aluguel 13", "13 aluguel", "valor 13", "13o aluguel", "aluguel dezembro"],
    ajuda: "Aluguel mínimo de dezembro daquele ano (substitui o mínimo padrão).", exemplo: ["25.000,00", ""] },
];

/** Normaliza um título de coluna para comparação. */
export function normalizarTitulo(t: unknown): string {
  return String(t ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, (m) => (m.includes("%") ? " % " : " ")) // remove "(S/N)", "(R$)" mas mantém "%"
    .replace(/[º°ª²]/g, "")
    .replace(/[^a-z0-9%]+/g, " ")
    .trim();
}

/** Palavras que indicam fim de período: nunca são a data de início. */
const FIM = /\b(fim|final|termino|vencimento|ate|encerramento)\b/;

/** Reconhecimento aproximado quando o título não é exatamente um dos conhecidos. */
function aproximado(n: string): ChaveColuna | null {
  if (/\bluc\b/.test(n)) return "luc";
  if (FIM.test(n)) return null;
  if (/\b13/.test(n) && /(aluguel|valor)/.test(n)) return "valor_13";
  if (/(vigencia|inicio)/.test(n)) {
    if (/(%|percent)/.test(n)) return "percentual_vigencia";
    if (/minimo/.test(n)) return "minimo_vigencia";
    return "vigencia";
  }
  if (/(%|percent)/.test(n)) return "percentual";
  if (/minimo/.test(n)) return "aluguel_minimo";
  if (/\b(area|abl|m2|metragem)\b/.test(n)) return "area";
  if (/\b(piso|pavimento|nivel|andar)\b/.test(n)) return "piso";
  if (/\b(segmento|ramo|atividade)\b/.test(n)) return "segmento";
  if (/\b(fantasia|operacao|lojista|nome)\b/.test(n) || n === "loja" || n === "lojas") return "nome_fantasia";
  return null;
}

/** Mapeia títulos da planilha → chave da coluna. Devolve também títulos não reconhecidos. */
export function mapearCabecalho(titulos: unknown[]): {
  indice: Partial<Record<ChaveColuna, number>>;
  desconhecidas: string[];
  faltando: string[];
  repetidas: string[];
} {
  const indice: Partial<Record<ChaveColuna, number>> = {};
  const desconhecidas: string[] = [];
  const repetidas: string[] = [];
  const pendentes: [number, string, unknown][] = [];
  // 1ª passada: títulos conhecidos exatamente
  titulos.forEach((t, i) => {
    const n = normalizarTitulo(t);
    if (!n) return;
    const col = COLUNAS.find(
      (c) => normalizarTitulo(c.titulo) === n || (c.apelidos ?? []).some((a) => normalizarTitulo(a) === n),
    );
    if (!col) pendentes.push([i, n, t]);
    else if (indice[col.chave] !== undefined) repetidas.push(String(t));
    else indice[col.chave] = i;
  });
  // 2ª passada: reconhecimento aproximado para os campos ainda livres
  for (const [i, n, t] of pendentes) {
    const chave = aproximado(n);
    if (chave && indice[chave] === undefined) indice[chave] = i;
    else desconhecidas.push(String(t));
  }
  const faltando = COLUNAS.filter((c) => c.obrigatoria && indice[c.chave] === undefined).map((c) => c.titulo);
  return { indice, desconhecidas, faltando, repetidas };
}
