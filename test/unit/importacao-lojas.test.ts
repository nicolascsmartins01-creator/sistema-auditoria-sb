import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { validarPlanilhaLojas, type LojaCadastrada } from "@/lib/importacao-lojas/validar";
import { lerPlanilha } from "@/lib/importacao-lojas/ler-planilha";
import { gerarModeloLojas } from "@/lib/importacao-lojas/modelo";
import { COLUNAS } from "@/lib/importacao-lojas/colunas";
import { analisarCabecalho, validarMapeamento } from "@/lib/importacao-lojas/mapeamento";
import { lerDataVigencia } from "@/lib/formato";

const CAB = COLUNAS.map((c) => c.titulo);
const linha = (o: Partial<Record<string, string | number | null>>) =>
  COLUNAS.map((c) => (o[c.chave] ?? null) as string | number | null);

const cadastro: LojaCadastrada[] = [
  {
    id: "1", luc: "LJ 101/102/102A", nome_fantasia: "Loja Fictícia A", area_m2: 120, piso: "L1", localizacao: "Corredor A",
    segmento: "Moda", auditada: true, ativa: true,
    percentuais: [{ vigencia_inicio: "2026-01-01", percentual: 6 }],
    minimos: [{ vigencia_inicio: "2026-01-01", valor: 10000 }],
    dezembro: [],
  },
  {
    id: "2", luc: "Q 001C", nome_fantasia: "Quiosque Fictício", area_m2: null, piso: null, localizacao: null,
    segmento: null, auditada: true, ativa: false, percentuais: [], minimos: [], dezembro: [],
  },
];

describe("validação da planilha de lojas", () => {
  it("classifica nova, atualização e sem alteração", () => {
    const r = validarPlanilhaLojas([
      CAB,
      linha({ luc: "LJ 101/102/102A", nome_fantasia: "Loja Fictícia A", area: "120", piso: "L1", segmento: "moda", vigencia: "01/01/2026", percentual: "6", aluguel_minimo: "10.000,00" }),
      linha({ luc: "T1", nome_fantasia: "Torre Fictícia", area: "85,5 m²", piso: "L2", vigencia: "15/09/2026", percentual: "5,5", aluguel_minimo: "2.000", ano_13: 2026, valor_13: "4.000,00" }),
      linha({ luc: "Q 001C", nome_fantasia: "Quiosque Fictício", ativa: "S" }),
    ], cadastro);
    expect(r.errosGerais).toEqual([]);
    expect(r.linhas.map((l) => l.situacao)).toEqual(["sem_alteracao", "nova", "atualizacao"]);
    expect(r.linhas[2].avisos.join()).toContain("reativada");
    expect(r.podeImportar).toBe(true);
    expect(r.paraGravar).toHaveLength(2);
    expect(r.paraGravar[0]).toMatchObject({
      luc: "T1", area_m2: "85.50", piso: "L2", percentual: "5.5000", percentual_vigencia: "2026-09-15",
      aluguel_minimo: "2000.00", minimo_vigencia: "2026-09-15", ano_13: 2026, valor_13: "4000.00",
    });
  });

  it("descreve nova vigência (qualquer dia), alteração de valor, área e piso", () => {
    const r = validarPlanilhaLojas([
      CAB,
      linha({ luc: "LJ 101/102/102A", area: "130", piso: "L2", percentual: "6,5", percentual_vigencia: "20/09/2026", aluguel_minimo: "11000", minimo_vigencia: "01/2026" }),
    ], cadastro);
    expect(r.linhas[0].mudancas).toEqual([
      "Área: 120 m² → 130 m²",
      'Piso: "L1" → "L2"',
      "Percentual 6,50% a partir de 20/09/2026",
      "Aluguel mínimo a partir de 01/01/2026: R$ 10.000,00 → R$ 11.000,00",
    ]);
  });

  it("nada bloqueia: dados faltando ou ilegíveis viram aviso e a loja é gravada", () => {
    const r = validarPlanilhaLojas([
      CAB,
      linha({ luc: "", nome_fantasia: "Título de grupo" }),
      linha({ luc: "LJ 200", nome_fantasia: "", piso: "L3" }),
      linha({ luc: "LJ 201", nome_fantasia: "X", percentual: "abc", vigencia: "15/09/2026", area: "grande" }),
      linha({ luc: "LJ 202", nome_fantasia: "Y", aluguel_minimo: "1.000,00", vigencia: "data errada" }),
      linha({ luc: "LJ 203", nome_fantasia: "Z", percentual: "6", vigencia: "-" }),
      linha({ luc: "LJ 203", nome_fantasia: "Z2", auditada: "talvez", aluguel_minimo: "500", vigencia: "01/03/2027" }),
      linha({ luc: "LJ 204", nome_fantasia: "W", ano_13: 2026 }),
      linha({ luc: "LJ 205", nome_fantasia: "V", percentual: "0,065" }),
    ], cadastro);
    expect(r.errosGerais).toEqual([]);
    expect(r.podeImportar).toBe(true);
    expect(r.avisosGerais.join()).toContain("1 linha(s) sem LUC foram ignoradas (linhas 2)");
    const por = (luc: string, i = 0) => r.linhas.filter((l) => l.luc === luc)[i];
    expect(por("LJ 200")).toMatchObject({ situacao: "nova", nome: "LJ 200" });
    expect(por("LJ 200").avisos[0]).toContain("LUC como nome");
    expect(por("LJ 201").dados).toEqual({ luc: "LJ 201", nome_fantasia: "X" });
    expect(por("LJ 201").avisos.join()).toContain("Percentual não reconhecido");
    expect(por("LJ 202").dados).toMatchObject({ aluguel_minimo: "1000.00", minimo_vigencia: null });
    expect(por("LJ 202").avisos.join()).toContain("ficará “a definir”");
    expect(por("LJ 203").dados).toMatchObject({ percentual: "6.0000", percentual_vigencia: null });
    expect(por("LJ 203", 1)).toMatchObject({ situacao: "atualizacao", dados: { aluguel_minimo: "500.00", minimo_vigencia: "2027-03-01" } });
    expect(por("LJ 203", 1).avisos.join()).toContain("também aparece na linha 6");
    expect(por("LJ 205").dados).toMatchObject({ percentual: "6.5000" });
    expect(r.paraGravar.map((d) => d.luc)).toEqual(["LJ 200", "LJ 201", "LJ 202", "LJ 203", "LJ 203", "LJ 204", "LJ 205"]);
  });

  it("acha a linha de títulos abaixo de cabeçalhos e avisa lojas fora da planilha", () => {
    expect(validarPlanilhaLojas([["A", "B"], ["1", "2"]], cadastro).errosGerais[0]).toContain("LUC");
    const r = validarPlanilhaLojas([["Shopping"], ["Relatório de contratos"], [], ["LUC", "Loja", "Observação"], ["T9", "Nova", "x"]], cadastro);
    expect(r.errosGerais).toEqual([]);
    expect(r.camposLidos).toEqual(["LUC ← coluna A", "Loja ← coluna B"]);
    expect(r.avisosGerais.join()).toContain("LJ 101/102/102A");
    expect(r.linhas[0].linha).toBe(5);
  });
});

