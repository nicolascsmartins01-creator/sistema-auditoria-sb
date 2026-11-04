/**
 * Fase 2 — lançamento da venda auditada: prazos, fotos obrigatórias,
 * duplicidade, modo sem internet (hora digitada) e permissões.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { USUARIOS as U, como, comoConfirmando, criarBancoTeste } from "./ambiente";

let db: Client;
let lj103: string, lj104: string, lj210: string;
let ontem: string;

beforeAll(async () => {
  db = await criarBancoTeste();
  const id = async (luc: string) => (await db.query("select id from lojas where luc = $1 and ativa", [luc])).rows[0].id as string;
  lj103 = await id("LJ 103"); lj104 = await id("LJ 104"); lj210 = await id("LJ 210");
  ontem = (await db.query("select ((now() at time zone 'America/Fortaleza')::date - 1)::text d")).rows[0].d;
});
afterAll(async () => { await db?.end(); });

/** Envia uma foto (como o usuário) e devolve o caminho. */
async function foto(usuario: string, nome = randomUUID()): Promise<string> {
  const caminho = `${usuario}/${nome}.jpg`;
  await comoConfirmando(db, usuario, (q) => q("insert into storage.objects (bucket_id, name) values ('fotos', $1)", [caminho]));
  return caminho;
}

async function lancar(usuario: string, args: { loja: string; data: string; valor?: number; digitado?: string | null; fotos?: string[]; cliente?: string }) {
  const fotos = args.fotos ?? [await foto(usuario)];
  return comoConfirmando(db, usuario, async (q) =>
    (await q("select registrar_lancamento($1, $2, $3::date, $4, coalesce($5::timestamptz, now()), $6::text[]) r",
      [args.cliente ?? randomUUID(), args.loja, args.data, args.valor ?? 1234.56, args.digitado ?? null, fotos])).rows[0].r);
}

describe("Lançamento", () => {
  it("auditor lança o dia anterior com foto", async () => {
    const r = await lancar(U.auditor, { loja: lj103, data: ontem, valor: 1048.5 });
    expect(r).toMatchObject({ situacao: "valido", repetido: false });
    const l = (await db.query("select valor, auditor_id from lancamentos where id = $1", [r.id])).rows[0];
    expect(l).toEqual({ valor: "1048.50", auditor_id: U.auditor });
    expect((await db.query("select count(*)::int n from trilha_auditoria where tabela='lancamentos' and registro_id = $1", [r.id])).rows[0].n).toBe(1);
  });

  it("reenvio do mesmo lançamento (internet caiu) não duplica", async () => {
    const cliente = randomUUID();
    const f = await foto(U.auditor);
    const a = await lancar(U.auditor, { loja: lj104, data: ontem, fotos: [f], cliente });
    const b = await lancar(U.auditor, { loja: lj104, data: ontem, fotos: [f], cliente });
    expect(b).toMatchObject({ id: a.id, repetido: true });
  });

  it("dia já lançado é recusado (mesmo por outro auditor)", () =>
    expect(lancar(U.auditor2, { loja: lj103, data: ontem })).rejects.toThrow(/já foi lançado/));

  it("o dia de hoje e dias futuros ficam bloqueados", async () => {
    const hoje = (await db.query("select (now() at time zone 'America/Fortaleza')::date::text d")).rows[0].d;
    await expect(lancar(U.auditor, { loja: lj103, data: hoje })).rejects.toThrow(/dias anteriores/);
  });

  it("fora do prazo (mês retrasado) é recusado", async () => {
    const antigo = (await db.query("select (date_trunc('month', now() at time zone 'America/Fortaleza') - interval '2 months')::date::text d")).rows[0].d;
    await expect(lancar(U.auditor, { loja: lj103, data: antigo })).rejects.toThrow(/Prazo encerrado/);
  });

  it("exige foto válida, enviada pelo próprio usuário", async () => {
    await expect(lancar(U.auditor, { loja: lj103, data: "2026-01-01", fotos: [] })).rejects.toThrow(/pelo menos uma foto/);
    await expect(lancar(U.auditor, { loja: lj103, data: ontem, fotos: [`${U.auditor}/nao-existe.jpg`] })).rejects.toThrow(/Foto não encontrada/);
    const alheia = await foto(U.auditor2);
    await expect(lancar(U.auditor, { loja: lj103, data: ontem, fotos: [alheia] })).rejects.toThrow(/Foto não encontrada/);
  });

  it("loja não auditada é recusada", () =>
    expect(lancar(U.auditor, { loja: lj210, data: ontem })).rejects.toThrow(/não está marcada como auditada/));

  it("sem internet: vale a hora digitada; chegando depois de 72 h fica em análise", async () => {
    const r = (await db.query(`select ((now() - interval '4 days') at time zone 'America/Fortaleza')::date - 1 as d, now() - interval '4 days' as t`)).rows[0];
    const data = (r.d as Date).toISOString().slice(0, 10);
    const res = await lancar(U.auditor, { loja: lj104, data, digitado: (r.t as Date).toISOString() });
    expect(res.situacao).toBe("em_analise");
  });

  it("relógio do aparelho adiantado não vale: usa a hora do servidor", async () => {
    const hoje = (await db.query("select (now() at time zone 'America/Fortaleza')::date::text d")).rows[0].d;
    // com relógio em 2099, "hoje" pareceria passado — mas continua bloqueado
    await expect(lancar(U.auditor2, { loja: lj103, data: hoje, digitado: "2099-01-01T00:00:00Z" })).rejects.toThrow(/dias anteriores/);
  });

  it("ninguém grava ou altera direto na tabela", async () => {
    await expect(como(db, U.analista, (q) =>
      q("insert into lancamentos (cliente_id, loja_id, data_venda, valor, auditor_id, digitado_em) values (gen_random_uuid(), $1, '2026-01-02', 1, $2, now())", [lj103, U.analista]),
    )).rejects.toThrow(/permission denied/);
    await expect(como(db, U.auditor, (q) => q("update lancamentos set valor = 1"))).rejects.toThrow(/permission denied/);
  });
});

