import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirUsuario, PERFIS_ANALISTA } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { formatarData, formatarDataHora, formatarPercentual, MESES } from "@/lib/formato";
import { NOME_CLASSIFICACAO, type Classificacao } from "@/lib/conciliacao";
import { Aviso, Cartao, Etiqueta, Titulo } from "@/components/ui";
import { Diferenca, reais } from "@/components/valores";

interface LojaRel {
  loja_id: string; luc: string; nome: string; dias_auditados: number;
  informado: number; auditado: number; media_informada: number; media_auditada: number;
  projecao: number; diferenca: number; diferenca_percentual: number | null; classificacao: Classificacao;
  percentual_vigente: string | null; aluguel_minimo_vigente: string | null;
  dias: { lancamento_id: string; data: string; valor: number; desvio: number }[];
}
interface Relatorio {
  competencia: string; dias_no_mes: number; calculado_em: string;
  lojas: LojaRel[];
  sem_informado: { luc: string; nome: string; dias_auditados: number }[];
  sem_auditoria: { luc: string; nome: string; informado: number }[];
  informado_sem_loja: { luc: string; nome: string; valor: number }[];
  totais: { lojas_conciliadas: number; lojas_com_alerta: number; informado: number; projecao: number; diferenca_para_maior: number; diferenca_para_menor: number };
}

const c = (v: number) => Math.round(Number(v) * 100);

