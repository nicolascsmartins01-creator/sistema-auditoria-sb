/**
 * Painéis (Fase 8): evolução por loja e segmento, rankings e histórico de
 * discrepâncias. Agrega a venda informada e a conciliação mês a mês usando a
 * mesma regra de src/lib/conciliacao.ts. Função pura (sem banco).
 */
import { conciliarMes, type EntradaLoja, type ResultadoConciliacao } from "@/lib/conciliacao";

export interface LojaPainel { id: string; luc: string; nome: string; segmento: string | null; auditada: boolean; ativa: boolean }
export interface InformadoLinha { loja_id: string; competencia: string; centavos: number }
export interface LancLinha { id: string; loja_id: string; data: string; centavos: number }

export interface PontoLoja { mes: string; informado: number | null; projecao: number | null; diferenca: number | null; diferencaPct: number | null; dias: number }
export interface CelulaHist { mes: string; diferenca: number | null; pct: number | null }
export interface LinhaHist {
  loja_id: string; luc: string; nome: string; celulas: CelulaHist[];
  mesesConciliados: number; mesesParaMaior: number; mesesParaMenor: number;
  somaParaMaior: number; somaParaMenor: number;
}

export interface Paineis {
  meses: string[];
  ultimoMes: string | null;                                        // último mês com venda informada
  totalPorMes: { mes: string; informado: number; lojas: number }[];
  segmentos: { nome: string; serie: { mes: string; informado: number }[] }[]; // até 7 + "Outros"
  difPorMes: { mes: string; paraMaior: number; paraMenor: number; alertas: number; conciliadas: number }[];
  porLoja: Record<string, PontoLoja[]>;
  ranking: {
    informado: { loja_id: string; nome: string; luc: string; valor: number }[];
    crescimento: { loja_id: string; nome: string; luc: string; atual: number; anterior: number; pct: number }[];
    segmentos: { nome: string; valor: number; lojas: number }[];
  };
  historico: LinhaHist[];
}

export const MAX_SEGMENTOS = 7;

