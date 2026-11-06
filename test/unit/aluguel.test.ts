import { describe, expect, it } from "vitest";
import { calcularAluguel } from "@/lib/aluguel";

describe("cálculo do aluguel", () => {
  it("complementar a pagar, ponto de equilíbrio e indicador com projeção maior", () => {
    // informado 300.000,00 · 7% → percentual 21.000,00 · mínimo 15.000,00 → complementar 6.000,00
    // ponto de equilíbrio = 15.000 ÷ 7% = 214.285,71
    // projeção 360.000,00 → percentual 25.200 → complementar 10.200 → indicador +4.200
    const r = calcularAluguel({ informadoCentavos: 30000000, projecaoCentavos: 36000000, percentual: 7, minimoCentavos: 1500000 });
    expect(r).toMatchObject({
      baseCentavos: 30000000, aluguelPercentualCentavos: 2100000, minimoCentavos: 1500000,
      complementarCentavos: 600000, temComplementar: true, pontoEquilibrioCentavos: 21428571,
      indicador: { baseCentavos: 36000000, usouProjecao: true, complementarCentavos: 1020000, diferencaCentavos: 420000 },
      pendencias: [],
    });
  });

  it("percentual abaixo do mínimo: sem complementar", () => {
    const r = calcularAluguel({ informadoCentavos: 10000000, projecaoCentavos: 9000000, percentual: 6, minimoCentavos: 900000 });
    expect(r).toMatchObject({ aluguelPercentualCentavos: 600000, complementarCentavos: 0, temComplementar: false });
    // projeção menor que o informado: o indicador usa o informado → diferença zero
    expect(r.indicador).toEqual({ baseCentavos: 10000000, usouProjecao: false, complementarCentavos: 0, diferencaCentavos: 0 });
  });

  it("indicador pode revelar complementar que não existiria pelo informado", () => {
    const r = calcularAluguel({ informadoCentavos: 10000000, projecaoCentavos: 20000000, percentual: 6, minimoCentavos: 900000 });
    expect(r.complementarCentavos).toBe(0);
    expect(r.indicador).toMatchObject({ complementarCentavos: 300000, diferencaCentavos: 300000 });
  });

  it("percentual zero (só mínimo): sem complementar e sem ponto de equilíbrio", () => {
    const r = calcularAluguel({ informadoCentavos: 5000000, projecaoCentavos: null, percentual: 0, minimoCentavos: 150000 });
    expect(r).toMatchObject({ aluguelPercentualCentavos: 0, complementarCentavos: 0, pontoEquilibrioCentavos: null, indicador: null });
  });

  it("faltando percentual ou mínimo: aponta pendência e não inventa valor", () => {
    const r = calcularAluguel({ informadoCentavos: 5000000, projecaoCentavos: 6000000, percentual: null, minimoCentavos: null });
    expect(r).toMatchObject({ aluguelPercentualCentavos: null, complementarCentavos: null, pontoEquilibrioCentavos: null });
    expect(r.pendencias).toEqual(["sem percentual vigente no mês", "sem aluguel mínimo vigente no mês"]);
    expect(r.indicador).toMatchObject({ complementarCentavos: null, diferencaCentavos: null });
  });

  it("arredonda para centavos", () => {
    // 123.456,78 × 6,5% = 8.024,6907 → 8.024,69
    expect(calcularAluguel({ informadoCentavos: 12345678, projecaoCentavos: null, percentual: 6.5, minimoCentavos: 0 }).aluguelPercentualCentavos).toBe(802469);
  });
});
