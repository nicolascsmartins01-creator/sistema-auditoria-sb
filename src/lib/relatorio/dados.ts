/**
 * Relatório do fechamento (dados congelados na versão) → linhas prontas para
 * tela, Excel e PDF, com o aluguel calculado por src/lib/aluguel.ts.
 */
import { calcularAluguel, type ResultadoAluguel } from "@/lib/aluguel";
import type { Classificacao } from "@/lib/conciliacao";

type Num = number | string | null;
const c = (v: Num | undefined): number | null => (v === null || v === undefined ? null : Math.round(Number(v) * 100));
const n = (v: Num | undefined): number | null => (v === null || v === undefined ? null : Number(v));

export interface DiaRel { lancamento_id: string; data: string; valor: Num; desvio: Num }
export interface LojaConcRel {
  loja_id: string; luc: string; nome: string; dias_auditados: number;
  informado: Num; auditado: Num; media_informada: Num; media_auditada: Num;
  projecao: Num; diferenca: Num; diferenca_percentual: Num; classificacao: Classificacao;
  percentual_vigente: Num; aluguel_minimo_vigente: Num; dias: DiaRel[] | null;
}
export interface LojaConsRel {
  loja_id: string; luc: string; nome: string; segmento: string | null; auditada: boolean; ativa: boolean;
  informado: Num; dias_auditados: number; auditado: Num; projecao: Num; diferenca: Num;
  percentual: Num; aluguel_minimo: Num; minimo_eh_13_aluguel: boolean | null; falta_13_aluguel: boolean | null;
}
export interface RelatorioEmitido {
  competencia: string; dias_no_mes: number; calculado_em: string;
  lojas: LojaConcRel[];
  consolidado?: LojaConsRel[];   // versões emitidas antes da Fase 6 não têm
  sem_informado: { luc: string; nome: string; dias_auditados: number }[];
  sem_auditoria: { luc: string; nome: string; informado: Num }[];
  informado_sem_loja: { luc: string; nome: string; valor: Num }[];
  totais: Record<string, Num>;
}

export interface LinhaConsolidada {
  loja_id: string; luc: string; nome: string; segmento: string | null; auditada: boolean;
  informadoCentavos: number | null;
  diasAuditados: number; auditadoCentavos: number;
  mediaInformadaCentavos: number | null; mediaAuditadaCentavos: number | null;
  projecaoCentavos: number | null; diferencaCentavos: number | null; diferencaPercentual: number | null;
  classificacao: Classificacao | null;
  percentual: number | null; minimoEh13: boolean; falta13: boolean;
  aluguel: ResultadoAluguel | null;           // null = sem venda informada no mês
  dias: { data: string; valorCentavos: number; desvioCentavos: number }[];
}

export interface Meta {
  mes: string;               // aaaa-mm
  versao: number | null;     // null = prévia (não emitida)
  tipo: string | null;
  emitidoEm: string | null;
  emitidoPor: string | null;
}

export function linhasConsolidadas(r: RelatorioEmitido): LinhaConsolidada[] {
  const conc = new Map(r.lojas.map((l) => [l.loja_id, l]));
  const base: LojaConsRel[] = r.consolidado ?? r.lojas.map((l) => ({
    loja_id: l.loja_id, luc: l.luc, nome: l.nome, segmento: null, auditada: true, ativa: true,
    informado: l.informado, dias_auditados: l.dias_auditados, auditado: l.auditado, projecao: l.projecao, diferenca: l.diferenca,
    percentual: l.percentual_vigente, aluguel_minimo: l.aluguel_minimo_vigente, minimo_eh_13_aluguel: null, falta_13_aluguel: null,
  }));
  return base.map((l) => {
    const k = conc.get(l.loja_id);
    const informado = c(l.informado);
    const projecao = c(l.projecao);
    const percentual = n(l.percentual);
    const minimo = c(l.aluguel_minimo);
    return {
      loja_id: l.loja_id, luc: l.luc, nome: l.nome, segmento: l.segmento, auditada: l.auditada,
      informadoCentavos: informado,
      diasAuditados: l.dias_auditados, auditadoCentavos: c(l.auditado) ?? 0,
      mediaInformadaCentavos: informado === null ? null : Math.round(informado / r.dias_no_mes),
      mediaAuditadaCentavos: l.dias_auditados ? Math.round((c(l.auditado) ?? 0) / l.dias_auditados) : null,
      projecaoCentavos: projecao, diferencaCentavos: c(l.diferenca),
      diferencaPercentual: k ? n(k.diferenca_percentual) : null,
      classificacao: k?.classificacao ?? null,
      percentual, minimoEh13: !!l.minimo_eh_13_aluguel, falta13: !!l.falta_13_aluguel,
      aluguel: informado === null ? null : calcularAluguel({ informadoCentavos: informado, projecaoCentavos: projecao, percentual, minimoCentavos: minimo }),
      dias: (k?.dias ?? []).map((d) => ({ data: d.data, valorCentavos: c(d.valor) ?? 0, desvioCentavos: c(d.desvio) ?? 0 })),
    };
  });
}

export interface TotaisAluguel {
  informado: number; aluguelPercentual: number; minimo: number; complementar: number;
  lojasComComplementar: number; indicadorDiferenca: number; lojasComPendencia: number;
}

export function totaisAluguel(linhas: LinhaConsolidada[]): TotaisAluguel {
  const t: TotaisAluguel = { informado: 0, aluguelPercentual: 0, minimo: 0, complementar: 0, lojasComComplementar: 0, indicadorDiferenca: 0, lojasComPendencia: 0 };
  for (const l of linhas) {
    if (!l.aluguel) continue;
    t.informado += l.aluguel.baseCentavos;
    t.aluguelPercentual += l.aluguel.aluguelPercentualCentavos ?? 0;
    t.minimo += l.aluguel.minimoCentavos ?? 0;
    t.complementar += l.aluguel.complementarCentavos ?? 0;
    if (l.aluguel.temComplementar) t.lojasComComplementar++;
    t.indicadorDiferenca += l.aluguel.indicador?.diferencaCentavos ?? 0;
    if (l.aluguel.pendencias.length) t.lojasComPendencia++;
  }
  return t;
}

export function rotuloMes(mes: string): string {
  const nomes = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const [a, m] = mes.split("-").map(Number);
  return `${nomes[m - 1][0].toUpperCase()}${nomes[m - 1].slice(1)}/${a}`;
}

export function rotuloVersao(meta: Meta): string {
  if (meta.versao === null) return "PRÉVIA — não emitida (mês não fechado)";
  const tipo = meta.tipo === "automatico" ? "fechamento automático" : meta.tipo === "antecipado" ? "fechamento antecipado" : "refechamento";
  return `Versão ${meta.versao} · ${tipo}`;
}
