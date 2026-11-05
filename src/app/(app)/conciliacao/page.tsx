import Link from "next/link";
import { exigirUsuario, PERFIS_ANALISTA } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { carregarConciliacao, ultimoMesComInformado } from "@/lib/dados/conciliacao";
import { NOME_CLASSIFICACAO } from "@/lib/conciliacao";
import { hojeFortaleza, MESES } from "@/lib/formato";
import { mesAnterior, mesSeguinte } from "@/lib/prazos";
import { Aviso, Cartao, Etiqueta, Titulo } from "@/components/ui";
import { Diferenca, reais } from "@/components/valores";

export default async function PaginaConciliacao({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await exigirUsuario(PERFIS_ANALISTA);
  const sb = await criarClienteServidor();
  const pedido = (await searchParams).mes;
  const mes = pedido && /^\d{4}-\d{2}$/.test(pedido) ? pedido : (await ultimoMesComInformado(sb)) ?? mesAnterior(hojeFortaleza().slice(0, 7));
  const r = await carregarConciliacao(sb, mes);
  const [a, m] = mes.split("-").map(Number);
  const nomeMes = MESES[m - 1][0].toUpperCase() + MESES[m - 1].slice(1);

  return (
    <>
      <Titulo>Conciliação mensal</Titulo>
      <div className="mb-4 flex items-center gap-1 text-sm">
        <Link href={`/conciliacao?mes=${mesAnterior(mes)}`} className="rounded-full border bg-white px-3 py-1.5 text-azul">‹</Link>
        <span className="px-3 font-semibold">{nomeMes}/{a} · {r.diasNoMes} dias</span>
        <Link href={`/conciliacao?mes=${mesSeguinte(mes)}`} className="rounded-full border bg-white px-3 py-1.5 text-azul">›</Link>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Total rotulo="Lojas com alerta" valor={`${r.alertas.length} de ${r.conciliadas.length}`} />
        <Total rotulo={`Para maior (${r.totais.lojasParaMaior} loja/s)`} valor={<Diferenca centavos={r.totais.diferencaParaMaiorCentavos} grande />} />
        <Total rotulo={`Para menor (${r.totais.lojasParaMenor} loja/s)`} valor={<Diferenca centavos={r.totais.diferencaParaMenorCentavos} grande />} />
        <Total rotulo="Informado × projetado (conciliadas)" valor={<span className="text-base">{reais(r.totais.informadoCentavos)} → {reais(r.totais.projecaoCentavos)}</span>} />
      </div>

      {!r.conciliadas.length && !r.semInformado.length && !r.semAuditoria.length ? (
        <Aviso tipo="info">Sem dados para este mês: importe o PDF do portal e lance as vendas auditadas.</Aviso>
      ) : (
        <div className="space-y-5">
          <Cartao titulo="Lojas conciliadas — da maior para a menor diferença projetada">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] text-sm">
                <thead className="text-left text-xs text-gray-500">
                  <tr>
                    <th className="py-2">Loja</th><th className="text-center">Dias auditados</th>
                    <th className="text-right">Informado</th><th className="text-right">Média inf./dia</th>
                    <th className="text-right">Média aud./dia</th><th className="text-right">Projeção</th>
                    <th className="text-right">Diferença</th><th className="pl-3">Classificação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {r.conciliadas.map((c) => (
                    <tr key={c.loja_id} className="hover:bg-azul-claro">
                      <td className="py-2"><Link href={`/conciliacao/${c.loja_id}?mes=${mes}`} className="font-medium text-azul hover:underline">{c.nome}</Link>
                        <span className="block text-xs text-gray-500">{c.luc}</span></td>
                      <td className="text-center"><span className={c.diasAuditados < 5 ? "text-amber-700" : ""}>{c.diasAuditados} de {c.diasNoMes}</span></td>
                      <td className="text-right tabular-nums">{reais(c.informadoCentavos)}</td>
                      <td className="text-right tabular-nums">{reais(c.mediaInformadaCentavos)}</td>
                      <td className="text-right tabular-nums">{reais(c.mediaAuditadaCentavos)}</td>
                      <td className="text-right tabular-nums">{reais(c.projecaoCentavos)}</td>
                      <td className="text-right"><Diferenca centavos={c.diferencaCentavos} percentual={c.diferencaPercentual} /></td>
                      <td className="pl-3">{c.alerta
                        ? <Etiqueta cor={c.classificacao === "para_maior" ? "verde" : "vermelho"}>⚠ {NOME_CLASSIFICACAO[c.classificacao]}</Etiqueta>
                        : <Etiqueta>sem diferença</Etiqueta>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              Projeção = média diária auditada × {r.diasNoMes} dias. Diferença = projeção − informado. “Para maior”: a auditoria projeta venda maior
              que a informada. Qualquer diferença gera alerta. Com poucos dias auditados (em laranja, menos de 5) a projeção é menos confiável.
            </p>
          </Cartao>

          {r.semInformado.length > 0 && (
            <Cartao titulo={`Auditadas sem venda informada (${r.semInformado.length})`}>
              <p className="mb-2 text-sm text-gray-600">Têm dias auditados no mês, mas o PDF do portal não trouxe valor para elas (ou ainda não foi importado).</p>
              <ul className="text-sm">{r.semInformado.map((l) => <li key={l.loja_id}><Link href={`/conciliacao/${l.loja_id}?mes=${mes}`} className="text-azul hover:underline">{l.nome}</Link> <span className="text-gray-500">({l.luc}) · {l.dias.length} dia(s) auditado(s)</span></li>)}</ul>
            </Cartao>
          )}
          {r.semAuditoria.length > 0 && (
            <Cartao titulo={`Com venda informada, sem nenhum dia auditado (${r.semAuditoria.length})`}>
              <p className="mb-2 text-sm text-gray-600">Lojas auditadas que não tiveram lançamento válido no mês: não há como projetar.</p>
              <p className="text-sm text-gray-700">{r.semAuditoria.map((l) => `${l.nome} (${l.luc})`).join(" · ")}</p>
            </Cartao>
          )}
        </div>
      )}
    </>
  );
}

function Total({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-gray-500">{rotulo}</p>
      <div className="mt-1 text-2xl font-bold">{valor}</div>
    </div>
  );
}
