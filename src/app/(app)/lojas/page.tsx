import { exigirUsuario } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { ehAnalista } from "@/lib/perfis";
import { listarLojas, vigentesPorLoja } from "@/lib/dados/lojas";
import { hojeFortaleza, inicioMesAtualFortaleza } from "@/lib/formato";
import { Aviso, LinkBotao, Titulo } from "@/components/ui";
import { ListaLojas, type LinhaLoja } from "./lista-lojas";

export default async function PaginaLojas({ searchParams }: {
  searchParams: Promise<{ situacao?: string; auditada?: string; pendencia?: string; excluida?: string }>;
}) {
  const u = await exigirUsuario();
  const filtrosIniciais = await searchParams;
  const analista = ehAnalista(u.perfil);
  const sb = await criarClienteServidor();
  const ano = Number(hojeFortaleza().slice(0, 4));
  const [lojas, vigentes, segmentos, dez, pendPct, pendMin] = await Promise.all([
    listarLojas(sb),
    analista ? vigentesPorLoja(sb, inicioMesAtualFortaleza()) : Promise.resolve(new Map()),
    sb.from("segmentos").select("id, nome").order("nome"),
    analista ? sb.from("loja_aluguel_dezembro").select("loja_id").eq("ano", ano) : Promise.resolve({ data: [] }),
    analista ? sb.from("loja_percentuais").select("loja_id").is("vigencia_inicio", null) : Promise.resolve({ data: [] }),
    analista ? sb.from("loja_alugueis_minimos").select("loja_id").is("vigencia_inicio", null) : Promise.resolve({ data: [] }),
  ]);
  const comPendente = new Set([...(pendPct.data ?? []), ...(pendMin.data ?? [])].map((x: { loja_id: string }) => x.loja_id));
  const com13 = new Set((dez.data ?? []).map((d: { loja_id: string }) => d.loja_id));
  const linhas: LinhaLoja[] = lojas.map((l) => ({
    ...l,
    percentual: vigentes.get(l.id)?.percentual ?? null,
    minimo: vigentes.get(l.id)?.minimo ?? null,
    tem13: com13.has(l.id),
    aDefinir: comPendente.has(l.id),
  }));
  return (
    <>
      {filtrosIniciais.excluida && <Aviso tipo="sucesso" className="mb-4">Loja excluída. O registro e o motivo ficam no Histórico.</Aviso>}
      <Titulo acoes={analista && <LinkBotao href="/lojas/nova">+ Nova loja</LinkBotao>}>Lojas</Titulo>
      <ListaLojas lojas={linhas} segmentos={(segmentos.data ?? []).map((s) => s.nome)}
        mostrarValores={analista} anoAtual={ano} filtrosIniciais={filtrosIniciais} />
    </>
  );
}
