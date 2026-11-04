import { exigirUsuario, PERFIS_ANALISTA } from "@/lib/sessao";
import { Cartao, classesBotao, Titulo } from "@/components/ui";
import { COLUNAS } from "@/lib/importacao-lojas/colunas";
import { Importador } from "./importador";

export default async function ImportarLojas() {
  await exigirUsuario(PERFIS_ANALISTA);
  return (
    <>
      <Titulo voltar={{ href: "/importacao", texto: "Central de importação" }}>Importar planilha de lojas</Titulo>
      <div className="space-y-5">
        <Cartao titulo="1. Baixe o modelo e preencha">
          <p className="mb-3 text-sm text-gray-700">
            Uma linha por loja. Se a LUC já existir, a loja é atualizada; se não existir, é criada.
            Percentual e aluguel mínimo entram como vigência a partir do mês informado (as anteriores são mantidas).
            Aceita .xlsx ou .csv (separado por ponto e vírgula).
          </p>
          <a href="/importacao/lojas/modelo" download className={classesBotao("secundario")}>Baixar modelo (.xlsx)</a>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-azul">Ver colunas do modelo</summary>
            <ul className="mt-2 space-y-1 text-gray-700">
              {COLUNAS.map((c) => <li key={c.chave}><strong>{c.titulo}</strong>{c.obrigatoria ? " (obrigatória)" : ""}: {c.ajuda}</li>)}
            </ul>
          </details>
        </Cartao>
        <Cartao titulo="2. Envie, confira a prévia e confirme">
          <Importador />
        </Cartao>
      </div>
    </>
  );
}
