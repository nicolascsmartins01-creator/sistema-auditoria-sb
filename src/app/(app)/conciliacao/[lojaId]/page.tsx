import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirUsuario, PERFIS_ANALISTA } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { carregarConciliacao } from "@/lib/dados/conciliacao";
import { NOME_CLASSIFICACAO } from "@/lib/conciliacao";
import { formatarData, MESES } from "@/lib/formato";
import { mesAnterior, mesSeguinte } from "@/lib/prazos";
import { Aviso, Cartao, Etiqueta, Titulo } from "@/components/ui";
import { Diferenca, reais } from "@/components/valores";

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export default async function ConciliacaoLoja({ params, searchParams }: {
  params: Promise<{ lojaId: string }>; searchParams: Promise<{ mes?: string }>;
}) {
  await exigirUsuario(PERFIS_ANALISTA);
  const { lojaId } = await params;
  const pedido = (await searchParams).mes;
  const mes = pedido && /^\d{4}-\d{2}$/.test(pedido) ? pedido : new Date().toISOString().slice(0, 7);
  const sb = await criarClienteServidor();
  const { data: loja } = await sb.from("lojas").select("id, luc, nome_fantasia").eq("id", lojaId).maybeSingle();
  if (!loja) notFound();
  const r = await carregarConciliacao(sb, mes);
  const c = r.conciliadas.find((x) => x.loja_id === lojaId);
  const semInf = r.semInformado.find((x) => x.loja_id === lojaId);
  const [a, m] = mes.split("-").map(Number);

  return (
    <div className="space-y-5">
      <Titulo voltar={{ href: `/conciliacao?mes=${mes}`, texto: "Conciliação" }}>{loja.nome_fantasia} <span className="text-base font-normal text-gray-500">{loja.luc}</span></Titulo>
      <div className="flex items-center gap-1 text-sm">
        <Link href={`/conciliacao/${lojaId}?mes=${mesAnterior(mes)}`} className="rounded-full border bg-white px-3 py-1.5 text-azul">‹</Link>
        <span className="px-3 font-semibold">{MESES[m - 1][0].toUpperCase() + MESES[m - 1].slice(1)}/{a}</span>
        <Link href={`/conciliacao/${lojaId}?mes=${mesSeguinte(mes)}`} className="rounded-full border bg-white px-3 py-1.5 text-azul">›</Link>
        <Link href={`/lojas/${lojaId}`} className="ml-auto text-azul hover:underline">Cadastro da loja</Link>
      </div>

      {!c ? (
        <Aviso tipo="info">
          {semInf ? `Há ${semInf.dias.length} dia(s) auditado(s), mas não há venda informada importada para este mês.`
            : "Sem conciliação neste mês: é preciso ter venda informada (PDF do portal) e ao menos um dia auditado válido."}
        </Aviso>
      ) : (
        <>
          <Cartao>
            <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <Item r="Informado no mês" v={reais(c.informadoCentavos)} />
              <Item r="Média diária informada" v={reais(c.mediaInformadaCentavos)} s={`÷ ${c.diasNoMes} dias`} />
              <Item r="Dias auditados" v={`${c.diasAuditados} de ${c.diasNoMes}`} s={c.diasAuditados < 5 ? "poucos dias: projeção menos confiável" : `soma ${reais(c.auditadoCentavos)}`} />
              <Item r="Média diária auditada" v={reais(c.mediaAuditadaCentavos)} />
              <Item r="Projeção auditada do mês" v={reais(c.projecaoCentavos)} s={`× ${c.diasNoMes} dias`} />
              <div><dt className="text-xs text-gray-500">Diferença projetada</dt>
                <dd><Diferenca centavos={c.diferencaCentavos} percentual={c.diferencaPercentual} /></dd>
                <dd className="mt-1">{c.alerta ? <Etiqueta cor={c.classificacao === "para_maior" ? "verde" : "vermelho"}>⚠ {NOME_CLASSIFICACAO[c.classificacao]}</Etiqueta> : <Etiqueta>sem diferença</Etiqueta>}</dd></div>
            </dl>
          </Cartao>
          <Cartao titulo="Dias auditados × média diária informada (maior desvio primeiro)">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-gray-500">
                <tr><th className="py-2">Data</th><th className="text-right">Auditado</th><th className="text-right">Média informada</th><th className="text-right">Desvio</th><th /></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {c.dias.map((d) => (
                  <tr key={d.lancamento_id}>
                    <td className="py-2">{formatarData(d.data)} <span className="text-xs text-gray-500">{SEMANA[new Date(d.data + "T12:00:00Z").getUTCDay()]}</span></td>
                    <td className="text-right tabular-nums">{reais(d.centavos)}</td>
                    <td className="text-right tabular-nums text-gray-600">{reais(c.mediaInformadaCentavos)}</td>
                    <td className="text-right"><Diferenca centavos={d.desvioCentavos} percentual={d.desvioPercentual} /></td>
                    <td className="pl-3 text-right"><Link href={`/lancamentos/${d.lancamento_id}`} className="text-xs text-azul hover:underline">ver lançamento e fotos</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Cartao>
        </>
      )}
    </div>
  );
}

function Item({ r, v, s }: { r: string; v: string; s?: string }) {
  return <div><dt className="text-xs text-gray-500">{r}</dt><dd className="text-lg font-semibold tabular-nums">{v}</dd>{s && <dd className="text-xs text-gray-500">{s}</dd>}</div>;
}