describe("escolha de colunas", () => {
  const planilha = [
    ["Código", "Operação", "Mínimo novo", "Obs"],
    ["LJ 101/102/102A", "Nome que não deve ser lido", "21.000,00", "x"],
    ["T1", "Outro nome", "", "y"],
  ];

  it("lê só os campos escolhidos; data fixa de vigência (qualquer dia)", () => {
    const r = validarPlanilhaLojas(planilha, cadastro, {
      linhaCabecalho: 0, colunas: { luc: 0, aluguel_minimo: 2 }, fixos: { vigencia: "2026-11-10" },
    });
    expect(r.errosGerais).toEqual([]);
    expect(r.camposLidos).toEqual(["LUC ← coluna A", "Aluguel mínimo (R$) ← coluna C", "Vigência do aluguel mínimo: 10/11/2026 para todas as linhas"]);
    expect(r.linhas[0]).toMatchObject({ situacao: "atualizacao", nome: "Loja Fictícia A", mudancas: ["Aluguel mínimo R$ 21.000,00 a partir de 10/11/2026"] });
    expect(r.linhas[0].dados).toEqual({ luc: "LJ 101/102/102A", aluguel_minimo: "21000.00", minimo_vigencia: "2026-11-10" });
    // T1 é nova e sem nome escolhido: cadastrada com a LUC como nome
    expect(r.linhas[1]).toMatchObject({ situacao: "nova", nome: "T1" });
    expect(r.podeImportar).toBe(true);
  });

  it("célula vazia num campo escolhido não altera a loja", () => {
    const r = validarPlanilhaLojas([["LUC", "Mínimo", "Piso", "Obs"], ["LJ 101/102/102A", "", "", "sem mudança"]], cadastro, {
      linhaCabecalho: 0, colunas: { luc: 0, aluguel_minimo: 1, piso: 2 }, fixos: { minimo_vigencia: "2026-11-01" },
    });
    expect(r.linhas[0]).toMatchObject({ situacao: "sem_alteracao", dados: { luc: "LJ 101/102/102A" } });
  });

  it("13º com ano fixo", () => {
    const r = validarPlanilhaLojas([["LUC", "13º"], ["LJ 101/102/102A", "40.000"]], cadastro, {
      linhaCabecalho: 0, colunas: { luc: 0, valor_13: 1 }, fixos: { ano_13: 2027 },
    });
    expect(r.linhas[0].dados).toEqual({ luc: "LJ 101/102/102A", ano_13: 2027, valor_13: "40000.00" });
  });

  it("só exige a LUC e mais um campo; a mesma coluna pode servir a dois campos", () => {
    expect(validarMapeamento({ linhaCabecalho: 0, colunas: {} })).toContain("Escolha a coluna da LUC (é ela que identifica a loja).");
    expect(validarMapeamento({ linhaCabecalho: 0, colunas: { luc: 0 } })[0]).toContain("pelo menos um campo");
    expect(validarMapeamento({ linhaCabecalho: 0, colunas: { luc: 0, percentual: 1 } })).toEqual([]);
    expect(validarMapeamento({ linhaCabecalho: 0, colunas: { luc: 0, percentual_vigencia: 1, minimo_vigencia: 1 } })).toEqual([]);
  });

  it("vigência separada tem prioridade sobre a geral", () => {
    const r = validarPlanilhaLojas([["LUC", "%", "AMM", "Vig", "Vig mín"], ["LJ 9", "7", "900", "05/02/2026", "10/03/2026"]], [], {
      linhaCabecalho: 0, colunas: { luc: 0, percentual: 1, aluguel_minimo: 2, vigencia: 3, minimo_vigencia: 4 },
    });
    expect(r.linhas[0].dados).toMatchObject({ percentual_vigencia: "2026-02-05", minimo_vigencia: "2026-03-10" });
  });

  it("sem vigência: grava como 'a definir'; aceita percentual 0", () => {
    const r = validarPlanilhaLojas([["LUC", "Nome", "Alu%", "AMM"], ["LJ 101/102/102A", "Loja Fictícia A", "6", "18500"], ["T7", "Nova Sem Vigência", "0", "3393.73"]], cadastro, {
      linhaCabecalho: 0, colunas: { luc: 0, nome_fantasia: 1, percentual: 2, aluguel_minimo: 3 },
    });
    expect(r.errosGerais).toEqual([]);
    expect(r.avisosGerais.join()).toContain("vigência a definir");
    expect(r.camposLidos).toContain("Vigência do percentual: a definir depois");
    expect(r.linhas[0].mudancas).toEqual(["Percentual 6,00% com vigência a definir", "Aluguel mínimo R$ 18.500,00 com vigência a definir"]);
    expect(r.linhas[1]).toMatchObject({ situacao: "nova", dados: { luc: "T7", percentual: "0.0000", percentual_vigencia: null, aluguel_minimo: "3393.73", minimo_vigencia: null } });
  });

  it("reconhece títulos comuns de planilhas de contratos", () => {
    const r = analisarCabecalho([
      ["Relatório de lojas"],
      ["Nº LUC", "Nome da Loja", "Pavimento", "ABL (m²)", "Ramo de atividade", "Início do contrato", "Fim do contrato", "Aluguel % s/ faturamento", "AMM (R$)"],
      ["LJ 1", "A", "L1", "100", "Moda", "15/02/2026", "14/02/2031", "6%", "100"],
      ["LJ 2", "B", "", "50", "", "", "", "", "200"],
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.linhaCabecalho).toBe(1);
    expect(r.totalLinhas).toBe(2);
    expect(r.sugestao.colunas).toEqual({ luc: 0, nome_fantasia: 1, piso: 2, area: 3, segmento: 4, vigencia: 5, percentual: 7, aluguel_minimo: 8 });
  });
});

describe("datas de vigência", () => {
  it("aceita qualquer dia e vários formatos", () => {
    const d = (v: unknown) => { const r = lerDataVigencia(v); return r.ok ? r.data : r.erro; };
    expect(d("15/03/2026")).toBe("2026-03-15");
    expect(d("15/03/26")).toBe("2026-03-15");
    expect(d("15.03.2026")).toBe("2026-03-15");
    expect(d("2026-03-15")).toBe("2026-03-15");
    expect(d("03/2026")).toBe("2026-03-01");
    expect(d("mar/2026")).toBe("2026-03-01");
    expect(d("março de 2026")).toBe("2026-03-01");
    expect(d("15/03/2026 a 14/03/2031")).toBe("2026-03-15");
    expect(d(46096)).toBe("2026-03-15");                         // número de série do Excel
    expect(d(new Date(Date.UTC(2026, 2, 15)))).toBe("2026-03-15");
    expect(d(new Date(Date.UTC(2026, 2, 14, 23, 59, 50)))).toBe("2026-03-15"); // arredondamento do Excel
    expect(d("31/02/2026")).toContain("não reconhecida");
    expect(d("-")).toBe("vazio");
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
    ws.addRow(["LUC", "Nome fantasia", "Percentual (%)", "Vigência"]);
    ws.addRow(["LJ 1", "Loja", 0.065, new Date(Date.UTC(2026, 8, 17))]);
    ws.getCell("C2").numFmt = "0.00%";
    const buf = await wb.xlsx.writeBuffer();
    const m = await lerPlanilha("a.xlsx", buf as ArrayBuffer);
    const r = validarPlanilhaLojas(m, []);
    expect(r.linhas[0].dados).toMatchObject({ percentual: "6.5000", percentual_vigencia: "2026-09-17" });
  });

  it("lê CSV do Excel em Windows-1252 separado por ponto e vírgula", async () => {
    const txt = "LUC;Nome fantasia;Localização;Aluguel mínimo (R$);Início vigência mínimo (dd/mm/aaaa)\r\nILHA 001/002;Café Fictício;Praça;1.234,56;10/2026\r\n";
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

describe("planilha real típica (fictícia)", () => {
  it("várias abas, títulos no meio, células do Excel, totais e marcas de vazio", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Capa").addRow(["Shopping Fictício — contratos"]);
    const ws = wb.addWorksheet("Contratos");
    ws.addRow(["RELAÇÃO DE OPERAÇÕES"]);
    ws.addRow([]);
    ws.addRow(["Nº LUC", "Operação", "Piso", "ABL (m²)", "Segmento", "Início Vigência", "Término", "% Aluguel", "Aluguel Mínimo"]);
    ws.addRow(["PISO L1"]);                                                                  // título de grupo
    ws.addRow(["LJ 101", "Loja Exemplo", "L1", 120.5, "Moda", new Date(Date.UTC(2025, 2, 15)), new Date(Date.UTC(2030, 2, 14)), 0.06, 15000]);
    ws.getCell("H5").numFmt = "0.00%";
    ws.addRow(["LJ 102", "", "L1", "85,00 m²", "-", "10/07/2024", "09/07/2029", "7%", "R$ 9.800,50"]);
    ws.addRow(["Q 003", "Quiosque Exemplo", "L2", "-", "Alimentação", "-", "", "-", "-"]);
    ws.addRow([102, "Loja Numérica", "L2", 30, "Serviços", 45658, "", "5", "1.000"]);         // LUC e data como número
    ws.addRow(["TOTAL", "", "", { formula: "SUM(D5:D8)", result: 235.5 }]);                  // linha de total
    const buf = await wb.xlsx.writeBuffer();
    const m = await lerPlanilha("contratos.xlsx", buf as ArrayBuffer);
    const r = validarPlanilhaLojas(m, []);
    expect(r.errosGerais).toEqual([]);
    expect(r.podeImportar).toBe(true);
    const d = Object.fromEntries(r.linhas.map((l) => [l.luc, l.dados]));
    expect(d["LJ 101"]).toMatchObject({ nome_fantasia: "Loja Exemplo", piso: "L1", area_m2: "120.50", segmento: "Moda",
      percentual: "6.0000", percentual_vigencia: "2025-03-15", aluguel_minimo: "15000.00", minimo_vigencia: "2025-03-15" });
    expect(d["LJ 102"]).toMatchObject({ area_m2: "85.00", percentual: "7.0000", percentual_vigencia: "2024-07-10", aluguel_minimo: "9800.50" });
    expect(d["LJ 102"]).not.toHaveProperty("segmento");
    expect(d["Q 003"]).toEqual({ luc: "Q 003", nome_fantasia: "Quiosque Exemplo", piso: "L2", segmento: "Alimentação" });
    expect(d["102"]).toMatchObject({ percentual_vigencia: "2025-01-01" });
    expect(r.linhas.find((l) => l.luc === "LJ 102")!.nome).toBe("LJ 102");
    expect(r.linhas.map((l) => l.luc)).toEqual(["LJ 101", "LJ 102", "Q 003", "102"]);
    expect(r.avisosGerais.join()).toContain("2 linha(s) de título ou total foram ignoradas (linhas 4, 9)");
  });
});
