import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { lerPdfPortal } from "@/lib/portal/ler-pdf";
import { gerarPdfPortal, linhasFicticias } from "@/lib/portal/gerar-ficticio";

const fixture = (n: string) => new Uint8Array(readFileSync(path.resolve(import.meta.dirname, "../fixtures", n)));

describe("leitura do PDF do portal (fictício)", () => {
  it("lê período, mês, todas as linhas de várias páginas e o TOTAL", async () => {
    const r = await lerPdfPortal(fixture("portal-ficticio-set-2026.pdf"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const esperado = linhasFicticias();
    expect({ inicio: r.inicio, fim: r.fim, rotulo: r.rotuloMes, ano: r.ano, mes: r.mes }).toEqual({
      inicio: "2026-09-01", fim: "2026-09-30", rotulo: "SET/2026", ano: 2026, mes: 9,
    });
    expect(r.paginas).toBe(3);
    expect(r.linhas.map(({ luc, nome, centavos }) => ({ luc, nome, centavos }))).toEqual(esperado);
    expect(r.totalCentavos).toBe(esperado.reduce((s, l) => s + l.centavos, 0));
    expect(r.linhasNaoReconhecidas).toEqual([]);
  });

  it("lê LUCs no formato do portal (barras, letras, ILHA, T1)", async () => {
    const r = await lerPdfPortal(fixture("portal-ficticio-set-2026.pdf"));
    if (!r.ok) throw new Error();
    expect(r.linhas.map((l) => l.luc)).toEqual(expect.arrayContaining(["LJ 101/102/102A", "Q 001C", "ILHA 001/002", "T1"]));
  });

  it("valores negativos e grandes no formato brasileiro", async () => {
    const pdf = await gerarPdfPortal({ ano: 2027, mes: 2, linhas: [
      { luc: "LJ 1", nome: "A", centavos: 104898333 }, { luc: "LJ 2", nome: "B", centavos: -1550 }, { luc: "LJ 3", nome: "C", centavos: 7 },
    ] });
    const r = await lerPdfPortal(pdf);
    if (!r.ok) throw new Error(r.erro);
    expect(r.linhas.map((l) => l.centavos)).toEqual([104898333, -1550, 7]);
    expect(r.fim).toBe("2027-02-28");
    expect(r.rotuloMes).toBe("FEV/2027");
  });

  it("recusa arquivo que não é PDF", async () => {
    const r = await lerPdfPortal(new TextEncoder().encode("isto não é um pdf"));
    expect(r.ok).toBe(false);
  });
});

import { validarPdfPortal, type LojaCadastro } from "@/lib/portal/validar";

describe("conferência do PDF do portal", () => {
  const cadastro: LojaCadastro[] = [
    { id: "1", luc: "LJ 101/102/102A", nome: "Moda", ativa: true },
    { id: "2", luc: "LJ 103", nome: "Calçados", ativa: false },
    { id: "3", luc: "LJ 777", nome: "Loja Que Não Veio No PDF", ativa: true },
  ];

  it("PDF correto: pode importar, com avisos de LUC sem cadastro, loja inativa e loja ausente", async () => {
    const r = await lerPdfPortal(fixture("portal-ficticio-set-2026.pdf"));
    if (!r.ok) throw new Error();
    const v = validarPdfPortal(r, cadastro, null);
    expect(v.erros).toEqual([]);
    expect(v.podeImportar).toBe(true);
    expect(v.competencia).toBe("2026-09-01");
    expect(v.linhas.find((l) => l.luc === "LJ 101/102/102A")).toMatchObject({ situacao: "ok", loja: { id: "1" } });
    expect(v.linhas.find((l) => l.luc === "LJ 103")?.situacao).toBe("inativa");
    expect(v.linhas.find((l) => l.luc === "LJ 999X")?.situacao).toBe("sem_cadastro");
    expect(v.avisos[0]).toMatch(/^112 LUC\(s\) do PDF não estão cadastradas: .*; e mais 102\. Veja todas no filtro/);
    expect(v.avisos.join(" ")).toContain("LJ 777 (Loja Que Não Veio No PDF)");
    expect(v.lojasAusentes).toEqual([{ luc: "LJ 777", nome: "Loja Que Não Veio No PDF" }]);
  });

  it("soma ≠ TOTAL: recusa", async () => {
    const r = await lerPdfPortal(fixture("portal-ficticio-total-errado.pdf"));
    if (!r.ok) throw new Error();
    const v = validarPdfPortal(r, cadastro, null);
    expect(v.podeImportar).toBe(false);
    expect(v.erros[0]).toContain("não bate com a linha TOTAL do PDF (R$ 62.792.917,22): diferença de -R$ 1,00. Importação recusada.");
  });

  it("LUC repetida e período incompleto: recusa", async () => {
    const pdf = await gerarPdfPortal({ ano: 2026, mes: 9, linhas: [{ luc: "LJ 1", nome: "A", centavos: 100 }, { luc: "LJ 1", nome: "A", centavos: 200 }] });
    const r = await lerPdfPortal(pdf);
    if (!r.ok) throw new Error();
    const v = validarPdfPortal({ ...r, fim: "2026-09-15" }, [], null);
    expect(v.erros.join(" ")).toContain("LUC repetida no PDF: LJ 1");
    expect(v.erros.join(" ")).toContain("não corresponde ao mês inteiro");
  });

  it("mês já importado: avisa e mostra o total anterior", async () => {
    const r = await lerPdfPortal(fixture("portal-ficticio-set-2026.pdf"));
    if (!r.ok) throw new Error();
    const v = validarPdfPortal(r, [], { totalCentavos: 123456, linhas: 10, importadoEm: "2026-10-02T10:00:00Z", arquivo: "antigo.pdf" });
    expect(v.podeImportar).toBe(true);
    expect(v.avisos.at(-1)).toContain('Já existe venda informada de SET/2026 (arquivo "antigo.pdf", total R$ 1.234,56)');
  });
});
