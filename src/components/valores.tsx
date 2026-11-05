import { formatarMoeda } from "@/lib/formato";

/** Diferença em R$ com sinal e cor: verde = para maior, vermelho = para menor. */
export function Diferenca({ centavos, percentual, grande = false }: { centavos: number; percentual?: number | null; grande?: boolean }) {
  const cor = centavos > 0 ? "text-green-700" : centavos < 0 ? "text-red-700" : "text-gray-600";
  const sinal = centavos > 0 ? "+" : "";
  return (
    <span className={`${cor} tabular-nums ${grande ? "text-2xl font-bold" : "font-semibold"}`}>
      {sinal}{formatarMoeda(centavos / 100)}
      {percentual !== undefined && percentual !== null && (
        <span className={`ml-1 ${grande ? "text-base" : "text-xs"} font-normal`}>({sinal}{percentual.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%)</span>
      )}
    </span>
  );
}

export const reais = (centavos: number) => formatarMoeda(centavos / 100);