describe("Visibilidade", () => {
  it("auditor vê só os próprios lançamentos; calendário mostra o dia de outro sem valor", async () => {
    await como(db, U.auditor2, async (q) => {
      expect(Number((await q("select count(*) n from lancamentos")).rows[0].n)).toBe(0);
      const dias = (await q("select * from dias_lancados($1, $2, $3)", [lj103, Number(ontem.slice(0, 4)), Number(ontem.slice(5, 7))])).rows;
      expect(dias).toHaveLength(1);
      expect(dias[0]).toMatchObject({ auditor_nome: "Auditor Teste", proprio: false, valor: null, lancamento_id: null });
    });
    await como(db, U.auditor, async (q) => {
      const dias = (await q("select * from dias_lancados($1, $2, $3)", [lj103, Number(ontem.slice(0, 4)), Number(ontem.slice(5, 7))])).rows;
      expect(dias[0]).toMatchObject({ proprio: true, valor: "1048.50" });
    });
  });

  it("auditor não vê fotos de outro auditor; analista vê todas", async () => {
    await como(db, U.auditor2, async (q) => {
      expect(Number((await q("select count(*) n from lancamento_fotos")).rows[0].n)).toBe(0);
      expect(Number((await q(`select count(*) n from storage.objects where bucket_id = 'fotos' and name like '${U.auditor}/%'`)).rows[0].n)).toBe(0);
    });
    await como(db, U.analista, async (q) => {
      expect(Number((await q("select count(*) n from lancamento_fotos")).rows[0].n)).toBeGreaterThan(0);
      expect(Number((await q(`select count(*) n from storage.objects where bucket_id = 'fotos'`)).rows[0].n)).toBeGreaterThan(0);
    });
  });

  it("auditor não consegue enviar foto na pasta de outro usuário nem apagar foto", async () => {
    await expect(como(db, U.auditor, (q) => q("insert into storage.objects (bucket_id, name) values ('fotos', $1)", [`${U.auditor2}/x.jpg`])))
      .rejects.toThrow(/row-level security/);
    await como(db, U.auditor, async (q) => {
      expect((await q(`delete from storage.objects where bucket_id = 'fotos'`)).rowCount).toBe(0);
    });
  });
});

describe("Edição, análise e exclusão", () => {
  it("auditor não edita; analista edita com motivo obrigatório e a trilha guarda antes/depois", async () => {
    const id = (await db.query("select id from lancamentos where loja_id = $1 and data_venda = $2", [lj103, ontem])).rows[0].id;
    await expect(como(db, U.auditor, (q) => q("select editar_lancamento($1, 10, 'x')", [id]))).rejects.toThrow(/Somente Analista/);
    await expect(como(db, U.analista, (q) => q("select editar_lancamento($1, 10, ' ')", [id]))).rejects.toThrow(/motivo/);
    await comoConfirmando(db, U.analista, (q) => q("select editar_lancamento($1, 1100, 'Valor digitado errado (conferido na foto)')", [id]));
    const t = (await db.query("select dados_anteriores->>'valor' a, dados_novos->>'valor' n, motivo, usuario_id from trilha_auditoria where tabela='lancamentos' and registro_id=$1 and acao='UPDATE'", [id])).rows;
    expect(t).toEqual([{ a: "1048.50", n: "1100.00", motivo: "Valor digitado errado (conferido na foto)", usuario_id: U.analista }]);
  });

  it("analista aprova lançamento em análise", async () => {
    const id = (await db.query("select id from lancamentos where situacao = 'em_analise' limit 1")).rows[0].id;
    await comoConfirmando(db, U.analista, (q) => q("select analisar_lancamento($1, true, 'Auditor ficou sem internet no fim de semana')", [id]));
    expect((await db.query("select situacao from lancamentos where id = $1", [id])).rows[0].situacao).toBe("valido");
  });

  it("loja com lançamentos não pode ser excluída", () =>
    expect(como(db, U.admin, (q) => q("select excluir_loja($1, 'teste')", [lj103]))).rejects.toThrow(/tem lançamentos/));
});
