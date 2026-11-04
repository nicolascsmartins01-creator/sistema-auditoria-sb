/**
 * Validação linha a linha da planilha de cadastro de lojas.
 * Função pura (sem banco): recebe a matriz lida da planilha, o cadastro atual e
 * a escolha de colunas; devolve a prévia (o que será criado/alterado) e os erros.
 *
 * Regras:
 *  - Só os campos com coluna escolhida são lidos e atualizados; os demais
 *    ficam como estão no cadastro.
 *  - Qualquer erro bloqueia a importação inteira (tudo ou nada).
 *  - Célula vazia em Auditada/Ativa/Percentual/Mínimo/13º = não altera aquela loja.
 *    Célula vazia em Localização/Segmento = apaga o valor (o campo foi escolhido).
 */
import {
  formatarMesAno, formatarMoeda, formatarPercentual, lerMesAno, lerNumeroBR,
  lerSimNao, normalizarLuc, paraDecimalBanco,
} from "@/lib/formato";
import type { ChaveColuna } from "./colunas";
import { LIMITE_LINHAS, type Celula } from "./ler-planilha";
import { analisarCabecalho, descreverMapeamento, validarMapeamento, type Mapeamento } from "./mapeamento";

export interface LojaCadastrada {
  id: string;
  luc: string;
  nome_fantasia: string;
  localizacao: string | null;
  segmento: string | null;
  auditada: boolean;
  ativa: boolean;
  percentuais: { vigencia_inicio: string; percentual: number }[];
  minimos: { vigencia_inicio: string; valor: number }[];
  dezembro: { ano: number; valor: number }[];
}

/**
 * Formato enviado à função importar_lojas do banco. Campo AUSENTE = não
 * alterar; presente com null = apagar (localização/segmento) ou manter
 * (auditada/ativa).
 */
export interface LinhaParaGravar {
  luc: string;
  nome_fantasia?: string;
  localizacao?: string | null;
  segmento?: string | null;
  auditada?: boolean | null;
  ativa?: boolean | null;
  percentual?: string;
  percentual_vigencia?: string;
  aluguel_minimo?: string;
  minimo_vigencia?: string;
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

const texto = (v: Celula | undefined): string => (v === null || v === undefined ? "" : String(v).trim());
const simNao = (b: boolean) => (b ? "Sim" : "Não");

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

  const map = m;
  const f = map.fixos ?? {};
  const escolhido = (c: ChaveColuna) => map.colunas[c] !== undefined;
  const pegar = (l: Celula[], c: ChaveColuna): Celula | undefined => {
    const i = map.colunas[c];
    return i === undefined ? undefined : l[i];
  };

  const corpo = matriz.slice(map.linhaCabecalho + 1);
  if (corpo.length > LIMITE_LINHAS) {
    errosGerais.push(`A planilha tem ${corpo.length} linhas; o limite é ${LIMITE_LINHAS}.`);
    return montar();
  }

  // Índice do cadastro por LUC: a ativa tem prioridade (mesma regra do banco).
  const porLuc = new Map<string, LojaCadastrada>();
  for (const l of cadastro) {
    const atual = porLuc.get(l.luc);
    if (!atual || (!atual.ativa && l.ativa)) porLuc.set(l.luc, l);
  }
  const lucsNaPlanilha = new Map<string, number>();

