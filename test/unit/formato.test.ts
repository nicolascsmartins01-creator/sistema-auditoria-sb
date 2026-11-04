import { describe, expect, it } from "vitest";
import {
  formatarData, formatarDataHora, formatarMesAno, formatarMoeda, formatarPercentual,
  hojeFortaleza, lerMesAno, lerNumeroBR, lerSimNao, normalizarLuc, paraDecimalBanco,
} from "@/lib/formato";
import { emailDoLogin, validarLogin } from "@/lib/perfis";

describe("formatação brasileira", () => {
  it("moeda no formato R$ 1.234,56", () => {
    expect(formatarMoeda(1048983.33)).toBe("R$ 1.048.983,33");
    expect(formatarMoeda("1234.5")).toBe("R$ 1.234,50");
    expect(formatarMoeda(null)).toBe("—");
  });
  it("percentual", () => {
    expect(formatarPercentual(6.5)).toBe("6,50%");
    expect(formatarPercentual("7.1250")).toBe("7,125%");
  });
  it("datas dd/mm/aaaa sem efeito de fuso", () => {
    expect(formatarData("2026-09-01")).toBe("01/09/2026");
    expect(formatarMesAno("2026-09-01")).toBe("09/2026");
  });
  it("data e hora no fuso de Fortaleza (UTC-3)", () => {
    expect(formatarDataHora("2026-11-05T02:30:00Z")).toBe("04/11/2026 23:30");
    expect(hojeFortaleza(new Date("2026-11-05T02:30:00Z"))).toBe("2026-11-04");
  });
});

describe("leitura de números no padrão brasileiro", () => {
  it.each([
    ["1.048.983,33", 1048983.33], ["1234,56", 1234.56], ["R$ 10,00", 10], ["6,5%", 6.5],
    ["1.500", 1500], ["6.5", 6.5], ["8", 8], ["1,234.56", 1234.56], ["-3,5", -3.5],
  ])("%s → %s", (txt, esperado) => expect(lerNumeroBR(txt)).toBeCloseTo(esperado, 6));
  it("vazio e inválido", () => {
    expect(lerNumeroBR("")).toBeNull();
    expect(lerNumeroBR(null)).toBeNull();
    expect(lerNumeroBR("abc")).toBeNaN();
    expect(lerNumeroBR("1,2,3")).toBeNaN();
  });
  it("arredonda para o banco", () => {
    expect(paraDecimalBanco(1234.005)).toBe("1234.01");
    expect(paraDecimalBanco(6.5, 4)).toBe("6.5000");
  });
});

describe("mês/ano de vigência", () => {
  it.each([
    ["09/2026", "2026-09-01"], ["9/2026", "2026-09-01"], ["01/09/2026", "2026-09-01"],
    ["2026-09", "2026-09-01"], ["set/2026", "2026-09-01"], ["Março/2027", "2027-03-01"],
  ])("%s → %s", (txt, esperado) => expect(lerMesAno(txt)).toEqual({ ok: true, data: esperado }));
  it("data do Excel no dia 1", () => {
    expect(lerMesAno(new Date(Date.UTC(2026, 8, 1)))).toEqual({ ok: true, data: "2026-09-01" });
  });
  it("recusa dia diferente de 1 e mês inválido", () => {
    expect(lerMesAno("15/09/2026").ok).toBe(false);
    expect(lerMesAno("13/2026").ok).toBe(false);
    expect(lerMesAno("abc").ok).toBe(false);
  });
});

describe("outros", () => {
  it("sim/não", () => {
    expect(lerSimNao("S")).toBe(true);
    expect(lerSimNao("não")).toBe(false);
    expect(lerSimNao("")).toBeNull();
    expect(lerSimNao("talvez")).toBeUndefined();
  });
  it("LUC preserva o texto do portal, só limpa espaços", () => {
    expect(normalizarLuc("  LJ  101/102/102A ")).toBe("LJ 101/102/102A");
    expect(normalizarLuc("Q 001C")).toBe("Q 001C");
  });
  it("login por nome de usuário ou e-mail", () => {
    expect(emailDoLogin(" Joao.Silva ")).toBe("joao.silva@usuarios.benfica.invalid");
    expect(emailDoLogin("Ana@Exemplo.com")).toBe("ana@exemplo.com");
    expect(validarLogin("jo")).not.toBeNull();
    expect(validarLogin("joão")).not.toBeNull();
    expect(validarLogin("joao.silva")).toBeNull();
  });
});

import { descreverRegistro } from "@/lib/trilha";
describe("descrição da trilha", () => {
  const base = { id: 1, ocorrido_em: "2026-11-04T15:00:00Z", usuario_id: null, registro_id: "x", motivo: null, importacao_id: null };
  it("concorda o gênero e mostra antes → depois", () => {
    const d = descreverRegistro({ ...base, acao: "UPDATE", tabela: "lojas",
      dados_anteriores: { nome_fantasia: "A", ativa: true }, dados_novos: { nome_fantasia: "B", ativa: false } });
    expect(d).toEqual({ titulo: "Loja alterada", detalhes: ["Nome fantasia: A → B", "Ativa: Sim → Não"] });
    const p = descreverRegistro({ ...base, acao: "INSERT", tabela: "loja_percentuais", importacao_id: "i",
      dados_anteriores: null, dados_novos: { percentual: 6.5, vigencia_inicio: "2026-09-01", loja_id: "l" } });
    expect(p).toEqual({ titulo: "Percentual cadastrado (via importação de planilha)", detalhes: ["Percentual: 6,50%", "Início da vigência: 09/2026"] });
  });
});
