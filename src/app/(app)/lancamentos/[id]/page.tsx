import { notFound } from "next/navigation";
import { exigirUsuario, PERFIS_ANALISTA } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { formatarData, formatarDataHora, formatarMoeda, formatarValor } from "@/lib/formato";
import { Aviso, Cartao, Etiqueta, Titulo } from "@/components/ui";
import { ListaTrilha } from "@/components/lista-trilha";
import type { RegistroTrilha } from "@/lib/trilha";
import { FormAnalise, FormEditarLancamento } from "../formularios";
import { analisarLancamento, editarLancamento } from "../actions";

export default async function PaginaLancamento({ params }: { params: Promise<{ id: string }> }) {
  await exigirUsuario(PERFIS_ANALISTA);
  const { id } = await params;
  const sb = await criarClienteServidor();
  const { data: l } = await sb.from("lancamentos")
    .select("*, lojas(id, luc, nome_fantasia), usuarios!lancamentos_auditor_id_fkey(nome)").eq("id", id).maybeSingle();
  if (!l) notFound();
  const [{ data: fotos }, { data: trilha }, { data: usuarios }] = await Promise.all([
    sb.from("lancamento_fotos").select("caminho, criado_em").eq("lancamento_id", id).order("criado_em"),
    sb.from("trilha_auditoria").select("*")
      .or(`and(tabela.eq.lancamentos,registro_id.eq.${id}),dados_novos->>lancamento_id.eq.${id}`)
      .order("ocorrido_em", { ascending: false }),
    sb.from("usuarios").select("id, nome"),
  ]);
  const caminhos = (fotos ?? []).map((f) => f.caminho);
  const { data: urls } = caminhos.length ? await sb.storage.from("fotos").createSignedUrls(caminhos, 600) : { data: [] };
  const loja = l.lojas as unknown as { id: string; luc: string; nome_fantasia: string };
  const auditor = (l.usuarios as unknown as { nome: string } | null)?.nome;
  const atraso = (new Date(l.recebido_em).getTime() - new Date(l.digitado_em).getTime()) / 3600000;

  return (
    <div className="space-y-5">
      <Titulo voltar={{ href: "/lancamentos", texto: "Lançamentos" }}>
        {loja.nome_fantasia} — {formatarData(l.data_venda)}{" "}
        {l.situacao === "em_analise" && <Etiqueta cor="amarelo">Em análise</Etiqueta>}
        {l.situacao === "recusado" && <Etiqueta cor="vermelho">Recusado</Etiqueta>}
      </Titulo>
      <Cartao>
        <dl className="grid gap-4 sm:grid-cols-4">
          <div><dt className="text-sm text-gray-500">Venda líquida</dt><dd className="text-2xl font-bold text-azul">{formatarMoeda(l.valor)}</dd></div>
          <div><dt className="text-sm text-gray-500">Loja</dt><dd>{loja.nome_fantasia} ({loja.luc})</dd></div>
          <div><dt className="text-sm text-gray-500">Auditor</dt><dd>{auditor}</dd></div>
          <div><dt className="text-sm text-gray-500">Digitado / recebido</dt><dd className="text-sm">{formatarDataHora(l.digitado_em)}<br />{formatarDataHora(l.recebido_em)}</dd></div>
        </dl>
        {atraso > 1 && <p className="mt-3 text-sm text-amber-800">Lançado sem internet: chegou ao servidor {Math.round(atraso)} h depois de digitado.</p>}
      </Cartao>

      {l.situacao === "em_analise" && (
        <Cartao titulo="Análise">
          <Aviso tipo="alerta" className="mb-3">Este lançamento chegou mais de 72 horas depois de digitado e só passa a valer se for aprovado.</Aviso>
          <FormAnalise aprovar={analisarLancamento.bind(null, id, true)} recusar={analisarLancamento.bind(null, id, false)} />
        </Cartao>
      )}

      <Cartao titulo={`Fotos (${caminhos.length})`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(urls ?? []).map((u, i) => u.signedUrl && (
            <a key={i} href={u.signedUrl} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u.signedUrl} alt={`Foto ${i + 1}`} className="aspect-square w-full rounded-lg border object-cover" />
            </a>
          ))}
        </div>
        <p className="mt-2 text-xs text-gray-500">Links de visualização temporários (10 minutos). As fotos ficam em área privada e não podem ser apagadas.</p>
      </Cartao>

      {l.situacao !== "recusado" && (
        <Cartao titulo="Editar lançamento">
          <FormEditarLancamento acao={editarLancamento.bind(null, id)} valor={formatarValor(l.valor)} />
        </Cartao>
      )}

      <Cartao titulo="Histórico">
        <ListaTrilha registros={(trilha ?? []) as RegistroTrilha[]} usuarios={new Map((usuarios ?? []).map((u) => [u.id, u.nome]))} />
      </Cartao>
    </div>
  );
}
