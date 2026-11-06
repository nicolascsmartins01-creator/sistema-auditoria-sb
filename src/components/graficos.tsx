"use client";
/**
 * Gráficos dos painéis (SVG, sem biblioteca). Regras seguidas:
 * - cores categóricas em ordem fixa (a cor acompanha o item, nunca a posição);
 * - um único eixo; linhas de 2px; grade discreta; textos em cinza (nunca na cor da série);
 * - dica ao passar o mouse/tocar; legenda com 2+ séries; versão em tabela.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatarMoeda } from "@/lib/formato";
import { COR_MAIOR, COR_MENOR, corDiferenca, PALETA } from "@/lib/cores-graficos";

const moeda = (c: number) => formatarMoeda(c / 100);

const GRADE = "#e5e7eb";
const TINTA_2 = "#4b5563";
const TINTA_3 = "#6b7280";

/** R$ curto para eixos: R$ 1,2 mi · R$ 350 mil · R$ 900 */
export function moedaCurta(centavos: number): string {
  const v = centavos / 100;
  const a = Math.abs(v);
  const f = (n: number, d: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: d });
  if (a >= 1e6) return `R$ ${f(v / 1e6, 1)} mi`;
  if (a >= 1e3) return `R$ ${f(v / 1e3, 0)} mil`;
  return `R$ ${f(v, 0)}`;
}

function escalaBonita(max: number, min = 0, passos = 4): number[] {
  const amplitude = max - min || Math.abs(max) || 1;
  const bruto = amplitude / passos;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= bruto)!;
  const ini = Math.floor(min / passo) * passo;
  const fim = Math.ceil(max / passo) * passo;
  const t: number[] = [];
  for (let v = ini; v <= fim + passo / 2; v += passo) t.push(Math.round(v));
  return t;
}

function useLargura(padrao = 320) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(padrao);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export interface Serie { nome: string; cor: string; valores: (number | null)[] }

function Legenda({ series }: { series: { nome: string; cor: string; tipo?: "linha" | "barra" }[] }) {
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-700">
      {series.map((s) => (
        <li key={s.nome} className="flex items-center gap-1.5">
          {s.tipo === "barra"
            ? <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.cor }} />
            : <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.cor }} />}
          {s.nome}
        </li>
      ))}
    </ul>
  );
}

function Dica({ x, y, largura, children }: { x: number; y: number; largura: number; children: ReactNode }) {
  const esquerda = x > largura - 220;
  return (
    <div role="status" className="pointer-events-none absolute z-10 min-w-40 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg"
      style={{ top: Math.max(0, y), ...(esquerda ? { right: largura - x + 12 } : { left: x + 12 }) }}>
      {children}
    </div>
  );
}

