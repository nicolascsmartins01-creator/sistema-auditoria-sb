import ExcelJS from "exceljs";
import { CAMPOS_LANC } from "./validar";

/** Modelo .xlsx para lançamentos em lote (2 linhas de exemplo fictícias). */
export async function gerarModeloLancamentos(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Lançamentos", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "LUC", width: 18, style: { numFmt: "@" } },
    { header: "Data da venda", width: 16, style: { numFmt: "dd/mm/yyyy" } },
    { header: "Venda líquida (R$)", width: 20, style: { numFmt: '#,##0.00' } },
    { header: "Auditor (login)", width: 20, style: { numFmt: "@" } },
  ];
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
  ws.addRow(["LJ 901", new Date(Date.UTC(2026, 9, 1)), 12345.67, "joao.silva"]);
  ws.addRow(["Q 950C", new Date(Date.UTC(2026, 9, 2)), 2100, ""]);
  const inst = wb.addWorksheet("Instruções");
  inst.columns = [{ header: "Coluna", width: 24 }, { header: "Obrigatória", width: 12 }, { header: "Como preencher", width: 90 }];
  inst.getRow(1).font = { bold: true };
  for (const c of CAMPOS_LANC) inst.addRow([c.titulo, c.obrigatorio ? "Sim" : "Não", c.ajuda]);
  inst.addRow([]);
  inst.addRow(["Observações", "", "As linhas da aba Lançamentos são exemplos fictícios: apague-as. Uma linha por loja e dia."]);
  inst.addRow(["", "", "Só dias anteriores a hoje, de meses não fechados, e que ainda não tenham lançamento para a loja."]);
  inst.addRow(["", "", "A planilha fica arquivada como comprovante dos lançamentos (sem fotos). Qualquer erro impede a importação inteira."]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
