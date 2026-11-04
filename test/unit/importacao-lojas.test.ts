import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { validarPlanilhaLojas, type LojaCadastrada } from "@/lib/importacao-lojas/validar";
import { lerPlanilha } from "@/lib/importacao-lojas/ler-planilha";
import { gerarModeloLojas } from "@/lib/importacao-lojas/modelo";
import { COLUNAS } from "@/lib/importacao-lojas/colunas";
import { analisarCabecalho, validarMapeamento } from "@/lib/importacao-lojas/mapeamento";

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

  it("sem coluna de LUC reconhecida pede a escolha; acha a linha de títulos e avisa lojas fora da planilha", () => {
    expect(validarPlanilhaLojas([["A", "B"], ["1", "2"]], cadastro).errosGerais[0]).toContain("LUC");
    const r = validarPlanilhaLojas([["Relatório"], ["LUC", "Nome fantasia", "Observação"], ["T9", "Nova", "x"]], cadastro);
    expect(r.errosGerais).toEqual([]);
    expect(r.camposLidos).toEqual(["LUC ← coluna A", "Nome fantasia ← coluna B"]);
    expect(r.avisosGerais.join()).toContain("LJ 101/102/102A");
    expect(r.linhas[0].linha).toBe(3);
  });
});

describe("escolha de colunas", () => {
  // planilha com títulos próprios do usuário, fora do modelo
  const planilha = [
    ["Código", "Loja", "Mínimo novo", "Obs"],
    ["LJ 101/102/102A", "Nome que não deve ser lido", "21.000,00", "x"],
    ["T1", "Outro nome", "", "y"],
  ];

  it("lê só os campos escolhidos; mês de vigência fixo para todas as linhas", () => {
    const r = validarPlanilhaLojas(planilha, cadastro, {
      linhaCabecalho: 0, colunas: { luc: 0, aluguel_minimo: 2 }, fixos: { minimo_vigencia: "2026-11-01" },
    });
    expect(r.errosGerais).toEqual([]);
    expect(r.camposLidos).toEqual(["LUC ← coluna A", "Aluguel mínimo (R$) ← coluna C", "Início vigência mínimo: 11/2026 para todas as linhas"]);
    expect(r.linhas[0]).toMatchObject({ situacao: "atualizacao", nome: "Loja Fictícia A", mudancas: ["Nova vigência de aluguel mínimo a partir de 11/2026: R$ 21.000,00"] });
    // nada além da LUC e do mínimo vai para o banco (nome, localização etc. ficam como estão)
    expect(r.linhas[0].dados).toEqual({ luc: "LJ 101/102/102A", aluguel_minimo: "21000.00", minimo_vigencia: "2026-11-01" });
    // T1 não está cadastrada e o nome não foi escolhido → erro
    expect(r.linhas[1].erros[0]).toContain("Nome fantasia");
    expect(r.podeImportar).toBe(false);
  });

  it("célula vazia num campo escolhido não altera a loja", () => {
    const r = validarPlanilhaLojas([["LUC", "Mínimo"], ["LJ 101/102/102A", ""]], cadastro, {
      linhaCabecalho: 0, colunas: { luc: 0, aluguel_minimo: 1 }, fixos: { minimo_vigencia: "2026-11-01" },
    });
    expect(r.linhas[0]).toMatchObject({ situacao: "sem_alteracao", dados: { luc: "LJ 101/102/102A" } });
  });

  it("13º com ano fixo", () => {
    const r = validarPlanilhaLojas([["LUC", "13º"], ["LJ 101/102/102A", "40.000"]], cadastro, {
      linhaCabecalho: 0, colunas: { luc: 0, valor_13: 1 }, fixos: { ano_13: 2027 },
    });
    expect(r.linhas[0].dados).toEqual({ luc: "LJ 101/102/102A", ano_13: 2027, valor_13: "40000.00" });
  });

  it("recusa escolhas incoerentes", () => {
    expect(validarMapeamento({ linhaCabecalho: 0, colunas: {} })).toContain("Escolha a coluna da LUC (é ela que identifica a loja).");
    expect(validarMapeamento({ linhaCabecalho: 0, colunas: { luc: 0 } })[0]).toContain("pelo menos um campo");
    expect(validarMapeamento({ linhaCabecalho: 0, colunas: { luc: 0, percentual: 1 } })[0]).toContain("Percentual: escolha a coluna do início de vigência");
    expect(validarMapeamento({ linhaCabecalho: 0, colunas: { luc: 0, nome_fantasia: 0 } })[0]).toContain("mesma coluna");
    expect(validarMapeamento({ linhaCabecalho: 0, colunas: { luc: 0, ano_13: 1 } })).toContain("13º aluguel: foi escolhida a coluna do ano, mas não a do valor.");
  });

  it("analisa os títulos e sugere a correspondência", () => {
    const r = analisarCabecalho([["Relatório de lojas"], ["Nº LUC", "Nome", "Piso", "Aluguel mínimo (R$)"], ["LJ 1", "A", "L1", "100"], ["LJ 2", "B", "", "200"]]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.linhaCabecalho).toBe(1);
    expect(r.totalLinhas).toBe(2);
    expect(r.sugestao.colunas).toEqual({ luc: 0, nome_fantasia: 1, aluguel_minimo: 3 });
    expect(r.colunas.map((c) => `${c.letra}:${c.titulo}:${c.exemplos.join("|")}`)).toEqual([
      "A:Nº LUC:LJ 1|LJ 2", "B:Nome:A|B", "C:Piso:L1", "D:Aluguel mínimo (R$):100|200",
    ]);
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
