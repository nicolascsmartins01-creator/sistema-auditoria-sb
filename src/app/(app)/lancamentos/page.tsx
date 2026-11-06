import Link from "next/link";
import { exigirUsuario, PERFIS_ANALISTA } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { formatarData, formatarMoeda, hojeFortaleza, MESES } from "@/lib/formato";
import { mesAnterior, mesSeguinte } from "@/lib/prazos";
import { Cartao, Etiqueta, Titulo } from "@/components/ui";

const SITUACOES: Record<string, { nome: string; cor: "verde" | "amarelo" | "vermelho" }> = {
  valido: { nome: "Válido", cor: "verde" },
  em_analise: { nome: "Em análise", cor: "amarelo" },
  recusado: { nome: "Recusado", cor: "vermelho" },
};

export default async function PaginaLancamentos({ searchParams }: { searchParams: Promise<{ mes?: string; situacao?: string }> }) {
  await exigirUsuario(PERFIS_ANALISTA);
  const sp = await searchParams;
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? sp.mes! : hojeFortaleza().slice(0, 7);
  const situacao = sp.situacao && SITUACOES[sp.situacao] ? sp.situacao : undefined;
  const sb = await criarClienteServidor();
  let q = sb.from("lancamentos")
    .select("id, data_venda, valor, situacao, origem, digitado_em, recebido_em, lojas(luc, nome_fantasia), usuarios!lancamentos_auditor_id_fkey(nome), lancamento_fotos(count)")
    .order("data_venda", { ascending: false }).order("recebido_em", { ascending: false }).limit(1000);
  if (situacao === "em_analise") q = q.eq("situacao", "em_analise");
  else {
    q = q.gte("data_venda", mes + "-01").lt("data_venda", mesSeguinte(mes) + "-01");
    if (situacao) q = q.eq("situacao", situacao);
  }
  const { data } = await q;
  const linhas = data ?? [];
  const total = linhas.filter((l) => l.situacao !== "recusado").reduce((s, l) => s + Number(l.valor), 0);
  const [a, m] = mes.split("-").map(Number);
  const url = (p: Record<string, string | undefined>) =>
    "/lancamentos?" + new URLSearchParams(Object.entries({ mes, situacao, ...p }).filter(([, v]) => v) as [string, string][]);

  return (
    <>
      <Titulo>Lançamentos auditados</Titulo>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {situacao !== "em_analise" && (
          <span className="flex items-center gap-1 rounded-full border bg-white px-2">
            <Link href={url({ mes: mesAnterior(mes) })} className="px-2 py-1.5 text-azul">‹</Link>
            <span className="capitalize">{MESES[m - 1]}/{a}</span>
            <Link href={url({ mes: mesSeguinte(mes) })} className="px-2 py-1.5 text-azul">›</Link>
          </span>
        )}
        {[undefined, "valido", "em_analise", "recusado"].map((s) => (
          <Link key={s ?? "todos"} href={url({ situacao: s ?? "" })}
            className={`rounded-full px-3 py-1.5 ${situacao === s ? "bg-azul text-white" : "border bg-white"}`}>
            {s ? SITUACOES[s].nome : "Todos"}
          </Link>
        ))}
      </div>
      <Cartao titulo={`${linhas.length} lançamento(s) · total ${formatarMoeda(total)}`}>
        {!linhas.length ? <p className="text-sm text-gray-500">Nenhum lançamento.</p> : (
          <ul className="divide-y divide-gray-100 text-sm">
            {linhas.map((l) => {
              const loja = l.lojas as unknown as { luc: string; nome_fantasia: string };
              const auditor = (l.usuarios as unknown as { nome: string } | null)?.nome;
              const nFotos = (l.lancamento_fotos as unknown as { count: number }[])[0]?.count ?? 0;
              return (
                <li key={l.id}>
                  <Link href={`/lancamentos/${l.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 hover:bg-azul-claro">
                    <span className="w-24 font-medium">{formatarData(l.data_venda)}</span>
                    <span className="min-w-0 flex-1">{loja.nome_fantasia} <span className="text-gray-500">({loja.luc})</span>
                      <span className="block text-xs text-gray-500">{auditor} · {l.origem === "planilha" ? "importado de planilha" : `${nFotos} foto(s)`}</span></span>
                    <span className="w-32 text-right font-semibold">{formatarMoeda(l.valor)}</span>
                    <Etiqueta cor={SITUACOES[l.situacao].cor}>{SITUACOES[l.situacao].nome}</Etiqueta>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Cartao>
    </>
  );
}
