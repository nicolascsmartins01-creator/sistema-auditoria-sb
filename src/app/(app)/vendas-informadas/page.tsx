import Link from "next/link";
import { exigirUsuario, PERFIS_ANALISTA } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { formatarMoeda, MESES } from "@/lib/formato";
import { mesAnterior, mesSeguinte } from "@/lib/prazos";
import { Aviso, Cartao, Etiqueta, LinkBotao, Titulo } from "@/components/ui";

export default async function VendasInformadas({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await exigirUsuario(PERFIS_ANALISTA);
  const sb = await criarClienteServidor();
  const pedido = (await searchParams).mes;
  let mes: string;
  if (pedido && /^\d{4}-\d{2}$/.test(pedido)) mes = pedido;
  else {
    const { data } = await sb.from("vendas_informadas").select("competencia").order("competencia", { ascending: false }).limit(1);
    mes = (data?.[0]?.competencia as string | undefined)?.slice(0, 7) ?? new Date().toISOString().slice(0, 7);
  }
  const [{ data: linhas }, { data: lojas }] = await Promise.all([
    sb.from("vendas_informadas").select("id, luc, nome_pdf, valor, loja_id, lojas(id, nome_fantasia, ativa)")
      .eq("competencia", mes + "-01").order("luc"),
    sb.from("lojas").select("id, luc, nome_fantasia").eq("ativa", true),
  ]);
  const ls = linhas ?? [];
  const total = ls.reduce((s, l) => s + Number(l.valor), 0);
  const presentes = new Set(ls.map((l) => l.loja_id));
  const ausentes = (lojas ?? []).filter((l) => !presentes.has(l.id));
  const [a, m] = mes.split("-").map(Number);

  return (
    <>
      <Titulo acoes={<LinkBotao href="/importacao/portal" variante="secundario">Importar PDF</LinkBotao>}>Venda informada</Titulo>
      <div className="mb-4 flex items-center gap-1 text-sm">
        <Link href={`/vendas-informadas?mes=${mesAnterior(mes)}`} className="rounded-full border bg-white px-3 py-1.5 text-azul">‹</Link>
        <span className="px-3 font-semibold">{MESES[m - 1][0].toUpperCase() + MESES[m - 1].slice(1)}/{a}</span>
        <Link href={`/vendas-informadas?mes=${mesSeguinte(mes)}`} className="rounded-full border bg-white px-3 py-1.5 text-azul">›</Link>
      </div>
      {!ls.length ? <Aviso tipo="info">Nenhuma venda informada importada para este mês.</Aviso> : (
        <div className="space-y-5">
          {ausentes.length > 0 && (
            <Aviso tipo="alerta">{ausentes.length} loja(s) ativa(s) sem venda informada neste mês: {ausentes.map((l) => l.luc).join(", ")}.</Aviso>
          )}
          <Cartao titulo={`${ls.length} loja(s) · total ${formatarMoeda(total)}`}>
            <table className="w-full text-sm">
              <thead className="text-left text-gray-500"><tr><th className="py-1">Nº LUC</th><th>Loja</th><th className="text-right">Venda informada</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {ls.map((l) => {
                  const loja = l.lojas as unknown as { id: string; nome_fantasia: string; ativa: boolean } | null;
                  return (
                    <tr key={l.id}>
                      <td className="py-1.5 font-medium">{l.luc}</td>
                      <td>{loja ? <Link href={`/lojas/${loja.id}`} className="text-azul hover:underline">{loja.nome_fantasia}</Link> : <span>{l.nome_pdf} <Etiqueta cor="vermelho">LUC não cadastrada</Etiqueta></span>}
                        {loja && !loja.ativa && <> <Etiqueta cor="amarelo">inativa</Etiqueta></>}</td>
                      <td className="text-right tabular-nums">{formatarMoeda(l.valor)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Cartao>
        </div>
      )}
    </>
  );
}
