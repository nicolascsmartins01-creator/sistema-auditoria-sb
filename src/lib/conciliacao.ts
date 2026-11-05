/**
 * CONCILIAÇÃO MENSAL (por loja) — venda informada × venda auditada.
 *
 * Definições (especificação do setor comercial):
 *   dias do mês                 = quantidade de dias do mês (28 a 31)
 *   média diária informada      = total informado ÷ dias do mês
 *   média diária auditada       = soma dos dias auditados ÷ nº de dias auditados
 *   projeção auditada do mês    = média diária auditada × dias do mês
 *   diferença projetada (R$)    = projeção − informado
 *   diferença projetada (%)     = diferença ÷ informado × 100
 *   classificação               = "para maior" (projeção > informado) ou
 *                                 "para menor" (projeção < informado)
 *   detalhe de cada dia         = valor auditado do dia − média diária informada
 *
 * Alertas: QUALQUER diferença (≥ R$ 0,01) gera alerta — sem tolerância.
 * Ordem: maior diferença projetada em valor absoluto primeiro; dentro da loja,
 * dias do maior para o menor desvio (valor absoluto).
 *
 * Só entram lançamentos VÁLIDOS (em análise e recusados ficam de fora).
 * A confiabilidade da projeção depende do nº de dias auditados, sempre exibido.
 * Cálculos em centavos para não acumular erro de arredondamento.
 */

export interface DiaAuditado { lancamento_id: string; data: string; centavos: number }

export interface EntradaLoja {
  loja_id: string;
  luc: string;
  nome: string;
  informadoCentavos: number | null;     // null = sem venda informada no mês
  dias: DiaAuditado[];                  // lançamentos válidos do mês
}

export type Classificacao = "para_maior" | "para_menor" | "sem_diferenca";

export interface DiaConciliado extends DiaAuditado {
  desvioCentavos: number;               // dia − média diária informada
  desvioPercentual: number | null;
}

export interface LojaConciliada {
  loja_id: string; luc: string; nome: string;
  diasNoMes: number;
  diasAuditados: number;
  informadoCentavos: number;
  auditadoCentavos: number;             // soma dos dias auditados
  mediaInformadaCentavos: number;
  mediaAuditadaCentavos: number;
  projecaoCentavos: number;
  diferencaCentavos: number;
  diferencaPercentual: number | null;   // null quando o informado é zero
  classificacao: Classificacao;
  alerta: boolean;
  dias: DiaConciliado[];                // do maior para o menor desvio absoluto
}

export interface ResultadoConciliacao {
  mes: string;                          // aaaa-mm
  diasNoMes: number;
  conciliadas: LojaConciliada[];        // com informado e ≥ 1 dia auditado; maior |diferença| primeiro
  alertas: LojaConciliada[];            // conciliadas com diferença
  semInformado: EntradaLoja[];          // auditadas no mês, mas sem venda informada
  semAuditoria: EntradaLoja[];          // com venda informada, mas nenhum dia auditado
  totais: {
    informadoCentavos: number;          // das lojas conciliadas
    projecaoCentavos: number;
    diferencaParaMaiorCentavos: number; // soma das diferenças positivas
    diferencaParaMenorCentavos: number; // soma das diferenças negativas
    diferencaLiquidaCentavos: number;
    lojasParaMaior: number;
    lojasParaMenor: number;
  };
}

export function diasNoMes(mes: string): number {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

const pct = (parte: number, base: number) => (base === 0 ? null : Math.round((parte / base) * 10000) / 100);

export function conciliarLoja(e: EntradaLoja & { informadoCentavos: number }, mes: string): LojaConciliada {
  const nDias = diasNoMes(mes);
  const auditado = e.dias.reduce((s, d) => s + d.centavos, 0);
  const n = e.dias.length;
  const mediaInf = e.informadoCentavos / nDias;
  const mediaAud = auditado / n;
  const projecao = Math.round(mediaAud * nDias);
  const diferenca = projecao - e.informadoCentavos;
  const dias = e.dias
    .map((d) => ({ ...d, desvioCentavos: Math.round(d.centavos - mediaInf), desvioPercentual: pct(d.centavos - mediaInf, mediaInf) }))
    .sort((a, b) => Math.abs(b.desvioCentavos) - Math.abs(a.desvioCentavos) || a.data.localeCompare(b.data));
  return {
    loja_id: e.loja_id, luc: e.luc, nome: e.nome,
    diasNoMes: nDias, diasAuditados: n,
    informadoCentavos: e.informadoCentavos, auditadoCentavos: auditado,
    mediaInformadaCentavos: Math.round(mediaInf), mediaAuditadaCentavos: Math.round(mediaAud),
    projecaoCentavos: projecao, diferencaCentavos: diferenca,
    diferencaPercentual: pct(diferenca, e.informadoCentavos),
    classificacao: diferenca > 0 ? "para_maior" : diferenca < 0 ? "para_menor" : "sem_diferenca",
    alerta: diferenca !== 0,
    dias,
  };
}

export function conciliarMes(mes: string, lojas: EntradaLoja[]): ResultadoConciliacao {
  const conciliadas: LojaConciliada[] = [];
  const semInformado: EntradaLoja[] = [];
  const semAuditoria: EntradaLoja[] = [];
  for (const l of lojas) {
    if (l.informadoCentavos === null) { if (l.dias.length) semInformado.push(l); continue; }
    if (!l.dias.length) { semAuditoria.push(l); continue; }
    conciliadas.push(conciliarLoja({ ...l, informadoCentavos: l.informadoCentavos }, mes));
  }
  conciliadas.sort((a, b) => Math.abs(b.diferencaCentavos) - Math.abs(a.diferencaCentavos) || a.nome.localeCompare(b.nome, "pt-BR"));
  const alertas = conciliadas.filter((c) => c.alerta);
  const positivas = conciliadas.filter((c) => c.diferencaCentavos > 0);
  const negativas = conciliadas.filter((c) => c.diferencaCentavos < 0);
  const soma = (xs: LojaConciliada[], f: (c: LojaConciliada) => number) => xs.reduce((s, c) => s + f(c), 0);
  return {
    mes, diasNoMes: diasNoMes(mes), conciliadas, alertas,
    semInformado: semInformado.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    semAuditoria: semAuditoria.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    totais: {
      informadoCentavos: soma(conciliadas, (c) => c.informadoCentavos),
      projecaoCentavos: soma(conciliadas, (c) => c.projecaoCentavos),
      diferencaParaMaiorCentavos: soma(positivas, (c) => c.diferencaCentavos),
      diferencaParaMenorCentavos: soma(negativas, (c) => c.diferencaCentavos),
      diferencaLiquidaCentavos: soma(conciliadas, (c) => c.diferencaCentavos),
      lojasParaMaior: positivas.length,
      lojasParaMenor: negativas.length,
    },
  };
}

export const NOME_CLASSIFICACAO: Record<Classificacao, string> = {
  para_maior: "para maior",
  para_menor: "para menor",
  sem_diferenca: "sem diferença",
};
