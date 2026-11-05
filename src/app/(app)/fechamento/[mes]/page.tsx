import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirUsuario, PERFIS_ANALISTA } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { estadoMes, NOMES_SITUACAO, pendenciasDoMes, processarFechamentosAutomaticos } from "@/lib/dados/fechamento";
import { formatarData, formatarDataHora, hojeFortaleza, MESES } from "@/lib/formato";
import { Aviso, Cartao, Etiqueta, Titulo } from "@/components/ui";
import { ListaTrilha } from "@/components/lista-trilha";
import type { RegistroTrilha } from "@/lib/trilha";
import { FormFechar, FormReabrir } from "../formularios";
import { reabrirMes, realizarFechamento } from "../actions";

export default async function FechamentoMes({ params, searchParams }: { params: Promise<{ mes: string }>; searchParams: Promise<{ reaberto?: string }> }) {
  await exigirUsuario(PERFIS_ANALISTA);
  const { mes } = await params;
  const { reaberto } = await searchParams;
  if (!/^\d{4}-\d{2}$/.test(mes) || mes > hojeFortaleza().slice(0, 7)) notFound();
  const sb = await criarClienteServidor();
  await processarFechamentosAutomaticos(sb);
  const [e, pend, { data: versoes }, { data: trilha }, { data: usuarios }] = await Promise.all([
    estadoMes(sb, mes),
    pendenciasDoMes(sb, mes),
    sb.from("fechamento_versoes").select("versao, tipo, gerado_em, gerado_por").eq("competencia", mes + "-01").order("versao", { ascending: false }),
    sb.from("trilha_auditoria").select("*").in("tabela", ["meses", "fechamento_versoes"])
      .or(`dados_novos->>competencia.eq.${mes}-01,dados_anteriores->>competencia.eq.${mes}-01`).order("ocorrido_em", { ascending: false }),
    sb.from("usuarios").select("id, nome"),
  ]);
  const [a, m] = mes.split("-").map(Number);
  const rotulo = `${MESES[m - 1][0].toUpperCase() + MESES[m - 1].slice(1)}/${a}`;
  const nomes = new Map((usuarios ?? []).map((u) => [u.id, u.nome]));
  const s = NOMES_SITUACAO[e.situacao];

  return (
    <div className="space-y-5">
      <Titulo voltar={{ href: "/fechamento", texto: "Fechamento" }}>{rotulo} <Etiqueta cor={s.cor}>{s.nome}</Etiqueta></Titulo>
      {reaberto && e.situacao === "reaberto" && (
        <Aviso tipo="sucesso">Mês reaberto. Edições do Analista e importação do informado voltam a ser permitidas; ao terminar, realize o fechamento novamente (nova versão do relatório).</Aviso>
      )}
      <Cartao>
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div><dt className="text-gray-500">Prazo de lançamento</dt><dd className="font-semibold">{formatarData(hojeFortaleza(new Date(e.prazo_lancamento)))} às 23:59</dd></div>
          <div><dt className="text-gray-500">Fechamento automático (5º dia útil)</dt><dd className="font-semibold">{formatarData(e.quinto_dia_util)} às 23:59</dd></div>
          <div><dt className="text-gray-500">Conciliação</dt><dd><Link href={`/conciliacao?mes=${mes}`} className="text-azul hover:underline">ver conciliação de {rotulo} →</Link></dd></div>
        </dl>
      </Cartao>

      {e.situacao !== "fechado" ? (
        <Cartao titulo={e.situacao === "reaberto" ? "Fechar novamente" : "Realizar fechamento (antecipado)"}>
          {pend.length ? (
            <div className="mb-4 space-y-2">
              <p className="text-sm font-medium text-gray-800">Pendências encontradas — confira antes de fechar:</p>
              {pend.map((p) => (
                <Aviso key={p.texto} tipo={p.grave ? "erro" : "alerta"}>
                  <strong>{p.qtd}</strong> {p.texto}{p.href && <> — <Link href={p.href} className="underline">ver</Link></>}
                </Aviso>
              ))}
            </div>
          ) : <Aviso tipo="sucesso" className="mb-4">Nenhuma pendência encontrada para {rotulo}.</Aviso>}
          {e.situacao !== "reaberto" && (
            <p className="mb-3 text-sm text-gray-600">O fechamento antecipado <strong>encerra o prazo de lançamento</strong> deste mês imediatamente, mesmo antes do dia 5.</p>
          )}
          <FormFechar acao={realizarFechamento.bind(null, mes)} rotulo={rotulo} refechamento={e.situacao === "reaberto"} />
        </Cartao>
      ) : (
        <Cartao titulo="Reabrir o mês">
          <p className="mb-3 text-sm text-gray-600">Reabrir libera de novo edições do Analista e a importação do informado. Fica registrado quem reabriu, quando e por quê.</p>
          <FormReabrir acao={reabrirMes.bind(null, mes)} />
        </Cartao>
      )}

      <Cartao titulo="Relatórios emitidos">
        {!versoes?.length ? <p className="text-sm text-gray-500">Nenhum relatório emitido ainda.</p> : (
          <ul className="divide-y divide-gray-100 text-sm">
            {versoes.map((v, i) => (
              <li key={v.versao} className="flex flex-wrap items-center gap-3 py-2">
                <Link href={`/fechamento/${mes}/v/${v.versao}`} className="font-semibold text-azul hover:underline">Versão {v.versao}</Link>
                {i === 0 && <Etiqueta cor="verde">mais recente</Etiqueta>}
                <span className="text-gray-600">{v.tipo === "automatico" ? "fechamento automático" : v.tipo === "antecipado" ? "fechamento antecipado" : "refechamento após reabertura"} · {formatarDataHora(v.gerado_em)} · {v.gerado_por ? nomes.get(v.gerado_por) : "sistema"}</span>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <Cartao titulo="Histórico de fechamentos e reaberturas">
        <ListaTrilha registros={(trilha ?? []) as RegistroTrilha[]} usuarios={nomes} />
      </Cartao>
    </div>
  );
}
