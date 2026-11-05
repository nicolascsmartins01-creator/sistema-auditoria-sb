"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { exigirUsuario, PERFIS_ANALISTA } from "@/lib/sessao";
import { mensagemErroBanco } from "@/lib/acoes";
import { lerPdfPortal } from "@/lib/portal/ler-pdf";
import { validarPdfPortal, type MesExistente, type PreviaPortal } from "@/lib/portal/validar";

export interface EstadoPortal {
  etapa: "inicio" | "previa" | "concluida";
  versao: number;
  erro?: string;
  arquivo?: string;
  previa?: PreviaPortal;
  resumo?: { competencia: string; linhas: number; total: number; sem_loja: number; substituiu: boolean };
}

const LIMITE = 10 * 1024 * 1024;
const decimal = (centavos: number) => (centavos < 0 ? "-" : "") + (Math.abs(centavos) / 100).toFixed(2);

/**
 * "previa": lê o PDF e confere (nada é gravado).
 * "confirmar": lê e confere de novo no servidor, arquiva o PDF original no
 * storage privado e grava (o banco confere a soma × TOTAL mais uma vez).
 */
export async function processarPortal(anterior: EstadoPortal, f: FormData): Promise<EstadoPortal> {
  await exigirUsuario(PERFIS_ANALISTA);
  const versao = anterior.versao + 1;
  const arquivo = f.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { etapa: "inicio", versao, erro: "Escolha o PDF do portal." };
  if (!arquivo.name.toLowerCase().endsWith(".pdf")) return { etapa: "inicio", versao, erro: "O arquivo precisa ser um PDF." };
  if (arquivo.size > LIMITE) return { etapa: "inicio", versao, erro: "Arquivo muito grande (limite de 10 MB)." };
  const bytes = new Uint8Array(await arquivo.arrayBuffer());

  const lido = await lerPdfPortal(bytes);
  if (!lido.ok) return { etapa: "inicio", versao, erro: lido.erro, arquivo: arquivo.name };

  const sb = await criarClienteServidor();
  const competencia = `${lido.ano}-${String(lido.mes).padStart(2, "0")}-01`;
  const [{ data: lojas }, { data: atuais }, { data: ultimaImp }] = await Promise.all([
    sb.from("lojas").select("id, luc, nome_fantasia, ativa"),
    sb.from("vendas_informadas").select("valor").eq("competencia", competencia),
    sb.from("importacoes").select("arquivo_nome, criado_em").eq("tipo", "portal").eq("competencia", competencia)
      .order("criado_em", { ascending: false }).limit(1),
  ]);
  const existente: MesExistente | null = atuais?.length ? {
    totalCentavos: Math.round(atuais.reduce((s, v) => s + Number(v.valor), 0) * 100),
    linhas: atuais.length,
    importadoEm: ultimaImp?.[0]?.criado_em ?? "",
    arquivo: ultimaImp?.[0]?.arquivo_nome ?? "—",
  } : null;
  const previa = validarPdfPortal(lido, (lojas ?? []).map((l) => ({ id: l.id, luc: l.luc, nome: l.nome_fantasia, ativa: l.ativa })), existente);

  if (f.get("passo") !== "confirmar") return { etapa: "previa", versao, arquivo: arquivo.name, previa };

  if (!previa.podeImportar) return { etapa: "previa", versao, arquivo: arquivo.name, previa, erro: "O PDF tem erros e não pode ser importado." };
  const substituir = f.get("substituir") === "sim";
  if (existente && !substituir) {
    return { etapa: "previa", versao, arquivo: arquivo.name, previa, erro: "Este mês já tem venda informada: marque a confirmação de substituição." };
  }

  const nomeSeguro = arquivo.name.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(-80);
  const caminho = `portal/${competencia.slice(0, 7)}/${crypto.randomUUID()}-${nomeSeguro}`;
  const { error: errUp } = await sb.storage.from("importacoes").upload(caminho, bytes, { contentType: "application/pdf", upsert: false });
  if (errUp) return { etapa: "previa", versao, arquivo: arquivo.name, previa, erro: `Falha ao arquivar o PDF: ${errUp.message}` };

  const { data, error } = await sb.rpc("importar_venda_informada", {
    p_competencia: competencia, p_arquivo_nome: arquivo.name, p_arquivo_path: caminho,
    p_total: decimal(previa.totalCentavos),
    p_linhas: previa.linhas.map((l) => ({ luc: l.luc, nome: l.nome, valor: decimal(l.centavos) })),
    p_substituir: substituir,
    p_detalhes: { rotulo: previa.rotulo, lojas_ausentes: previa.lojasAusentes.length, avisos: previa.avisos.length },
  });
  if (error) return { etapa: "previa", versao, arquivo: arquivo.name, previa, erro: mensagemErroBanco(error) };
  revalidatePath("/importacao");
  revalidatePath("/importacao/portal");
  revalidatePath("/vendas-informadas");
  return { etapa: "concluida", versao, arquivo: arquivo.name, resumo: data };
}
