/**
 * Gera um PDF FICTÍCIO no mesmo formato do relatório mensal do portal
 * (E.net / Ease Controller), para testes e homologação. Nenhum dado real.
 *
 * Formato reproduzido:
 *  - cabeçalho com "Data Início: 01/09/2026; Data Término: 30/09/2026"
 *  - tabela "Nº LUC | NOME FANTASIA | SET/2026", uma linha por loja
 *  - valores no formato brasileiro (1.048.983,33)
 *  - várias páginas, cabeçalho repetido em cada uma, linha "TOTAL:" no final
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface LinhaFicticia { luc: string; nome: string; centavos: number }

const ABREV = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

export function formatarBR(centavos: number): string {
  const neg = centavos < 0;
  const s = Math.abs(centavos).toString().padStart(3, "0");
  const int = s.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (neg ? "-" : "") + int + "," + s.slice(-2);
}

/** Lojas fictícias: as do seed de homologação + outras inventadas para ocupar várias páginas. */
export function linhasFicticias(semente = 7): LinhaFicticia[] {
  let x = semente;
  const aleatorio = () => { x = (x * 48271) % 2147483647; return x / 2147483647; };
  const base: [string, string][] = [
    ["LJ 101/102/102A", "MODA FICTICIA ATACAREJO"], ["LJ 103", "CALCADOS EXEMPLO"], ["LJ 104", "OTICA MODELO"],
    ["LJ 105", "FARMACIA TESTE"], ["LJ 110", "ELETRO DEMONSTRACAO"], ["LJ 201", "BOUTIQUE IMAGINARIA"],
    ["LJ 202/203", "ESPORTES HIPOTETICOS"], ["LJ 204", "RELOJOARIA SIMULADA"], ["LJ 210", "CINE EXEMPLO"],
    ["LJ 211", "ACADEMIA TESTE"], ["PA 01", "RESTAURANTE SABOR FICTICIO"], ["PA 02", "LANCHONETE MODELO"],
    ["PA 03", "PIZZARIA DEMONSTRACAO"], ["Q 001C", "QUIOSQUE CAPINHAS TESTE"], ["Q 002", "QUIOSQUE SORVETE EXEMPLO"],
    ["ILHA 001/002", "ILHA CAFE FICTICIO"], ["ILHA 003", "ILHA PERFUMES MODELO"], ["T1", "LOJA ANCORA IMAGINARIA"],
    ["LJ 999X", "LOJA QUE NAO EXISTE NO CADASTRO"],
  ];
  for (let i = 1; i <= 95; i++) base.push([`LJ ${300 + i}`, `LOJA FICTICIA NUMERO ${i}`]);
  return base.map(([luc, nome]) => ({ luc, nome, centavos: Math.round(500000 + aleatorio() * 120000000) }));
}

export async function gerarPdfPortal(opcoes: {
  ano: number; mes: number; linhas: LinhaFicticia[];
  totalCentavos?: number;          // para simular TOTAL errado
  linhasPorPagina?: number;
}): Promise<Uint8Array> {
  const { ano, mes, linhas } = opcoes;
  const porPagina = opcoes.linhasPorPagina ?? 40;
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const mm = String(mes).padStart(2, "0");
  const rotulo = `${ABREV[mes - 1]}/${ano}`;
  const total = opcoes.totalCentavos ?? linhas.reduce((s, l) => s + l.centavos, 0);

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Relatorio de vendas ${rotulo} (FICTICIO)`);
  const fonte = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const paginas = Math.max(1, Math.ceil(linhas.length / porPagina));
  const direita = (pg: ReturnType<typeof pdf.addPage>, t: string, xFim: number, y: number, f = fonte) =>
    pg.drawText(t, { x: xFim - f.widthOfTextAtSize(t, 9), y, size: 9, font: f });

  for (let p = 0; p < paginas; p++) {
    const pg = pdf.addPage([595, 842]);
    pg.drawText("SHOPPING FICTICIO - RELATORIO DE VENDAS POR LOJA", { x: 40, y: 800, size: 12, font: negrito });
    pg.drawText(`Data Início: 01/${mm}/${ano}; Data Término: ${ultimoDia}/${mm}/${ano}`, { x: 40, y: 782, size: 9, font: fonte });
    pg.drawText("DOCUMENTO FICTICIO PARA TESTES", { x: 40, y: 768, size: 8, font: fonte, color: rgb(0.5, 0.5, 0.5) });
    let y = 740;
    pg.drawText("Nº LUC", { x: 40, y, size: 9, font: negrito });
    pg.drawText("NOME FANTASIA", { x: 150, y, size: 9, font: negrito });
    direita(pg, rotulo, 555, y, negrito);
    pg.drawLine({ start: { x: 40, y: y - 4 }, end: { x: 555, y: y - 4 }, thickness: 0.5 });
    y -= 18;
    for (const l of linhas.slice(p * porPagina, (p + 1) * porPagina)) {
      pg.drawText(l.luc, { x: 40, y, size: 9, font: fonte });
      pg.drawText(l.nome, { x: 150, y, size: 9, font: fonte });
      direita(pg, formatarBR(l.centavos), 555, y);
      y -= 16;
    }
    if (p === paginas - 1) {
      pg.drawLine({ start: { x: 40, y: y + 10 }, end: { x: 555, y: y + 10 }, thickness: 0.5 });
      pg.drawText("TOTAL:", { x: 40, y: y - 4, size: 9, font: negrito });
      direita(pg, formatarBR(total), 555, y - 4, negrito);
    }
    pg.drawText(`Página ${p + 1} de ${paginas}`, { x: 480, y: 30, size: 8, font: fonte });
  }
  return pdf.save();
}
