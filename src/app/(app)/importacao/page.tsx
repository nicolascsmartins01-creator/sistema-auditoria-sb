import Link from "next/link";
import { exigirUsuario, PERFIS_ANALISTA } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { formatarDataHora } from "@/lib/formato";
import { Cartao, Etiqueta, Titulo } from "@/components/ui";

const TIPOS = [
  { href: "/importacao/lojas", titulo: "Planilha de lojas", texto: "Cadastro e atualização de lojas, percentuais, aluguel mínimo e 13º (Excel/CSV).", pronto: true },
  { href: null, titulo: "PDF mensal do portal", texto: "Venda informada pelos lojistas, validada pela linha TOTAL.", pronto: false, fase: 3 },
  { href: null, titulo: "Lançamentos em lote", texto: "Vendas auditadas por planilha (Excel/CSV).", pronto: false, fase: 7 },
];

export default async function CentralImportacao() {
  await exigirUsuario(PERFIS_ANALISTA);
  const sb = await criarClienteServidor();
  const [{ data: imports }, { data: usuarios }] = await Promise.all([
    sb.from("importacoes").select("id, tipo, arquivo_nome, resumo, criado_em, criado_por").order("criado_em", { ascending: false }).limit(30),
    sb.from("usuarios").select("id, nome"),
  ]);
  const nomes = new Map((usuarios ?? []).map((u) => [u.id, u.nome]));

  return (
    <>
      <Titulo>Central de importação</Titulo>
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-3">
          {TIPOS.map((t) => {
            const conteudo = (
              <>
                <p className="font-semibold text-gray-900">{t.titulo} {!t.pronto && <Etiqueta>Fase {t.fase}</Etiqueta>}</p>
                <p className="mt-1 text-sm text-gray-600">{t.texto}</p>
              </>
            );
            return t.href ? (
              <Link key={t.titulo} href={t.href} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-azul">{conteudo}</Link>
            ) : (
              <div key={t.titulo} className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 opacity-80">{conteudo}</div>
            );
          })}
        </div>
        <Cartao titulo="Importações realizadas">
          {!imports?.length ? <p className="text-sm text-gray-500">Nenhuma importação ainda.</p> : (
            <ul className="divide-y divide-gray-100 text-sm">
              {imports.map((i) => {
                const r = i.resumo as Record<string, number>;
                return (
                  <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                    <span className="w-36 text-gray-500">{formatarDataHora(i.criado_em)}</span>
                    <span className="min-w-0 flex-1">
                      <a href={`/importacao/arquivo/${i.id}`} className="text-azul hover:underline">{i.arquivo_nome}</a>
                      <span className="block text-xs text-gray-500">
                        {nomes.get(i.criado_por) ?? "—"} · {r.lojas_criadas ?? 0} criada(s), {r.lojas_atualizadas ?? 0} atualizada(s), {r.vigencias_gravadas ?? 0} vigência(s), {r.alugueis_13_gravados ?? 0} 13º
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
