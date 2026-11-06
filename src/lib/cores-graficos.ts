/** Cores dos gráficos (paleta categórica validada e escala divergente). Sem "use client": usado também no servidor. */
export const PALETA = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
export const COR_MAIOR = "#2a78d6";   // diferença para maior
export const COR_MENOR = "#e34948";   // diferença para menor
export const NEUTRO = "#f0efec";
const TINTA_2 = "#4b5563";
const TINTA_3 = "#6b7280";

/** Cor de uma célula pela diferença % (azul = para maior, vermelho = para menor, cinza ≈ 0). */
const AZUIS = ["#d6e4f6", "#a9c8ee", "#6fa2e2", "#2a78d6"];
const VERMELHOS = ["#f8d6d4", "#f1aaa6", "#ea7a74", "#e34948"];
export function corDiferenca(pct: number | null): { fundo: string; tinta: string } {
  if (pct === null) return { fundo: "transparent", tinta: TINTA_3 };
  const a = Math.abs(pct);
  if (a < 2) return { fundo: NEUTRO, tinta: TINTA_2 };
  const n = a < 5 ? 0 : a < 10 ? 1 : a < 20 ? 2 : 3;
  return { fundo: (pct > 0 ? AZUIS : VERMELHOS)[n], tinta: n === 3 ? "#ffffff" : "#111827" };
}

