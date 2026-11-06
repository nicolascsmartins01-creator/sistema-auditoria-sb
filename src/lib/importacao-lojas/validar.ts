/**
 * Validação linha a linha da planilha de cadastro de lojas.
 * Função pura (sem banco): recebe a matriz lida da planilha, o cadastro atual e
 * a escolha de colunas; devolve a prévia (o que será criado/alterado) e os avisos.
 *
 * Regras (a importação nunca é barrada por uma informação faltando ou ilegível):
 *  - Só os campos com coluna escolhida são lidos; os demais ficam como estão.
 *  - Célula vazia (ou "-", "n/a") = não altera aquele campo da loja.
 *  - Valor que não dá para entender é ignorado, com aviso na linha; o resto da linha é gravado.
 *  - Loja nova sem nome é cadastrada com a LUC como nome (ajustar depois).
 *  - Linha sem LUC é ignorada (títulos de grupo, totais, linhas em branco).
 *  - A mesma LUC em várias linhas é aceita (ex.: uma linha por vigência).
 *  - Vigência pode começar em qualquer dia; sem data, fica "a definir".
 */
import {
  celulaVazia, formatarData, formatarMoeda, formatarPercentual, lerDataVigencia, lerNumeroBR,
  lerSimNao, normalizarLuc, paraDecimalBanco,
} from "@/lib/formato";
import type { ChaveColuna } from "./colunas";
import { LIMITE_LINHAS, type Celula } from "./ler-planilha";
import {
  analisarCabecalho, avisosMapeamento, descreverMapeamento, fontesVigencia, validarMapeamento, type FonteVigencia, type Mapeamento,
} from "./mapeamento";

export interface LojaCadastrada {
  id: string;
  luc: string;
  nome_fantasia: string;
  area_m2: number | null;
  piso: string | null;
  localizacao: string | null;
  segmento: string | null;
  auditada: boolean;
  ativa: boolean;
  percentuais: { vigencia_inicio: string | null; percentual: number }[];   // null = a definir
  minimos: { vigencia_inicio: string | null; valor: number }[];
  dezembro: { ano: number; valor: number }[];
}

/** Formato enviado à função importar_lojas do banco. Campo AUSENTE = não alterar. */
export interface LinhaParaGravar {
  luc: string;
  nome_fantasia?: string;
  area_m2?: string;
  piso?: string;
  localizacao?: string;
  segmento?: string;
  auditada?: boolean;
  ativa?: boolean;
  percentual?: string;
  percentual_vigencia?: string | null;   // null = vigência a definir
  aluguel_minimo?: string;
  minimo_vigencia?: string | null;       // null = vigência a definir
  ano_13?: number;
  valor_13?: string;
}

export type Situacao = "nova" | "atualizacao" | "sem_alteracao" | "erro";

export interface ResultadoLinha {
  linha: number;            // número da linha na planilha (como o Excel mostra)
  luc: string;
  nome: string;
  situacao: Situacao;
  erros: string[];
  avisos: string[];
  mudancas: string[];
  dados: LinhaParaGravar | null;
}

export interface ResultadoValidacao {
  errosGerais: string[];
  avisosGerais: string[];
  camposLidos: string[];
  linhas: ResultadoLinha[];
  totais: Record<Situacao, number> & { linhas: number };
  podeImportar: boolean;
  paraGravar: LinhaParaGravar[];
}

const texto = (v: Celula | undefined): string =>
  celulaVazia(v) ? "" : v instanceof Date ? formatarData(v.toISOString().slice(0, 10)) : String(v).replace(/\s+/g, " ").trim();
