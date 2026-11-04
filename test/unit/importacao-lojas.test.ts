import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { validarPlanilhaLojas, type LojaCadastrada } from "@/lib/importacao-lojas/validar";
import { lerPlanilha } from "@/lib/importacao-lojas/ler-planilha";
import { gerarModeloLojas } from "@/lib/importacao-lojas/modelo";
import { COLUNAS } from "@/lib/importacao-lojas/colunas";

const CAB = COLUNAS.map((c) => c.titulo);
const linha = (o: Partial<Record<string, string | number | null>>) =>
  COLUNAS.map((c) => (o[c.chave] ?? null) as string | number | null);

const cadastro: LojaCadastrada[] = [
  {
    id: "1", luc: "LJ 101/102/102A", nome_fantasia: "Loja Fictícia A", localizacao: "Piso L1",
    segmento: "Moda", auditada: true, ativa: true,
    percentuais: [{ vigencia_inicio: "2026-01-01", percentual: 6 }],
    minimos: [{ vigencia_inicio: "2026-01-01", valor: 10000 }],
    dezembro: [],
  },
  {
    id: "2", luc: "Q 001C", nome_fantasia: "Quiosque Fictício", localizacao: null,
    segmento: null, auditada: true, ativa: false, percentuais: [], minimos: [], dezembro: [],
  },
];

describe("validação da planilha de lojas", () => {
  it("classifica nova, atualização e sem alteração", () => {
    const r = validarPlanilhaLojas([
      CAB,
      linha({ luc: "LJ 101/102/102A", nome_fantasia: "Loja Fictícia A", localizacao: "Piso L1", segmento: "moda", percentual: "6", percentual_vigencia: "01/2026", aluguel_minimo: "10.000,00", minimo_vigencia: "01/2026" }),
      linha({ luc: "T1", nome_fantasia: "Torre Fictícia", percentual: "5,5", percentual_vigencia: "09/2026", aluguel_minimo: "2.000", minimo_vigencia: "09/2026", ano_13: 2026, valor_13: "4.000,00" }),
      linha({ luc: "Q 001C", nome_fantasia: "Quiosque Fictício", ativa: "S" }),
    ], cadastro);
    expect(r.errosGerais).toEqual([]);
    expect(r.linhas.map((l) => l.situacao)).toEqual(["sem_alteracao", "nova", "atualizacao"]);
    expect(r.linhas[2].avisos.join()).toContain("reativada");
    expect(r.podeImportar).toBe(true);
    expect(r.paraGravar).toHaveLength(2);
    expect(r.paraGravar[0]).toMatchObject({
      luc: "T1", percentual: "5.5000", percentual_vigencia: "2026-09-01",
      aluguel_minimo: "2000.00", ano_13: 2026, valor_13: "4000.00",
    });
  });

  it("descreve nova vigência e alteração de valor", () => {
    const r = validarPlanilhaLojas([
      CAB,
      linha({ luc: "LJ 101/102/102A", nome_fantasia: "Loja Fictícia A", localizacao: "Piso L1", segmento: "Moda", percentual: "6,5", percentual_vigencia: "09/2026", aluguel_minimo: "11000", minimo_vigencia: "01/2026" }),
    ], cadastro);
    expect(r.linhas[0].mudancas).toEqual([
      "Nova vigência de percentual a partir de 09/2026: 6,50%",
      "Aluguel mínimo de 01/2026: R$ 10.000,00 → R$ 11.000,00",
    ]);
  });

  it("aponta erros linha a linha e bloqueia a importação", () => {
    const r = validarPlanilhaLojas([
      CAB,
      linha({ luc: "", nome_fantasia: "Sem LUC" }),
      linha({ luc: "LJ 200", nome_fantasia: "" }),
      linha({ luc: "LJ 201", nome_fantasia: "X", percentual: "abc", percentual_vigencia: "09/2026" }),
      linha({ luc: "LJ 202", nome_fantasia: "Y", aluguel_minimo: "1.000,00" }),
      linha({ luc: "LJ 203", nome_fantasia: "Z", percentual: "6", percentual_vigencia: "15/09/2026" }),
      linha({ luc: "LJ 203", nome_fantasia: "Z2", auditada: "talvez" }),
      linha({ luc: "LJ 204", nome_fantasia: "W", ano_13: 2026 }),
    ], cadastro);
    const erros = r.linhas.map((l) => [l.linha, l.erros.join(" | ")]);
    expect(erros).toEqual([
      [2, "LUC vazia."],
      [3, "Nome fantasia vazio."],
      [4, 'Percentual inválido: "abc".'],
      [5, "Aluguel mínimo preenchido sem o início de vigência."],
      [6, "Início de vigência do percentual inválido: a vigência deve começar no dia 1º do mês."],
      [7, 'LUC repetida na planilha (também na linha 6). | "Auditada" deve ser S ou N.'],
      [8, "Preencha o ano e o valor do 13º juntos (ou deixe os dois vazios)."],
    ]);
    expect(r.podeImportar).toBe(false);
    expect(r.paraGravar).toEqual([]);
  });

  it("exige cabeçalho e avisa colunas desconhecidas e lojas fora da planilha", () => {
    expect(validarPlanilhaLojas([["A", "B"], ["1", "2"]], cadastro).errosGerais[0]).toContain("cabeçalho");
    const r = validarPlanilhaLojas([["Relatório"], ["LUC", "Nome fantasia", "Observação"], ["T9", "Nova", "x"]], cadastro);
    expect(r.errosGerais).toEqual([]);
    expect(r.avisosGerais.join()).toContain("Observação");
    expect(r.avisosGerais.join()).toContain("LJ 101/102/102A");
    expect(r.linhas[0].linha).toBe(3);
  });
});

