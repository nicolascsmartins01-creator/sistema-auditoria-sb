import { formatarData, formatarMesAno, formatarMoeda, formatarPercentual } from "@/lib/formato";
import { NOMES_PERFIL, type Perfil } from "@/lib/perfis";

export interface RegistroTrilha {
  id: number;
  ocorrido_em: string;
  usuario_id: string | null;
  acao: string;
  tabela: string;
  registro_id: string | null;
  dados_anteriores: Record<string, unknown> | null;
  dados_novos: Record<string, unknown> | null;
  motivo: string | null;
  importacao_id: string | null;
}

export const ROTULOS_TABELA: Record<string, string> = {
  lojas: "Loja",
  loja_percentuais: "Percentual",
  loja_alugueis_minimos: "Aluguel mínimo",
  loja_aluguel_dezembro: "13º aluguel",
  usuarios: "Usuário",
  segmentos: "Segmento",
  importacoes: "Importação",
  lancamentos: "Lançamento",
  lancamento_fotos: "Foto do lançamento",
  vendas_informadas: "Venda informada",
  meses: "Situação do mês",
  fechamento_versoes: "Relatório de fechamento",
  feriados: "Feriado",
};

const FEMININO = new Set(["lojas", "importacoes", "lancamento_fotos", "vendas_informadas", "meses"]);
const flex = (tabela: string, masc: string) => (FEMININO.has(tabela) ? masc.replace(/o$/, "a") : masc);

const ROTULOS_CAMPO: Record<string, string> = {
  luc: "LUC", nome_fantasia: "Nome fantasia", area_m2: "Área (m²)", piso: "Piso", localizacao: "Localização", segmento_id: "Segmento",
  auditada: "Auditada", ativa: "Ativa", ativo: "Ativo", percentual: "Percentual", valor: "Valor",
  vigencia_inicio: "Início da vigência", ano: "Ano", nome: "Nome", perfil: "Perfil", login: "Login",
  arquivo_nome: "Arquivo",
  versao: "Versão", tipo: "Tipo", data: "Data", descricao: "Descrição", esfera: "Esfera",
  data_venda: "Data da venda", competencia: "Mês", nome_pdf: "Nome no PDF", situacao: "Situação", caminho: "Arquivo",
};
const IGNORAR = new Set(["id", "criado_em", "criado_por", "atualizado_em", "loja_id", "arquivo_path", "resumo", "cliente_id", "auditor_id", "importacao_id", "digitado_em", "recebido_em", "lancamento_id", "enviado_por", "dados", "gerado_em", "gerado_por", "versao_atual"]);

export interface Contexto { segmentos?: Map<number, string> }

function formatarCampo(campo: string, v: unknown, ctx: Contexto): string {
  if ((v === null || v === undefined) && campo === "vigencia_inicio") return "a definir";
  if (v === null || v === undefined || v === "") return "(vazio)";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (campo === "percentual") return formatarPercentual(v as number);
  if (campo === "valor") return formatarMoeda(v as number);
  if (campo === "competencia") return formatarMesAno(String(v));
  if (campo === "data_venda") return String(v).split("-").reverse().join("/");
  if (campo === "situacao") return ({ valido: "Válido", em_analise: "Em análise", recusado: "Recusado", fechado: "Fechado", reaberto: "Reaberto" } as Record<string, string>)[String(v)] ?? String(v);
  if (campo === "tipo") return ({ automatico: "fechamento automático", antecipado: "fechamento antecipado", refechamento: "refechamento", lojas: "planilha de lojas", portal: "PDF do portal" } as Record<string, string>)[String(v)] ?? String(v);
  if (campo === "data") return String(v).split("-").reverse().join("/");
  if (campo === "caminho") return "foto anexada";
  if (campo === "vigencia_inicio") return formatarData(String(v));
  if (campo === "segmento_id") return ctx.segmentos?.get(Number(v)) ?? `#${v}`;
  if (campo === "perfil") return NOMES_PERFIL[v as Perfil] ?? String(v);
  return String(v);
}

/** Texto legível de um registro da trilha: título + linhas de detalhe. */
export function descreverRegistro(r: RegistroTrilha, ctx: Contexto = {}): { titulo: string; detalhes: string[] } {
  const rotulo = ROTULOS_TABELA[r.tabela] ?? r.tabela;
  const via = r.importacao_id ? " (via importação de planilha)" : "";
  if (r.acao === "SENHA_REDEFINIDA") return { titulo: "Senha redefinida pelo Administrador", detalhes: [] };
  if (r.acao === "SENHA_ALTERADA") return { titulo: "Senha alterada pelo próprio usuário", detalhes: [] };

  const campos = (d: Record<string, unknown> | null) =>
    Object.entries(d ?? {}).filter(([k]) => !IGNORAR.has(k) && ROTULOS_CAMPO[k]);

  if (r.acao === "INSERT") {
    return {
      titulo: `${rotulo} ${flex(r.tabela, "cadastrado")}${via}`,
      detalhes: campos(r.dados_novos).filter(([, v]) => v !== null && v !== "")
        .map(([k, v]) => `${ROTULOS_CAMPO[k]}: ${formatarCampo(k, v, ctx)}`),
    };
  }
  if (r.acao === "DELETE") {
    return {
      titulo: `${rotulo} ${flex(r.tabela, "excluído")}${via}`,
      detalhes: campos(r.dados_anteriores).map(([k, v]) => `${ROTULOS_CAMPO[k]}: ${formatarCampo(k, v, ctx)}`),
    };
  }
  const ant = r.dados_anteriores ?? {};
  const novo = r.dados_novos ?? {};
  const detalhes = campos(novo)
    .filter(([k, v]) => JSON.stringify(ant[k]) !== JSON.stringify(v))
    .map(([k, v]) => `${ROTULOS_CAMPO[k]}: ${formatarCampo(k, ant[k], ctx)} → ${formatarCampo(k, v, ctx)}`);
  return { titulo: `${rotulo} ${flex(r.tabela, "alterado")}${via}`, detalhes };
}
