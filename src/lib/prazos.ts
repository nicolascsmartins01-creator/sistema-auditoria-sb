/**
 * Regras fixas de prazo de lançamento (mesmas da função prazo_lancamento do banco).
 *  - A venda de um dia só pode ser lançada a partir do dia seguinte.
 *  - Lançamentos de um mês: até 23:59 do dia 5 do mês seguinte (Fortaleza).
 * O banco é quem decide de verdade; aqui é só para o calendário mostrar o estado.
 * Fechamento antecipado e reabertura entram na Fase 5.
 */

const utc = (iso: string) => new Date(iso + "T00:00:00Z");
const iso = (d: Date) => d.toISOString().slice(0, 10);

export const DIA_LIMITE = 5;

export function somarDias(data: string, n: number): string {
  const d = utc(data);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

/** Último dia (inclusive) para lançar a venda de `dataVenda`: dia 5 do mês seguinte. */
export function prazoLancamento(dataVenda: string): string {
  const d = utc(dataVenda.slice(0, 8) + "01");
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(DIA_LIMITE);
  return iso(d);
}

export type EstadoDia = "futuro" | "hoje" | "fora_prazo" | "aberto";

export function estadoDia(dataVenda: string, hoje: string): EstadoDia {
  if (dataVenda > hoje) return "futuro";
  if (dataVenda === hoje) return "hoje";
  if (hoje > prazoLancamento(dataVenda)) return "fora_prazo";
  return "aberto";
}

/** Dias do mês ("aaaa-mm") como datas "aaaa-mm-dd". */
export function diasDoMes(mes: string): string[] {
  const [a, m] = mes.split("-").map(Number);
  const total = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return Array.from({ length: total }, (_, i) => `${mes}-${String(i + 1).padStart(2, "0")}`);
}

/** Dia da semana (0 = domingo). */
export function diaDaSemana(data: string): number {
  return utc(data).getUTCDay();
}

export function mesAnterior(mes: string): string {
  const d = utc(mes + "-01");
  d.setUTCMonth(d.getUTCMonth() - 1);
  return iso(d).slice(0, 7);
}

export function mesSeguinte(mes: string): string {
  const d = utc(mes + "-01");
  d.setUTCMonth(d.getUTCMonth() + 1);
  return iso(d).slice(0, 7);
}

/** Meses ainda abertos para lançamento em `hoje`: o anterior (até o dia 5) e o atual. */
export function mesesAbertos(hoje: string): string[] {
  const atual = hoje.slice(0, 7);
  const anterior = mesAnterior(atual);
  return hoje <= prazoLancamento(anterior + "-01") ? [anterior, atual] : [atual];
}

/** Mês e dia que o calendário abre: o dia anterior a hoje. */
export function diaPadrao(hoje: string): string {
  return somarDias(hoje, -1);
}