const simNao = (b: boolean) => (b ? "Sim" : "Não");
const igual = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
const fmtArea = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²`;

/** Lista curta de números de linha: "3, 7, 12 e mais 4". */
function listaLinhas(ns: number[]): string {
  return ns.slice(0, 15).join(", ") + (ns.length > 15 ? ` e mais ${ns.length - 15}` : "");
}

export function validarPlanilhaLojas(
  matriz: Celula[][],
  cadastro: LojaCadastrada[],
  mapeamentoInformado?: Mapeamento,
): ResultadoValidacao {
  const errosGerais: string[] = [];
  const avisosGerais: string[] = [];
  const linhas: ResultadoLinha[] = [];
  let camposLidos: string[] = [];

  // Sem escolha explícita, usa a sugestão automática pelos títulos das colunas.
  let m = mapeamentoInformado;
  if (!m) {
    const cab = analisarCabecalho(matriz);
    if (!cab.ok) {
      errosGerais.push(cab.erro);
      return montar();
    }
    m = cab.sugestao;
  }
  errosGerais.push(...validarMapeamento(m));
  if (errosGerais.length) return montar();
  camposLidos = descreverMapeamento(m);
  avisosGerais.push(...avisosMapeamento(m));

  const map = m;
  const f = map.fixos ?? {};
  const escolhido = (c: ChaveColuna) => map.colunas[c] !== undefined;
  const pegar = (l: Celula[], c: ChaveColuna): Celula | undefined => {
    const i = map.colunas[c];
    return i === undefined ? undefined : l[i];
  };
  const origemPct = fontesVigencia(map, "percentual_vigencia");
  const origemMin = fontesVigencia(map, "minimo_vigencia");

  const corpo = matriz.slice(map.linhaCabecalho + 1);
  if (corpo.length > LIMITE_LINHAS) {
    errosGerais.push(`A planilha tem ${corpo.length} linhas; o limite é ${LIMITE_LINHAS}. Divida em duas planilhas.`);
    return montar();
  }

  // Índice do cadastro por LUC: a ativa tem prioridade (mesma regra do banco).
  const porLuc = new Map<string, LojaCadastrada>();
  for (const l of cadastro) {
    const atual = porLuc.get(l.luc);
    if (!atual || (!atual.ativa && l.ativa)) porLuc.set(l.luc, l);
  }
  const lucsNaPlanilha = new Map<string, number>();
  const semLuc: number[] = [];
  const ignoradas: number[] = [];
  const repetidas: number[] = [];

  corpo.forEach((l, i) => {
    const numero = map.linhaCabecalho + i + 2;
    if (l.every((c) => celulaVazia(c))) return; // linha em branco
    const avisos: string[] = [];
    const mudancas: string[] = [];

    const luc = normalizarLuc(texto(pegar(l, "luc")));
    if (!luc) { semLuc.push(numero); return; }
    // linha de total/subtotal, ou título de grupo (só a célula da LUC preenchida): não é loja
    const soLuc = l.every((c, i) => i === map.colunas.luc || celulaVazia(c));
    if (/^(sub\s*)?tota(l|is)\b|^total\s+geral/i.test(luc) || soLuc) {
      ignoradas.push(numero);
      return;
    }
    const dados: LinhaParaGravar = { luc };
    if (lucsNaPlanilha.has(luc)) {
      repetidas.push(numero);
      avisos.push(`LUC também aparece na linha ${lucsNaPlanilha.get(luc)}: as duas linhas são gravadas (a de baixo prevalece nos dados da loja).`);
    } else lucsNaPlanilha.set(luc, numero);
    const existente = porLuc.get(luc);
    const ignorado = (campo: string, bruto: Celula | undefined, motivo = "não reconhecido") =>
      avisos.push(`${campo} ${motivo} (“${texto(bruto)}”): campo ignorado nesta linha.`);

    // Nome
    let nome = existente?.nome_fantasia ?? "";
    if (escolhido("nome_fantasia")) {
      const n = texto(pegar(l, "nome_fantasia"));
      if (n) { nome = n; dados.nome_fantasia = n; }
    }
    if (!existente && !nome) {
      nome = luc;
      avisos.push("Loja nova sem nome na planilha: será cadastrada com a LUC como nome (ajuste depois na página da loja).");
    }

    // Área
    if (escolhido("area")) {
      const bruto = pegar(l, "area");
      const limpo = typeof bruto === "string" ? bruto.replace(/m\s*[²2]?\s*$/i, "").trim() : bruto;
      const a = lerNumeroBR(limpo);
      if (a !== null && (Number.isNaN(a) || a < 0)) ignorado("Área", bruto);
      else if (a !== null) dados.area_m2 = paraDecimalBanco(a, 2);
    }
    // Textos simples: vazio = mantém o que está no cadastro
    for (const k of ["piso", "localizacao", "segmento"] as const) {
      if (!escolhido(k)) continue;
      const v = texto(pegar(l, k));
      if (v) dados[k] = v.slice(0, 200);
    }

    for (const k of ["auditada", "ativa"] as const) {
      if (!escolhido(k)) continue;
      const v = lerSimNao(celulaVazia(pegar(l, k)) ? null : pegar(l, k));
      if (v === undefined) ignorado(k === "auditada" ? "“Auditada”" : "“Ativa”", pegar(l, k), "deveria ser S ou N");
      else if (v !== null) dados[k] = v;
    }

    // Vigência (qualquer dia). null = a definir; erro de leitura vira aviso e fica a definir.
    const lerVig = (fontes: FonteVigencia[], nomeCampo: string): string | null => {
      for (const fonte of fontes) {
        if (fonte.tipo === "fixa") return fonte.data;
        const bruto = l[fonte.indice];
        if (celulaVazia(bruto)) continue;
        const v = lerDataVigencia(bruto);
        if (v.ok) return v.data;
        avisos.push(`Vigência do ${nomeCampo} não reconhecida (“${texto(bruto)}”): ficará “a definir”.`);
        return null;
      }
      return null;
    };

    // Percentual
    let percentual: number | null = null;
    let pctVig: string | null = null;
    if (escolhido("percentual")) {
      const bruto = pegar(l, "percentual");
      let p = lerNumeroBR(bruto);
      if (p !== null && Number.isNaN(p)) ignorado("Percentual", bruto);
      else if (p !== null && (p < 0 || p > 100)) ignorado("Percentual", bruto, "fora de 0 a 100");
      else if (p !== null) {
        if (p > 0 && p < 1 && !(typeof bruto === "string" && bruto.includes("%"))) {
          avisos.push(`Percentual “${texto(bruto)}” interpretado como ${formatarPercentual(p * 100)}.`);
          p = p * 100;
        }
        percentual = Math.round(p * 10000) / 10000;
        pctVig = lerVig(origemPct, "percentual");
        if (percentual > 30) avisos.push(`Percentual alto (${formatarPercentual(percentual)}): confira.`);
        dados.percentual = paraDecimalBanco(percentual, 4);
        dados.percentual_vigencia = pctVig;
        if (pctVig === null) avisos.push("Percentual com vigência a definir.");
      }
    }

    // Aluguel mínimo
    let minimo: number | null = null;
    let minVig: string | null = null;
    if (escolhido("aluguel_minimo")) {
      const bruto = pegar(l, "aluguel_minimo");
      const v = lerNumeroBR(bruto);
      if (v !== null && (Number.isNaN(v) || v < 0)) ignorado("Aluguel mínimo", bruto);
      else if (v !== null) {
        minimo = Math.round(v * 100) / 100;
        minVig = lerVig(origemMin, "aluguel mínimo");
        dados.aluguel_minimo = paraDecimalBanco(minimo, 2);
        dados.minimo_vigencia = minVig;
        if (minVig === null) avisos.push("Aluguel mínimo com vigência a definir.");
      }
    }

    // 13º aluguel (precisa do ano)
    let ano13: number | null = null;
    let valor13: number | null = null;
    if (escolhido("valor_13")) {
      const v = lerNumeroBR(pegar(l, "valor_13"));
      if (v !== null && (Number.isNaN(v) || v < 0)) ignorado("Aluguel 13º", pegar(l, "valor_13"));
      else if (v !== null) valor13 = Math.round(v * 100) / 100;
      if (escolhido("ano_13")) {
        const bruto = pegar(l, "ano_13");
        const a = bruto instanceof Date ? bruto.getUTCFullYear() : lerNumeroBR(bruto);
        if (a !== null && (Number.isNaN(a) || !Number.isInteger(a) || a < 2000 || a > 2100)) ignorado("Ano do 13º", bruto);
        else if (a !== null) ano13 = a;
      } else ano13 = f.ano_13 ?? null;
      if (valor13 !== null && ano13 === null) avisos.push("13º aluguel sem ano: ignorado nesta linha.");
      if (valor13 !== null && ano13 !== null) {
        dados.ano_13 = ano13;
        dados.valor_13 = paraDecimalBanco(valor13, 2);
      }
    }

    // O que muda em relação ao cadastro
    if (existente) {
      if (dados.nome_fantasia !== undefined && existente.nome_fantasia !== dados.nome_fantasia) mudancas.push(`Nome: "${existente.nome_fantasia}" → "${dados.nome_fantasia}"`);
      if (dados.area_m2 !== undefined && Number(existente.area_m2 ?? NaN) !== Number(dados.area_m2))
        mudancas.push(`Área: ${existente.area_m2 === null ? "—" : fmtArea(existente.area_m2)} → ${fmtArea(Number(dados.area_m2))}`);
      if (dados.piso !== undefined && !igual(existente.piso, dados.piso)) mudancas.push(`Piso: "${existente.piso ?? ""}" → "${dados.piso}"`);
      if (dados.localizacao !== undefined && !igual(existente.localizacao, dados.localizacao)) mudancas.push(`Localização: "${existente.localizacao ?? ""}" → "${dados.localizacao}"`);
      if (dados.segmento !== undefined && !igual(existente.segmento, dados.segmento)) mudancas.push(`Segmento: "${existente.segmento ?? ""}" → "${dados.segmento}"`);
      if (dados.auditada !== undefined && dados.auditada !== existente.auditada) mudancas.push(`Auditada: ${simNao(existente.auditada)} → ${simNao(dados.auditada)}`);
      if (dados.ativa !== undefined && dados.ativa !== existente.ativa) {
        mudancas.push(`Ativa: ${simNao(existente.ativa)} → ${simNao(dados.ativa)}`);
        if (dados.ativa) avisos.push("A loja estava inativa e será reativada.");
      }
      if (percentual !== null) {
        const atual = existente.percentuais.find((p) => p.vigencia_inicio === pctVig);
        const quando = pctVig ? `a partir de ${formatarData(pctVig)}` : "com vigência a definir";
        if (!atual) mudancas.push(`Percentual ${formatarPercentual(percentual)} ${quando}`);
        else if (Number(atual.percentual) !== percentual) mudancas.push(`Percentual ${quando}: ${formatarPercentual(atual.percentual)} → ${formatarPercentual(percentual)}`);
      }
      if (minimo !== null) {
        const atual = existente.minimos.find((x) => x.vigencia_inicio === minVig);
        const quando = minVig ? `a partir de ${formatarData(minVig)}` : "com vigência a definir";
        if (!atual) mudancas.push(`Aluguel mínimo ${formatarMoeda(minimo)} ${quando}`);
        else if (Number(atual.valor) !== minimo) mudancas.push(`Aluguel mínimo ${quando}: ${formatarMoeda(atual.valor)} → ${formatarMoeda(minimo)}`);
      }
      if (dados.valor_13 && ano13 !== null && valor13 !== null) {
        const atual = existente.dezembro.find((d) => d.ano === ano13);
        if (!atual) mudancas.push(`13º aluguel de ${ano13}: ${formatarMoeda(valor13)}`);
        else if (Number(atual.valor) !== valor13) mudancas.push(`13º aluguel de ${ano13}: ${formatarMoeda(atual.valor)} → ${formatarMoeda(valor13)}`);
      }
    } else {
      if (dados.area_m2 !== undefined) mudancas.push(`Área: ${fmtArea(Number(dados.area_m2))}`);
      if (dados.piso) mudancas.push(`Piso: ${dados.piso}`);
      if (dados.segmento) mudancas.push(`Segmento: ${dados.segmento}`);
      if (percentual !== null) mudancas.push(`Percentual ${formatarPercentual(percentual)}${pctVig ? ` a partir de ${formatarData(pctVig)}` : ""}`);
      if (minimo !== null) mudancas.push(`Aluguel mínimo ${formatarMoeda(minimo)}${minVig ? ` a partir de ${formatarData(minVig)}` : ""}`);
      if (percentual === null && escolhido("percentual")) avisos.push("Sem percentual: informe depois na página da loja.");
      if (minimo === null && escolhido("aluguel_minimo")) avisos.push("Sem aluguel mínimo: informe depois na página da loja.");
    }

    const primeira = lucsNaPlanilha.get(luc) === numero;
    const situacao: Situacao = !existente && primeira ? "nova" : mudancas.length ? "atualizacao" : "sem_alteracao";

    linhas.push({ linha: numero, luc, nome, situacao, erros: [], avisos, mudancas, dados });
  });

  if (semLuc.length) avisosGerais.push(`${semLuc.length} linha(s) sem LUC foram ignoradas (linhas ${listaLinhas(semLuc)}). Confira se não é uma loja sem o código.`);
  if (ignoradas.length) avisosGerais.push(`${ignoradas.length} linha(s) de título ou total foram ignoradas (linhas ${listaLinhas(ignoradas)}): a linha só tinha a célula da LUC preenchida ou era uma linha de total. Se alguma delas for loja, preencha ao menos o nome.`);
  if (repetidas.length) avisosGerais.push(`${repetidas.length} linha(s) repetem uma LUC já listada acima (linhas ${listaLinhas(repetidas)}). Todas serão gravadas.`);
  if (!linhas.length) errosGerais.push("Nenhuma linha com LUC foi encontrada abaixo da linha de títulos. Confira se a coluna escolhida para a LUC está certa.");

  const naoListadas = cadastro.filter((c) => c.ativa && !lucsNaPlanilha.has(c.luc));
  if (linhas.length && naoListadas.length) {
    avisosGerais.push(
      `${naoListadas.length} loja(s) ativa(s) do cadastro não aparecem na planilha e não serão alteradas: ` +
        naoListadas.slice(0, 10).map((c) => c.luc).join(", ") + (naoListadas.length > 10 ? "…" : "") + ".",
    );
  }

  return montar();

  function montar(): ResultadoValidacao {
    const totais = { linhas: linhas.length, nova: 0, atualizacao: 0, sem_alteracao: 0, erro: 0 };
    for (const l of linhas) totais[l.situacao]++;
    const podeImportar = !errosGerais.length && totais.nova + totais.atualizacao > 0;
    return {
      errosGerais, avisosGerais, camposLidos, linhas, totais, podeImportar,
      paraGravar: podeImportar ? linhas.filter((l) => l.situacao !== "sem_alteracao").map((l) => l.dados!) : [],
    };
  }
}
