import { exigirUsuario, PERFIS_ANALISTA } from "@/lib/sessao";
import { Cartao, classesBotao, Titulo } from "@/components/ui";
import { ImportadorLote } from "./importador-lote";

export default async function ImportarLancamentos() {
  await exigirUsuario(PERFIS_ANALISTA);
  return (
    <>
      <Titulo voltar={{ href: "/importacao", texto: "Central de importação" }}>Lançamentos em lote (planilha)</Titulo>
      <div className="space-y-5">
        <Cartao titulo="Como funciona">
          <ul className="mb-3 space-y-1 text-sm text-gray-700">
            <li>• Uma linha por loja e dia: LUC, data da venda, venda líquida e (opcional) o login do auditor.</li>
            <li>• Valem as mesmas regras do lançamento pelo celular: só dias anteriores a hoje, meses não fechados e dias ainda não lançados.</li>
            <li>• Os lançamentos ficam marcados com origem “planilha”; a planilha original fica arquivada como comprovante (sem fotos).</li>
            <li>• Qualquer erro impede a importação inteira. Nada é gravado antes da sua confirmação.</li>
          </ul>
          <a href="/importacao/lancamentos/modelo" download className={classesBotao("secundario")}>Baixar modelo (.xlsx)</a>
        </Cartao>
        <Cartao titulo="Importar"><ImportadorLote /></Cartao>
      </div>
    </>
  );
}
