"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Aviso, Botao, classesInput, Etiqueta } from "@/components/ui";
import { BotaoEnviar } from "@/components/botao-enviar";
import { confirmarImportacao, previaImportacao, type EstadoImportacao } from "./actions";
import type { ResultadoLinha, Situacao } from "@/lib/importacao-lojas/validar";

const INICIAL: EstadoImportacao = { etapa: "inicio" };
const NOMES: Record<Situacao, string> = { nova: "Nova", atualizacao: "Atualização", sem_alteracao: "Sem alteração", erro: "Erro" };
const CORES = { nova: "verde", atualizacao: "azul", sem_alteracao: "cinza", erro: "vermelho" } as const;

export function Importador() {
  const [previa, acaoPrevia] = useActionState(previaImportacao, INICIAL);
  const [final, acaoConfirmar] = useActionState(confirmarImportacao, INICIAL);
  const [filtro, setFiltro] = useState<Situacao | "todas">("todas");
  // O React limpa o campo de arquivo após o envio; guardamos o arquivo escolhido
  // para reenviá-lo na confirmação (o servidor valida tudo de novo).
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [chave, setChave] = useState(0); // recomeçar

  const estado = final.etapa !== "inicio" || final.erro ? final : previa;

  if (estado.etapa === "concluida" && estado.resumo) {
    const s = estado.resumo;
    return (
      <div className="space-y-4">
        <Aviso tipo="sucesso">
          <p className="font-semibold">Importação concluída ({estado.arquivo}).</p>
          <p>{s.lojas_criadas} loja(s) criada(s) · {s.lojas_atualizadas} atualizada(s) · {s.vigencias_gravadas} vigência(s) gravada(s) · {s.alugueis_13_gravados} 13º aluguel(is).</p>
          <p className="mt-1">O arquivo original foi arquivado e todas as alterações estão no histórico.</p>
        </Aviso>
        <div className="flex gap-3">
          <Link href="/lojas" className="text-azul underline">Ver lojas</Link>
          <a href="/importacao/lojas" className="text-azul underline">Nova importação</a>
        </div>
      </div>
    );
  }

  const r = estado.resultado;
  const linhas: ResultadoLinha[] = r ? r.linhas.filter((l) => filtro === "todas" || l.situacao === filtro) : [];

  return (
    <div className="space-y-4" key={chave}>
      <form action={acaoPrevia} className="space-y-3">
        <input type="file" name="arquivo" required onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          className={`${classesInput} py-2`} aria-label="Arquivo da planilha" />
        <BotaoEnviar textoAguarde="Analisando…">Analisar planilha</BotaoEnviar>
        <p className="text-xs text-gray-500">Nada é gravado nesta etapa: primeiro você confere a prévia.</p>
      </form>

      {estado.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}

      {r && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Prévia: {estado.arquivo}</h3>
          {r.errosGerais.map((e, i) => <Aviso key={i} tipo="erro">{e}</Aviso>)}
          {r.avisosGerais.map((e, i) => <Aviso key={i} tipo="alerta">{e}</Aviso>)}

          <div className="flex flex-wrap gap-2 text-sm">
            {(["todas", "nova", "atualizacao", "sem_alteracao", "erro"] as const).map((s) => (
              <button key={s} type="button" onClick={() => setFiltro(s)}
                className={`rounded-full border px-3 py-1.5 ${filtro === s ? "border-azul bg-azul text-white" : "bg-white"}`}>
                {s === "todas" ? `Todas (${r.totais.linhas})` : `${NOMES[s]} (${r.totais[s]})`}
              </button>
            ))}
          </div>

          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {linhas.map((l) => (
              <li key={l.linha} className="px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-gray-500">Linha {l.linha}</span>
                  <Etiqueta cor={CORES[l.situacao]}>{NOMES[l.situacao]}</Etiqueta>
                  <span className="font-medium">{l.luc || "(sem LUC)"}</span>
                  <span className="text-gray-700">{l.nome}</span>
                </div>
                {l.erros.map((e, i) => <p key={"e" + i} className="text-red-700">✖ {e}</p>)}
                {l.mudancas.map((m, i) => <p key={"m" + i} className="text-gray-700">• {m}</p>)}
                {l.avisos.map((a, i) => <p key={"a" + i} className="text-amber-800">⚠ {a}</p>)}
              </li>
            ))}
            {!linhas.length && <li className="px-3 py-4 text-center text-gray-500">Nenhuma linha neste filtro.</li>}
          </ul>

          {r.podeImportar ? (
            <form action={(fd) => {
              if (arquivo) fd.set("arquivo", arquivo);
              return acaoConfirmar(fd);
            }} className="flex flex-wrap items-center gap-3 rounded-lg border border-green-300 bg-green-50 p-3">
              <p className="flex-1 text-sm text-green-900">
                Serão gravadas {r.totais.nova} loja(s) nova(s) e {r.totais.atualizacao} atualização(ões).
                {r.totais.sem_alteracao > 0 && ` ${r.totais.sem_alteracao} linha(s) sem alteração serão ignoradas.`}
              </p>
              <BotaoEnviar textoAguarde="Gravando…">Confirmar importação</BotaoEnviar>
            </form>
          ) : (
            <Aviso tipo="erro">
              {r.totais.erro > 0 || r.errosGerais.length
                ? "Corrija os erros na planilha e envie novamente. A importação é tudo ou nada: nenhuma linha é gravada enquanto houver erro."
                : "Nada a importar: todas as linhas já estão iguais ao cadastro."}
            </Aviso>
          )}
          <Botao variante="discreto" type="button" onClick={() => { setChave(chave + 1); location.reload(); }}>Recomeçar</Botao>
        </div>
      )}
    </div>
  );
}
