import { NextResponse } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { usuarioAtual } from "@/lib/sessao";
import { ehAnalista } from "@/lib/perfis";
import { arquivoDaVersao, carregarVersao, nomeArquivo, type TipoArquivo } from "@/lib/relatorio/arquivos";

/** Arquivo oficial da versão (Excel ou PDF consolidado), guardado com ela. Link temporário de 60 s. */
export async function GET(_: Request, { params }: { params: Promise<{ mes: string; versao: string; tipo: string }> }) {
  const u = await usuarioAtual();
  if (!u || !ehAnalista(u.perfil)) return new Response("Não autorizado", { status: 403 });
  const { mes, versao, tipo } = await params;
  if (tipo !== "excel" && tipo !== "pdf") return new Response("Tipo inválido", { status: 400 });
  const sb = await criarClienteServidor();
  const v = await carregarVersao(sb, mes, Number(versao));
  if (!v) return new Response("Versão não encontrada", { status: 404 });
  const caminho = await arquivoDaVersao(sb, v, tipo as TipoArquivo);
  const { data, error } = await sb.storage.from("relatorios").createSignedUrl(caminho, 60, { download: nomeArquivo(v.meta, tipo as TipoArquivo) });
  if (error || !data) return new Response("Arquivo indisponível", { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
