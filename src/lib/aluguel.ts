/**
 * CÁLCULO DO ALUGUEL (percentual × mínimo) — regra isolada de propósito:
 * se a base de cálculo mudar, só este arquivo precisa ser alterado.
 *
 * Regra atual (especificação do setor comercial):
 *   base de cálculo         = venda INFORMADA do mês
 *   aluguel percentual      = base × percentual vigente no mês
 *   aluguel mínimo do mês   = mínimo vigente no mês; em DEZEMBRO, o 13º aluguel
 *                             (sem 13º cadastrado, usa o mínimo padrão — decisão
 *                             do setor comercial)
 *   aluguel complementar    = aluguel percentual − aluguel mínimo
 *                             ≤ 0 → sem complementar; > 0 → complementar a pagar
 *   ponto de equilíbrio     = aluguel mínimo ÷ percentual
 *                             (venda a partir da qual o percentual supera o mínimo)
 *
 * Indicador adicional (NÃO cobrado): complementar que resultaria se a base fosse
 * o MAIOR valor entre informado e projeção auditada, e a diferença em relação ao
 * complementar efetivamente calculado.
 *
 * Valores em centavos (inteiros); percentual em pontos (6,5% = 6.5).
 */

export interface EntradaAluguel {
  informadoCentavos: number;
  projecaoCentavos: number | null;   // null = loja sem auditoria no mês
  percentual: number | null;         // null = sem percentual vigente
  minimoCentavos: number | null;     // já com o 13º em dezembro; null = sem mínimo vigente
}

export interface ResultadoAluguel {
  baseCentavos: number;
  aluguelPercentualCentavos: number | null;
  minimoCentavos: number | null;
  complementarCentavos: number | null;        // 0 = sem complementar
  temComplementar: boolean;
  pontoEquilibrioCentavos: number | null;     // null quando o percentual é 0 ou falta dado
  indicador: {
    baseCentavos: number;                     // maior entre informado e projeção
    usouProjecao: boolean;
    complementarCentavos: number | null;
    diferencaCentavos: number | null;         // indicador − complementar calculado
  } | null;                                   // null = sem projeção (loja não auditada no mês)
  pendencias: string[];                       // o que falta para o cálculo ficar completo
}

const arred = (x: number) => Math.round(x);

function complementar(baseCentavos: number, percentual: number, minimoCentavos: number): number {
  return Math.max(0, arred((baseCentavos * percentual) / 100) - minimoCentavos);
}

export function calcularAluguel(e: EntradaAluguel): ResultadoAluguel {
  const pendencias: string[] = [];
  if (e.percentual === null) pendencias.push("sem percentual vigente no mês");
  if (e.minimoCentavos === null) pendencias.push("sem aluguel mínimo vigente no mês");

  const base = e.informadoCentavos;
  const aluguelPct = e.percentual === null ? null : arred((base * e.percentual) / 100);
  const comp = aluguelPct === null || e.minimoCentavos === null ? null : Math.max(0, aluguelPct - e.minimoCentavos);
  const equilibrio = e.percentual && e.minimoCentavos !== null ? arred(e.minimoCentavos / (e.percentual / 100)) : null;

  let indicador: ResultadoAluguel["indicador"] = null;
  if (e.projecaoCentavos !== null) {
    const usouProjecao = e.projecaoCentavos > base;
    const baseAlt = usouProjecao ? e.projecaoCentavos : base;
    const compAlt = e.percentual === null || e.minimoCentavos === null ? null : complementar(baseAlt, e.percentual, e.minimoCentavos);
    indicador = {
      baseCentavos: baseAlt, usouProjecao, complementarCentavos: compAlt,
      diferencaCentavos: compAlt === null || comp === null ? null : compAlt - comp,
    };
  }

  return {
    baseCentavos: base, aluguelPercentualCentavos: aluguelPct, minimoCentavos: e.minimoCentavos,
    complementarCentavos: comp, temComplementar: (comp ?? 0) > 0,
    pontoEquilibrioCentavos: equilibrio, indicador, pendencias,
  };
}
