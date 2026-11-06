import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirUsuario, PERFIS_ANALISTA } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { formatarDataHora, formatarPercentual } from "@/lib/formato";
import { NOME_CLASSIFICACAO } from "@/lib/conciliacao";
import { carregarVersao } from "@/lib/relatorio/arquivos";
import { linhasConsolidadas, rotuloMes, totaisAluguel } from "@/lib/relatorio/dados";
import { Aviso, Cartao, classesBotao, Etiqueta, Titulo } from "@/components/ui";
import { Diferenca, reais } from "@/components/valores";

/** Relatório EMITIDO no fechamento: lido da versão gravada (não muda depois). */
export default async function VersaoRelatorio({ params, searchParams }: {
  params: Promise<{ mes: string; versao: string }>; searchParams: Promise<{ emitido?: string }>;
}) {
  await exigirUsuario(PERFIS_ANALISTA);
  const { mes, versao } = await params;
  const { emitido } = await searchParams;
  const sb = await criarClienteServidor();
  const [v, { data: todas }] = await Promise.all([
    carregarVersao(sb, mes, Number(versao)),
    sb.from("fechamento_versoes").select("versao").eq("competencia", mes + "-01").order("versao", { ascending: false }),
  ]);
  if (!v) notFound();
  const r = v.dados;
  const linhas = linhasConsolidadas(r);
  const tot = totaisAluguel(linhas);
  const ultima = todas?.[0]?.versao === v.meta.versao;
  const base = `/fechamento/${mes}/v/${versao}`;
  const tipo = v.meta.tipo === "automatico" ? "fechamento automático" : v.meta.tipo === "antecipado" ? "fechamento antecipado" : "refechamento após reabertura";
  const c = (x: number | string | null | undefined) => Math.round(Number(x ?? 0) * 100);

  return (
    <div className="space-y-5">
      <Titulo voltar={{ href: `/fechamento/${mes}`, texto: `Fechamento de ${rotuloMes(mes)}` }}>
        Relatório — {rotuloMes(mes)} <Etiqueta cor={ultima ? "verde" : "cinza"}>versão {v.meta.versao}{ultima ? " (mais recente)" : " (substituída)"}</Etiqueta>
      </Titulo>
      {emitido && <Aviso tipo="sucesso">Mês fechado e relatório emitido como versão {v.meta.versao}. Os arquivos Excel e PDF foram gerados e guardados com esta versão.</Aviso>}
      {!ultima && <Aviso tipo="alerta">Esta versão foi substituída após reabertura. Ela é mantida para consulta, exatamente como foi emitida.</Aviso>}
      {!r.consolidado && <Aviso tipo="info">Versão emitida antes do cálculo do aluguel completo: o consolidado considera apenas as lojas conciliadas. Para incluir todas as lojas, reabra e feche o mês novamente.</Aviso>}

      <Cartao>
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex-1 text-sm text-gray-600">
            Emitido em {formatarDataHora(v.meta.emitidoEm)} por {v.meta.emitidoPor ?? "—"} · {tipo} · {r.dias_no_mes} dias. Valores congelados no fechamento.
          </p>
          <a href={`${base}/arquivo/excel`} className={classesBotao("primario")}>Baixar Excel</a>
          <a href={`${base}/arquivo/pdf`} target="_blank" rel="noreferrer" className={classesBotao("secundario")}>PDF consolidado</a>
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div><dt className="text-xs text-gray-500">Venda informada (base)</dt><dd className="text-lg font-bold">{reais(tot.informado)}</dd></div>
          <div><dt className="text-xs text-gray-500">Aluguel percentual</dt><dd className="text-lg font-bold">{reais(tot.aluguelPercentual)}</dd></div>
          <div><dt className="text-xs text-gray-500">Aluguel mínimo</dt><dd className="text-lg font-bold">{reais(tot.minimo)}</dd></div>
          <div><dt className="text-xs text-gray-500">Complementar a cobrar ({tot.lojasComComplementar} loja/s)</dt><dd className="text-lg font-bold text-azul">{reais(tot.complementar)}</dd></div>
          <div><dt className="text-xs text-gray-500">Indicador (não cobrado)</dt><dd className="text-lg font-bold">{reais(tot.indicadorDiferenca)}</dd></div>
        </dl>
        <dl className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-3">
          <div><dt className="text-xs text-gray-500">Lojas com alerta de diferença</dt><dd className="font-semibold">{String(r.totais.lojas_com_alerta)} de {String(r.totais.lojas_conciliadas)}</dd></div>
          <div><dt className="text-xs text-gray-500">Para maior</dt><dd><Diferenca centavos={c(r.totais.diferenca_para_maior)} /></dd></div>
          <div><dt className="text-xs text-gray-500">Para menor</dt><dd><Diferenca centavos={c(r.totais.diferenca_para_menor)} /></dd></div>
        </dl>
        {tot.lojasComPendencia > 0 && <Aviso tipo="alerta" className="mt-3">{tot.lojasComPendencia} loja(s) sem percentual ou mínimo vigente no mês: o aluguel delas ficou incompleto (ver “Observações” no Excel).</Aviso>}
      </Cartao>

      <Cartao titulo="Consolidado por loja (aluguel e conciliação)">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[72rem] text-sm">
            <thead className="text-left text-xs text-gray-500">
              <tr>
                <th className="py-2">Loja</th><th className="text-right">Informado</th><th className="text-center">Dias aud.</th>
                <th className="text-right">Projeção</th><th className="text-right">Diferença</th>
                <th className="text-right">%</th><th className="text-right">Aluguel %</th><th className="text-right">Mínimo</th>
                <th className="text-right">Complementar</th><th className="text-right">P. equilíbrio</th><th className="text-right">Indicador</th><th />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {linhas.map((l) => (
                <tr key={l.loja_id}>
                  <td className="py-2"><span className="font-medium">{l.nome}</span> <span className="text-xs text-gray-500">{l.luc}</span>
                    {!l.auditada && <span className="ml-1 text-xs text-gray-500">(não auditada)</span>}
                    {l.classificacao && l.classificacao !== "sem_diferenca" && <span className="ml-1"><Etiqueta cor={l.classificacao === "para_maior" ? "verde" : "vermelho"}>{NOME_CLASSIFICACAO[l.classificacao]}</Etiqueta></span>}</td>
                  <td className="text-right tabular-nums">{l.informadoCentavos === null ? "—" : reais(l.informadoCentavos)}</td>
                  <td className="text-center">{l.diasAuditados}</td>
                  <td className="text-right tabular-nums">{l.projecaoCentavos === null ? "—" : reais(l.projecaoCentavos)}</td>
                  <td className="text-right">{l.diferencaCentavos === null ? "—" : <Diferenca centavos={l.diferencaCentavos} percentual={l.diferencaPercentual} />}</td>
                  <td className="text-right">{l.percentual === null ? "—" : formatarPercentual(l.percentual)}</td>
                  <td className="text-right tabular-nums">{l.aluguel?.aluguelPercentualCentavos == null ? "—" : reais(l.aluguel.aluguelPercentualCentavos)}</td>
                  <td className="text-right tabular-nums">{l.aluguel?.minimoCentavos == null ? "—" : reais(l.aluguel.minimoCentavos)}{l.minimoEh13 && <span title="13º aluguel">*</span>}</td>
                  <td className="text-right tabular-nums font-semibold">{l.aluguel?.complementarCentavos == null ? "—" : l.aluguel.temComplementar ? reais(l.aluguel.complementarCentavos) : <span className="font-normal text-gray-500">sem</span>}</td>
                  <td className="text-right tabular-nums">{l.aluguel?.pontoEquilibrioCentavos == null ? "—" : reais(l.aluguel.pontoEquilibrioCentavos)}</td>
                  <td className="text-right tabular-nums">{l.aluguel?.indicador?.diferencaCentavos == null ? "—" : reais(l.aluguel.indicador.diferencaCentavos)}</td>
                  <td className="pl-3 text-right"><a href={`${base}/loja/${l.loja_id}`} target="_blank" rel="noreferrer" className="text-xs text-azul hover:underline">PDF</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Base do aluguel = venda informada. Complementar = aluguel percentual − mínimo (sem complementar quando ≤ 0). Ponto de equilíbrio = mínimo ÷ percentual.
          * mínimo de dezembro = 13º aluguel. Indicador: complementar adicional se a base fosse o maior entre informado e projeção auditada — não é cobrado.
        </p>
      </Cartao>

      {(r.informado_sem_loja.length > 0 || r.sem_informado.length > 0) && (
        <Cartao titulo="Fora do cálculo">
          <div className="space-y-2 text-sm">
            {r.sem_informado.length > 0 && <p><strong>Auditadas sem venda informada:</strong> {r.sem_informado.map((l) => `${l.nome} (${l.luc})`).join(" · ")}</p>}
            {r.informado_sem_loja.length > 0 && <p><strong>LUC do PDF sem cadastro:</strong> {r.informado_sem_loja.map((l) => `${l.luc} (${reais(c(l.valor))})`).join(" · ")}</p>}
          </div>
        </Cartao>
      )}
      <p className="text-xs text-gray-500"><Link href={`/conciliacao?mes=${mes}`} className="text-azul underline">Conciliação atual (ao vivo)</Link></p>
    </div>
  );
}
