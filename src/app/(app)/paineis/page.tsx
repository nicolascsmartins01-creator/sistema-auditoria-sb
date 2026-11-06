import Link from "next/link";
import { exigirUsuario, PERFIS_ANALISTA } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { carregarPaineis } from "@/lib/dados/paineis";
import { ultimoMesComInformado } from "@/lib/dados/conciliacao";
import { formatarMesAno, formatarPercentual, hojeFortaleza, MESES } from "@/lib/formato";
import { mesAnterior, mesSeguinte } from "@/lib/prazos";
import { Aviso, Cartao, Titulo } from "@/components/ui";
import { Diferenca, reais } from "@/components/valores";
import { BarrasHorizontais, GraficoDivergente, GraficoLinhas, LegendaDiferenca, TabelaDados } from "@/components/graficos";
import { corDiferenca, PALETA } from "@/lib/cores-graficos";
import { EscolherLoja } from "./escolher-loja";

const curto = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1].slice(0, 3)}/${mes.slice(2, 4)}`;
const pct = (n: number | null) => (n === null ? "—" : `${n > 0 ? "+" : ""}${formatarPercentual(n)}`);

export default async function PaginaPaineis({ searchParams }: { searchParams: Promise<{ ate?: string; n?: string; loja?: string }> }) {
  await exigirUsuario(PERFIS_ANALISTA);
  const sb = await criarClienteServidor();
  const q = await searchParams;
  const n = q.n === "6" ? 6 : 12;
  const ate = q.ate && /^\d{4}-\d{2}$/.test(q.ate) ? q.ate : (await ultimoMesComInformado(sb)) ?? mesAnterior(hojeFortaleza().slice(0, 7));
  const { paineis: p, lojas } = await carregarPaineis(sb, ate, n);
  const rotulos = p.meses.map(curto);
  const base = `/paineis?ate=${ate}&n=${n}`;

  // loja escolhida: a pedida, ou a de maior venda no último mês
  const comDados = lojas.filter((l) => p.porLoja[l.id].some((x) => x.informado !== null || x.dias > 0));
  const lojaId = q.loja && p.porLoja[q.loja] ? q.loja : p.ranking.informado[0]?.loja_id ?? comDados[0]?.id;
  const loja = lojas.find((l) => l.id === lojaId);
  const serieLoja = lojaId ? p.porLoja[lojaId] : [];

  const ult = p.ultimoMes;
  const iUlt = ult ? p.meses.indexOf(ult) : -1;
  const totUlt = iUlt >= 0 ? p.totalPorMes[iUlt].informado : 0;
  const totAnt = iUlt > 0 ? p.totalPorMes[iUlt - 1].informado : 0;
  const varTotal = totAnt > 0 ? Math.round(((totUlt - totAnt) / totAnt) * 10000) / 100 : null;
  const difUlt = iUlt >= 0 ? p.difPorMes[iUlt] : null;

  const crescimento = p.ranking.crescimento;
  const maisCresceram = crescimento.filter((c) => c.pct > 0).slice(0, 5);
  const maisCairam = crescimento.filter((c) => c.pct < 0).slice(-5).reverse();

  return (
    <>
      <Titulo>Painéis</Titulo>

      <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <Link href={`/paineis?ate=${mesAnterior(ate)}&n=${n}`} className="rounded-full border bg-white px-3 py-1.5 text-azul" aria-label="Mês anterior">‹</Link>
        <span className="font-semibold">{formatarMesAno(p.meses[0])} a {formatarMesAno(ate)}</span>
        <Link href={`/paineis?ate=${mesSeguinte(ate)}&n=${n}`} className="rounded-full border bg-white px-3 py-1.5 text-azul" aria-label="Mês seguinte">›</Link>
        <span className="ml-2 inline-flex overflow-hidden rounded-full border bg-white">
          {[6, 12].map((k) => (
            <Link key={k} href={`/paineis?ate=${ate}&n=${k}`} className={`px-3 py-1.5 ${k === n ? "bg-azul text-white" : "text-azul"}`}>{k} meses</Link>
          ))}
        </span>
      </div>

      {!ult ? (
        <Aviso tipo="info">Não há venda informada neste período. Importe o PDF do portal em Importação → Venda informada.</Aviso>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Numero rotulo={`Venda informada · ${formatarMesAno(ult)}`} valor={reais(totUlt)} nota={`${p.totalPorMes[iUlt].lojas} lojas`} />
            <Numero rotulo="Variação sobre o mês anterior" valor={pct(varTotal)} nota={totAnt ? `antes: ${reais(totAnt)}` : "sem mês anterior"} />
            <Numero rotulo="Lojas com alerta" valor={`${difUlt?.alertas ?? 0} de ${difUlt?.conciliadas ?? 0}`} nota="lojas conciliadas" />
            <Numero rotulo="Diferença projetada" valor={<span className="text-base"><Diferenca centavos={difUlt?.paraMaior ?? 0} /> · <Diferenca centavos={difUlt?.paraMenor ?? 0} /></span>} nota="para maior · para menor" />
          </div>

          <Cartao titulo="Evolução da venda informada — total do shopping">
            <GraficoLinhas rotulos={rotulos} series={[{ nome: "Venda informada", cor: PALETA[0], valores: p.totalPorMes.map((t) => (t.lojas ? t.informado : null)) }]} rotuloFinal={false} />
            <TabelaDados cabecalho={["Mês", "Venda informada", "Lojas"]}
              linhas={p.totalPorMes.map((t) => [formatarMesAno(t.mes), t.lojas ? reais(t.informado) : "—", t.lojas])} />
          </Cartao>

          <Cartao titulo="Evolução por segmento">
            <GraficoLinhas rotulos={rotulos} series={p.segmentos.map((s, i) => ({ nome: s.nome, cor: PALETA[i], valores: s.serie.map((x, k) => (p.totalPorMes[k].lojas ? x.informado : null)) }))} />
            {p.segmentos.some((s) => s.nome === "Outros") && <p className="mt-1 text-xs text-gray-500">“Outros” reúne os segmentos menores do período.</p>}
            <TabelaDados cabecalho={["Segmento", ...p.meses.map(formatarMesAno)]}
              linhas={p.segmentos.map((s) => [s.nome, ...s.serie.map((x, k) => (p.totalPorMes[k].lojas ? reais(x.informado) : "—"))])} />
          </Cartao>

          <section id="loja">
            <Cartao titulo="Evolução por loja" acoes={
              <EscolherLoja base={base} atual={lojaId ?? ""}
                lojas={comDados.map((l) => ({ id: l.id, texto: `${l.luc} — ${l.nome}` }))} />
            }>
              {loja ? (
                <>
                  <p className="mb-2 text-sm text-gray-600">
                    <Link href={`/lojas/${loja.id}`} className="font-medium text-azul hover:underline">{loja.nome}</Link> · {loja.luc} · {loja.segmento ?? "sem segmento"}
                  </p>
                  <GraficoLinhas rotulos={rotulos} series={[
                    { nome: "Venda informada", cor: PALETA[0], valores: serieLoja.map((x) => x.informado) },
                    { nome: "Projeção da auditoria", cor: PALETA[1], valores: serieLoja.map((x) => x.projecao) },
                  ]} />
                  <TabelaDados resumo="Ver em tabela (com diferença e dias auditados)"
                    cabecalho={["Mês", "Informado", "Projeção", "Diferença", "Dias auditados"]}
                    linhas={serieLoja.map((x) => [
                      formatarMesAno(x.mes), x.informado === null ? "—" : reais(x.informado), x.projecao === null ? "—" : reais(x.projecao),
                      x.diferenca === null ? "—" : <Diferenca centavos={x.diferenca} percentual={x.diferencaPct} />, x.dias,
                    ])} />
                </>
              ) : <p className="text-sm text-gray-500">Nenhuma loja com dados no período.</p>}
            </Cartao>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <Cartao titulo={`Maiores vendas informadas · ${formatarMesAno(ult)}`}>
              <BarrasHorizontais itens={p.ranking.informado.slice(0, 10).map((r, i) => ({
                rotulo: <><span className="mr-1 text-gray-500">{i + 1}º</span><Link href={`${base}&loja=${r.loja_id}#loja`} className="hover:underline">{r.nome}</Link></>,
                valor: r.valor, texto: reais(r.valor), detalhe: r.luc,
              }))} />
              <TabelaDados resumo={`Ver todas (${p.ranking.informado.length})`} cabecalho={["Loja", "LUC", "Venda informada"]}
                linhas={p.ranking.informado.map((r) => [r.nome, r.luc, reais(r.valor)])} />
            </Cartao>

            <Cartao titulo={`Ranking de segmentos · ${formatarMesAno(ult)}`}>
              <BarrasHorizontais itens={p.ranking.segmentos.map((s, i) => ({
                rotulo: <><span className="mr-1 text-gray-500">{i + 1}º</span>{s.nome} <span className="text-xs text-gray-500">({s.lojas} loja{s.lojas > 1 ? "s" : ""})</span></>,
                valor: s.valor, texto: reais(s.valor),
              }))} />
            </Cartao>

            <Cartao titulo={`Crescimento sobre o mês anterior · ${formatarMesAno(ult)}`} className="lg:col-span-2">
              {!crescimento.length ? <p className="text-sm text-gray-500">Sem mês anterior com venda informada para comparar.</p> : (
                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-gray-700">Mais cresceram</h3>
                    {maisCresceram.length ? <ListaCrescimento itens={maisCresceram} base={base} /> : <p className="text-sm text-gray-500">Nenhuma loja cresceu.</p>}
                  </div>
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-gray-700">Mais caíram</h3>
                    {maisCairam.length ? <ListaCrescimento itens={maisCairam} base={base} /> : <p className="text-sm text-gray-500">Nenhuma loja caiu.</p>}
                  </div>
                </div>
              )}
              {crescimento.length > 0 && (
                <TabelaDados resumo={`Ver todas (${crescimento.length})`} cabecalho={["Loja", "Mês anterior", "Mês atual", "Variação"]}
                  linhas={crescimento.map((c) => [`${c.nome} (${c.luc})`, reais(c.anterior), reais(c.atual), pct(c.pct)])} />
              )}
            </Cartao>
          </div>

          <Cartao titulo="Discrepâncias mês a mês (soma das lojas conciliadas)">
            <GraficoDivergente rotulos={rotulos} maior={p.difPorMes.map((d) => d.paraMaior)} menor={p.difPorMes.map((d) => d.paraMenor)}
              extras={p.difPorMes.map((d) => `${d.alertas} loja(s) com alerta de ${d.conciliadas} conciliada(s)`)} />
            <TabelaDados cabecalho={["Mês", "Para maior", "Para menor", "Lojas com alerta", "Conciliadas"]}
              linhas={p.difPorMes.map((d) => [formatarMesAno(d.mes), reais(d.paraMaior), reais(d.paraMenor), d.alertas, d.conciliadas])} />
          </Cartao>

          <Cartao titulo="Histórico de discrepâncias por loja">
            <p className="mb-2 text-sm text-gray-600">Diferença % entre a projeção da auditoria e o informado, em cada mês. Em primeiro, as lojas com mais meses para maior.</p>
            <LegendaDiferenca />
            {!p.historico.length ? <p className="text-sm text-gray-500">Nenhuma loja conciliada no período.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-gray-500">
                    <tr>
                      <th className="sticky left-0 bg-white py-1.5 pr-2 text-left">Loja</th>
                      {p.meses.map((m) => <th key={m} className="px-0.5 text-center font-normal">{curto(m)}</th>)}
                      <th className="pl-3 text-right">Meses + / −</th>
                      <th className="pl-3 text-right">Soma para maior</th>
                      <th className="pl-3 text-right">Soma para menor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.historico.map((h) => (
                      <tr key={h.loja_id}>
                        <td className="sticky left-0 max-w-[12rem] truncate bg-white py-0.5 pr-2">
                          <Link href={`${base}&loja=${h.loja_id}#loja`} className="text-azul hover:underline">{h.nome}</Link>
                          <span className="ml-1 text-gray-500">{h.luc}</span>
                        </td>
                        {h.celulas.map((c) => {
                          const cor = corDiferenca(c.pct);
                          return (
                            <td key={c.mes} className="p-0.5">
                              <span className="block min-w-12 rounded px-1 py-1 text-center tabular-nums"
                                style={{ background: cor.fundo, color: cor.tinta }}
                                title={c.diferenca === null ? `${formatarMesAno(c.mes)}: sem conciliação` : `${formatarMesAno(c.mes)}: ${reais(c.diferenca)} (${pct(c.pct)})`}>
                                {c.pct === null ? "·" : `${c.pct > 0 ? "+" : ""}${Math.round(c.pct)}%`}
                              </span>
                            </td>
                          );
                        })}
                        <td className="whitespace-nowrap pl-3 text-right tabular-nums">{h.mesesParaMaior} / {h.mesesParaMenor}</td>
                        <td className="whitespace-nowrap pl-3 text-right"><Diferenca centavos={h.somaParaMaior} /></td>
                        <td className="whitespace-nowrap pl-3 text-right"><Diferenca centavos={h.somaParaMenor} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-2 text-xs text-gray-500">“·” = mês sem conciliação (sem venda informada ou sem dia auditado). Clique na loja para ver a evolução dela.</p>
          </Cartao>
        </div>
      )}
    </>
  );
}

function Numero({ rotulo, valor, nota }: { rotulo: string; valor: React.ReactNode; nota?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-gray-500">{rotulo}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{valor}</p>
      {nota && <p className="mt-0.5 text-xs text-gray-500">{nota}</p>}
    </div>
  );
}

function ListaCrescimento({ itens, base }: { itens: { loja_id: string; nome: string; luc: string; atual: number; anterior: number; pct: number }[]; base: string }) {
  return (
    <ul className="divide-y divide-gray-100 text-sm">
      {itens.map((c) => (
        <li key={c.loja_id} className="flex items-center justify-between gap-2 py-1.5">
          <Link href={`${base}&loja=${c.loja_id}#loja`} className="truncate hover:underline">{c.nome} <span className="text-xs text-gray-500">{c.luc}</span></Link>
          <span className="shrink-0 text-right">
            <span className="font-semibold tabular-nums text-gray-900">{pct(c.pct)}</span>
            <span className="block text-xs text-gray-500">{reais(c.anterior)} → {reais(c.atual)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
