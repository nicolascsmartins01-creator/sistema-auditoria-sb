import { notFound } from "next/navigation";
import { exigirUsuario } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { ehAdmin, ehAnalista } from "@/lib/perfis";
import { formatarData, formatarDataHora, formatarMesAno, formatarMoeda, formatarPercentual, hojeFortaleza } from "@/lib/formato";
import { mesSeguinte } from "@/lib/prazos";
import { Aviso, Cartao, Etiqueta, Titulo } from "@/components/ui";
import { ListaTrilha } from "@/components/lista-trilha";
import type { RegistroTrilha } from "@/lib/trilha";
import { BotaoExcluir, Form13, FormDefinirMes, FormExcluirLoja, FormLoja, FormVigencia } from "../formularios";
import { definirMesVigencia, excluirLoja, excluirValor, salvar13, salvarLoja, salvarMinimo, salvarPercentual } from "../actions";

export default async function PaginaLoja({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ criada?: string }>;
}) {
  const u = await exigirUsuario();
  const { id } = await params;
  const { criada } = await searchParams;
  const sb = await criarClienteServidor();
  const { data: loja } = await sb.from("lojas")
    .select("id, luc, nome_fantasia, area_m2, piso, localizacao, segmento_id, auditada, ativa, criado_em, segmentos(nome)")
    .eq("id", id).maybeSingle();
  if (!loja) notFound();
  const segmento = (loja.segmentos as unknown as { nome: string } | null)?.nome;

  const cabecalho = (
    <Titulo voltar={{ href: "/lojas", texto: "Lojas" }}>
      {loja.nome_fantasia}{" "}
      {!loja.ativa && <Etiqueta cor="vermelho">Inativa</Etiqueta>}{" "}
      {!loja.auditada && <Etiqueta>Não auditada</Etiqueta>}
    </Titulo>
  );

  if (!ehAnalista(u.perfil)) {
    return (
      <>
        {cabecalho}
        <Cartao>
          <dl className="grid gap-3 sm:grid-cols-3">
            <div><dt className="text-sm text-gray-500">Nº LUC</dt><dd className="font-medium">{loja.luc}</dd></div>
            <div><dt className="text-sm text-gray-500">Piso</dt><dd>{loja.piso ?? "—"}</dd></div>
            <div><dt className="text-sm text-gray-500">Localização</dt><dd>{loja.localizacao ?? "—"}</dd></div>
            <div><dt className="text-sm text-gray-500">Segmento</dt><dd>{segmento ?? "—"}</dd></div>
          </dl>
        </Cartao>
      </>
    );
  }

  const hoje = hojeFortaleza();
  const anoAtual = Number(hoje.slice(0, 4));
  const mesRef = hoje.slice(0, 8) + "01";
  // vale a vigência iniciada até o último dia do mês (início no meio do mês já vale para o mês inteiro)
  const proximoMes = mesSeguinte(hoje.slice(0, 7)) + "-01";

  const [segmentos, pcts, mins, dez, trilha, usuarios, informadas] = await Promise.all([
    sb.from("segmentos").select("id, nome, ativo").order("nome"),
    sb.from("loja_percentuais").select("id, vigencia_inicio, percentual, criado_em").eq("loja_id", id).order("vigencia_inicio", { ascending: false }),
    sb.from("loja_alugueis_minimos").select("id, vigencia_inicio, valor, criado_em").eq("loja_id", id).order("vigencia_inicio", { ascending: false }),
    sb.from("loja_aluguel_dezembro").select("id, ano, valor, criado_em").eq("loja_id", id).order("ano", { ascending: false }),
    sb.from("trilha_auditoria").select("*")
      .or(`and(tabela.eq.lojas,registro_id.eq.${id}),dados_novos->>loja_id.eq.${id},dados_anteriores->>loja_id.eq.${id}`)
      .order("ocorrido_em", { ascending: false }).limit(100),
    sb.from("usuarios").select("id, nome"),
    sb.from("vendas_informadas").select("competencia, valor").eq("loja_id", id).order("competencia", { ascending: false }).limit(12),
  ]);
  const listaSeg = (segmentos.data ?? []).filter((s) => s.ativo || s.id === loja.segmento_id);
  const mapaSeg = new Map((segmentos.data ?? []).map((s) => [s.id as number, s.nome as string]));
  const mapaUsu = new Map((usuarios.data ?? []).map((x) => [x.id as string, x.nome as string]));
  const pctVigente = (pcts.data ?? []).find((p) => p.vigencia_inicio !== null && p.vigencia_inicio < proximoMes);
  const minVigente = (mins.data ?? []).find((m) => m.vigencia_inicio !== null && m.vigencia_inicio < proximoMes);

  return (
    <div className="space-y-5">
      {cabecalho}
      {criada && <Aviso tipo="sucesso">Loja cadastrada. Agora informe o percentual, o aluguel mínimo e o 13º aluguel.</Aviso>}

      <Cartao titulo="Dados cadastrais">
        <FormLoja acao={salvarLoja.bind(null, id)} loja={loja} segmentos={listaSeg} textoBotao="Salvar alterações" />
        <p className="mt-3 text-xs text-gray-500">Cadastrada em {formatarDataHora(loja.criado_em)}</p>
      </Cartao>

      <div className="grid gap-5 lg:grid-cols-2">
        <Cartao titulo="Percentual de participação">
          <p className="mb-3 text-sm text-gray-600">
            Vigente em {formatarMesAno(mesRef)}: <strong>{pctVigente ? formatarPercentual(pctVigente.percentual) : "não cadastrado"}</strong>
          </p>
          <TabelaVigencias hoje={hoje} linhas={(pcts.data ?? []).map((p) => ({
            id: p.id, inicio: p.vigencia_inicio ? formatarData(p.vigencia_inicio) : null, valor: formatarPercentual(p.percentual), vigente: p.id === pctVigente?.id,
            excluir: excluirValor.bind(null, "loja_percentuais", p.id, id),
            definir: definirMesVigencia.bind(null, "loja_percentuais", p.id, id),
          }))} />
          <FormVigencia acao={salvarPercentual.bind(null, id)} tipo="percentual" hoje={hoje} />
        </Cartao>

        <Cartao titulo="Aluguel mínimo">
          <p className="mb-3 text-sm text-gray-600">
            Vigente em {formatarMesAno(mesRef)}: <strong>{minVigente ? formatarMoeda(minVigente.valor) : "não cadastrado"}</strong>
          </p>
          <TabelaVigencias hoje={hoje} linhas={(mins.data ?? []).map((m) => ({
            id: m.id, inicio: m.vigencia_inicio ? formatarData(m.vigencia_inicio) : null, valor: formatarMoeda(m.valor), vigente: m.id === minVigente?.id,
            excluir: excluirValor.bind(null, "loja_alugueis_minimos", m.id, id),
            definir: definirMesVigencia.bind(null, "loja_alugueis_minimos", m.id, id),
          }))} />
          <FormVigencia acao={salvarMinimo.bind(null, id)} tipo="minimo" hoje={hoje} />
        </Cartao>
      </div>

      <Cartao titulo="13º aluguel (mínimo de dezembro)">
        <p className="mb-3 text-sm text-gray-600">Em dezembro, substitui o aluguel mínimo padrão no cálculo.</p>
        {(dez.data ?? []).length > 0 ? (
          <ul className="mb-3 divide-y divide-gray-100">
            {(dez.data ?? []).map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2">
                <span>Dezembro/{d.ano}: <strong>{formatarMoeda(d.valor)}</strong></span>
                <BotaoExcluir acao={excluirValor.bind(null, "loja_aluguel_dezembro", d.id, id)} pergunta={`Excluir o 13º aluguel de ${d.ano}?`} />
              </li>
            ))}
          </ul>
        ) : <p className="mb-3 text-sm text-amber-800">Nenhum 13º aluguel cadastrado.</p>}
        <Form13 acao={salvar13.bind(null, id)} anoAtual={anoAtual} />
      </Cartao>

      <Cartao titulo="Venda informada (PDF do portal)">
        {!(informadas.data ?? []).length ? <p className="text-sm text-gray-500">Nenhuma venda informada importada para esta loja.</p> : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              {(informadas.data ?? []).map((v) => (
                <tr key={v.competencia}>
                  <td className="py-1.5"><a href={`/vendas-informadas?mes=${v.competencia.slice(0, 7)}`} className="text-azul hover:underline">{formatarMesAno(v.competencia)}</a></td>
                  <td className="text-right tabular-nums">{formatarMoeda(v.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Cartao>

      {ehAdmin(u.perfil) && (
        <Cartao titulo="Excluir loja" className="border-red-200">
          <p className="mb-3 text-sm text-gray-600">
            Somente o Administrador pode excluir. Para uma loja que saiu do shopping, prefira desmarcar “Ativa”:
            o histórico continua consultável. A exclusão fica registrada no histórico geral com o motivo.
          </p>
          <FormExcluirLoja acao={excluirLoja.bind(null, id)} nome={loja.nome_fantasia} />
        </Cartao>
      )}

      <Cartao titulo="Histórico de alterações">
        <ListaTrilha registros={(trilha.data ?? []) as RegistroTrilha[]} usuarios={mapaUsu} ctx={{ segmentos: mapaSeg }} />
      </Cartao>
    </div>
  );
}

type AcaoForm = (e: import("@/lib/acoes").EstadoAcao, f: FormData) => Promise<import("@/lib/acoes").EstadoAcao>;

function TabelaVigencias({ linhas, hoje }: {
  hoje: string;
  linhas: { id: string; inicio: string | null; valor: string; vigente: boolean; excluir: () => Promise<void>; definir: AcaoForm }[];
}) {
  if (!linhas.length) return <p className="mb-3 text-sm text-amber-800">Nenhuma vigência cadastrada.</p>;
  const pendentes = linhas.filter((l) => l.inicio === null);
  const datadas = linhas.filter((l) => l.inicio !== null);
  return (
    <>
    {pendentes.map((l) => (
      <div key={l.id} className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span><strong>{l.valor}</strong> <Etiqueta cor="amarelo">vigência a definir</Etiqueta></span>
          <BotaoExcluir acao={l.excluir} pergunta="Excluir este valor pendente?" />
        </div>
        <p className="mt-1 text-amber-900">Informe a partir de qual data este valor vale. Enquanto isso, ele não entra em nenhum cálculo.</p>
        <FormDefinirMes acao={l.definir} hoje={hoje} />
      </div>
    ))}
    {datadas.length > 0 && (
    <table className="mb-3 w-full text-sm">
      <thead><tr className="text-left text-gray-500"><th className="py-1 font-normal">A partir de</th><th className="font-normal">Valor</th><th /></tr></thead>
      <tbody className="divide-y divide-gray-100">
        {datadas.map((l) => (
          <tr key={l.id}>
            <td className="py-2">{l.inicio}</td>
            <td>{l.valor} {l.vigente && <Etiqueta cor="verde">vigente</Etiqueta>}</td>
            <td className="text-right"><BotaoExcluir acao={l.excluir} pergunta={`Excluir a vigência de ${l.inicio}?`} /></td>
          </tr>
        ))}
      </tbody>
    </table>
    )}
    </>
  );
}
