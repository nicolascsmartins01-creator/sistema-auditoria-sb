import { exigirUsuario, PERFIS_ANALISTA } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { Cartao, Titulo } from "@/components/ui";
import { FormLoja } from "../formularios";
import { salvarLoja } from "../actions";

export default async function NovaLoja() {
  await exigirUsuario(PERFIS_ANALISTA);
  const sb = await criarClienteServidor();
  const { data: segmentos } = await sb.from("segmentos").select("id, nome").eq("ativo", true).order("nome");
  return (
    <>
      <Titulo voltar={{ href: "/lojas", texto: "Lojas" }}>Nova loja</Titulo>
      <Cartao>
        <FormLoja acao={salvarLoja.bind(null, null)} segmentos={segmentos ?? []} textoBotao="Cadastrar loja" />
        <p className="mt-4 text-sm text-gray-500">Depois de cadastrar, informe o percentual, o aluguel mínimo e o 13º aluguel na página da loja.</p>
      </Cartao>
    </>
  );
}