describe("leitura de arquivos", () => {
  it("lê o modelo gerado e reconhece todas as colunas", async () => {
    const buf = await gerarModeloLojas();
    const m = await lerPlanilha("modelo.xlsx", buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
    const r = validarPlanilhaLojas(m, []);
    expect(r.errosGerais).toEqual([]);
    expect(r.linhas.map((l) => l.situacao)).toEqual(["nova", "nova"]);
    expect(r.linhas[0].dados).toMatchObject({ luc: "LJ 901", percentual: "6.5000", aluguel_minimo: "12500.00", ano_13: 2026 });
  });

  it("converte célula de percentual do Excel (0,065 → 6,5) e datas", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("x");
    ws.addRow(["LUC", "Nome fantasia", "Percentual (%)", "Início vigência % (mm/aaaa)"]);
    ws.addRow(["LJ 1", "Loja", 0.065, new Date(Date.UTC(2026, 8, 1))]);
    ws.getCell("C2").numFmt = "0.00%";
    const buf = await wb.xlsx.writeBuffer();
    const m = await lerPlanilha("a.xlsx", buf as ArrayBuffer);
    const r = validarPlanilhaLojas(m, []);
    expect(r.linhas[0].dados).toMatchObject({ percentual: "6.5000", percentual_vigencia: "2026-09-01" });
  });

  it("lê CSV do Excel em Windows-1252 separado por ponto e vírgula", async () => {
    const txt = "LUC;Nome fantasia;Localização;Aluguel mínimo (R$);Início vigência mínimo (mm/aaaa)\r\nILHA 001/002;Café Fictício;Praça;1.234,56;10/2026\r\n";
    const bytes = Uint8Array.from([...txt].map((ch) => ch.charCodeAt(0))); // latin1 ≈ windows-1252
    const m = await lerPlanilha("lojas.csv", bytes.buffer);
    const r = validarPlanilhaLojas(m, []);
    expect(r.errosGerais).toEqual([]);
    expect(r.linhas[0].dados).toMatchObject({ luc: "ILHA 001/002", localizacao: "Praça", aluguel_minimo: "1234.56", minimo_vigencia: "2026-10-01" });
  });

  it("recusa formato não suportado", async () => {
    await expect(lerPlanilha("a.xls", new ArrayBuffer(1))).rejects.toThrow(".xlsx");
  });
});
