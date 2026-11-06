import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { extractText, getDocumentProxy } from "unpdf";
import { gerarExcel } from "@/lib/relatorio/excel";
import { gerarPdfConsolidado, gerarPdfLoja } from "@/lib/relatorio/pdf";
import { linhasConsolidadas, totaisAluguel, type Meta, type RelatorioEmitido } from "@/lib/relatorio/dados";

// Relatório fictício: set/2026 (30 dias). Loja A auditada (exemplo da especificação), loja B não auditada.
const rel: RelatorioEmitido = {
  competencia: "2026-09-01", dias_no_mes: 30, calculado_em: "2026-10-09T03:00:00Z",
  lojas: [{
    loja_id: "a", luc: "LJ 101", nome: "Loja Fictícia A", dias_auditados: 3, informado: 300000, auditado: 36000,
    media_informada: 10000, media_auditada: 12000, projecao: 360000, diferenca: 60000, diferenca_percentual: 20, classificacao: "para_maior",
    percentual_vigente: 7, aluguel_minimo_vigente: 15000,
    dias: [{ lancamento_id: "1", data: "2026-09-20", valor: 13000, desvio: 3000 }, { lancamento_id: "2", data: "2026-09-05", valor: 12000, desvio: 2000 }, { lancamento_id: "3", data: "2026-09-12", valor: 11000, desvio: 1000 }],
  }],
  consolidado: [
    { loja_id: "a", luc: "LJ 101", nome: "Loja Fictícia A", segmento: "Moda", auditada: true, ativa: true, informado: 300000, dias_auditados: 3, auditado: 36000, projecao: 360000, diferenca: 60000, percentual: 7, aluguel_minimo: 15000, minimo_eh_13_aluguel: false, falta_13_aluguel: false },
    { loja_id: "b", luc: "LJ 210", nome: "Cinema Fictício", segmento: null, auditada: false, ativa: true, informado: 400000, dias_auditados: 0, auditado: 0, projecao: null, diferenca: null, percentual: 5, aluguel_minimo: 30000, minimo_eh_13_aluguel: false, falta_13_aluguel: false },
  ],
  sem_informado: [], sem_auditoria: [], informado_sem_loja: [{ luc: "LJ 999X", nome: "X", valor: 1 }],
  totais: { lojas_conciliadas: 1, lojas_com_alerta: 1, informado: 300000, projecao: 360000, diferenca_para_maior: 60000, diferenca_para_menor: 0 },
};
const meta: Meta = { mes: "2026-09", versao: 2, tipo: "refechamento", emitidoEm: "2026-10-10T15:00:00Z", emitidoPor: "Analista Teste" };

describe("relatório do fechamento", () => {
  it("monta o consolidado com o aluguel de todas as lojas (inclusive não auditada)", () => {
    const l = linhasConsolidadas(rel);
    expect(l[0].aluguel).toMatchObject({ aluguelPercentualCentavos: 2100000, complementarCentavos: 600000, indicador: { diferencaCentavos: 420000 } });
    expect(l[1].aluguel).toMatchObject({ aluguelPercentualCentavos: 2000000, complementarCentavos: 0, indicador: null });
    expect(totaisAluguel(l)).toMatchObject({ informado: 70000000, aluguelPercentual: 4100000, minimo: 4500000, complementar: 600000, lojasComComplementar: 1 });
  });

  it("Excel: consolidado com uma linha por loja, dias auditados e resumo", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await gerarExcel(rel, meta)) as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Resumo", "Consolidado", "Dias auditados"]);
    const cs = wb.getWorksheet("Consolidado")!;
    const linha = (n: number) => (cs.getRow(n).values as unknown[]).slice(1);
    expect(linha(2).slice(0, 11)).toEqual(["LJ 101", "Loja Fictícia A", "Moda", "Sim", 300000, 3, 36000, 10000, 12000, 360000, 60000]);
    expect(linha(2).slice(13, 21)).toEqual([7, 21000, 15000, 6000, 214285.71, 360000, 10200, 4200]);
    expect(linha(3)[3]).toBe("Não");
    expect(linha(4)[0]).toBe("TOTAL");
    expect(wb.getWorksheet("Dias auditados")!.rowCount).toBe(4);
  });

  it("PDF consolidado e PDF da loja trazem os valores", async () => {
    const texto = async (b: Uint8Array) => (await extractText(await getDocumentProxy(b), { mergePages: true })).text;
    const cons = await texto(await gerarPdfConsolidado(rel, meta));
    expect(cons).toContain("Relatório consolidado");
    expect(cons).toContain("R$ 6.000,00");          // complementar
    expect(cons).toContain("Versão 2");
    expect(cons).toContain("LJ 999X");
    const loja = await texto((await gerarPdfLoja(rel, meta, "a"))!);
    expect(loja).toContain("Loja Fictícia A");
    expect(loja).toContain("R$ 214.285,71");        // ponto de equilíbrio
    expect(loja).toContain("20/09/2026");
    expect(await gerarPdfLoja(rel, meta, "nao-existe")).toBeNull();
  });

  it("prévia é identificada como não emitida", async () => {
    const t = (await extractText(await getDocumentProxy(await gerarPdfConsolidado(rel, { ...meta, versao: null, emitidoEm: null })), { mergePages: true })).text;
    expect(t).toContain("PRÉVIA");
  });
});
