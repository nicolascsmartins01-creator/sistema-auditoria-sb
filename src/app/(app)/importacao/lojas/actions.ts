"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { exigirUsuario, PERFIS_ANALISTA } from "@/lib/sessao";
import { mensagemErroBanco } from "@/lib/acoes";
import { hojeFortaleza } from "@/lib/formato";
import { LIMITE_BYTES, lerPlanilha, type Celula } from "@/lib/importacao-lojas/ler-planilha";
import { validarPlanilhaLojas, type ResultadoValidacao } from "@/lib/importacao-lojas/validar";
import { analisarCabecalho, type ColunaPlanilha, type Mapeamento } from "@/lib/importacao-lojas/mapeamento";
import { carregarCadastroParaImportacao } from "@/lib/dados/cadastro-importacao";

export interface EstadoImportacao {
  etapa: "inicio" | "mapeamento" | "previa" | "concluida";
  /** muda a cada resposta, para a tela saber que chegou resultado novo */
  versao: number;
  erro?: string;
  arquivo?: string;
  colunas?: ColunaPlanilha[];
  sugestao?: Mapeamento;
  totalLinhas?: number;
  resultado?: ResultadoValidacao;
  resumo?: { lojas_criadas: number; lojas_atualizadas: number; vigencias_gravadas: number; alugueis_13_gravados: number };
}

const CHAVES = ["luc", "nome_fantasia", "area", "piso", "localizacao", "segmento", "auditada", "ativa", "vigencia",
  "percentual", "percentual_vigencia", "aluguel_minimo", "minimo_vigencia", "ano_13", "valor_13"] as const;
const DATA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const esquemaMapeamento = z.object({
  linhaCabecalho: z.number().int().min(0).max(100),
  colunas: z.partialRecord(z.enum(CHAVES), z.number().int().min(0).max(500)),
  fixos: z.object({
    vigencia: DATA.optional(),
    percentual_vigencia: DATA.optional(),
    minimo_vigencia: DATA.optional(),
    ano_13: z.number().int().min(2000).max(2100).optional(),
  }).optional(),
});

async function lerArquivo(f: FormData): Promise<{ erro: string } | { arquivo: File; conteudo: ArrayBuffer; matriz: Celula[][] }> {
  const arquivo = f.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Escolha o arquivo da planilha." };
  if (arquivo.size > LIMITE_BYTES) return { erro: "Arquivo muito grande (limite de 4 MB). Apague abas e colunas que não serão usadas, ou salve como .csv." };
  const conteudo = await arquivo.arrayBuffer();
  try {
    return { arquivo, conteudo, matriz: await lerPlanilha(arquivo.name, conteudo) };
  } catch (e) {
    return { erro: (e as Error).message };
  }
}

function lerMapeamento(f: FormData): Mapeamento | null {
  try {
    const r = esquemaMapeamento.safeParse(JSON.parse(String(f.get("mapeamento") ?? "")));
    return r.success ? (r.data as Mapeamento) : null;
  } catch {
    return null;
  }
}

/**
 * Passos da importação (campo "passo" do formulário):
 *  - "ler":       lê os títulos das colunas e sugere a correspondência. Nada é gravado.
 *  - "previa":    aplica a escolha de colunas e valida linha a linha. Nada é gravado.
 *  - "confirmar": revalida tudo no servidor (a prévia do navegador nunca é usada
 *                 como fonte), arquiva o arquivo no storage privado e grava numa
 *                 única transação.
 */
export async function processarImportacao(anterior: EstadoImportacao, f: FormData): Promise<EstadoImportacao> {
  await exigirUsuario(PERFIS_ANALISTA);
  const versao = anterior.versao + 1;
  const passo = String(f.get("passo"));
  const lido = await lerArquivo(f);
  if ("erro" in lido) return { etapa: "inicio", versao, erro: lido.erro };
  const nome = lido.arquivo.name;

  if (passo === "ler") {
    const cab = analisarCabecalho(lido.matriz);
    if (!cab.ok) return { etapa: "inicio", versao, erro: cab.erro, arquivo: nome };
    return { etapa: "mapeamento", versao, arquivo: nome, colunas: cab.colunas, sugestao: cab.sugestao, totalLinhas: cab.totalLinhas };
  }

  const mapeamento = lerMapeamento(f);
  if (!mapeamento) return { etapa: "mapeamento", versao, arquivo: nome, erro: "Escolha de colunas inválida. Refaça a seleção." };
  const sb = await criarClienteServidor();
  const resultado = validarPlanilhaLojas(lido.matriz, await carregarCadastroParaImportacao(sb), mapeamento);

  if (passo === "previa") return { etapa: "previa", versao, arquivo: nome, resultado };

  if (passo !== "confirmar") return { etapa: "inicio", versao, erro: "Passo desconhecido." };
  if (!resultado.podeImportar) {
    return { etapa: "previa", versao, arquivo: nome, resultado, erro: "Não há o que importar. Confira a escolha de colunas." };
  }
  const nomeSeguro = nome.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(-80);
  const caminho = `lojas/${hojeFortaleza()}/${crypto.randomUUID()}-${nomeSeguro}`;
  const { error: errUp } = await sb.storage.from("importacoes").upload(caminho, lido.conteudo, {
    contentType: lido.arquivo.type || "application/octet-stream", upsert: false,
  });
  if (errUp) return { etapa: "previa", versao, arquivo: nome, resultado, erro: `Falha ao arquivar o arquivo: ${errUp.message}` };

  const { data, error } = await sb.rpc("importar_lojas", {
    p_arquivo_nome: nome, p_arquivo_path: caminho, p_linhas: resultado.paraGravar, p_campos: resultado.camposLidos,
  });
  if (error) return { etapa: "previa", versao, arquivo: nome, resultado, erro: mensagemErroBanco(error) };
  revalidatePath("/lojas");
  revalidatePath("/importacao");
  return { etapa: "concluida", versao, arquivo: nome, resumo: data };
}
