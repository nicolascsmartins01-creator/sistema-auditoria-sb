import { describe, expect, it } from "vitest";
import { diaPadrao, diasDoMes, estadoDia, mesesAbertos, prazoLancamento } from "@/lib/prazos";

describe("prazos de lançamento (regra B: até o dia 5)", () => {
  it("prazo é o dia 5 do mês seguinte", () => {
    expect(prazoLancamento("2026-10-31")).toBe("2026-11-05");
    expect(prazoLancamento("2026-12-15")).toBe("2027-01-05");
    expect(prazoLancamento("2027-01-31")).toBe("2027-02-05");
  });
  it("estado de cada dia", () => {
    expect(estadoDia("2026-11-05", "2026-11-05")).toBe("hoje");
    expect(estadoDia("2026-11-06", "2026-11-05")).toBe("futuro");
    expect(estadoDia("2026-10-01", "2026-11-05")).toBe("aberto");      // dia 5: ainda vale
    expect(estadoDia("2026-10-01", "2026-11-06")).toBe("fora_prazo");  // dia 6: encerrado
    expect(estadoDia("2026-09-30", "2026-11-01")).toBe("fora_prazo");
  });
  it("meses abertos e dia padrão (dia anterior)", () => {
    expect(mesesAbertos("2026-11-05")).toEqual(["2026-10", "2026-11"]);
    expect(mesesAbertos("2026-11-06")).toEqual(["2026-11"]);
    expect(mesesAbertos("2027-01-03")).toEqual(["2026-12", "2027-01"]);
    expect(diaPadrao("2026-11-01")).toBe("2026-10-31");
    expect(diaPadrao("2027-03-01")).toBe("2027-02-28");
  });
  it("dias do mês", () => {
    expect(diasDoMes("2028-02")).toHaveLength(29);
    expect(diasDoMes("2026-11")[0]).toBe("2026-11-01");
  });
});
