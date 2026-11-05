/** Fase 3 — venda informada (PDF do portal): gravação, TOTAL, substituição e permissões. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { USUARIOS as U, como, comoConfirmando, criarBancoTeste } from "./ambiente";

let db: Client;
let mes: string; // mês corrente (aberto)
beforeAll(async () => {
  db = await criarBancoTeste();
  mes = (await db.query("select date_trunc('month', now() at time zone 'America/Fortaleza')::date::text m")).rows[0].m;
});
afterAll(async () => { await db?.end(); });

const linhas = [
  { luc: "LJ 103", nome: "CALCADOS EXEMPLO", valor: "100000.50" },
  { luc: "LJ 104", nome: "OTICA MODELO", valor: "25000.00" },
  { luc: "LJ 999X", nome: "NAO CADASTRADA", valor: "1.00" },
];
const importar = (usuario: string, total: string, substituir = false, ls = linhas) =>
  comoConfirmando(db, usuario, async (q) =>
    (await q("select importar_venda_informada($4::date, 'set.pdf', 'portal/set.pdf', $1, $2::jsonb, $3) r",
      [total, JSON.stringify(ls), substituir, mes])).rows[0].r);

describe("Venda informada", () => {
  it("auditor não importa nem vê", async () => {
    await expect(importar(U.auditor, "125001.50")).rejects.toThrow(/Somente Analista/);
  });

  it("soma diferente do TOTAL é recusada pelo banco", () =>
    expect(importar(U.analista, "125001.51")).rejects.toThrow(/não bate com o TOTAL/));

  it("grava ligando pela LUC; LUC não cadastrada fica sem loja", async () => {
    const r = await importar(U.analista, "125001.50");
    expect(r).toMatchObject({ linhas: 3, sem_loja: 1, substituiu: false });
    const v = (await db.query("select v.luc, v.valor, l.luc as loja_luc from vendas_informadas v left join lojas l on l.id = v.loja_id order by v.luc")).rows;
    expect(v).toEqual([
      { luc: "LJ 103", valor: "100000.50", loja_luc: "LJ 103" },
      { luc: "LJ 104", valor: "25000.00", loja_luc: "LJ 104" },
      { luc: "LJ 999X", valor: "1.00", loja_luc: null },
    ]);
    await como(db, U.auditor, async (q) => {
      expect(Number((await q("select count(*) n from vendas_informadas")).rows[0].n)).toBe(0);
    });
  });

  it("mês já importado: exige confirmação; ao substituir, a trilha guarda o anterior com motivo", async () => {
    await expect(importar(U.analista, "125001.50")).rejects.toThrow(/Confirme a substituição/);
    const novas = [{ luc: "LJ 103", nome: "CALCADOS EXEMPLO", valor: "90000.00" }];
    const r = await importar(U.analista, "90000.00", true, novas);
    expect(r).toMatchObject({ substituiu: true, total_anterior: 125001.5 });
    expect((await db.query("select count(*)::int n from vendas_informadas")).rows[0].n).toBe(1);
    const t = (await db.query("select count(*)::int n, min(motivo) m from trilha_auditoria where tabela = 'vendas_informadas' and acao = 'DELETE'")).rows[0];
    expect(t).toEqual({ n: 3, m: "Substituída pela importação do arquivo set.pdf" });
  });

  it("loja cadastrada depois é ligada às vendas que vieram só com a LUC", async () => {
    await importar(U.analista, "125001.50", true);
    await comoConfirmando(db, U.analista, (q) => q("insert into lojas (luc, nome_fantasia) values ('LJ 999X', 'Agora Cadastrada')"));
    const v = (await db.query("select l.nome_fantasia from vendas_informadas v join lojas l on l.id = v.loja_id where v.luc = 'LJ 999X'")).rows;
    expect(v).toEqual([{ nome_fantasia: "Agora Cadastrada" }]);
  });

  it("ninguém grava direto na tabela; loja com venda informada não é excluída", async () => {
    await expect(como(db, U.analista, (q) => q("update vendas_informadas set valor = 1"))).rejects.toThrow(/permission denied/);
    const lj = (await db.query("select id from lojas where luc = 'LJ 104'")).rows[0].id;
    await expect(como(db, U.admin, (q) => q("select excluir_loja($1, 'x')", [lj]))).rejects.toThrow(/vendas informadas/);
  });
});