  corpo.forEach((l, i) => {
    const numero = map.linhaCabecalho + i + 2;
    if (l.every((c) => texto(c) === "")) return; // linha em branco
    const erros: string[] = [];
    const avisos: string[] = [];
    const mudancas: string[] = [];
    const dados: LinhaParaGravar = { luc: "" };

    const luc = normalizarLuc(pegar(l, "luc"));
    dados.luc = luc;
    if (!luc) erros.push("LUC vazia.");
    else if (lucsNaPlanilha.has(luc)) erros.push(`LUC repetida na planilha (também na linha ${lucsNaPlanilha.get(luc)}).`);
    else lucsNaPlanilha.set(luc, numero);
    const existente = luc ? porLuc.get(luc) : undefined;

    // Nome fantasia
    let nome = existente?.nome_fantasia ?? "";
    if (escolhido("nome_fantasia")) {
      nome = texto(pegar(l, "nome_fantasia"));
      if (!nome) erros.push("Nome fantasia vazio.");
      else dados.nome_fantasia = nome;
    } else if (luc && !existente) {
      erros.push('Loja nova (LUC não cadastrada): é preciso escolher a coluna "Nome fantasia" para cadastrá-la.');
    }

    if (escolhido("localizacao")) dados.localizacao = texto(pegar(l, "localizacao")) || null;
    if (escolhido("segmento")) dados.segmento = texto(pegar(l, "segmento")) || null;

    if (escolhido("auditada")) {
      const v = lerSimNao(pegar(l, "auditada"));
      if (v === undefined) erros.push('"Auditada" deve ser S ou N.');
      else dados.auditada = v;
    }
    if (escolhido("ativa")) {
      const v = lerSimNao(pegar(l, "ativa"));
      if (v === undefined) erros.push('"Ativa" deve ser S ou N.');
      else dados.ativa = v;
    }

    // Vigência: coluna da planilha ou mês fixo escolhido na tela
    const lerVigencia = (chave: "percentual_vigencia" | "minimo_vigencia", nomeCampo: string): string | null => {
      if (!escolhido(chave)) return f[chave] ?? null;
      const bruto = pegar(l, chave);
      if (texto(bruto) === "") { erros.push(`${nomeCampo} preenchido sem o início de vigência.`); return null; }
      const v = lerMesAno(bruto);
      if (!v.ok) { erros.push(`Início de vigência do ${nomeCampo.toLowerCase()} inválido: ${v.erro}.`); return null; }
      return v.data;
    };

    // Percentual
    let percentual: number | null = null;
    let pctVig: string | null = null;
    if (escolhido("percentual")) {
      const bruto = pegar(l, "percentual");
      const p = lerNumeroBR(bruto);
      if (p !== null && Number.isNaN(p)) erros.push(`Percentual inválido: "${texto(bruto)}".`);
      else if (p !== null && (p <= 0 || p > 100)) erros.push("Percentual deve ser maior que 0 e no máximo 100.");
      else if (p !== null) {
        percentual = Math.round(p * 10000) / 10000;
        pctVig = lerVigencia("percentual_vigencia", "Percentual");
        if (percentual < 1) avisos.push(`Percentual de ${formatarPercentual(percentual)} — confira se não quis dizer ${formatarPercentual(percentual * 100)}.`);
        if (percentual > 30) avisos.push(`Percentual alto (${formatarPercentual(percentual)}) — confira.`);
      } else if (escolhido("percentual_vigencia") && texto(pegar(l, "percentual_vigencia")) !== "") {
        erros.push("Início de vigência do percentual preenchido sem o percentual.");
      }
      if (percentual !== null && pctVig) {
        dados.percentual = paraDecimalBanco(percentual, 4);
        dados.percentual_vigencia = pctVig;
      }
    }

    // Aluguel mínimo
    let minimo: number | null = null;
    let minVig: string | null = null;
    if (escolhido("aluguel_minimo")) {
      const bruto = pegar(l, "aluguel_minimo");
      const v = lerNumeroBR(bruto);
      if (v !== null && Number.isNaN(v)) erros.push(`Aluguel mínimo inválido: "${texto(bruto)}".`);
      else if (v !== null && v < 0) erros.push("Aluguel mínimo não pode ser negativo.");
      else if (v !== null) {
        minimo = Math.round(v * 100) / 100;
        minVig = lerVigencia("minimo_vigencia", "Aluguel mínimo");
      } else if (escolhido("minimo_vigencia") && texto(pegar(l, "minimo_vigencia")) !== "") {
        erros.push("Início de vigência do mínimo preenchido sem o valor.");
      }
      if (minimo !== null && minVig) {
        dados.aluguel_minimo = paraDecimalBanco(minimo, 2);
        dados.minimo_vigencia = minVig;
      }
    }

    // 13º aluguel
    let ano13: number | null = null;
    let valor13: number | null = null;
    if (escolhido("valor_13")) {
      const v = lerNumeroBR(pegar(l, "valor_13"));
      if (v !== null && Number.isNaN(v)) erros.push(`Aluguel 13º inválido: "${texto(pegar(l, "valor_13"))}".`);
      else if (v !== null && v < 0) erros.push("Aluguel 13º não pode ser negativo.");
      else if (v !== null) valor13 = Math.round(v * 100) / 100;

      if (escolhido("ano_13")) {
        const a = lerNumeroBR(pegar(l, "ano_13"));
        if (a !== null && (Number.isNaN(a) || !Number.isInteger(a) || a < 2000 || a > 2100)) erros.push(`Ano do 13º inválido: "${texto(pegar(l, "ano_13"))}".`);
        else if (a !== null) ano13 = a;
        if ((a === null) !== (v === null)) erros.push("Preencha o ano e o valor do 13º juntos (ou deixe os dois vazios).");
      } else if (valor13 !== null) {
        ano13 = f.ano_13 ?? null;
      }
      if (valor13 !== null && ano13 !== null) {
        dados.ano_13 = ano13;
        dados.valor_13 = paraDecimalBanco(valor13, 2);
      }
    }

    // O que muda em relação ao cadastro
    if (existente) {
      if (dados.nome_fantasia !== undefined && existente.nome_fantasia !== dados.nome_fantasia) mudancas.push(`Nome: "${existente.nome_fantasia}" → "${dados.nome_fantasia}"`);
      if (dados.localizacao !== undefined && (existente.localizacao ?? null) !== dados.localizacao) mudancas.push(`Localização: "${existente.localizacao ?? ""}" → "${dados.localizacao ?? ""}"`);
      if (dados.segmento !== undefined && (existente.segmento ?? "").toLowerCase() !== (dados.segmento ?? "").toLowerCase()) mudancas.push(`Segmento: "${existente.segmento ?? ""}" → "${dados.segmento ?? ""}"`);
      if (dados.auditada != null && dados.auditada !== existente.auditada) mudancas.push(`Auditada: ${simNao(existente.auditada)} → ${simNao(dados.auditada)}`);
      if (dados.ativa != null && dados.ativa !== existente.ativa) {
        mudancas.push(`Ativa: ${simNao(existente.ativa)} → ${simNao(dados.ativa)}`);
        if (dados.ativa) avisos.push("A loja estava inativa e será reativada.");
      }
      if (dados.percentual && pctVig && percentual !== null) {
        const atual = existente.percentuais.find((p) => p.vigencia_inicio === pctVig);
        if (!atual) mudancas.push(`Nova vigência de percentual a partir de ${formatarMesAno(pctVig)}: ${formatarPercentual(percentual)}`);
        else if (Number(atual.percentual) !== percentual) mudancas.push(`Percentual de ${formatarMesAno(pctVig)}: ${formatarPercentual(atual.percentual)} → ${formatarPercentual(percentual)}`);
        const maisRecente = existente.percentuais.map((p) => p.vigencia_inicio).sort().at(-1);
        if (!atual && maisRecente && pctVig < maisRecente) avisos.push(`Vigência de percentual anterior à mais recente cadastrada (${formatarMesAno(maisRecente)}).`);
      }
      if (dados.aluguel_minimo && minVig && minimo !== null) {
        const atual = existente.minimos.find((x) => x.vigencia_inicio === minVig);
        if (!atual) mudancas.push(`Nova vigência de aluguel mínimo a partir de ${formatarMesAno(minVig)}: ${formatarMoeda(minimo)}`);
        else if (Number(atual.valor) !== minimo) mudancas.push(`Aluguel mínimo de ${formatarMesAno(minVig)}: ${formatarMoeda(atual.valor)} → ${formatarMoeda(minimo)}`);
        const maisRecente = existente.minimos.map((x) => x.vigencia_inicio).sort().at(-1);
        if (!atual && maisRecente && minVig < maisRecente) avisos.push(`Vigência de aluguel mínimo anterior à mais recente cadastrada (${formatarMesAno(maisRecente)}).`);
      }
      if (dados.valor_13 && ano13 !== null && valor13 !== null) {
        const atual = existente.dezembro.find((d) => d.ano === ano13);
        if (!atual) mudancas.push(`13º aluguel de ${ano13}: ${formatarMoeda(valor13)}`);
        else if (Number(atual.valor) !== valor13) mudancas.push(`13º aluguel de ${ano13}: ${formatarMoeda(atual.valor)} → ${formatarMoeda(valor13)}`);
      }
    } else if (luc && !erros.length) {
      if (!dados.percentual) avisos.push("Loja nova sem percentual cadastrado.");
      if (!dados.aluguel_minimo) avisos.push("Loja nova sem aluguel mínimo cadastrado.");
    }

    const situacao: Situacao = erros.length
      ? "erro"
      : !existente ? "nova" : mudancas.length ? "atualizacao" : "sem_alteracao";

    linhas.push({ linha: numero, luc, nome, situacao, erros, avisos, mudancas, dados: erros.length ? null : dados });
  });

  if (!linhas.length) errosGerais.push("A planilha não tem nenhuma linha de loja abaixo da linha de títulos.");

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
    const podeImportar = !errosGerais.length && totais.erro === 0 && totais.nova + totais.atualizacao > 0;
    return {
      errosGerais, avisosGerais, camposLidos, linhas, totais, podeImportar,
      paraGravar: podeImportar ? linhas.filter((l) => l.situacao !== "sem_alteracao").map((l) => l.dados!) : [],
    };
  }
}
