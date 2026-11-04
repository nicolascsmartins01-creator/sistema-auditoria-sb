"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { exigirUsuario, PERFIS_ANALISTA } from "@/lib/sessao";
import { mensagemErroBanco } from "@/lib/acoes";
import { hojeFortaleza } from "@/lib/formato";
import { LIMITE_BYTES, lerPlanilha } from "@/lib/importacao-lojas/ler-planilha";
import { validarPlanilhaLojas, type ResultadoValidacao } from "@/lib/importacao-lojas/validar";
import { carregarCadastroParaImportacao } from "@/lib/dados/cadastro-importacao";

export interface EstadoImportacao {
  etapa: "inicio" | "previa" | "concluida";
  erro?: string;
  arquivo?: string;
  resultado?: ResultadoValidacao;
  resumo?: { lojas_criadas: number; lojas_atualizadas: number; vigencias_gravadas: number; alugueis_13_gravados: number };
}

async function analisar(f: FormData) {
  const arquivo = f.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Escolha o arquivo da planilha." } as const;
  if (arquivo.size > LIMITE_BYTES) return { erro: "Arquivo muito grande (limite de 5 MB)." } as const;
  const conteudo = await arquivo.arrayBuffer();
  let matriz;
  try {
    matriz = await lerPlanilha(arquivo.name, conteudo);
  } catch (e) {
    return { erro: (e as Error).message } as const;
  }
  const sb = await criarClienteServidor();
  const resultado = validarPlanilhaLojas(matriz, await carregarCadastroParaImportacao(sb));
  return { arquivo, conteudo, resultado, sb } as const;
}

/** Etapa 1: lê e valida a planilha. Nada é gravado. */
export async function previaImportacao(_: EstadoImportacao, f: FormData): Promise<EstadoImportacao> {
  await exigirUsuario(PERFIS_ANALISTA);
  const r = await analisar(f);
  if ("erro" in r) return { etapa: "inicio", erro: r.erro };
  return { etapa: "previa", arquivo: r.arquivo.name, resultado: r.resultado };
}

/**
 * Etapa 2: o arquivo é reenviado e revalidado no servidor (a prévia do
 * navegador nunca é usada como fonte), arquivado no storage privado e
 * gravado numa única transação.
 */
export async function confirmarImportacao(_: EstadoImportacao, f: FormData): Promise<EstadoImportacao> {
  await exigirUsuario(PERFIS_ANALISTA);
  const r = await analisar(f);
  if ("erro" in r) return { etapa: "inicio", erro: r.erro };
  if (!r.resultado.podeImportar) {
    return { etapa: "previa", arquivo: r.arquivo.name, resultado: r.resultado, erro: "A planilha tem pendências e não pode ser importada." };
  }
  const nomeSeguro = r.arquivo.name.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(-80);
  const caminho = `lojas/${hojeFortaleza()}/${crypto.randomUUID()}-${nomeSeguro}`;
  const { error: errUp } = await r.sb.storage.from("importacoes").upload(caminho, r.conteudo, {
    contentType: r.arquivo.type || "application/octet-stream", upsert: false,
  });
  if (errUp) return { etapa: "previa", arquivo: r.arquivo.name, resultado: r.resultado, erro: `Falha ao arquivar o arquivo: ${errUp.message}` };

  const { data, error } = await r.sb.rpc("importar_lojas", {
    p_arquivo_nome: r.arquivo.name, p_arquivo_path: caminho, p_linhas: r.resultado.paraGravar,
  });
  if (error) return { etapa: "previa", arquivo: r.arquivo.name, resultado: r.resultado, erro: mensagemErroBanco(error) };
  revalidatePath("/lojas");
  revalidatePath("/importacao");
  return { etapa: "concluida", arquivo: r.arquivo.name, resumo: data };
}
