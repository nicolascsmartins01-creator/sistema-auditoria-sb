/** Colunas da planilha de cadastro de lojas (modelo para download e leitura). */

export type ChaveColuna =
  | "luc" | "nome_fantasia" | "localizacao" | "segmento" | "auditada" | "ativa"
  | "percentual" | "percentual_vigencia" | "aluguel_minimo" | "minimo_vigencia"
  | "ano_13" | "valor_13";

export interface Coluna {
  chave: ChaveColuna;
  titulo: string;          // como aparece no modelo
  obrigatoria: boolean;    // precisa ser escolhida na importação
  ajuda: string;
  exemplo: [string, string];
  apelidos?: string[];     // outros títulos aceitos
}

export const COLUNAS: Coluna[] = [
  { chave: "luc", titulo: "LUC", obrigatoria: true, apelidos: ["nº luc", "n luc", "no luc", "numero luc"],
    ajuda: "Exatamente como aparece no relatório do portal (ex.: LJ 101/102/102A, Q 001C, ILHA 001/002, T1).",
    exemplo: ["LJ 901", "Q 950C"] },
  { chave: "nome_fantasia", titulo: "Nome fantasia", obrigatoria: false, apelidos: ["nome", "loja"],
    ajuda: "Nome da loja. Obrigatório para cadastrar loja nova.", exemplo: ["Loja Exemplo Calçados", "Quiosque Exemplo Sucos"] },
  { chave: "localizacao", titulo: "Localização", obrigatoria: false, apelidos: ["localizacao", "local"],
    ajuda: "Texto livre (piso, corredor, referência).", exemplo: ["Piso L1 – corredor A", "Praça de alimentação"] },
  { chave: "segmento", titulo: "Segmento", obrigatoria: false,
    ajuda: "Opcional. Se não existir na lista, será criado.", exemplo: ["Calçados", "Alimentação"] },
  { chave: "auditada", titulo: "Auditada (S/N)", obrigatoria: false, apelidos: ["auditada"],
    ajuda: "S = entra na auditoria diária; N = não auditada. Vazio = S para loja nova.", exemplo: ["S", "N"] },
  { chave: "ativa", titulo: "Ativa (S/N)", obrigatoria: false, apelidos: ["ativa", "situacao"],
    ajuda: "N = inativa (some da busca, mas mantém o histórico). Vazio = S para loja nova.", exemplo: ["S", "S"] },
  { chave: "percentual", titulo: "Percentual (%)", obrigatoria: false, apelidos: ["percentual", "%", "percentual de participacao"],
    ajuda: "Percentual de participação do shopping. Ex.: 6,5 para 6,5%.", exemplo: ["6,5", "8"] },
  { chave: "percentual_vigencia", titulo: "Início vigência % (mm/aaaa)", obrigatoria: false,
    apelidos: ["inicio vigencia %", "vigencia percentual", "inicio vigencia percentual"],
    ajuda: "Mês a partir do qual o percentual vale. Obrigatório se o percentual for preenchido.", exemplo: ["01/2026", "01/2026"] },
  { chave: "aluguel_minimo", titulo: "Aluguel mínimo (R$)", obrigatoria: false, apelidos: ["aluguel minimo", "minimo"],
    ajuda: "Valor em reais. Ex.: 12.500,00", exemplo: ["12.500,00", "3.200,00"] },
  { chave: "minimo_vigencia", titulo: "Início vigência mínimo (mm/aaaa)", obrigatoria: false,
    apelidos: ["inicio vigencia minimo", "vigencia minimo", "vigencia aluguel minimo"],
    ajuda: "Mês a partir do qual o mínimo vale. Obrigatório se o mínimo for preenchido.", exemplo: ["01/2026", "01/2026"] },
  { chave: "ano_13", titulo: "Ano do 13º", obrigatoria: false, apelidos: ["ano 13", "ano do 13", "ano 13o"],
    ajuda: "Ano do dezembro em que vale o 13º aluguel.", exemplo: ["2026", ""] },
  { chave: "valor_13", titulo: "Aluguel 13º (R$)", obrigatoria: false, apelidos: ["aluguel 13", "13 aluguel", "valor 13", "13o aluguel"],
    ajuda: "Aluguel mínimo de dezembro daquele ano (substitui o mínimo padrão).", exemplo: ["25.000,00", ""] },
];

/** Normaliza um título de coluna para comparação. */
export function normalizarTitulo(t: unknown): string {
  return String(t ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, (m) => (m.includes("%") ? " % " : " ")) // remove "(S/N)", "(R$)" mas mantém "%"
    .replace(/[º°ª]/g, "")
    .replace(/[^a-z0-9%]+/g, " ")
    .trim();
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
  titulos.forEach((t, i) => {
    const n = normalizarTitulo(t);
    if (!n) return;
    const col = COLUNAS.find(
      (c) => normalizarTitulo(c.titulo) === n || (c.apelidos ?? []).some((a) => normalizarTitulo(a) === n),
    );
    if (!col) desconhecidas.push(String(t));
    else if (indice[col.chave] !== undefined) repetidas.push(String(t));
    else indice[col.chave] = i;
  });
  const faltando = COLUNAS.filter((c) => c.obrigatoria && indice[c.chave] === undefined).map((c) => c.titulo);
  return { indice, desconhecidas, faltando, repetidas };
}