/** Relatório EMITIDO no fechamento: lido da versão gravada (não muda depois). */
export default async function VersaoRelatorio({ params, searchParams }: {
  params: Promise<{ mes: string; versao: string }>; searchParams: Promise<{ emitido?: string }>;
}) {
  await exigirUsuario(PERFIS_ANALISTA);
  const { mes, versao } = await params;
  const { emitido } = await searchParams;
  const sb = await criarClienteServidor();
  const [{ data: v }, { data: usuarios }, { data: todas }] = await Promise.all([
    sb.from("fechamento_versoes").select("*").eq("competencia", mes + "-01").eq("versao", Number(versao)).maybeSingle(),
    sb.from("usuarios").select("id, nome"),
    sb.from("fechamento_versoes").select("versao").eq("competencia", mes + "-01").order("versao", { ascending: false }),
  ]);
  if (!v) notFound();
  const r = v.dados as Relatorio;
  const [a, m] = mes.split("-").map(Number);
  const rotulo = `${MESES[m - 1][0].toUpperCase() + MESES[m - 1].slice(1)}/${a}`;
  const ultima = todas?.[0]?.versao === v.versao;
  const autor = v.gerado_por ? (usuarios ?? []).find((u) => u.id === v.gerado_por)?.nome : "sistema (fechamento automático)";

  return (
    <div className="space-y-5">
      <Titulo voltar={{ href: `/fechamento/${mes}`, texto: `Fechamento de ${rotulo}` }}>
        Relatório de conciliação — {rotulo} <Etiqueta cor={ultima ? "verde" : "cinza"}>versão {v.versao}{ultima ? " (mais recente)" : " (substituída)"}</Etiqueta>
      </Titulo>
      {emitido && <Aviso tipo="sucesso">Mês fechado e relatório emitido como versão {v.versao}.</Aviso>}
      {!ultima && <Aviso tipo="alerta">Esta versão foi substituída após reabertura. Ela é mantida para consulta, exatamente como foi emitida.</Aviso>}
      <Cartao>
        <p className="text-sm text-gray-600">
          Emitido em {formatarDataHora(v.gerado_em)} por {autor} · {v.tipo === "automatico" ? "fechamento automático" : v.tipo === "antecipado" ? "fechamento antecipado" : "refechamento após reabertura"} · {r.dias_no_mes} dias no mês.
          Os valores abaixo foram gravados no fechamento e não mudam com alterações posteriores.
        </p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-4">
          <div><dt className="text-xs text-gray-500">Lojas com alerta</dt><dd className="text-2xl font-bold">{r.totais.lojas_com_alerta} <span className="text-sm font-normal">de {r.totais.lojas_conciliadas}</span></dd></div>
          <div><dt className="text-xs text-gray-500">Para maior</dt><dd><Diferenca centavos={c(r.totais.diferenca_para_maior)} /></dd></div>
          <div><dt className="text-xs text-gray-500">Para menor</dt><dd><Diferenca centavos={c(r.totais.diferenca_para_menor)} /></dd></div>
          <div><dt className="text-xs text-gray-500">Informado → projetado</dt><dd className="font-semibold">{reais(c(r.totais.informado))} → {reais(c(r.totais.projecao))}</dd></div>
        </dl>
      </Cartao>
      <Cartao titulo="Lojas — da maior para a menor diferença projetada">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[60rem] text-sm">
            <thead className="text-left text-xs text-gray-500">
              <tr><th className="py-2">Loja</th><th className="text-center">Dias aud.</th><th className="text-right">Informado</th><th className="text-right">Média inf.</th>
                <th className="text-right">Média aud.</th><th className="text-right">Projeção</th><th className="text-right">Diferença</th><th className="pl-3">Classif.</th>
                <th className="text-right">% vigente</th><th className="text-right">Mínimo vigente</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {r.lojas.map((l) => (
                <tr key={l.loja_id} className="align-top">
                  <td className="py-2">
                    <details>
                      <summary className="cursor-pointer font-medium text-azul">{l.nome} <span className="text-xs text-gray-500">{l.luc}</span></summary>
                      <ul className="mt-1 space-y-0.5 text-xs text-gray-600">
                        {l.dias.map((d) => <li key={d.lancamento_id}>{formatarData(d.data)}: {reais(c(d.valor))} (desvio <Diferenca centavos={c(d.desvio)} />)</li>)}
                      </ul>
                    </details>
                  </td>
                  <td className="text-center">{l.dias_auditados}</td>
                  <td className="text-right tabular-nums">{reais(c(l.informado))}</td>
                  <td className="text-right tabular-nums">{reais(c(l.media_informada))}</td>
                  <td className="text-right tabular-nums">{reais(c(l.media_auditada))}</td>
                  <td className="text-right tabular-nums">{reais(c(l.projecao))}</td>
                  <td className="text-right"><Diferenca centavos={c(l.diferenca)} percentual={l.diferenca_percentual} /></td>
                  <td className="pl-3"><Etiqueta cor={l.classificacao === "para_maior" ? "verde" : l.classificacao === "para_menor" ? "vermelho" : "cinza"}>{NOME_CLASSIFICACAO[l.classificacao]}</Etiqueta></td>
                  <td className="text-right">{l.percentual_vigente ? formatarPercentual(l.percentual_vigente) : "—"}</td>
                  <td className="text-right tabular-nums">{l.aluguel_minimo_vigente ? reais(c(Number(l.aluguel_minimo_vigente))) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Cartao>
      {(r.sem_informado.length > 0 || r.sem_auditoria.length > 0 || r.informado_sem_loja.length > 0) && (
        <Cartao titulo="Fora da conciliação">
          <div className="space-y-3 text-sm">
            {r.sem_informado.length > 0 && <p><strong>Sem venda informada:</strong> {r.sem_informado.map((l) => `${l.nome} (${l.luc}, ${l.dias_auditados} dia/s aud.)`).join(" · ")}</p>}
            {r.sem_auditoria.length > 0 && <p><strong>Sem dias auditados:</strong> {r.sem_auditoria.map((l) => `${l.nome} (${l.luc}, informado ${reais(c(l.informado))})`).join(" · ")}</p>}
            {r.informado_sem_loja.length > 0 && <p><strong>LUC do PDF sem cadastro:</strong> {r.informado_sem_loja.map((l) => `${l.luc} (${reais(c(l.valor))})`).join(" · ")}</p>}
          </div>
        </Cartao>
      )}
      <p className="text-xs text-gray-500">Cálculo do aluguel e exportação em Excel/PDF: próxima etapa. <Link href={`/conciliacao?mes=${mes}`} className="text-azul underline">Conciliação atual (ao vivo)</Link></p>
    </div>
  );
}
