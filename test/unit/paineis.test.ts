import { describe, expect, it } from "vitest";
import { calcularPaineis, mesesAte, type LojaPainel } from "@/lib/paineis";

const lojas: LojaPainel[] = [
  { id: "a", luc: "LJ 1", nome: "Alfa", segmento: "Moda", auditada: true, ativa: true },
  { id: "b", luc: "LJ 2", nome: "Beta", segmento: "Alimentação", auditada: true, ativa: true },
  { id: "c", luc: "LJ 3", nome: "Gama", segmento: null, auditada: false, ativa: true },
];

describe("painéis", () => {
  it("meses do período", () => {
    expect(mesesAte("2026-02", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("evolução, segmentos, conciliação mês a mês, rankings e histórico", () => {
    const meses = ["2026-08", "2026-09"];
    const p = calcularPaineis(meses, lojas, [
      { loja_id: "a", competencia: "2026-08-01", centavos: 3100000 }, { loja_id: "b", competencia: "2026-08-01", centavos: 6200000 },
      { loja_id: "a", competencia: "2026-09-01", centavos: 3600000 }, { loja_id: "b", competencia: "2026-09-01", centavos: 6000000 },
      { loja_id: "c", competencia: "2026-09-01", centavos: 900000 },
    ], [
      { id: "1", loja_id: "a", data: "2026-08-10", centavos: 120000 },   // ago: 1.200/dia × 31 = 37.200 → +6.200
      { id: "2", loja_id: "a", data: "2026-09-10", centavos: 120000 },   // set: 1.200 × 30 = 36.000 → 0
      { id: "3", loja_id: "b", data: "2026-09-11", centavos: 180000 },   // set: 1.800 × 30 = 54.000 → −6.000
    ]);
    expect(p.ultimoMes).toBe("2026-09");
    expect(p.totalPorMes).toEqual([{ mes: "2026-08", informado: 9300000, lojas: 2 }, { mes: "2026-09", informado: 10500000, lojas: 3 }]);
    expect(p.segmentos.map((s) => [s.nome, s.serie.map((x) => x.informado)])).toEqual([
      ["Alimentação", [6200000, 6000000]], ["Moda", [3100000, 3600000]], ["Sem segmento", [0, 900000]],
    ]);
    expect(p.difPorMes).toEqual([
      { mes: "2026-08", paraMaior: 620000, paraMenor: 0, alertas: 1, conciliadas: 1 },
      { mes: "2026-09", paraMaior: 0, paraMenor: -600000, alertas: 1, conciliadas: 2 },
    ]);
    expect(p.porLoja.a.map((x) => x.diferenca)).toEqual([620000, 0]);
    expect(p.ranking.informado.map((r) => r.luc)).toEqual(["LJ 2", "LJ 1", "LJ 3"]);
    expect(p.ranking.crescimento.map((r) => [r.luc, r.pct])).toEqual([["LJ 1", 16.13], ["LJ 2", -3.23]]);
    expect(p.ranking.segmentos[0]).toEqual({ nome: "Alimentação", valor: 6000000, lojas: 1 });
    expect(p.historico.map((h) => [h.luc, h.mesesParaMaior, h.mesesParaMenor, h.somaParaMaior])).toEqual([["LJ 1", 1, 0, 620000], ["LJ 2", 0, 1, 0]]);
  });

  it("mais de 7 segmentos: os 6 maiores + Outros", () => {
    const muitas = Array.from({ length: 9 }, (_, i) => ({ id: String(i), luc: `L${i}`, nome: `N${i}`, segmento: `S${i}`, auditada: true, ativa: true }));
    const p = calcularPaineis(["2026-09"], muitas, muitas.map((l, i) => ({ loja_id: l.id, competencia: "2026-09-01", centavos: (i + 1) * 100 })), []);
    expect(p.segmentos).toHaveLength(7);
    expect(p.segmentos.at(-1)!.nome).toBe("Outros");
    expect(p.segmentos.at(-1)!.serie[0].informado).toBe(100 + 200 + 300);
  });
});