export function calcularPaineis(meses: string[], lojas: LojaPainel[], informado: InformadoLinha[], lancs: LancLinha[]): Paineis {
  const porMesInf = new Map<string, Map<string, number>>();           // mes → loja → centavos
  for (const i of informado) {
    const m = i.competencia.slice(0, 7);
    const mapa = porMesInf.get(m) ?? new Map<string, number>();
    mapa.set(i.loja_id, (mapa.get(i.loja_id) ?? 0) + i.centavos);
    porMesInf.set(m, mapa);
  }
  const porMesLanc = new Map<string, Map<string, EntradaLoja["dias"]>>();
  for (const l of lancs) {
    const m = l.data.slice(0, 7);
    const mapa = porMesLanc.get(m) ?? new Map<string, EntradaLoja["dias"]>();
    mapa.set(l.loja_id, [...(mapa.get(l.loja_id) ?? []), { lancamento_id: l.id, data: l.data, centavos: l.centavos }]);
    porMesLanc.set(m, mapa);
  }
  const lojaPorId = new Map(lojas.map((l) => [l.id, l]));

  // conciliação de cada mês (mesma regra da tela de conciliação)
  const conc = new Map<string, ResultadoConciliacao>();
  for (const m of meses) {
    const inf = porMesInf.get(m) ?? new Map();
    const dias = porMesLanc.get(m) ?? new Map();
    const entradas: EntradaLoja[] = lojas
      .filter((l) => (l.auditada && l.ativa) || dias.has(l.id) || inf.has(l.id))
      .map((l) => ({ loja_id: l.id, luc: l.luc, nome: l.nome, informadoCentavos: inf.has(l.id) ? inf.get(l.id)! : null, dias: dias.get(l.id) ?? [] }));
    conc.set(m, conciliarMes(m, entradas));
  }

  const totalPorMes = meses.map((m) => {
    const inf = porMesInf.get(m) ?? new Map<string, number>();
    return { mes: m, informado: [...inf.values()].reduce((s, v) => s + v, 0), lojas: inf.size };
  });
  const ultimoMes = [...totalPorMes].reverse().find((t) => t.lojas > 0)?.mes ?? null;

  // segmentos: os 7 maiores no período; o resto em "Outros"
  const somaSeg = new Map<string, number>();
  for (const [, inf] of porMesInf) for (const [lojaId, v] of inf) {
    const s = lojaPorId.get(lojaId)?.segmento ?? "Sem segmento";
    somaSeg.set(s, (somaSeg.get(s) ?? 0) + v);
  }
  const ordenados = [...somaSeg].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  const principais = ordenados.length > MAX_SEGMENTOS ? ordenados.slice(0, MAX_SEGMENTOS - 1) : ordenados;
  const temOutros = ordenados.length > principais.length;
  const nomesSeg = [...principais].sort((a, b) => a.localeCompare(b, "pt-BR")).concat(temOutros ? ["Outros"] : []);
  const segmentos = nomesSeg.map((nome) => ({
    nome,
    serie: meses.map((m) => {
      let v = 0;
      for (const [lojaId, c] of porMesInf.get(m) ?? new Map<string, number>()) {
        const s = lojaPorId.get(lojaId)?.segmento ?? "Sem segmento";
        if (nome === "Outros" ? !principais.includes(s) : s === nome) v += c;
      }
      return { mes: m, informado: v };
    }),
  }));

  const difPorMes = meses.map((m) => {
    const r = conc.get(m)!;
    return { mes: m, paraMaior: r.totais.diferencaParaMaiorCentavos, paraMenor: r.totais.diferencaParaMenorCentavos, alertas: r.alertas.length, conciliadas: r.conciliadas.length };
  });

  const porLoja: Record<string, PontoLoja[]> = {};
  for (const l of lojas) {
    porLoja[l.id] = meses.map((m) => {
      const c = conc.get(m)!.conciliadas.find((x) => x.loja_id === l.id);
      return {
        mes: m, informado: porMesInf.get(m)?.get(l.id) ?? null,
        projecao: c?.projecaoCentavos ?? null, diferenca: c?.diferencaCentavos ?? null,
        diferencaPct: c?.diferencaPercentual ?? null, dias: c?.diasAuditados ?? porMesLanc.get(m)?.get(l.id)?.length ?? 0,
      };
    });
  }

  // rankings do último mês com informado
  const ranking: Paineis["ranking"] = { informado: [], crescimento: [], segmentos: [] };
  if (ultimoMes) {
    const atual = porMesInf.get(ultimoMes)!;
    const anterior = porMesInf.get(meses[meses.indexOf(ultimoMes) - 1]) ?? new Map<string, number>();
    const info = (id: string) => ({ loja_id: id, nome: lojaPorId.get(id)?.nome ?? "?", luc: lojaPorId.get(id)?.luc ?? "?" });
    ranking.informado = [...atual].sort((a, b) => b[1] - a[1]).map(([id, v]) => ({ ...info(id), valor: v }));
    ranking.crescimento = [...atual].filter(([id]) => (anterior.get(id) ?? 0) > 0)
      .map(([id, v]) => ({ ...info(id), atual: v, anterior: anterior.get(id)!, pct: Math.round(((v - anterior.get(id)!) / anterior.get(id)!) * 10000) / 100 }))
      .sort((a, b) => b.pct - a.pct);
    const seg = new Map<string, { valor: number; lojas: number }>();
    for (const [id, v] of atual) {
      const s = lojaPorId.get(id)?.segmento ?? "Sem segmento";
      const x = seg.get(s) ?? { valor: 0, lojas: 0 };
      seg.set(s, { valor: x.valor + v, lojas: x.lojas + 1 });
    }
    ranking.segmentos = [...seg].map(([nome, x]) => ({ nome, ...x })).sort((a, b) => b.valor - a.valor);
  }

  // histórico de discrepâncias: lojas com ao menos um mês conciliado
  const historico: LinhaHist[] = [];
  for (const l of lojas) {
    const celulas = porLoja[l.id].map((p) => ({ mes: p.mes, diferenca: p.diferenca, pct: p.diferencaPct }));
    const conciliados = celulas.filter((c) => c.diferenca !== null);
    if (!conciliados.length) continue;
    historico.push({
      loja_id: l.id, luc: l.luc, nome: l.nome, celulas,
      mesesConciliados: conciliados.length,
      mesesParaMaior: conciliados.filter((c) => c.diferenca! > 0).length,
      mesesParaMenor: conciliados.filter((c) => c.diferenca! < 0).length,
      somaParaMaior: conciliados.filter((c) => c.diferenca! > 0).reduce((s, c) => s + c.diferenca!, 0),
      somaParaMenor: conciliados.filter((c) => c.diferenca! < 0).reduce((s, c) => s + c.diferenca!, 0),
    });
  }
  historico.sort((a, b) => b.mesesParaMaior - a.mesesParaMaior || b.somaParaMaior - a.somaParaMaior || a.nome.localeCompare(b.nome, "pt-BR"));

  return { meses, ultimoMes, totalPorMes, segmentos, difPorMes, porLoja, ranking, historico };
}

/** Lista de meses "aaaa-mm" terminando em `ate`, com `n` meses. */
export function mesesAte(ate: string, n: number): string[] {
  const [a, m] = ate.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1 - (n - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}
