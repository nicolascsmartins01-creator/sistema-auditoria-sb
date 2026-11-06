import ExcelJS from "exceljs";
import { COLUNAS } from "./colunas";

/** Gera o modelo .xlsx da planilha de lojas (com 2 linhas de exemplo fictícias e uma aba de instruções). */
export async function gerarModeloLojas(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Auditoria de Vendas — Shopping Benfica";

  const ws = wb.addWorksheet("Lojas", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = COLUNAS.map((c) => ({
    header: c.titulo,
    key: c.chave,
    width: Math.max(14, c.titulo.length + 4),
    style: { numFmt: "@" }, // texto: evita o Excel transformar "09/2026" em data ou "6,5" em outra coisa
  }));
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
  for (const i of [0, 1]) {
    ws.addRow(Object.fromEntries(COLUNAS.map((c) => [c.chave, c.exemplo[i] || null])));
  }

  const inst = wb.addWorksheet("Instruções");
  inst.columns = [{ header: "Coluna", width: 34 }, { header: "Obrigatória", width: 12 }, { header: "Como preencher", width: 90 }];
  inst.getRow(1).font = { bold: true };
  for (const c of COLUNAS) inst.addRow([c.titulo, c.obrigatoria ? "Sim" : "Não", c.ajuda]);
  inst.addRow([]);
  inst.addRow(["Observações", "", "As duas linhas da aba Lojas são exemplos fictícios: apague-as antes de preencher."]);
  inst.addRow(["", "", "Uma linha por loja. Se a LUC já existir no cadastro, a loja será atualizada; se não existir, será criada."]);
  inst.addRow(["", "", "Percentual e aluguel mínimo entram como nova vigência a partir da data informada (qualquer dia); vigências anteriores são mantidas."]);
  inst.addRow(["", "", "Uma vigência que começa no meio do mês já vale para o mês inteiro no cálculo do aluguel."]);
  inst.addRow(["", "", "Informação faltando não impede a importação: a loja é cadastrada e você completa depois."]);
  inst.addRow(["", "", "Também é aceito arquivo .csv (separado por ponto e vírgula) com os mesmos títulos de coluna."]);
  inst.getColumn(3).alignment = { wrapText: true, vertical: "top" };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
