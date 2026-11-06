import { describe, expect, it } from "vitest";
import { analisarPlanilhaLanc, lerData, validarLancamentosLote, type ContextoLanc } from "@/lib/importacao-lancamentos/validar";
import { gerarModeloLancamentos } from "@/lib/importacao-lancamentos/modelo";
import { lerPlanilha } from "@/lib/importacao-lojas/ler-planilha";

const ctx: ContextoLanc = {
  lojas: [
    { id: "a", luc: "LJ 103", nome: "Calçados", ativa: true, auditada: true },
    { id: "b", luc: "LJ 210", nome: "Cine", ativa: true, auditada: false },
    { id: "c", luc: "LJ 130", nome: "Antiga", ativa: false, auditada: true },
  ],
  jaLancados: new Set(["a|2026-10-05"]),
  mesesFechados: new Set(["2026-09"]),
  hoje: "2026-11-06",
  logins: new Set(["auditor.teste"]),
};

describe("lançamentos em lote", () => {
  it("lê datas em vários formatos e recusa datas impossíveis", () => {
    expect([lerData("05/10/2026"), lerData("5/10/2026"), lerData("2026-10-05"), lerData(new Date(Date.UTC(2026, 9, 5)))]).toEqual(Array(4).fill("2026-10-05"));
    expect([lerData("31/02/2026"), lerData("10/2026"), lerData("")]).toEqual([null, null, null]);
  });

  it("sugere as colunas pelos títulos e valida linha a linha", () => {
    const m = [
      ["LUC", "Data", "Valor", "Auditor"],
      ["LJ 103", "06/10/2026", "1.234,56", "auditor.teste"],    // ok
      ["LJ 103", "05/10/2026", "10", ""],                       // dia já lançado
      ["LJ 999", "06/10/2026", "10", ""],                       // loja não encontrada
      ["LJ 210", "06/10/2026", "10", ""],                       // não auditada
      ["LJ 130", "06/10/2026", "10", ""],                       // inativa
      ["LJ 103", "15/09/2026", "10", ""],                       // mês fechado
      ["LJ 103", "06/11/2026", "10", ""],                       // hoje
      ["LJ 103", "32/10/2026", "10", ""],                       // data inválida
      ["LJ 103", "07/10/2026", "", ""],                         // valor vazio
      ["LJ 103", "06/10/2026", "5", ""],                        // repetido na planilha
      ["LJ 103", "08/10/2026", "5", "fulano"],                  // auditor inexistente
    ];
    const a = analisarPlanilhaLanc(m);
    if (!a.ok) throw new Error();
    expect(a.sugestao.colunas).toEqual({ luc: 0, data: 1, valor: 2, auditor: 3 });
    const r = validarLancamentosLote(m, a.sugestao, ctx);
    expect(r.linhas.map((l) => [l.linha, l.erros.join(" | ")])).toEqual([
      [2, ""],
      [3, "Dia já lançado: 05/10/2026 já tem lançamento para esta loja."],
      [4, 'Loja não encontrada: LUC "LJ 999" não está entre as lojas ativas.'],
      [5, "Loja não está marcada como auditada."],
      [6, 'Loja não encontrada: LUC "LJ 130" não está entre as lojas ativas.'],
      [7, "Mês 09/2026 está fechado."],
      [8, "Data de hoje: só é possível lançar dias anteriores."],
      [9, 'Data inválida: "32/10/2026" (use dd/mm/aaaa).'],
      [10, "Valor vazio."],
      [11, "Repetido na planilha (mesma loja e data da linha 2)."],
      [12, 'Auditor "fulano" não encontrado ou desativado.'],
    ]);
    expect(r.podeImportar).toBe(false);
    expect(r.paraGravar).toEqual([]);
  });

  it("planilha correta: pronta para gravar, com totais por mês", () => {
    const m = [["LUC", "Data da venda", "Venda líquida (R$)"], ["LJ 103", "06/10/2026", "1.000,00"], ["LJ 103", "02/11/2026", "0"]];
    const a = analisarPlanilhaLanc(m);
    if (!a.ok) throw new Error();
    const r = validarLancamentosLote(m, a.sugestao, ctx);
    expect(r.podeImportar).toBe(true);
    expect(r.totais).toEqual({ linhas: 2, comErro: 0, valorCentavos: 100000, porMes: { "2026-10": 1, "2026-11": 1 } });
    expect(r.linhas[1].avisos).toEqual(["Valor zero (loja fechada no dia?)."]);
    expect(r.paraGravar[0]).toEqual({ linha: 2, luc: "LJ 103", data: "2026-10-06", valor: "1000.00", auditor: null });
  });

  it("modelo baixado é reconhecido", async () => {
    const buf = await gerarModeloLancamentos();
    const m = await lerPlanilha("modelo.xlsx", buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
    const a = analisarPlanilhaLanc(m);
    if (!a.ok) throw new Error();
    expect(a.sugestao.colunas).toEqual({ luc: 0, data: 1, valor: 2, auditor: 3 });
  });
});
