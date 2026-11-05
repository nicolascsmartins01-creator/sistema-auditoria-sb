import { exigirUsuario, PERFIS_ANALISTA } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { ehAdmin } from "@/lib/perfis";
import { formatarData } from "@/lib/formato";
import { Botao, Cartao, Etiqueta, Titulo } from "@/components/ui";
import { FormFeriado } from "./form";
import { excluirFeriado, incluirFeriado } from "./actions";

const SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export default async function PaginaFeriados() {
  const u = await exigirUsuario(PERFIS_ANALISTA);
  const admin = ehAdmin(u.perfil);
  const sb = await criarClienteServidor();
  const { data } = await sb.from("feriados").select("data, descricao, esfera").order("data", { ascending: false });
  const porAno = new Map<string, NonNullable<typeof data>>();
  for (const f of data ?? []) porAno.set(f.data.slice(0, 4), [...(porAno.get(f.data.slice(0, 4)) ?? []), f]);

  return (
    <>
      <Titulo>Feriados</Titulo>
      <div className="space-y-5">
        <Cartao>
          <p className="text-sm text-gray-700">
            Usados para calcular o <strong>5º dia útil</strong> (fechamento automático). Dia útil = segunda a sexta, exceto as datas abaixo
            (nacionais, do Ceará e de Fortaleza). {admin ? "Somente o Administrador mantém esta tabela." : "Somente o Administrador pode alterar."}
          </p>
          <p className="mt-2 text-sm text-amber-800">As datas de 2026 e 2027 foram pré-carregadas — confira e inclua as que faltarem (ex.: pontos facultativos adotados pelo shopping).</p>
        </Cartao>
        {admin && <Cartao titulo="Incluir feriado"><FormFeriado acao={incluirFeriado} /></Cartao>}
        {[...porAno].map(([ano, lista]) => (
          <Cartao key={ano} titulo={ano}>
            <ul className="divide-y divide-gray-100 text-sm">
              {lista.map((f) => (
                <li key={f.data} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="w-40 font-medium">{formatarData(f.data)} <span className="text-xs font-normal text-gray-500">{SEMANA[new Date(f.data + "T12:00:00Z").getUTCDay()]}</span></span>
                  <span className="flex-1">{f.descricao}</span>
                  <Etiqueta cor={f.esfera === "nacional" ? "azul" : f.esfera === "estadual" ? "amarelo" : "verde"}>{f.esfera}</Etiqueta>
                  {admin && <form action={excluirFeriado.bind(null, f.data)}><Botao variante="discreto" className="min-h-0 text-sm text-red-700">Excluir</Botao></form>}
                </li>
              ))}
            </ul>
          </Cartao>
        ))}
      </div>
    </>
  );
}
