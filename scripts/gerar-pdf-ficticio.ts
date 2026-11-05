/** Gera PDFs fictícios do portal em test/fixtures (npx tsx scripts/gerar-pdf-ficticio.ts). */
import { writeFileSync } from "node:fs";
import { gerarPdfPortal, linhasFicticias } from "../src/lib/portal/gerar-ficticio";

async function main() {
  const linhas = linhasFicticias();
  writeFileSync("test/fixtures/portal-ficticio-set-2026.pdf", await gerarPdfPortal({ ano: 2026, mes: 9, linhas }));
  writeFileSync("test/fixtures/portal-ficticio-out-2026.pdf", await gerarPdfPortal({ ano: 2026, mes: 10, linhas: linhasFicticias(11) }));
  const errado = linhas.reduce((s, l) => s + l.centavos, 0) + 100;
  writeFileSync("test/fixtures/portal-ficticio-total-errado.pdf", await gerarPdfPortal({ ano: 2026, mes: 9, linhas, totalCentavos: errado }));
  console.log("PDFs fictícios gerados em test/fixtures/");
}
main();
