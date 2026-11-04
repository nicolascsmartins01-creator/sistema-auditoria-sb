/**
 * Validação linha a linha da planilha de cadastro de lojas.
 * Função pura (sem banco): recebe a matriz lida da planilha e o cadastro atual,
 * devolve a prévia (o que será criado/alterado) e os erros.
 * Regra: qualquer erro bloqueia a importação inteira (tudo ou nada).
 */
import {
  formatarMesAno, formatarMoeda, formatarPercentual, lerMesAno, lerNumeroBR,
  lerSimNao, normalizarLuc, paraDecimalBanco,
} from "@/lib/formato";
import { COLUNAS, mapearCabecalho, type ChaveColuna } from "./colunas";
import { LIMITE_LINHAS, type Celula } from "./ler-planilha";

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

/** Formato enviado à função importar_lojas do banco. */
export interface LinhaParaGravar {
  luc: string;
  nome_fantasia: string;
  localizacao: string | null;
  segmento: string | null;
  auditada: boolean | null;
  ativa: boolean | null;
  percentual: string | null;
  percentual_vigencia: string | null;
  aluguel_minimo: string | null;
  minimo_vigencia: string | null;
  ano_13: number | null;
  valor_13: string | null;
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
  linhas: ResultadoLinha[];
  totais: Record<Situacao, number> & { linhas: number };
  podeImportar: boolean;
  paraGravar: LinhaParaGravar[];
}

const texto = (v: Celula | undefined): string => (v === null || v === undefined ? "" : String(v).trim());
const simNao = (b: boolean) => (b ? "Sim" : "Não");

