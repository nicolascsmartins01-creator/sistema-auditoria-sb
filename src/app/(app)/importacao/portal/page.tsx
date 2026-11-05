import Link from "next/link";
import { exigirUsuario, PERFIS_ANALISTA } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { formatarDataHora, formatarMoeda } from "@/lib/formato";
import { Cartao, Etiqueta, Titulo } from "@/components/ui";
import { ImportadorPortal } from "./importador-portal";

export default async function ImportarPortal() {
  await exigirUsuario(PERFIS_ANALISTA);
  const sb = await criarClienteServidor();
  const [{ data: imps }, { data: usuarios }] = await Promise.all([
    sb.from("importacoes").select("id, arquivo_nome, competencia, resumo, criado_em, criado_por")
      .eq("tipo", "portal").order("criado_em", { ascending: false }).limit(60),
    sb.from("usuarios").select("id, nome"),
  ]);
  const nomes = new Map((usuarios ?? []).map((u) => [u.id, u.nome]));
  const vigente = new Set<string>();
  return (
    <>
      <Titulo voltar={{ href: "/importacao", texto: "Central de importação" }}>PDF mensal do portal (venda informada)</Titulo>
      <div className="space-y-5">
        <Cartao titulo="Importar">
          <p className="mb-3 text-sm text-gray-700">
            Envie o PDF consolidado do mês gerado pelo portal (E.net). O sistema lê o texto do arquivo, identifica o mês pelo
            cabeçalho e confere se a soma das lojas bate com a linha <strong>TOTAL</strong> — se não bater, a importação é recusada.
            Nada é gravado antes da sua confirmação.
          </p>
          <ImportadorPortal />
        </Cartao>
        <Cartao titulo="Importações do portal">
          {!imps?.length ? <p className="text-sm text-gray-500">Nenhuma importação ainda.</p> : (
            <ul className="divide-y divide-gray-100 text-sm">
              {imps.map((i) => {
                const r = i.resumo as { total?: number; linhas?: number; sem_loja?: number; substituiu?: boolean };
                const mes = (i.competencia as string).slice(0, 7);
                const atual = !vigente.has(mes);
                vigente.add(mes);
                return (
                  <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                    <Link href={`/vendas-informadas?mes=${mes}`} className="w-20 font-semibold text-azul">{mes.slice(5)}/{mes.slice(0, 4)}</Link>
                    <span className="min-w-0 flex-1">
                      <a href={`/importacao/arquivo/${i.id}`} className="text-azul hover:underline">{i.arquivo_nome}</a>{" "}
                      {atual ? <Etiqueta cor="verde">vigente</Etiqueta> : <Etiqueta>substituída</Etiqueta>}
                      <span className="block text-xs text-gray-500">
                        {formatarDataHora(i.criado_em)} · {nomes.get(i.criado_por) ?? "—"} · {r.linhas ?? 0} linha(s) · total {formatarMoeda(r.total ?? 0)}
                        {r.sem_loja ? ` · ${r.sem_loja} sem cadastro` : ""}{r.substituiu ? " · substituiu a anterior" : ""}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Cartao>
      </div>
    </>
  );
}
