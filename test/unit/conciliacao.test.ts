import { describe, expect, it } from "vitest";
import { conciliarLoja, conciliarMes, diasNoMes, type EntradaLoja } from "@/lib/conciliacao";

const dia = (data: string, reais: number) => ({ lancamento_id: data, data, centavos: Math.round(reais * 100) });

describe("conciliação mensal", () => {
  it("exemplo da especificação: médias, projeção e diferença", () => {
    // setembro/2026: 30 dias; informado 300.000,00 → média informada 10.000,00/dia
    // auditados: 12.000 + 11.000 + 13.000 = 36.000 em 3 dias → média 12.000 → projeção 360.000
    const c = conciliarLoja({
      loja_id: "1", luc: "LJ 1", nome: "Loja", informadoCentavos: 30000000,
      dias: [dia("2026-09-05", 12000), dia("2026-09-12", 11000), dia("2026-09-20", 13000)],
    }, "2026-09");
    expect(c).toMatchObject({
      diasNoMes: 30, diasAuditados: 3,
      mediaInformadaCentavos: 1000000, mediaAuditadaCentavos: 1200000,
      projecaoCentavos: 36000000, diferencaCentavos: 6000000, diferencaPercentual: 20,
      classificacao: "para_maior", alerta: true,
    });
    // dias do maior para o menor desvio: 13.000 (+3.000), 12.000 (+2.000), 11.000 (+1.000)
    expect(c.dias.map((d) => [d.data, d.desvioCentavos, d.desvioPercentual])).toEqual([
      ["2026-09-20", 300000, 30], ["2026-09-05", 200000, 20], ["2026-09-12", 100000, 10],
    ]);
  });

  it("para menor, sem diferença e informado zero", () => {
    const menor = conciliarLoja({ loja_id: "1", luc: "A", nome: "A", informadoCentavos: 3100000, dias: [dia("2026-10-01", 800)] }, "2026-10");
    expect(menor).toMatchObject({ diasNoMes: 31, projecaoCentavos: 2480000, diferencaCentavos: -620000, classificacao: "para_menor" });
    const igual = conciliarLoja({ loja_id: "2", luc: "B", nome: "B", informadoCentavos: 3100000, dias: [dia("2026-10-01", 1000)] }, "2026-10");
    expect(igual).toMatchObject({ diferencaCentavos: 0, classificacao: "sem_diferenca", alerta: false });
    const zero = conciliarLoja({ loja_id: "3", luc: "C", nome: "C", informadoCentavos: 0, dias: [dia("2026-10-01", 10)] }, "2026-10");
    expect(zero).toMatchObject({ diferencaPercentual: null, alerta: true });
  });

  it("qualquer diferença gera alerta (sem tolerância), inclusive de 1 centavo", () => {
    // 28 dias (fev/2027): informado 28,01; auditado 1,00/dia → projeção 28,00 → diferença −0,01
    const c = conciliarLoja({ loja_id: "1", luc: "A", nome: "A", informadoCentavos: 2801, dias: [dia("2027-02-03", 1)] }, "2027-02");
    expect(c.diferencaCentavos).toBe(-1);
    expect(c.alerta).toBe(true);
  });

  it("mês: ordena pela maior diferença absoluta, separa sem informado e sem auditoria, totaliza", () => {
    const lojas: EntradaLoja[] = [
      { loja_id: "a", luc: "A", nome: "Pequena", informadoCentavos: 3000000, dias: [dia("2026-09-01", 1100)] },   // +3.000
      { loja_id: "b", luc: "B", nome: "Grande", informadoCentavos: 30000000, dias: [dia("2026-09-01", 9000)] },  // −30.000
      { loja_id: "c", luc: "C", nome: "Igual", informadoCentavos: 300000, dias: [dia("2026-09-01", 100)] },      // 0
      { loja_id: "d", luc: "D", nome: "Sem informado", informadoCentavos: null, dias: [dia("2026-09-02", 50)] },
      { loja_id: "e", luc: "E", nome: "Sem auditoria", informadoCentavos: 500000, dias: [] },
      { loja_id: "f", luc: "F", nome: "Nada", informadoCentavos: null, dias: [] },
    ];
    const r = conciliarMes("2026-09", lojas);
    expect(r.conciliadas.map((c) => c.nome)).toEqual(["Grande", "Pequena", "Igual"]);
    expect(r.alertas.map((c) => c.nome)).toEqual(["Grande", "Pequena"]);
    expect(r.semInformado.map((l) => l.nome)).toEqual(["Sem informado"]);
    expect(r.semAuditoria.map((l) => l.nome)).toEqual(["Sem auditoria"]);
    expect(r.totais).toEqual({
      informadoCentavos: 33300000, projecaoCentavos: 30600000,
      diferencaParaMaiorCentavos: 300000, diferencaParaMenorCentavos: -3000000, diferencaLiquidaCentavos: -2700000,
      lojasParaMaior: 1, lojasParaMenor: 1,
    });
  });

  it("dias do mês", () => {
    expect([diasNoMes("2026-09"), diasNoMes("2026-10"), diasNoMes("2028-02"), diasNoMes("2027-02")]).toEqual([30, 31, 29, 28]);
  });
});