export function validarPlanilhaLojas(matriz: Celula[][], cadastro: LojaCadastrada[]): ResultadoValidacao {
  const errosGerais: string[] = [];
  const avisosGerais: string[] = [];
  const linhas: ResultadoLinha[] = [];

  // Cabeçalho: primeira linha (entre as 10 primeiras) que tenha a coluna LUC.
  const idxCab = matriz.slice(0, 10).findIndex((l) => mapearCabecalho(l).indice.luc !== undefined);
  if (idxCab < 0) {
    errosGerais.push('Não encontrei o cabeçalho. A planilha precisa ter as colunas "LUC" e "Nome fantasia" (baixe o modelo).');
    return montar();
  }
  const cab = mapearCabecalho(matriz[idxCab]);
  if (cab.faltando.length) errosGerais.push(`Coluna(s) obrigatória(s) ausente(s): ${cab.faltando.join(", ")}.`);
  if (cab.repetidas.length) errosGerais.push(`Coluna(s) repetida(s): ${cab.repetidas.join(", ")}.`);
  if (cab.desconhecidas.length) avisosGerais.push(`Coluna(s) ignorada(s) por não fazerem parte do modelo: ${cab.desconhecidas.join(", ")}.`);
  if (errosGerais.length) return montar();

  const pegar = (l: Celula[], c: ChaveColuna): Celula | undefined => {
    const i = cab.indice[c];
    return i === undefined ? undefined : l[i];
  };

  const corpo = matriz.slice(idxCab + 1);
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
    const numero = idxCab + i + 2;
    if (l.every((c) => texto(c) === "")) return; // linha em branco
    const erros: string[] = [];
    const avisos: string[] = [];
    const mudancas: string[] = [];

    const luc = normalizarLuc(pegar(l, "luc"));
    const nome = texto(pegar(l, "nome_fantasia"));
    const localizacao = texto(pegar(l, "localizacao")) || null;
    const segmento = texto(pegar(l, "segmento")) || null;

    if (!luc) erros.push("LUC vazia.");
    else if (lucsNaPlanilha.has(luc)) erros.push(`LUC repetida na planilha (também na linha ${lucsNaPlanilha.get(luc)}).`);
    else lucsNaPlanilha.set(luc, numero);
    if (!nome) erros.push("Nome fantasia vazio.");

    const auditada = lerSimNao(pegar(l, "auditada"));
    if (auditada === undefined) erros.push('"Auditada" deve ser S ou N.');
    const ativa = lerSimNao(pegar(l, "ativa"));
    if (ativa === undefined) erros.push('"Ativa" deve ser S ou N.');

    // Percentual + vigência
    let percentual: number | null = null;
    let pctVig: string | null = null;
    {
      const p = lerNumeroBR(pegar(l, "percentual"));
      const vBruto = pegar(l, "percentual_vigencia");
      if (p !== null && Number.isNaN(p)) erros.push(`Percentual inválido: "${texto(pegar(l, "percentual"))}".`);
      else if (p !== null && (p <= 0 || p > 100)) erros.push("Percentual deve ser maior que 0 e no máximo 100.");
      else if (p !== null) {
        percentual = Math.round(p * 10000) / 10000;
        if (percentual < 1) avisos.push(`Percentual de ${formatarPercentual(percentual)} — confira se não quis dizer ${formatarPercentual(percentual * 100)}.`);
        if (percentual > 30) avisos.push(`Percentual alto (${formatarPercentual(percentual)}) — confira.`);
      }
      if (texto(vBruto) !== "") {
        const v = lerMesAno(vBruto);
        if (!v.ok) erros.push(`Início de vigência do percentual inválido: ${v.erro}.`);
        else pctVig = v.data;
      }
      if (p !== null && !Number.isNaN(p) && texto(vBruto) === "") erros.push("Percentual preenchido sem o início de vigência.");
      if (p === null && texto(vBruto) !== "") erros.push("Início de vigência do percentual preenchido sem o percentual.");
    }

    // Aluguel mínimo + vigência
    let minimo: number | null = null;
    let minVig: string | null = null;
    {
      const m = lerNumeroBR(pegar(l, "aluguel_minimo"));
      const vBruto = pegar(l, "minimo_vigencia");
      if (m !== null && Number.isNaN(m)) erros.push(`Aluguel mínimo inválido: "${texto(pegar(l, "aluguel_minimo"))}".`);
      else if (m !== null && m < 0) erros.push("Aluguel mínimo não pode ser negativo.");
      else if (m !== null) minimo = Math.round(m * 100) / 100;
      if (texto(vBruto) !== "") {
        const v = lerMesAno(vBruto);
        if (!v.ok) erros.push(`Início de vigência do mínimo inválido: ${v.erro}.`);
        else minVig = v.data;
      }
      if (m !== null && !Number.isNaN(m) && texto(vBruto) === "") erros.push("Aluguel mínimo preenchido sem o início de vigência.");
      if (m === null && texto(vBruto) !== "") erros.push("Início de vigência do mínimo preenchido sem o valor.");
    }

    // 13º aluguel
    let ano13: number | null = null;
    let valor13: number | null = null;
    {
      const a = lerNumeroBR(pegar(l, "ano_13"));
      const v = lerNumeroBR(pegar(l, "valor_13"));
      if (a !== null && (Number.isNaN(a) || !Number.isInteger(a) || a < 2000 || a > 2100)) erros.push(`Ano do 13º inválido: "${texto(pegar(l, "ano_13"))}".`);
      else if (a !== null) ano13 = a;
      if (v !== null && Number.isNaN(v)) erros.push(`Aluguel 13º inválido: "${texto(pegar(l, "valor_13"))}".`);
      else if (v !== null && v < 0) erros.push("Aluguel 13º não pode ser negativo.");
      else if (v !== null) valor13 = Math.round(v * 100) / 100;
      if ((a === null) !== (v === null)) erros.push("Preencha o ano e o valor do 13º juntos (ou deixe os dois vazios).");
    }

    const existente = luc ? porLuc.get(luc) : undefined;

    if (existente) {
      if (existente.nome_fantasia !== nome && nome) mudancas.push(`Nome: "${existente.nome_fantasia}" → "${nome}"`);
      if ((existente.localizacao ?? null) !== localizacao) mudancas.push(`Localização: "${existente.localizacao ?? ""}" → "${localizacao ?? ""}"`);
      if ((existente.segmento ?? "").toLowerCase() !== (segmento ?? "").toLowerCase()) mudancas.push(`Segmento: "${existente.segmento ?? ""}" → "${segmento ?? ""}"`);
      if (auditada !== null && auditada !== undefined && auditada !== existente.auditada) mudancas.push(`Auditada: ${simNao(existente.auditada)} → ${simNao(auditada)}`);
      if (ativa !== null && ativa !== undefined && ativa !== existente.ativa) {
        mudancas.push(`Ativa: ${simNao(existente.ativa)} → ${simNao(ativa)}`);
        if (ativa) avisos.push("A loja estava inativa e será reativada.");
      }
      if (percentual !== null && pctVig) {
        const atual = existente.percentuais.find((p) => p.vigencia_inicio === pctVig);
        if (!atual) mudancas.push(`Nova vigência de percentual a partir de ${formatarMesAno(pctVig)}: ${formatarPercentual(percentual)}`);
        else if (Number(atual.percentual) !== percentual) mudancas.push(`Percentual de ${formatarMesAno(pctVig)}: ${formatarPercentual(atual.percentual)} → ${formatarPercentual(percentual)}`);
        const maisRecente = existente.percentuais.map((p) => p.vigencia_inicio).sort().at(-1);
        if (!atual && maisRecente && pctVig < maisRecente) avisos.push(`Vigência de percentual anterior à mais recente cadastrada (${formatarMesAno(maisRecente)}).`);
      }
      if (minimo !== null && minVig) {
        const atual = existente.minimos.find((m) => m.vigencia_inicio === minVig);
        if (!atual) mudancas.push(`Nova vigência de aluguel mínimo a partir de ${formatarMesAno(minVig)}: ${formatarMoeda(minimo)}`);
        else if (Number(atual.valor) !== minimo) mudancas.push(`Aluguel mínimo de ${formatarMesAno(minVig)}: ${formatarMoeda(atual.valor)} → ${formatarMoeda(minimo)}`);
        const maisRecente = existente.minimos.map((m) => m.vigencia_inicio).sort().at(-1);
        if (!atual && maisRecente && minVig < maisRecente) avisos.push(`Vigência de aluguel mínimo anterior à mais recente cadastrada (${formatarMesAno(maisRecente)}).`);
      }
      if (valor13 !== null && ano13 !== null) {
        const atual = existente.dezembro.find((d) => d.ano === ano13);
        if (!atual) mudancas.push(`13º aluguel de ${ano13}: ${formatarMoeda(valor13)}`);
        else if (Number(atual.valor) !== valor13) mudancas.push(`13º aluguel de ${ano13}: ${formatarMoeda(atual.valor)} → ${formatarMoeda(valor13)}`);
      }
    } else if (luc) {
      if (percentual === null) avisos.push("Loja nova sem percentual cadastrado.");
      if (minimo === null) avisos.push("Loja nova sem aluguel mínimo cadastrado.");
    }

    const situacao: Situacao = erros.length
      ? "erro"
      : !existente ? "nova" : mudancas.length ? "atualizacao" : "sem_alteracao";

    linhas.push({
      linha: numero, luc, nome, situacao, erros, avisos, mudancas,
      dados: erros.length ? null : {
        luc, nome_fantasia: nome, localizacao, segmento,
        auditada: auditada ?? null, ativa: ativa ?? null,
        percentual: percentual === null ? null : paraDecimalBanco(percentual, 4),
        percentual_vigencia: percentual === null ? null : pctVig,
        aluguel_minimo: minimo === null ? null : paraDecimalBanco(minimo, 2),
        minimo_vigencia: minimo === null ? null : minVig,
        ano_13: valor13 === null ? null : ano13,
        valor_13: valor13 === null ? null : paraDecimalBanco(valor13, 2),
      },
    });
  });

  if (!linhas.length) errosGerais.push("A planilha não tem nenhuma linha de loja abaixo do cabeçalho.");

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
      errosGerais, avisosGerais, linhas, totais, podeImportar,
      paraGravar: podeImportar ? linhas.filter((l) => l.situacao !== "sem_alteracao").map((l) => l.dados!) : [],
    };
  }
}

export { COLUNAS };
