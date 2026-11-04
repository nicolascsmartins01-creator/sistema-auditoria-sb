export type Perfil = "auditor" | "analista" | "administrador";

export const NOMES_PERFIL: Record<Perfil, string> = {
  auditor: "Auditor",
  analista: "Analista",
  administrador: "Administrador",
};

export function ehAnalista(p: Perfil | null | undefined): boolean {
  return p === "analista" || p === "administrador";
}

export function ehAdmin(p: Perfil | null | undefined): boolean {
  return p === "administrador";
}

/**
 * Login individual. Quem não tem e-mail entra com um nome de usuário
 * (ex.: "joao.silva"); internamente ele vira um e-mail técnico, nunca usado
 * para envio de mensagens.
 */
export const DOMINIO_LOGIN_TECNICO = "usuarios.benfica.invalid";

export function normalizarLogin(login: string): string {
  return login.trim().toLowerCase();
}

export function validarLogin(login: string): string | null {
  const l = normalizarLogin(login);
  if (l.includes("@")) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(l) ? null : "E-mail inválido.";
  }
  return /^[a-z0-9._-]{3,40}$/.test(l)
    ? null
    : "Use de 3 a 40 caracteres: letras sem acento, números, ponto, hífen ou sublinhado.";
}

export function emailDoLogin(login: string): string {
  const l = normalizarLogin(login);
  return l.includes("@") ? l : `${l}@${DOMINIO_LOGIN_TECNICO}`;
}

export const SENHA_MINIMA = 8;
