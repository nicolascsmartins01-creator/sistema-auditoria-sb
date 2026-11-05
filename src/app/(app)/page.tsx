import Link from "next/link";
import { exigirUsuario } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { ehAnalista } from "@/lib/perfis";
import { listarLojas, vigentesPorLoja } from "@/lib/dados/lojas";
import { hojeFortaleza, inicioMesAtualFortaleza } from "@/lib/formato";
import { Aviso, Cartao, Etiqueta } from "@/components/ui";
import { carregarConciliacao, ultimoMesComInformado } from "@/lib/dados/conciliacao";
import { processarFechamentosAutomaticos } from "@/lib/dados/fechamento";
import { NOME_CLASSIFICACAO } from "@/lib/conciliacao";
import { Diferenca, reais } from "@/components/valores";

export default async function Inicio({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const u = await exigirUsuario();
  const { aviso } = await searchParams;
  const primeiroNome = u.nome.split(" ")[0];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Olá, {primeiroNome}</h1>
      {aviso === "sem-permissao" && <Aviso tipo="alerta">Você não tem permissão para acessar aquela página.</Aviso>}
      {ehAnalista(u.perfil) ? <><PainelAlertas /><PainelAnalista /></> : <PainelAuditor />}
    </div>
  );
}

function PainelAuditor() {
  return (
    <div className="space-y-4">
      <Link href="/lancar" className="flex min-h-20 items-center justify-center rounded-xl bg-azul text-xl font-semibold text-white shadow active:bg-azul-escuro">
        Lançar venda auditada
      </Link>
      <p className="text-sm text-gray-600">Escolha a loja, o dia (o calendário já abre no dia anterior), digite o valor e anexe as fotos.</p>
    </div>
  );
}

