/** Fase 5 — ciclo mensal: dias úteis, prazos, fechamento, reabertura e versões. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { USUARIOS as U, como, comoConfirmando, criarBancoTeste } from "./ambiente";

let db: Client;
let mesAtual: string, ontem: string;
beforeAll(async () => {
  db = await criarBancoTeste();
  const r = (await db.query(`select date_trunc('month', now() at time zone 'America/Fortaleza')::date::text m,
    ((now() at time zone 'America/Fortaleza')::date - 1)::text o`)).rows[0];
  mesAtual = r.m; ontem = r.o;
});
afterAll(async () => { await db?.end(); });

const um = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows[0];

describe("Dia útil e prazos (regras fixas)", () => {
  it("exemplo da especificação: outubro/2026 → fechamento em 09/11 (31/10 e 01/11 fim de semana; 02/11 Finados)", async () => {
    expect((await um("select quinto_dia_util('2026-10-01')::text d")).d).toBe("2026-11-09");
  });
  it("feriado municipal conta (Corpus Christi 04/06/2026): maio/2026 → 08/06", async () => {
    expect((await um("select quinto_dia_util('2026-05-01')::text d")).d).toBe("2026-06-08");
  });
  it("quando o 5º dia útil é o próprio dia 5 (fev/2027 começa na segunda)", async () => {
    expect((await um("select quinto_dia_util('2027-01-01')::text d")).d).toBe("2027-02-05");
  });
  it("situação ao longo do ciclo de outubro/2026", async () => {
    const s = async (t: string) => (await um("select situacao_mes('2026-10-01', $1::timestamptz) s", [t])).s;
    expect(await s("2026-11-05T23:59:00-03:00")).toBe("aberto");    // lançamentos até 23:59 do dia 5
    expect(await s("2026-11-06T00:00:01-03:00")).toBe("revisao");   // dia 6: revisão do Analista
    expect(await s("2026-11-09T23:59:00-03:00")).toBe("revisao");
    expect(await s("2026-11-10T00:00:01-03:00")).toBe("fechado");   // fechou às 23:59 do 5º dia útil
  });
  it("5º dia útil = dia 5: fecha às 23:59 do dia 5, sem período de revisão", async () => {
    const s = async (t: string) => (await um("select situacao_mes('2027-01-01', $1::timestamptz) s", [t])).s;
    expect(await s("2027-02-05T23:59:00-03:00")).toBe("aberto");
    expect(await s("2027-02-06T00:00:01-03:00")).toBe("fechado");
  });
  it("feriados: só o Administrador mantém; a regra recalcula sozinha", async () => {
    await expect(como(db, U.analista, (q) => q("insert into feriados (data, descricao, esfera) values ('2026-11-04', 'X', 'municipal')")))
      .rejects.toThrow(/row-level security/);
    await como(db, U.admin, async (q) => {
      await q("insert into feriados (data, descricao, esfera) values ('2026-11-04', 'Feriado fictício de teste', 'municipal')");
      expect((await q("select quinto_dia_util('2026-10-01')::text d")).rows[0].d).toBe("2026-11-10");
    });
  });
});

describe("Fechamento antecipado, reabertura e versões", () => {
  it("auditor não fecha nem reabre", async () => {
    await expect(como(db, U.auditor, (q) => q("select fechar_mes($1::date)", [mesAtual]))).rejects.toThrow(/Somente Analista/);
    await expect(como(db, U.auditor, (q) => q("select reabrir_mes($1::date, 'x')", [mesAtual]))).rejects.toThrow(/Somente Analista/);
  });

  it("fechamento antecipado bloqueia lançamento, edição e importação do informado", async () => {
    const lj = (await um("select id from lojas where luc = 'LJ 103'")).id;
    // um lançamento antes de fechar (se hoje não for dia 1)
    let lancId: string | null = null;
    if (ontem.slice(0, 7) === mesAtual.slice(0, 7)) {
      const caminho = `${U.auditor}/${randomUUID()}.jpg`;
      await comoConfirmando(db, U.auditor, (q) => q("insert into storage.objects (bucket_id, name) values ('fotos', $1)", [caminho]));
      lancId = (await comoConfirmando(db, U.auditor, (q) => q("select registrar_lancamento(gen_random_uuid(), $1, $2::date, 100, now(), $3::text[]) r", [lj, ontem, [caminho]]))).rows[0].r.id;
    }
    const r = (await comoConfirmando(db, U.analista, (q) => q("select fechar_mes($1::date) r", [mesAtual]))).rows[0].r;
    expect(r).toEqual({ versao: 1, tipo: "antecipado" });
    expect((await um("select situacao_mes($1::date) s", [mesAtual])).s).toBe("fechado");
    if (lancId) {
      await expect(como(db, U.analista, (q) => q("select editar_lancamento($1, 1, 'x')", [lancId]))).rejects.toThrow(/fechado/);
      const caminho = `${U.auditor2}/${randomUUID()}.jpg`;
      await comoConfirmando(db, U.auditor2, (q) => q("insert into storage.objects (bucket_id, name) values ('fotos', $1)", [caminho]));
      const lj2 = (await um("select id from lojas where luc = 'LJ 104'")).id;
      await expect(como(db, U.auditor2, (q) => q("select registrar_lancamento(gen_random_uuid(), $1, $2::date, 1, now(), $3::text[])", [lj2, ontem, [caminho]])))
        .rejects.toThrow(/está fechado/);
    }
    await expect(como(db, U.analista, (q) => q("select importar_venda_informada($1::date, 'x.pdf', 'p', 1, '[{\"luc\":\"LJ 103\",\"valor\":\"1\"}]'::jsonb, true)", [mesAtual])))
      .rejects.toThrow(/está fechado/);
    await expect(como(db, U.analista, (q) => q("select fechar_mes($1::date)", [mesAtual]))).rejects.toThrow(/já está fechado/);
  });

  it("reabertura exige motivo e fica na trilha; refechar gera nova versão e a anterior é preservada", async () => {
    await expect(como(db, U.analista, (q) => q("select reabrir_mes($1::date, '  ')", [mesAtual]))).rejects.toThrow(/motivo/);
    await comoConfirmando(db, U.analista, (q) => q("select reabrir_mes($1::date, 'Correção de valor informado pelo lojista')", [mesAtual]));
    expect((await um("select situacao_mes($1::date) s", [mesAtual])).s).toBe("reaberto");
    const t = await um("select usuario_id, motivo, dados_novos->>'situacao' s from trilha_auditoria where tabela = 'meses' order by id desc limit 1");
    expect(t).toEqual({ usuario_id: U.analista, motivo: "Correção de valor informado pelo lojista", s: "reaberto" });
    const v1 = (await um("select dados from fechamento_versoes where competencia = $1 and versao = 1", [mesAtual])).dados;
    const r = (await comoConfirmando(db, U.analista, (q) => q("select fechar_mes($1::date) r", [mesAtual]))).rows[0].r;
    expect(r).toEqual({ versao: 2, tipo: "refechamento" });
    expect((await um("select dados from fechamento_versoes where competencia = $1 and versao = 1", [mesAtual])).dados).toEqual(v1);
    await expect(db.query("update fechamento_versoes set tipo = 'antecipado'")).rejects.toThrow(/não pode ser alterada/);
    await expect(db.query("delete from fechamento_versoes")).rejects.toThrow(/não pode ser alterada/);
    await como(db, U.auditor, async (q) => {
      expect(Number((await q("select count(*) n from fechamento_versoes")).rows[0].n)).toBe(0);
    });
  });
});

describe("Relatório e fechamento automático", () => {
  it("relatório do banco usa a mesma regra da tela (exemplo da especificação)", async () => {
    // set/2025 (fictício): informado 300.000; auditados 12.000 + 11.000 + 13.000 → projeção 360.000 (+20%)
    const lj = (await um("select id from lojas where luc = 'LJ 201'")).id;
    const imp = (await um("insert into importacoes (tipo, arquivo_nome, arquivo_path, competencia) values ('portal', 'f.pdf', 'p', '2025-09-01') returning id")).id;
    await db.query("insert into vendas_informadas (competencia, luc, loja_id, valor, importacao_id) values ('2025-09-01', 'LJ 201', $1, 300000, $2)", [lj, imp]);
    for (const [d, v] of [["2025-09-05", 12000], ["2025-09-12", 11000], ["2025-09-20", 13000]] as const) {
      await db.query("insert into lancamentos (cliente_id, loja_id, data_venda, valor, auditor_id, digitado_em) values (gen_random_uuid(), $1, $2, $3, $4, now())", [lj, d, v, U.auditor]);
    }
    const rel = (await um("select relatorio_conciliacao('2025-09-01') r")).r;
    const loja = rel.lojas.find((l: { luc: string }) => l.luc === "LJ 201");
    expect(loja).toMatchObject({
      dias_auditados: 3, informado: 300000, media_informada: 10000, media_auditada: 12000,
      projecao: 360000, diferenca: 60000, diferenca_percentual: 20, classificacao: "para_maior",
      percentual_vigente: null, aluguel_minimo_vigente: null, // vigências fictícias começam em 01/2026
    });
    expect(loja.dias.map((d: { data: string; desvio: number }) => [d.data, d.desvio])).toEqual([
      ["2025-09-20", 3000], ["2025-09-05", 2000], ["2025-09-12", 1000],
    ]);
  });

  it("fechamento automático grava a versão dos meses vencidos uma única vez", async () => {
    expect((await um("select fechar_meses_vencidos() n")).n).toBe(1);   // set/2025
    expect((await um("select fechar_meses_vencidos() n")).n).toBe(0);
    expect(await um("select versao, tipo, gerado_por from fechamento_versoes where competencia = '2025-09-01'"))
      .toEqual({ versao: 1, tipo: "automatico", gerado_por: null });
  });
});

describe("Fase 6 — consolidado para o aluguel", () => {
  it("relatório traz todas as lojas com informado (inclusive não auditadas) e os valores vigentes", async () => {
    const lj210 = (await um("select id from lojas where luc = 'LJ 210'")).id; // Cine Exemplo: não auditada
    const imp = (await um("insert into importacoes (tipo, arquivo_nome, arquivo_path, competencia) values ('portal', 'g.pdf', 'p2', '2026-12-01') returning id")).id;
    await db.query("insert into vendas_informadas (competencia, luc, loja_id, valor, importacao_id) values ('2026-12-01', 'LJ 210', $1, 400000, $2)", [lj210, imp]);
    const rel = (await um("select relatorio_conciliacao('2026-12-01') r")).r;
    const cine = rel.consolidado.find((l: { luc: string }) => l.luc === "LJ 210");
    expect(cine).toMatchObject({ auditada: false, informado: 400000, dias_auditados: 0, projecao: null, percentual: 5, aluguel_minimo: 30000, falta_13_aluguel: true });
    const moda = rel.consolidado.find((l: { luc: string }) => l.luc === "LJ 101/102/102A");
    expect(moda).toMatchObject({ informado: null, aluguel_minimo: 39600, minimo_eh_13_aluguel: true }); // dezembro: 13º aluguel
  });

  it("prévia só para Analista/Administrador", async () => {
    await expect(como(db, U.auditor, (q) => q("select previa_relatorio('2026-12-01')"))).rejects.toThrow(/Somente Analista/);
    await como(db, U.analista, async (q) => { expect((await q("select previa_relatorio('2026-12-01') r")).rows[0].r.consolidado.length).toBeGreaterThan(0); });
  });
});