export function TabelaDados({ cabecalho, linhas, resumo = "Ver em tabela" }: { cabecalho: string[]; linhas: ReactNode[][]; resumo?: string }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-azul hover:underline">{resumo}</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-gray-500">
            <tr>{cabecalho.map((c, i) => <th key={i} className={`py-1.5 ${i ? "text-right" : ""}`}>{c}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {linhas.map((l, i) => (
              <tr key={i}>{l.map((c, j) => <td key={j} className={`py-1.5 tabular-nums ${j ? "text-right" : ""}`}>{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Linhas ao longo dos meses, com linha-guia e dica ao passar o mouse. */
export function GraficoLinhas({ rotulos, series, altura = 260, rotuloFinal = true }: {
  rotulos: string[]; series: Serie[]; altura?: number; rotuloFinal?: boolean;
}) {
  const formatar = moeda;
  const [ref, largura] = useLargura();
  const [foco, setFoco] = useState<number | null>(null);
  const direto = rotuloFinal && series.length <= 4 && largura >= 520;
  const m = { t: 12, r: direto ? 118 : 16, b: 28, l: 74 };
  const w = largura - m.l - m.r;
  const h = altura - m.t - m.b;
  const todos = series.flatMap((s) => s.valores.filter((v): v is number => v !== null));
  const ticks = escalaBonita(Math.max(1, ...todos), Math.min(0, ...todos));
  const yMin = ticks[0], yMax = ticks.at(-1)!;
  const x = (i: number) => (rotulos.length === 1 ? w / 2 : (i / (rotulos.length - 1)) * w);
  const y = (v: number) => h - ((v - yMin) / (yMax - yMin || 1)) * h;

  // rótulos diretos no fim de cada linha, afastados para não se sobreporem
  const finais = series.map((s) => {
    let i = s.valores.length - 1;
    while (i >= 0 && s.valores[i] === null) i--;
    return { s, i, yy: i >= 0 ? y(s.valores[i]!) : null };
  }).filter((f) => f.yy !== null).sort((a, b) => a.yy! - b.yy!);
  for (let k = 1; k < finais.length; k++) if (finais[k].yy! - finais[k - 1].yy! < 14) finais[k].yy = finais[k - 1].yy! + 14;

  function mover(cx: number) {
    const rel = cx - m.l;
    const i = rotulos.length === 1 ? 0 : Math.round((rel / w) * (rotulos.length - 1));
    setFoco(Math.max(0, Math.min(rotulos.length - 1, i)));
  }

  return (
    <div>
      {series.length >= 2 && <Legenda series={series} />}
      <div ref={ref} className="relative w-full min-w-0 overflow-hidden" onMouseLeave={() => setFoco(null)}>
        <svg width={largura} height={altura} role="img" aria-label="Gráfico de linhas"
          onMouseMove={(e) => mover(e.clientX - e.currentTarget.getBoundingClientRect().left)}
          onTouchStart={(e) => mover(e.touches[0].clientX - e.currentTarget.getBoundingClientRect().left)}>
          <g transform={`translate(${m.l},${m.t})`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={0} x2={w} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#9ca3af" : GRADE} />
                <text x={-8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={TINTA_3}>{moedaCurta(t)}</text>
              </g>
            ))}
            {rotulos.map((r, i) => (rotulos.length <= 8 || i % 2 === (rotulos.length - 1) % 2) && (
              <text key={r + i} x={x(i)} y={h + 18} textAnchor="middle" fontSize={11} fill={TINTA_3}>{r}</text>
            ))}
            {foco !== null && <line x1={x(foco)} x2={x(foco)} y1={0} y2={h} stroke="#9ca3af" strokeDasharray="3 3" />}
            {series.map((s) => {
              const segs: string[] = [];
              let atual = "";
              s.valores.forEach((v, i) => {
                if (v === null) { if (atual) segs.push(atual); atual = ""; return; }
                atual += `${atual ? "L" : "M"}${x(i)},${y(v)}`;
              });
              if (atual) segs.push(atual);
              return (
                <g key={s.nome}>
                  {segs.map((d, k) => <path key={k} d={d} fill="none" stroke={s.cor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}
                  {s.valores.map((v, i) => v !== null && (foco === i || s.valores.filter((z) => z !== null).length === 1 || (s.valores[i - 1] ?? null) === null && (s.valores[i + 1] ?? null) === null) && (
                    <circle key={i} cx={x(i)} cy={y(v)} r={4} fill={s.cor} stroke="#fff" strokeWidth={2} />
                  ))}
                </g>
              );
            })}
            {direto && finais.map((f) => (
              <text key={f.s.nome} x={w + 8} y={f.yy!} dy="0.32em" fontSize={11} fill={TINTA_2}>
                {f.s.nome.length > 16 ? f.s.nome.slice(0, 15) + "…" : f.s.nome}
              </text>
            ))}
          </g>
        </svg>
        {foco !== null && (
          <Dica x={m.l + x(foco)} y={m.t} largura={largura}>
            <p className="mb-1 font-semibold text-gray-900">{rotulos[foco]}</p>
            {series.map((s) => (
              <p key={s.nome} className="flex items-center gap-2 text-gray-700">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.cor }} />
                <span className="flex-1">{s.nome}</span>
                <span className="tabular-nums font-medium text-gray-900">{s.valores[foco] === null ? "—" : formatar(s.valores[foco]!)}</span>
              </p>
            ))}
          </Dica>
        )}
      </div>
    </div>
  );
}

/** Barras para cima (para maior) e para baixo (para menor) a partir do zero, mês a mês. */
export function GraficoDivergente({ rotulos, maior, menor, extras, altura = 240 }: {
  rotulos: string[]; maior: number[]; menor: number[]; extras?: string[]; altura?: number;
}) {
  const formatar = moeda;
  const [ref, largura] = useLargura();
  const [foco, setFoco] = useState<number | null>(null);
  const m = { t: 12, r: 12, b: 28, l: 74 };
  const w = largura - m.l - m.r;
  const h = altura - m.t - m.b;
  const ticks = escalaBonita(Math.max(1, ...maior), Math.min(-1, ...menor));
  const yMin = ticks[0], yMax = ticks.at(-1)!;
  const y = (v: number) => h - ((v - yMin) / (yMax - yMin || 1)) * h;
  const banda = w / rotulos.length;
  const bw = Math.min(36, banda * 0.55);
  const barra = (cx: number, v: number, cor: string) => {
    if (!v) return null;
    const y0 = y(0), y1 = y(v);
    const topo = Math.min(y0, y1), alt = Math.max(1, Math.abs(y1 - y0));
    const r = Math.min(4, alt / 2, bw / 2);
    // canto arredondado só na ponta (longe do zero)
    const d = v > 0
      ? `M${cx - bw / 2},${y0} V${topo + r} Q${cx - bw / 2},${topo} ${cx - bw / 2 + r},${topo} H${cx + bw / 2 - r} Q${cx + bw / 2},${topo} ${cx + bw / 2},${topo + r} V${y0} Z`
      : `M${cx - bw / 2},${y0} V${topo + alt - r} Q${cx - bw / 2},${topo + alt} ${cx - bw / 2 + r},${topo + alt} H${cx + bw / 2 - r} Q${cx + bw / 2},${topo + alt} ${cx + bw / 2},${topo + alt - r} V${y0} Z`;
    return <path d={d} fill={cor} />;
  };
  return (
    <div>
      <Legenda series={[{ nome: "Para maior (projeção acima do informado)", cor: COR_MAIOR, tipo: "barra" }, { nome: "Para menor", cor: COR_MENOR, tipo: "barra" }]} />
      <div ref={ref} className="relative w-full min-w-0 overflow-hidden" onMouseLeave={() => setFoco(null)}>
        <svg width={largura} height={altura} role="img" aria-label="Gráfico de barras das diferenças por mês">
          <g transform={`translate(${m.l},${m.t})`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={0} x2={w} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#9ca3af" : GRADE} />
                <text x={-8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={TINTA_3}>{moedaCurta(t)}</text>
              </g>
            ))}
            {rotulos.map((r, i) => {
              const cx = banda * i + banda / 2;
              return (
                <g key={r + i}>
                  {foco === i && <rect x={banda * i} y={0} width={banda} height={h} fill="#f3f4f6" />}
                  {barra(cx, maior[i], COR_MAIOR)}
                  {barra(cx, menor[i], COR_MENOR)}
                  {(rotulos.length <= 8 || i % 2 === (rotulos.length - 1) % 2) && <text x={cx} y={h + 18} textAnchor="middle" fontSize={11} fill={TINTA_3}>{r}</text>}
                  <rect x={banda * i} y={0} width={banda} height={h} fill="transparent"
                    onMouseEnter={() => setFoco(i)} onTouchStart={() => setFoco(i)} />
                </g>
              );
            })}
          </g>
        </svg>
        {foco !== null && (
          <Dica x={m.l + banda * foco + banda / 2} y={m.t} largura={largura}>
            <p className="mb-1 font-semibold text-gray-900">{rotulos[foco]}</p>
            <p className="flex gap-2 text-gray-700"><span className="flex-1">Para maior</span><span className="tabular-nums font-medium text-gray-900">{formatar(maior[foco])}</span></p>
            <p className="flex gap-2 text-gray-700"><span className="flex-1">Para menor</span><span className="tabular-nums font-medium text-gray-900">{formatar(menor[foco])}</span></p>
            {extras?.[foco] && <p className="mt-1 text-gray-600">{extras[foco]}</p>}
          </Dica>
        )}
      </div>
    </div>
  );
}

/** Barras horizontais (uma série), com o valor escrito ao lado. */
export function BarrasHorizontais({ itens, cor = PALETA[0] }: { itens: { rotulo: ReactNode; valor: number; texto: string; detalhe?: string }[]; cor?: string }) {
  const max = Math.max(1, ...itens.map((i) => Math.abs(i.valor)));
  return (
    <ul className="space-y-2">
      {itens.map((i, k) => (
        <li key={k} className="text-sm" title={i.detalhe}>
          <div className="mb-0.5 flex justify-between gap-2">
            <span className="truncate text-gray-800">{i.rotulo}</span>
            <span className="shrink-0 tabular-nums font-medium text-gray-900">{i.texto}</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100">
            <div className="h-2 rounded-full" style={{ width: `${Math.max(1, (Math.abs(i.valor) / max) * 100)}%`, background: cor }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function LegendaDiferenca() {
  const faixas: [string, number][] = [["≤ −20%", -25], ["−10%", -15], ["−5%", -7], ["−2%", -3], ["≈ 0", 0], ["+2%", 3], ["+5%", 7], ["+10%", 15], ["≥ +20%", 25]];
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1 text-xs text-gray-600">
      <span className="mr-1">Para menor</span>
      {faixas.map(([r, v]) => (
        <span key={r} className="rounded px-1.5 py-0.5" style={{ background: corDiferenca(v).fundo, color: corDiferenca(v).tinta }}>{r}</span>
      ))}
      <span className="ml-1">Para maior</span>
    </div>
  );
}
