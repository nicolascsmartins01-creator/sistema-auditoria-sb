/** Resultado padrão das ações de formulário. */
export interface EstadoAcao {
  ok?: boolean;
  mensagem?: string;
  erros?: Record<string, string>;
}

export const ESTADO_INICIAL: EstadoAcao = {};

/** Traduz erros do banco para mensagens compreensíveis. */
export function mensagemErroBanco(e: { code?: string; message?: string } | null | undefined): string {
  if (!e) return "Erro desconhecido.";
  const m = e.message ?? "";
  if (e.code === "23505" && m.includes("lojas_luc_ativa_uk")) return "Já existe uma loja ATIVA com esta LUC.";
  if (e.code === "23505" && m.includes("segmentos_nome_uk")) return "Já existe um segmento com este nome.";
  if (e.code === "23505") return "Registro duplicado.";
  if (e.code === "42501" || m.includes("row-level security")) return "Você não tem permissão para esta operação.";
  if (e.code === "P0001") return m; // mensagens das regras do banco (já em português)
  if (e.code === "23514") return "Valor fora do permitido.";
  return "Não foi possível salvar. Tente novamente. (" + m + ")";
}
