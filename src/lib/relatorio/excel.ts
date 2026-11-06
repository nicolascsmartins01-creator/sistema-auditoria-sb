import ExcelJS from "exceljs";
import { formatarDataHora } from "@/lib/formato";
import { NOME_CLASSIFICACAO } from "@/lib/conciliacao";
import { linhasConsolidadas, rotuloMes, rotuloVersao, totaisAluguel, type Meta, type RelatorioEmitido } from "./dados";

const MOEDA = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
const PCT = '0.00"%"';
const r = (centavos: number | null | undefined) => (centavos === null || centavos === undefined ? null : centavos / 100);

/**
 * Excel do fechamento:
 *  - "Consolidado": uma linha por loja (informado, auditado, dias auditados,
 *    projeção, diferença, aluguel percentual, mínimo, complementar, ponto de
 *    equilíbrio, indicador);
 *  - "Dias auditados": cada dia auditado × média diária informada;
 *  - "Resumo": mês, versão, emissão e totais.
 */
export async function gerarExcel(rel: RelatorioEmitido, meta: Meta): Promise<Buffer> {
  const linhas = linhasConsolidadas(rel);
  const tot = totaisAluguel(linhas);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Auditoria de Vendas — Shopping Benfica";
  wb.created = meta.emitidoEm ? new Date(meta.emitidoEm) : new Date();

  // ---- Resumo
  const rs = wb.addWorksheet("Resumo");
  rs.columns = [{ width: 42 }, { width: 28 }];
  const titulo = rs.addRow([`Relatório de auditoria de vendas — ${rotuloMes(meta.mes)}`]);
  titulo.font = { bold: true, size: 14 };
  rs.addRow([rotuloVersao(meta)]);
  if (meta.emitidoEm) rs.addRow([`Emitido em ${formatarDataHora(meta.emitidoEm)}${meta.emitidoPor ? ` por ${meta.emitidoPor}` : ""}`]);
  rs.addRow([`${rel.dias_no_mes} dias no mês · base de cálculo do aluguel: venda informada`]);
  rs.addRow([]);
  const resumo: [string, number | null, string?][] = [
    ["Venda informada (lojas com informado)", r(tot.informado), MOEDA],
    ["Aluguel percentual", r(tot.aluguelPercentual), MOEDA],
    ["Aluguel mínimo (13º em dezembro)", r(tot.minimo), MOEDA],
    ["Aluguel complementar a cobrar", r(tot.complementar), MOEDA],
    ["Lojas com complementar", tot.lojasComComplementar],
    ["Indicador (não cobrado): complementar adicional pela projeção", r(tot.indicadorDiferenca), MOEDA],
    ["Lojas conciliadas", Number(rel.totais.lojas_conciliadas ?? 0)],
    ["Lojas com alerta de diferença", Number(rel.totais.lojas_com_alerta ?? 0)],
    ["Diferença projetada para maior", Number(rel.totais.diferenca_para_maior ?? 0), MOEDA],
    ["Diferença projetada para menor", Number(rel.totais.diferenca_para_menor ?? 0), MOEDA],
    ["Lojas com pendência de cadastro (percentual/mínimo)", tot.lojasComPendencia],
  ];
  for (const [rot, v, fmt] of resumo) {
    const row = rs.addRow([rot, v]);
    if (fmt) row.getCell(2).numFmt = fmt;
  }

  // ---- Consolidado
  const cs = wb.addWorksheet("Consolidado", { views: [{ state: "frozen", ySplit: 1, xSplit: 2 }] });
  const cols: [string, number, string?][] = [
    ["Nº LUC", 16], ["Loja", 32], ["Segmento", 16], ["Auditada", 9],
    ["Venda informada", 16, MOEDA], ["Dias auditados", 9], ["Venda auditada (soma)", 16, MOEDA],
    ["Média diária informada", 15, MOEDA], ["Média diária auditada", 15, MOEDA], ["Projeção auditada", 16, MOEDA],
    ["Diferença projetada", 16, MOEDA], ["Diferença (%)", 11, PCT], ["Classificação", 13],
    ["Percentual (%)", 11, '0.00##"%"'], ["Aluguel percentual", 15, MOEDA], ["Aluguel mínimo do mês", 15, MOEDA],
    ["Aluguel complementar", 15, MOEDA], ["Ponto de equilíbrio", 16, MOEDA],
    ["Indicador: base (maior entre informado e projeção)", 18, MOEDA], ["Indicador: complementar", 15, MOEDA],
    ["Indicador: diferença (não cobrada)", 16, MOEDA], ["Observações", 40],
  ];
  cs.columns = cols.map(([header, width, fmt]) => ({ header, width, style: fmt ? { numFmt: fmt } : {} }));
  const cab = cs.getRow(1);
  cab.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cab.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
  cab.alignment = { wrapText: true, vertical: "middle" };
  cab.height = 45;
  for (const l of linhas) {
    const a = l.aluguel;
    const obs = [
      ...(a?.pendencias ?? []),
      l.informadoCentavos === null ? "sem venda informada no mês" : "",
      l.minimoEh13 ? "mínimo = 13º aluguel" : "", l.falta13 ? "13º não cadastrado: usado o mínimo padrão" : "",
      l.diasAuditados === 0 && l.auditada ? "nenhum dia auditado" : "",
    ].filter(Boolean).join("; ");
    cs.addRow([
      l.luc, l.nome, l.segmento ?? "", l.auditada ? "Sim" : "Não",
      r(l.informadoCentavos), l.diasAuditados, l.diasAuditados ? r(l.auditadoCentavos) : null,
      r(l.mediaInformadaCentavos), r(l.mediaAuditadaCentavos), r(l.projecaoCentavos),
      r(l.diferencaCentavos), l.diferencaPercentual, l.classificacao ? NOME_CLASSIFICACAO[l.classificacao] : "",
      l.percentual, r(a?.aluguelPercentualCentavos), r(a?.minimoCentavos), r(a?.complementarCentavos), r(a?.pontoEquilibrioCentavos),
      r(a?.indicador?.baseCentavos), r(a?.indicador?.complementarCentavos), r(a?.indicador?.diferencaCentavos), obs,
    ]);
  }
  const totalRow = cs.addRow([
    "TOTAL", "", "", "", r(tot.informado), null, null, null, null, null, null, null, "", null,
    r(tot.aluguelPercentual), r(tot.minimo), r(tot.complementar), null, null, null, r(tot.indicadorDiferenca), "",
  ]);
  totalRow.font = { bold: true };
  cs.autoFilter = { from: { row: 1, column: 1 }, to: { row: linhas.length + 1, column: cols.length } };

  // ---- Dias auditados
  const ds = wb.addWorksheet("Dias auditados", { views: [{ state: "frozen", ySplit: 1 }] });
  ds.columns = [
    { header: "Nº LUC", width: 16 }, { header: "Loja", width: 32 }, { header: "Data", width: 12, style: { numFmt: "dd/mm/yyyy" } },
    { header: "Venda auditada", width: 16, style: { numFmt: MOEDA } }, { header: "Média diária informada", width: 18, style: { numFmt: MOEDA } },
    { header: "Desvio (R$)", width: 16, style: { numFmt: MOEDA } }, { header: "Desvio (%)", width: 12, style: { numFmt: PCT } },
  ];
  ds.getRow(1).font = { bold: true };
  for (const l of linhas) {
    for (const d of l.dias) {
      const media = l.mediaInformadaCentavos;
      const [a, m, dd] = d.data.split("-").map(Number);
      ds.addRow([l.luc, l.nome, new Date(Date.UTC(a, m - 1, dd)), r(d.valorCentavos), r(media), r(d.desvioCentavos),
        media ? Math.round((d.desvioCentavos / media) * 10000) / 100 : null]);
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
