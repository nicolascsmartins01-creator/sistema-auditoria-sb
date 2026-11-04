import { exigirUsuario, PERFIS_ANALISTA } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { Botao, Cartao, Etiqueta, Titulo } from "@/components/ui";
import { FormSegmento } from "./formularios";
import { alternarSegmento, criarSegmento, renomearSegmento } from "./actions";

export default async function PaginaSegmentos() {
  await exigirUsuario(PERFIS_ANALISTA);
  const sb = await criarClienteServidor();
  const [{ data: segmentos }, { data: lojas }] = await Promise.all([
    sb.from("segmentos").select("id, nome, ativo").order("nome"),
    sb.from("lojas").select("segmento_id").eq("ativa", true),
  ]);
  const uso = new Map<number, number>();
  for (const l of lojas ?? []) if (l.segmento_id) uso.set(l.segmento_id, (uso.get(l.segmento_id) ?? 0) + 1);

  return (
    <>
      <Titulo>Segmentos</Titulo>
      <div className="space-y-5">
        <Cartao titulo="Novo segmento">
          <FormSegmento acao={criarSegmento} textoBotao="Adicionar" />
        </Cartao>
        <Cartao titulo="Lista de segmentos">
          <p className="mb-3 text-sm text-gray-600">Segmento desativado não aparece para novas lojas, mas continua nas lojas que já o usam.</p>
          <ul className="divide-y divide-gray-100">
            {(segmentos ?? []).map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
                <FormSegmento acao={renomearSegmento.bind(null, s.id)} valor={s.nome} textoBotao="Renomear" />
                <span className="w-24 text-sm text-gray-500">{uso.get(s.id) ?? 0} loja(s)</span>
                {!s.ativo && <Etiqueta cor="vermelho">Desativado</Etiqueta>}
                <form action={alternarSegmento.bind(null, s.id, !s.ativo)}>
                  <Botao variante="discreto" className="text-sm">{s.ativo ? "Desativar" : "Reativar"}</Botao>
                </form>
              </li>
            ))}
          </ul>
        </Cartao>
      </div>
    </>
  );
}
