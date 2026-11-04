import Link from "next/link";
import { exigirUsuario, PERFIS_ANALISTA } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { ROTULOS_TABELA, type RegistroTrilha } from "@/lib/trilha";
import { Cartao, Titulo } from "@/components/ui";
import { ListaTrilha } from "@/components/lista-trilha";

const POR_PAGINA = 50;

export default async function PaginaHistorico({ searchParams }: { searchParams: Promise<{ tipo?: string; pagina?: string }> }) {
  await exigirUsuario(PERFIS_ANALISTA);
  const { tipo, pagina } = await searchParams;
  const p = Math.max(1, Number(pagina) || 1);
  const sb = await criarClienteServidor();
  let q = sb.from("trilha_auditoria").select("*", { count: "exact" })
    .order("ocorrido_em", { ascending: false }).order("id", { ascending: false })
    .range((p - 1) * POR_PAGINA, p * POR_PAGINA - 1);
  if (tipo && ROTULOS_TABELA[tipo]) q = q.eq("tabela", tipo);
  const [{ data, count }, { data: usuarios }, { data: lojas }, { data: segmentos }] = await Promise.all([
    q, sb.from("usuarios").select("id, nome"), sb.from("lojas").select("id, luc, nome_fantasia"), sb.from("segmentos").select("id, nome"),
  ]);
  const mapaLoja = new Map((lojas ?? []).map((l) => [l.id, `${l.nome_fantasia} (${l.luc})`]));
  const total = count ?? 0;
  const url = (n: number) => `/historico?${new URLSearchParams({ ...(tipo ? { tipo } : {}), pagina: String(n) })}`;

  return (
    <>
      <Titulo>Histórico de alterações</Titulo>
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link href="/historico" className={`rounded-full px-3 py-1.5 ${!tipo ? "bg-azul text-white" : "bg-white border"}`}>Tudo</Link>
        {Object.entries(ROTULOS_TABELA).map(([k, v]) => (
          <Link key={k} href={`/historico?tipo=${k}`} className={`rounded-full px-3 py-1.5 ${tipo === k ? "bg-azul text-white" : "bg-white border"}`}>{v}</Link>
        ))}
      </div>
      <Cartao>
        <ListaTrilha
          registros={(data ?? []) as RegistroTrilha[]}
          usuarios={new Map((usuarios ?? []).map((u) => [u.id, u.nome]))}
          ctx={{ segmentos: new Map((segmentos ?? []).map((s) => [s.id, s.nome])) }}
          extra={(r) => {
            const lojaId = r.tabela === "lojas" ? r.registro_id : (r.dados_novos?.loja_id ?? r.dados_anteriores?.loja_id) as string | undefined;
            return lojaId && mapaLoja.has(lojaId)
              ? <> — <Link href={`/lojas/${lojaId}`} className="text-azul hover:underline">{mapaLoja.get(lojaId)}</Link></>
              : null;
          }}
        />
        <div className="mt-4 flex items-center justify-between text-sm">
          {p > 1 ? <Link href={url(p - 1)} className="text-azul">← Mais recentes</Link> : <span />}
          <span className="text-gray-500">Página {p} de {Math.max(1, Math.ceil(total / POR_PAGINA))}</span>
          {p * POR_PAGINA < total ? <Link href={url(p + 1)} className="text-azul">Mais antigos →</Link> : <span />}
        </div>
      </Cartao>
    </>
  );
}