async function PainelAnalista() {
  const sb = await criarClienteServidor();
  const mes = inicioMesAtualFortaleza();
  const ano = Number(hojeFortaleza().slice(0, 4));
  const [lojas, vigentes, dez, pendPct, pendMin, emAnalise] = await Promise.all([
    listarLojas(sb),
    vigentesPorLoja(sb, mes),
    sb.from("loja_aluguel_dezembro").select("loja_id").eq("ano", ano),
    sb.from("loja_percentuais").select("loja_id").is("vigencia_inicio", null),
    sb.from("loja_alugueis_minimos").select("loja_id").is("vigencia_inicio", null),
    sb.from("lancamentos").select("id", { count: "exact", head: true }).eq("situacao", "em_analise"),
  ]);
  const comPendente = new Set([...(pendPct.data ?? []), ...(pendMin.data ?? [])].map((x) => x.loja_id));
  const ativas = lojas.filter((l) => l.ativa);
  const com13 = new Set((dez.data ?? []).map((d) => d.loja_id));
  const semPct = ativas.filter((l) => vigentes.get(l.id)?.percentual == null);
  const semMin = ativas.filter((l) => vigentes.get(l.id)?.minimo == null);
  const sem13 = ativas.filter((l) => !com13.has(l.id));

  const numeros = [
    { rotulo: "Lojas ativas", valor: ativas.length, href: "/lojas" },
    { rotulo: "Auditadas", valor: ativas.filter((l) => l.auditada).length, href: "/lojas?auditada=sim" },
    { rotulo: "Inativas", valor: lojas.length - ativas.length, href: "/lojas?situacao=inativas" },
  ];
  const pendencias = [
    { qtd: emAnalise.count ?? 0, texto: "lançamento(s) recebido(s) após 72 h aguardando sua análise", href: "/lancamentos?situacao=em_analise" },
    { qtd: lojas.filter((l) => comPendente.has(l.id)).length, texto: "loja(s) com percentual ou mínimo de vigência a definir", href: "/lojas?pendencia=a-definir" },
    { qtd: semPct.length, texto: "loja(s) ativa(s) sem percentual vigente neste mês", href: "/lojas?pendencia=percentual" },
    { qtd: semMin.length, texto: "loja(s) ativa(s) sem aluguel mínimo vigente neste mês", href: "/lojas?pendencia=minimo" },
    { qtd: sem13.length, texto: `loja(s) ativa(s) sem 13º aluguel de ${ano} cadastrado`, href: "/lojas?pendencia=13" },
  ].filter((p) => p.qtd > 0);

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        {numeros.map((n) => (
          <Link key={n.rotulo} href={n.href} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-azul">
            <span className="block text-3xl font-bold text-azul">{n.valor}</span>
            <span className="text-sm text-gray-600">{n.rotulo}</span>
          </Link>
        ))}
      </div>
      <Link href="/lancar" className="flex min-h-14 items-center justify-center rounded-xl bg-azul text-lg font-semibold text-white shadow">Lançar venda auditada</Link>
      <Cartao titulo="Pendências">
        {pendencias.length === 0 ? (
          <p className="text-gray-600">Nenhuma pendência.</p>
        ) : (
          <ul className="space-y-2">
            {pendencias.map((p) => (
              <li key={p.href}>
                <Link href={p.href} className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 hover:border-amber-400">
                  <span className="text-xl font-bold text-amber-800">{p.qtd}</span>
                  <span className="text-amber-900">{p.texto}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
      <Cartao titulo="Em construção">
        <p className="text-sm text-gray-600">
          Fechamento mensal, cálculo do aluguel e relatórios aparecerão aqui nas próximas etapas.
        </p>
      </Cartao>
    </>
  );
}

/** Alertas da conciliação: qualquer diferença entre projeção e informado. */
async function PainelAlertas() {
  const sb = await criarClienteServidor();
  await processarFechamentosAutomaticos(sb);
  const mes = await ultimoMesComInformado(sb);
  if (!mes) {
    return <Cartao titulo="Alertas de conciliação"><p className="text-sm text-gray-600">Importe o PDF do portal de um mês para ver os alertas.</p></Cartao>;
  }
  const r = await carregarConciliacao(sb, mes);
  const rotulo = `${mes.slice(5)}/${mes.slice(0, 4)}`;
  const primeiros = r.alertas.slice(0, 10);
  return (
    <Cartao titulo={`Alertas de conciliação — ${rotulo}`}
      acoes={<Link href={`/conciliacao?mes=${mes}`} className="text-sm text-azul hover:underline">Ver conciliação completa →</Link>}>
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <div className="rounded-lg bg-red-50 p-3"><p className="text-xs text-red-800">Lojas com alerta</p><p className="text-2xl font-bold text-red-800">{r.alertas.length}<span className="text-sm font-normal"> de {r.conciliadas.length}</span></p></div>
        <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-600">Para maior ({r.totais.lojasParaMaior})</p><Diferenca centavos={r.totais.diferencaParaMaiorCentavos} /></div>
        <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-600">Para menor ({r.totais.lojasParaMenor})</p><Diferenca centavos={r.totais.diferencaParaMenorCentavos} /></div>
        <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-600">Sem informado / sem auditoria</p><p className="text-lg font-semibold">{r.semInformado.length} / {r.semAuditoria.length}</p></div>
      </div>
      {!primeiros.length ? <p className="text-sm text-gray-600">Nenhuma diferença neste mês.</p> : (
        <ol className="divide-y divide-gray-100 text-sm">
          {primeiros.map((c, i) => (
            <li key={c.loja_id}>
              <Link href={`/conciliacao/${c.loja_id}?mes=${mes}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 hover:bg-azul-claro">
                <span className="w-6 text-gray-400">{i + 1}.</span>
                <span className="min-w-0 flex-1 font-medium">{c.nome} <span className="text-xs font-normal text-gray-500">{c.luc} · {c.diasAuditados} dia(s) auditado(s) · informado {reais(c.informadoCentavos)}</span></span>
                <Diferenca centavos={c.diferencaCentavos} percentual={c.diferencaPercentual} />
                <Etiqueta cor={c.classificacao === "para_maior" ? "verde" : "vermelho"}>{NOME_CLASSIFICACAO[c.classificacao]}</Etiqueta>
              </Link>
            </li>
          ))}
        </ol>
      )}
      {r.alertas.length > primeiros.length && <p className="mt-2 text-xs text-gray-500">E mais {r.alertas.length - primeiros.length} loja(s) com alerta na conciliação completa.</p>}
    </Cartao>
  );
}
