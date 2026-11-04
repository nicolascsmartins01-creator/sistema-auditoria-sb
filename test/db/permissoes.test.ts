/**
 * Testes de permissão no BANCO (não na tela): garantem que cada perfil só
 * enxerga e altera o que pode, mesmo que alguém tente burlar a interface.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { USUARIOS as U, como, comoConfirmando, criarBancoTeste } from "./ambiente";

let db: Client;
beforeAll(async () => { db = await criarBancoTeste(); });
afterAll(async () => { await db?.end(); });

const contar = async (q: Client["query"], sql: string, params: unknown[] = []) =>
  Number((await q(sql, params)).rows[0].n);
const idLoja = async (luc: string) =>
  (await db.query("select id from public.lojas where luc = $1 order by ativa desc limit 1", [luc])).rows[0].id as string;

describe("Auditor", () => {
  it("vê as lojas, mas nenhum valor contratual", () =>
    como(db, U.auditor, async (q) => {
      expect(await contar(q, "select count(*) n from lojas")).toBe(21);
      expect(await contar(q, "select count(*) n from loja_percentuais")).toBe(0);
      expect(await contar(q, "select count(*) n from loja_alugueis_minimos")).toBe(0);
      expect(await contar(q, "select count(*) n from loja_aluguel_dezembro")).toBe(0);
      const v = (await q("select * from valores_vigentes((select id from lojas where luc='LJ 103'), 2026, 9)")).rows[0];
      expect(v.percentual).toBeNull();
      expect(v.aluguel_minimo).toBeNull();
    }));

  it("não vê trilha, importações nem outros usuários", () =>
    como(db, U.auditor, async (q) => {
      expect(await contar(q, "select count(*) n from trilha_auditoria")).toBe(0);
      expect(await contar(q, "select count(*) n from importacoes")).toBe(0);
      const r = await q("select id from usuarios");
      expect(r.rows.map((x) => x.id)).toEqual([U.auditor]);
    }));

  it("não cria loja", () =>
    expect(como(db, U.auditor, (q) => q("insert into lojas (luc, nome_fantasia) values ('X 1', 'Hack')")))
      .rejects.toThrow(/row-level security/));

  it("não altera loja (nenhuma linha afetada)", () =>
    como(db, U.auditor, async (q) => {
      const r = await q("update lojas set nome_fantasia = 'Hack' where luc = 'LJ 103'");
      expect(r.rowCount).toBe(0);
    }));

  it("não grava valor contratual", () =>
    expect(como(db, U.auditor, (q) =>
      q("insert into loja_percentuais (loja_id, vigencia_inicio, percentual) select id, '2026-10-01', 1 from lojas limit 1"),
    )).rejects.toThrow(/row-level security/));

  it("não importa planilha", () =>
    expect(como(db, U.auditor, (q) => q("select importar_lojas('a.xlsx', 'p', '[]'::jsonb)")))
      .rejects.toThrow(/Somente Analista/));

  it("não muda o próprio perfil", () =>
    como(db, U.auditor, async (q) => {
      const r = await q("update usuarios set perfil = 'administrador' where id = $1", [U.auditor]);
      expect(r.rowCount).toBe(0);
    }));

  it("não envia arquivo para o storage de importações", () =>
    expect(como(db, U.auditor, (q) => q("insert into storage.objects (bucket_id, name) values ('importacoes', 'x.xlsx')")))
      .rejects.toThrow(/row-level security/));
});

describe("Analista", () => {
  it("vê valores contratuais, trilha e todos os usuários", () =>
    como(db, U.analista, async (q) => {
      expect(await contar(q, "select count(*) n from loja_percentuais")).toBeGreaterThan(0);
      expect(await contar(q, "select count(*) n from usuarios")).toBe(4);
    }));

  it("cadastra loja e vigência; a trilha registra quem fez", () =>
    como(db, U.analista, async (q) => {
      const id = (await q("insert into lojas (luc, nome_fantasia) values ('LJ 999', 'Nova Fictícia') returning id")).rows[0].id;
      await q("insert into loja_percentuais (loja_id, vigencia_inicio, percentual) values ($1, '2026-10-01', 6.5)", [id]);
      await q("update lojas set nome_fantasia = 'Nova Fictícia 2' where id = $1", [id]);
      await q("update lojas set nome_fantasia = 'Nova Fictícia 2' where id = $1", [id]); // sem mudança real
      const t = await q("select acao, tabela, usuario_id, dados_anteriores->>'nome_fantasia' ant, dados_novos->>'nome_fantasia' novo from trilha_auditoria where registro_id = $1 order by id", [id]);
      expect(t.rows).toEqual([
        { acao: "INSERT", tabela: "lojas", usuario_id: U.analista, ant: null, novo: "Nova Fictícia" },
        { acao: "UPDATE", tabela: "lojas", usuario_id: U.analista, ant: "Nova Fictícia", novo: "Nova Fictícia 2" },
      ]);
      expect(await contar(q, "select count(*) n from trilha_auditoria where tabela='loja_percentuais' and dados_novos->>'loja_id' = $1", [id])).toBe(1);
    }));

  it("não apaga loja (só inativa)", () =>
    expect(como(db, U.analista, (q) => q("delete from lojas where luc = 'LJ 103'"))).rejects.toThrow(/permission denied/));

  it("não altera nem apaga a trilha", async () => {
    await expect(como(db, U.analista, (q) => q("update trilha_auditoria set motivo = 'x'"))).rejects.toThrow(/permission denied/);
    await expect(como(db, U.analista, (q) => q("delete from trilha_auditoria"))).rejects.toThrow(/permission denied/);
  });

  it("nem o dono do banco consegue apagar a trilha", async () => {
    await db.query("begin");
    await db.query("insert into trilha_auditoria (acao, tabela) values ('TESTE', 'x')");
    await expect(db.query("delete from trilha_auditoria")).rejects.toThrow(/não pode ser alterada/);
    await db.query("rollback");
  });

  it("não cria nem altera usuários", async () => {
    await expect(como(db, U.analista, (q) =>
      q("insert into usuarios (id, nome, login, perfil) values ($1, 'X', 'xxx', 'administrador')", [U.inativo]),
    )).rejects.toThrow(/row-level security/);
    await como(db, U.analista, async (q) => {
      expect((await q("update usuarios set perfil = 'administrador' where id = $1", [U.analista])).rowCount).toBe(0);
    });
  });

  it("envia arquivo de importação, mas não o substitui nem apaga", () =>
    como(db, U.analista, async (q) => {
      await q("insert into storage.objects (bucket_id, name) values ('importacoes', 'lojas/a.xlsx')");
      expect((await q("delete from storage.objects where name = 'lojas/a.xlsx'")).rowCount).toBe(0);
      expect((await q("update storage.objects set name = 'b' where name = 'lojas/a.xlsx'")).rowCount).toBe(0);
    }));
});

describe("Administrador", () => {
  it("altera perfil e desativa outros usuários", () =>
    como(db, U.admin, async (q) => {
      expect((await q("update usuarios set perfil = 'analista' where id = $1", [U.auditor])).rowCount).toBe(1);
      expect((await q("update usuarios set ativo = false where id = $1", [U.analista])).rowCount).toBe(1);
    }));

  it("não altera o próprio perfil nem se desativa", () =>
    expect(como(db, U.admin, (q) => q("update usuarios set ativo = false where id = $1", [U.admin])))
      .rejects.toThrow(/próprio perfil/));

  it("o login não pode mudar", () =>
    expect(como(db, U.admin, (q) => q("update usuarios set login = 'outro' where id = $1", [U.auditor])))
      .rejects.toThrow(/login não pode/));

  it("o sistema nunca fica sem Administrador ativo", async () => {
    // segundo admin rebaixa o primeiro: permitido só se sobrar outro admin
    await db.query("update usuarios set perfil = 'administrador' where id = $1", [U.analista]);
    await como(db, U.analista, async (q) => {
      expect((await q("update usuarios set perfil = 'analista' where id = $1", [U.admin])).rowCount).toBe(1);
    });
    await db.query("update usuarios set perfil = 'analista' where id = $1", [U.analista]);
    // com um único Administrador ativo, nem por fora da tela ele pode ser rebaixado/desativado
    await expect(db.query("update usuarios set ativo = false where id = $1", [U.admin]))
      .rejects.toThrow(/pelo menos um Administrador/);
    await expect(db.query("update usuarios set perfil = 'auditor' where id = $1", [U.admin]))
      .rejects.toThrow(/pelo menos um Administrador/);
  });
});

describe("Usuário desativado", () => {
  it("não enxerga nada", () =>
    como(db, U.inativo, async (q) => {
      expect(await contar(q, "select count(*) n from lojas")).toBe(0);
      expect(await contar(q, "select count(*) n from loja_percentuais")).toBe(0);
    }));
});

describe("Visitante sem login", () => {
  it("não tem acesso a nenhuma tabela", async () => {
    await db.query("begin");
    await db.query("set local role anon");
    await expect(db.query("select * from lojas")).rejects.toThrow(/permission denied/);
    await db.query("rollback");
  });
});

describe("Regras do cadastro", () => {
  it("valores vigentes respeitam o mês e o 13º aluguel de dezembro", () =>
    como(db, U.analista, async (q) => {
      const vv = async (luc: string, ano: number, mes: number) =>
        (await q("select * from valores_vigentes((select id from lojas where luc=$1 and ativa), $2, $3)", [luc, ano, mes])).rows[0];
      expect(await vv("LJ 101/102/102A", 2026, 6)).toMatchObject({ aluguel_minimo: "18500.00", percentual: "6.0000", falta_13_aluguel: false });
      expect(await vv("LJ 101/102/102A", 2026, 8)).toMatchObject({ aluguel_minimo: "19800.00" });
      expect(await vv("LJ 101/102/102A", 2026, 12)).toMatchObject({ aluguel_minimo: "39600.00", minimo_eh_13_aluguel: true });
      expect(await vv("LJ 103", 2026, 6)).toMatchObject({ percentual: "7.0000" });
      expect(await vv("LJ 103", 2026, 7)).toMatchObject({ percentual: "7.2500" });
      expect(await vv("LJ 104", 2026, 12)).toMatchObject({ aluguel_minimo: "6100.00", falta_13_aluguel: true, minimo_eh_13_aluguel: false });
      expect(await vv("LJ 104", 2025, 12)).toMatchObject({ aluguel_minimo: null, percentual: null });
    }));

  it("vigência só pode começar no dia 1º", () =>
    expect(como(db, U.analista, (q) =>
      q("insert into loja_percentuais (loja_id, vigencia_inicio, percentual) select id, '2026-10-15', 5 from lojas limit 1"),
    )).rejects.toThrow(/check constraint/));

  it("LUC é única entre lojas ativas, mas pode ser reaproveitada de loja inativa", async () => {
    await expect(como(db, U.analista, (q) => q("insert into lojas (luc, nome_fantasia) values ('LJ 103', 'Duplicada')")))
      .rejects.toThrow(/lojas_luc_ativa_uk/);
    await como(db, U.analista, async (q) => {
      await q("insert into lojas (luc, nome_fantasia) values ('LJ 130', 'Nova no lugar da antiga')");
      expect(await contar(q, "select count(*) n from lojas where luc = 'LJ 130'")).toBe(2);
    });
  });
});

describe("Importação da planilha de lojas", () => {
  const linhas = [
    { luc: "LJ 103", nome_fantasia: "Calçados Exemplo Renovada", localizacao: "Piso L1 – corredor A", segmento: "Calçados",
      auditada: null, ativa: null, percentual: "7.2500", percentual_vigencia: "2026-07-01",
      aluguel_minimo: "9900.00", minimo_vigencia: "2026-10-01", ano_13: 2026, valor_13: "19000.00" },
    { luc: "T2", nome_fantasia: "Torre Fictícia 2", localizacao: null, segmento: "Segmento Novo",
      auditada: false, ativa: true, percentual: "5.0000", percentual_vigencia: "2026-10-01",
      aluguel_minimo: "3000.00", minimo_vigencia: "2026-10-01", ano_13: null, valor_13: null },
  ];

  it("grava tudo numa transação, registra a importação e é idempotente", async () => {
    const r1 = await comoConfirmando(db, U.analista, async (q) =>
      (await q("select importar_lojas('lojas.xlsx', 'lojas/1.xlsx', $1::jsonb) r", [JSON.stringify(linhas)])).rows[0].r);
    expect(r1).toMatchObject({ linhas: 2, lojas_criadas: 1, lojas_atualizadas: 1, vigencias_gravadas: 3, alugueis_13_gravados: 1 });

    const lj103 = await idLoja("LJ 103");
    const t = await db.query("select count(*)::int n from trilha_auditoria where importacao_id = $1", [r1.importacao_id]);
    expect(t.rows[0].n).toBeGreaterThanOrEqual(6);
    const v = (await db.query("select * from valores_vigentes($1, 2026, 12)", [lj103])).rows[0];
    expect(v).toMatchObject({ aluguel_minimo: "19000.00", percentual: "7.2500" });
    const seg = await db.query("select count(*)::int n from segmentos where nome = 'Segmento Novo'");
    expect(seg.rows[0].n).toBe(1);

    const r2 = await comoConfirmando(db, U.analista, async (q) =>
      (await q("select importar_lojas('lojas.xlsx', 'lojas/2.xlsx', $1::jsonb) r", [JSON.stringify(linhas)])).rows[0].r);
    expect(r2).toMatchObject({ lojas_criadas: 0, lojas_atualizadas: 0, vigencias_gravadas: 0, alugueis_13_gravados: 0 });
  });

  it("só altera os campos enviados (colunas escolhidas)", async () => {
    const lj = await idLoja("LJ 104");
    const antes = (await db.query("select nome_fantasia, localizacao, segmento_id, auditada from lojas where id = $1", [lj])).rows[0];
    const r = await comoConfirmando(db, U.analista, async (q) =>
      (await q("select importar_lojas('parcial.xlsx', 'lojas/p.xlsx', $1::jsonb, $2::jsonb) r", [
        JSON.stringify([{ luc: "LJ 104", aluguel_minimo: "6500.00", minimo_vigencia: "2026-11-01" }]),
        JSON.stringify(["LUC ← coluna A", "Aluguel mínimo ← coluna C"]),
      ])).rows[0].r);
    expect(r).toMatchObject({ lojas_atualizadas: 0, vigencias_gravadas: 1, campos: ["LUC ← coluna A", "Aluguel mínimo ← coluna C"] });
    const depois = (await db.query("select nome_fantasia, localizacao, segmento_id, auditada from lojas where id = $1", [lj])).rows[0];
    expect(depois).toEqual(antes);
  });

  it("loja nova sem nome é recusada pelo banco", () =>
    expect(como(db, U.analista, (q) =>
      q("select importar_lojas('x.xlsx', 'lojas/x.xlsx', $1::jsonb)", [JSON.stringify([{ luc: "LJ 777", aluguel_minimo: "1.00", minimo_vigencia: "2026-11-01" }])]),
    )).rejects.toThrow(/sem nome fantasia/));

  it("um erro em qualquer linha desfaz a importação inteira", async () => {
    const antes = (await db.query("select count(*)::int n from lojas")).rows[0].n;
    const ruins = [{ ...linhas[1], luc: "T3" }, { ...linhas[1], luc: "T4", percentual: "500" }];
    await expect(comoConfirmando(db, U.analista, (q) =>
      q("select importar_lojas('x.xlsx', 'lojas/3.xlsx', $1::jsonb)", [JSON.stringify(ruins)]),
    )).rejects.toThrow(/check constraint/);
    expect((await db.query("select count(*)::int n from lojas")).rows[0].n).toBe(antes);
  });
});
