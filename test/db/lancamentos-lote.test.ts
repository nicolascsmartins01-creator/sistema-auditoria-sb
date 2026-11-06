/** Fase 7 — lançamentos em lote por planilha. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { USUARIOS as U, como, comoConfirmando, criarBancoTeste } from "./ambiente";

let db: Client;
let ontem: string, anteontem: string, hoje: string;
beforeAll(async () => {
  db = await criarBancoTeste();
  const r = (await db.query(`select (now() at time zone 'America/Fortaleza')::date::text h,
     ((now() at time zone 'America/Fortaleza')::date - 1)::text o, ((now() at time zone 'America/Fortaleza')::date - 2)::text a`)).rows[0];
  hoje = r.h; ontem = r.o; anteontem = r.a;
});
afterAll(async () => { await db?.end(); });

const importar = (usuario: string, linhas: object[]) =>
  comoConfirmando(db, usuario, async (q) => (await q("select importar_lancamentos('lote.xlsx', 'lancamentos/l.xlsx', $1::jsonb) r", [JSON.stringify(linhas)])).rows[0].r);

describe("Lançamentos em lote", () => {
  it("auditor não importa", () =>
    expect(importar(U.auditor, [{ linha: 2, luc: "LJ 103", data: ontem, valor: "10" }])).rejects.toThrow(/Somente Analista/));

  it("grava tudo, com origem planilha, auditor indicado e importação registrada", async () => {
    const r = await importar(U.analista, [
      { linha: 2, luc: "LJ 103", data: ontem, valor: "1000.50", auditor: "auditor.teste" },
      { linha: 3, luc: "LJ 104", data: anteontem, valor: "0" },
    ]);
    expect(r).toMatchObject({ linhas: 2, total: 1000.5 });
    const ls = (await db.query("select l.origem, l.importacao_id is not null imp, u.login from lancamentos l join usuarios u on u.id = l.auditor_id order by l.valor desc")).rows;
    expect(ls).toEqual([{ origem: "planilha", imp: true, login: "auditor.teste" }, { origem: "planilha", imp: true, login: "analista.teste" }]);
    expect((await db.query("select count(*)::int n from trilha_auditoria where tabela = 'lancamentos' and importacao_id = $1", [r.importacao_id])).rows[0].n).toBe(2);
  });

  it("qualquer linha com problema desfaz tudo e aponta a linha", async () => {
    const antes = (await db.query("select count(*)::int n from lancamentos")).rows[0].n;
    const casos: [object, RegExp][] = [
      [{ linha: 5, luc: "LJ 999", data: anteontem, valor: "1" }, /Linha 5: LUC LJ 999 não encontrada/],
      [{ linha: 6, luc: "LJ 210", data: anteontem, valor: "1" }, /Linha 6: a loja LJ 210 não está marcada como auditada/],
      [{ linha: 7, luc: "LJ 201", data: hoje, valor: "1" }, /Linha 7: só é possível lançar dias anteriores/],
      [{ linha: 8, luc: "LJ 103", data: ontem, valor: "1" }, /Linha 8: o dia .* já foi lançado/],
      [{ linha: 9, luc: "LJ 204", data: anteontem, valor: "1", auditor: "ninguem" }, /Linha 9: auditor "ninguem" não encontrado/],
      [{ linha: 10, luc: "LJ 201", data: "2025-01-10", valor: "1" }, /Linha 10: o mês 01\/2025 está fechado/],
    ];
    for (const [ruim, erro] of casos) {
      await expect(importar(U.analista, [{ linha: 2, luc: "LJ 201", data: anteontem, valor: "5" }, ruim])).rejects.toThrow(erro);
    }
    expect((await db.query("select count(*)::int n from lancamentos")).rows[0].n).toBe(antes);
  });

  it("lançamento de planilha entra na conciliação como os demais", async () => {
    await como(db, U.analista, async (q) => {
      const n = (await q("select count(*)::int n from lancamentos where situacao = 'valido' and origem = 'planilha'")).rows[0].n;
      expect(n).toBe(2);
    });
  });
});
